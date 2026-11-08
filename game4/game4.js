window.Game4Client = {
  audio: null,
  maxDuration: 0.5,
  isPlaying: false,

  async init() {
    this.audio = document.getElementById('game4-audio-element');
    if (!this.audio) return;

    // Mehrfache Prüfung für Captain-Status, falls Supabase/localStorage kurz braucht
    await this.checkIfCaptain();
    setTimeout(() => this.checkIfCaptain(), 500);
    setTimeout(() => this.checkIfCaptain(), 1500);

    await this.loadGame4State();

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
          const limitEl = document.getElementById('game4-limit-text');
          if (limitEl) limitEl.innerText = `${duration} Sekunden`;
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
    const slot = typeof MY_SLOT !== 'undefined' ? MY_SLOT : localStorage.getItem('quiz_studio_my_slot');
    if (!slot) return;

    try {
      const { data } = await supabaseClient
        .from('player_slots')
        .select('team, is_captain')
        .eq('slot_id', slot)
        .maybeSingle();

      const captainPanel = document.getElementById('game4-captain-panel');
      if (data && data.is_captain) {
        if (captainPanel) {
          captainPanel.style.display = 'flex';
          captainPanel.dataset.myTeam = data.team;
        }
      } else {
        if (captainPanel) {
          captainPanel.style.display = 'none';
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

    const startScreen = document.getElementById('game4-start-screen');
    const playerScreen = document.getElementById('game4-player-screen');

    if (state.active_song && state.active_song.trackUrl) {
      this.applySong(state.active_song);
      if (state.is_revealed && state.active_song.solutionText) {
        this.showReveal(state.active_song.solutionText);
      }
    } else {
      if (startScreen && playerScreen) {
        startScreen.style.display = 'none';
        playerScreen.style.display = 'flex';
      }
    }
    this.checkIfCaptain();
  },

  applySong(songData) {
    if (songData && songData.trackUrl) {
      if (!this.audio.src.includes(songData.trackUrl)) {
        this.audio.src = songData.trackUrl;
        this.audio.load();
      }
    }
    
    const startScreen = document.getElementById('game4-start-screen');
    const playerScreen = document.getElementById('game4-player-screen');
    if (startScreen) startScreen.style.display = 'none';
    if (playerScreen) playerScreen.style.display = 'flex';
    
    const titleEl = document.getElementById('game4-song-title-display');
    if (titleEl) {
      titleEl.innerText = "";
      titleEl.style.display = 'none';
    }

    const status = document.getElementById('game4-captain-status');
    if (status) status.innerText = "";
    
    this.checkIfCaptain();
  },

  showReveal(solution) {
    const titleEl = document.getElementById('game4-song-title-display');
    if (titleEl) {
      titleEl.innerText = `🎵 ${solution}`;
      titleEl.style.display = 'block';
    }
  },

  resetUI() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.setPlayingState(false);
    const startScreen = document.getElementById('game4-start-screen');
    const playerScreen = document.getElementById('game4-player-screen');
    if (startScreen) startScreen.style.display = 'flex';
    if (playerScreen) playerScreen.style.display = 'none';
    const titleEl = document.getElementById('game4-song-title-display');
    if (titleEl) {
      titleEl.innerText = "";
      titleEl.style.display = 'none';
    }
    this.checkIfCaptain();
  },

  togglePlay() {
    if (!this.audio || !this.audio.src) return;
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
  await window.Game4Client.checkIfCaptain();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.Game4Client.init());
} else {
  window.Game4Client.init();
}