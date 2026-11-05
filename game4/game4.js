window.Game4Client = {
  audio: null,
  maxDuration: 0.5,
  isPlaying: false,

  async init() {
    this.audio = document.getElementById('game4-audio-element');
    if (!this.audio) return;

    // Spiel-4-Zustand (inkl. Rundenpunkte) laden
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

    // Live-Sync direkt über game4_state (für Punkte, Song & Stufe)
    supabaseClient
      .channel('game4-state-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game4_state' }, payload => {
        if (payload.new) {
          this.applyState(payload.new);
        }
      })
      .subscribe();

    // Broadcasts für sekundengenaue Audio-Aktionen
    const channel = supabaseClient.channel('game4-realtime', {
      config: { broadcast: { self: true } }
    });

    channel
      .on('broadcast', { event: 'game4_load_track' }, payload => {
        this.applySong(payload.payload);
      })
      .on('broadcast', { event: 'game4_set_stage' }, payload => {
        const { duration, stageName } = payload.payload;
        this.maxDuration = duration;
        document.getElementById('game4-limit-text').innerText = `${duration} Sekunden`;
        document.getElementById('game4-status-badge').innerText = stageName;
      })
      .on('broadcast', { event: 'game4_reveal' }, payload => {
        const { solution } = payload.payload;
        this.showReveal(solution);
      })
      .on('broadcast', { event: 'game4_reset' }, () => {
        this.resetUI();
      })
      .subscribe();
  },

  async loadGame4State() {
    const { data } = await supabaseClient.from('game4_state').select('*').eq('id', 1).maybeSingle();
    if (data) {
      this.applyState(data);
    }
  },

  applyState(state) {
    // Punkte aktualisieren
    ['blau', 'rot', 'gruen', 'gelb'].forEach(t => {
      const el = document.getElementById(`g4-score-${t}`);
      if (el && state[`punkte_runde_${t}`] !== undefined) {
        el.innerText = state[`punkte_runde_${t}`];
      }
    });

    // Snippet & Status aktualisieren
    if (state.snippet_duration) {
      this.maxDuration = state.snippet_duration;
      const limitEl = document.getElementById('game4-limit-text');
      if (limitEl) limitEl.innerText = `${state.snippet_duration} Sekunden`;
    }
    if (state.snippet_name) {
      const badgeEl = document.getElementById('game4-status-badge');
      if (badgeEl) badgeEl.innerText = state.snippet_name;
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
    document.getElementById('game4-song-title-display').innerText = "❓ ??? — ???";
    document.getElementById('game4-reveal-box').style.display = 'none';
  },

  showReveal(solution) {
    document.getElementById('game4-correct-solution').innerText = solution;
    document.getElementById('game4-song-title-display').innerText = `🎵 ${solution}`;
    document.getElementById('game4-reveal-box').style.display = 'block';
    document.getElementById('game4-status-badge').innerText = 'AUFGELÖST';
  },

  resetUI() {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.setPlayingState(false);
    document.getElementById('game4-start-screen').style.display = 'flex';
    document.getElementById('game4-player-screen').style.display = 'none';
    document.getElementById('game4-reveal-box').style.display = 'none';
    document.getElementById('game4-status-badge').innerText = 'BEREIT';
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

  replay() {
    if (!this.audio.src) return;
    this.audio.pause();
    this.audio.currentTime = 0;
    this.audio.play();
    this.setPlayingState(true);
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

Game4Client.init();