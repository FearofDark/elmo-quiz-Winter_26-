window.Game4Client = {
  audio: null,
  maxDuration: 0.5,
  isPlaying: false,

  async init() {
    this.audio = document.getElementById('game4-audio-element');
    if (!this.audio) return;

    await this.loadGame4State();
    this.checkIfCaptain();

    this.audio.ontimeupdate = () => {
      if (this.audio.currentTime >= this.maxDuration) {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.setPlayingState(false);
      }
    };

    this.audio.onended = () => {
      this.setPlayingState(false);
    };

    if (typeof supabaseClient !== 'undefined') {
      supabaseClient
        .channel('game4-state-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game4_state' }, payload => {
          if (payload.new) {
            this.applyState(payload.new);
          }
        })
        .subscribe();

      const channel = supabaseClient.channel('game4-realtime', {
        config: { broadcast: { self: true } }
      });

      channel
        .on('broadcast', { event: 'game4_load_track' }, payload => {
          this.applySong(payload.payload);
        })
        .on('broadcast', { event: 'game4_set_stage' }, payload => {
          const { duration } = payload.payload;
          this.maxDuration = duration;
          document.getElementById('game4-limit-text').innerText = `${duration} Sekunden`;
        })
        .on('broadcast', { event: 'game4_reveal' }, payload => {
          const { solution } = payload.payload;
          this.showReveal(solution);
        })
        .on('broadcast', { event: 'game4_reset' }, () => {
          this.resetUI();
        })
        .subscribe();
    }
  },

  async checkIfCaptain() {
    if (typeof MY_SLOT === 'undefined' || !MY_SLOT) return;
    try {
      const { data } = await supabaseClient
        .from('player_slots')
        .select('team, is_captain')
        .eq('slot_id', MY_SLOT)
        .maybeSingle();

      if (data && data.is_captain) {
        const captainPanel = document.getElementById('game4-captain-panel');
        if (captainPanel) {
          captainPanel.style.display = 'flex';
          captainPanel.dataset.myTeam = data.team;
        }
      }
    } catch (e) {}
  },

  async sendCaptainAnswer() {
    const input = document.getElementById('game4-captain-input');
    const status = document.getElementById('game4-captain-status');
    const panel = document.getElementById('game4-captain-panel');
    if (!input || !panel) return;

    const answerText = input.value.trim();
    const teamId = panel.dataset.myTeam;
    if (!answerText || !teamId) return;

    try {
      const { error } = await supabaseClient.from('game4_submissions').upsert({
        team_id: teamId,
        team_name: teamId.toUpperCase(),
        answer: answerText,
        updated_at: new Date()
      }, { onConflict: 'team_id' });

      if (!error) {
        status.innerText = "✅ Antwort erfolgreich gesendet!";
        status.style.color = "#4ade80";
        input.value = "";
      } else {
        status.innerText = "❌ Fehler beim Senden.";
        status.style.color = "#f87171";
      }
    } catch (err) {
      status.innerText = "❌ Verbindungsfehler.";
      status.style.color = "#f87171";
    }
  },

  async loadGame4State() {
    try {
      const { data } = await supabaseClient.from('game4_state').select('*').eq('id', 1).maybeSingle();
      if (data) {
        this.applyState(data);
      }
    } catch (e) {}
  },

  applyState(state) {
    ['blau', 'rot', 'gruen', 'gelb'].forEach(t => {
      const el = document.getElementById(`g4-score-${t}`);
      if (el && state[`punkte_runde_${t}`] !== undefined) {
        el.innerText = state[`punkte_runde_${t}`];
      }
    });

    if (state.snippet_duration) {
      this.maxDuration = state.snippet_duration;
      const limitEl = document.getElementById('game4-limit-text');
      if (limitEl) limitEl.innerText = `${state.snippet_duration} Sekunden`;
    }
    if (state.active_song) {
      this.applySong(state.active_song);
      if (state.is_revealed && state.active_song.solutionText) {
        this.showReveal(state.active_song.solutionText);
      }
    } else {
      this.resetUI();
    }
  },

  applySong(songData) {
    if (!this.audio.src.includes(songData.trackUrl)) {
      this.audio.src = songData.trackUrl;
      this.audio.load();
    }
    
    document.getElementById('game4-start-screen').style.display = 'none';
    document.getElementById('game4-player-screen').style.display = 'flex';
    
    const titleEl = document.getElementById('game4-song-title-display');
    if (titleEl) {
      titleEl.innerText = "";
      titleEl.style.display = 'none';
    }

    const status = document.getElementById('game4-captain-status');
    if (status) status.innerText = "";
  },

  showReveal(solution) {
    const titleEl = document.getElementById('game4-song-title-display');
    if (titleEl) {
      titleEl.innerText = `🎵 ${solution}`;
      titleEl.style.display = 'block';
    }
  },

  resetUI() {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.setPlayingState(false);
    document.getElementById('game4-start-screen').style.display = 'flex';
    document.getElementById('game4-player-screen').style.display = 'none';
    const titleEl = document.getElementById('game4-song-title-display');
    if (titleEl) {
      titleEl.innerText = "";
      titleEl.style.display = 'none';
    }
  },

  togglePlay() {
    if (!this.audio.src) return;
    if (this.isPlaying) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.setPlayingState(false);
    } else {
      this.audio.currentTime = 0;
      this.audio.play().then(() => this.setPlayingState(true)).catch(() => {});
    }
  },

  setVolume(val) {
    if (this.audio) this.audio.volume = parseFloat(val);
  },

  setPlayingState(playing) {
    this.isPlaying = playing;
    const btn = document.getElementById('game4-play-btn');
    const disc = document.getElementById('game4-vinyl-disc');
    
    if (btn) btn.innerText = playing ? '⏹️ Stopp' : '▶️ Ausschnitt abspielen';
    if (disc) {
      if (playing) disc.classList.add('spinning');
      else disc.classList.remove('spinning');
    }
  }
};

window.reloadGame4Only = async function() {
  await window.Game4Client.loadGame4State();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.Game4Client.init());
} else {
  window.Game4Client.init();
}