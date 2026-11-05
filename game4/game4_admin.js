window.Game4Admin = {
  channel: null,
  songsList: [],
  currentIndex: 0,
  currentRoundScores: { blau: 0, rot: 0, gruen: 0, gelb: 0 },

  async init() {
    this.channel = supabaseClient.channel('game4-realtime', {
      config: { broadcast: { self: true } }
    });
    this.channel.subscribe();

    await this.loadSongsFromSupabase();
    await this.loadGame4State();

    // Live lauschen, falls sich game4_state ändert
    supabaseClient
      .channel('game4-admin-state-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game4_state' }, payload => {
        if (payload.new) this.updateAdminScoreUI(payload.new);
      })
      .subscribe();
  },

  async loadGame4State() {
    const { data } = await supabaseClient.from('game4_state').select('*').eq('id', 1).maybeSingle();
    if (data) {
      this.currentRoundScores = {
        blau: data.punkte_runde_blau || 0,
        rot: data.punkte_runde_rot || 0,
        gruen: data.punkte_runde_gruen || 0,
        gelb: data.punkte_runde_gelb || 0
      };
      this.updateAdminScoreUI(data);
    }
  },

  updateAdminScoreUI(state) {
    ['blau', 'rot', 'gruen', 'gelb'].forEach(t => {
      const el = document.getElementById(`admin-score-${t}`);
      if (el && state[`punkte_runde_${t}`] !== undefined) {
        el.innerText = state[`punkte_runde_${t}`];
      }
    });
  },

  async addPoints(team, amount) {
    // Aktuellen Wert holen und anpassen
    this.currentRoundScores[team] = Math.max(0, (this.currentRoundScores[team] || 0) + amount);

    // Direkt in game4_state speichern
    await supabaseClient.from('game4_state').update({
      [`punkte_runde_${team}`]: this.currentRoundScores[team]
    }).eq('id', 1);
  },

  async loadSongsFromSupabase() {
    const { data, error } = await supabaseClient
      .from('game4_songs')
      .select('*')
      .order('reihenfolge', { ascending: true });

    if (error) return;
    this.songsList = data || [];
    const selectEl = document.getElementById('g4-admin-song-select');
    if (!selectEl) return;

    if (this.songsList.length === 0) {
      selectEl.innerHTML = `<option value="">Keine Songs gefunden</option>`;
      return;
    }

    selectEl.innerHTML = this.songsList.map((song, idx) => `
      <option value="${idx}">${song.reihenfolge}. ${song.interpret} - ${song.titel}</option>
    `).join('');

    this.updateCurrentSongIndicator();
  },

  updateCurrentSongIndicator() {
    const indicator = document.getElementById('g4-current-song-indicator');
    const selectEl = document.getElementById('g4-admin-song-select');
    if (selectEl && this.songsList.length > 0) {
      selectEl.value = this.currentIndex;
      const current = this.songsList[this.currentIndex];
      if (indicator && current) {
        indicator.innerText = `Aktiv: #${current.reihenfolge} (${current.interpret} - ${current.titel})`;
      }
    }
  },

  nextSong() {
    if (this.songsList.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.songsList.length;
    this.updateCurrentSongIndicator();
    this.loadSelectedSong();
  },

  prevSong() {
    if (this.songsList.length === 0) return;
    this.currentIndex = (this.currentIndex - 1 + this.songsList.length) % this.songsList.length;
    this.updateCurrentSongIndicator();
    this.loadSelectedSong();
  },

  async loadSelectedSong() {
    if (!this.channel) this.init();
    const selectEl = document.getElementById('g4-admin-song-select');
    if (!selectEl) return;

    this.currentIndex = parseInt(selectEl.value) || 0;
    const song = this.songsList[this.currentIndex];
    if (!song) return;

    this.updateCurrentSongIndicator();

    const songPayload = {
      trackUrl: song.datei_url,
      title: `${song.interpret} — ??? (Rate den Song!)`,
      solutionText: `${song.interpret} - ${song.titel}`
    };

    await supabaseClient.from('game4_state').update({
      active_song: songPayload,
      current_index: this.currentIndex,
      snippet_duration: 0.5,
      snippet_name: 'Stufe 1 (0.5 Sek)',
      is_revealed: false
    }).eq('id', 1);

    await this.channel.send({
      type: 'broadcast',
      event: 'game4_load_track',
      payload: songPayload
    });
  },

  async setStage(duration, stageName) {
    if (!this.channel) this.init();

    await supabaseClient.from('game4_state').update({
      snippet_duration: duration,
      snippet_name: stageName
    }).eq('id', 1);

    await this.channel.send({
      type: 'broadcast',
      event: 'game4_set_stage',
      payload: { duration, stageName }
    });
  },

  async revealAnswer() {
    if (!this.channel) this.init();
    const song = this.songsList[this.currentIndex];
    const solution = song ? `${song.interpret} - ${song.titel}` : "Unbekannt";

    await supabaseClient.from('game4_state').update({
      is_revealed: true
    }).eq('id', 1);

    await this.channel.send({
      type: 'broadcast',
      event: 'game4_reveal',
      payload: { solution }
    });
  },

  async resetGame() {
    if (!this.channel) this.init();

    await supabaseClient.from('game4_state').update({
      active_song: null,
      current_index: 0,
      snippet_duration: 0.5,
      snippet_name: 'BEREIT',
      is_revealed: false,
      punkte_runde_blau: 0,
      punkte_runde_rot: 0,
      punkte_runde_gruen: 0,
      punkte_runde_gelb: 0
    }).eq('id', 1);

    await this.channel.send({
      type: 'broadcast',
      event: 'game4_reset',
      payload: {}
    });
  }
};

Game4Admin.init();