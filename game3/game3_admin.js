window.AdminGame3 = {
  channel: null,
  pantomimeList: [],
  pantomimeIndex: 0,
  tabuList: [],
  tabuIndex: 0,
  currentMode: 'intro',
  playerNames: {},
  teamNames: { blau: 'Blau', rot: 'Rot', gruen: 'Grün', gelb: 'Gelb' },

  async init() {
    this.channel = supabaseClient.channel('game3_room_channel');
    await this.channel.subscribe();

    await this.fetchPlayerNames();
    await this.fetchTeamNamesFromGameState();
    await this.fetchPantomimeWords();
    await this.fetchTabuCards();
    await this.loadScores();

    // Live-Sync für Punkte, Spielernamen und Teamnamen über Supabase Postgres Changes
    supabaseClient
      .channel('admin_game3_db_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game3_state' }, () => {
        this.loadScores();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_state' }, () => {
        this.fetchTeamNamesFromGameState();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_slots' }, () => {
        this.fetchPlayerNames();
      })
      .subscribe();
  },

  // Echte Teamnamen direkt aus der game_state Tabelle laden (z.B. team_gelb_name: "Dennis suckt")
  async fetchTeamNamesFromGameState() {
    try {
      const { data, error } = await supabaseClient
        .from('game_state')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        if (data.team_blau_name) this.teamNames.blau = data.team_blau_name;
        if (data.team_rot_name) this.teamNames.rot = data.team_rot_name;
        if (data.team_gruen_name) this.teamNames.gruen = data.team_gruen_name;
        if (data.team_gelb_name) this.teamNames.gelb = data.team_gelb_name;

        // UI-Labels im Admin-Panel aktualisieren
        ['blau', 'rot', 'gruen', 'gelb'].forEach(t => {
          const labelEl = document.getElementById(`admin-team-label-${t}`);
          if (labelEl) {
            labelEl.innerText = this.teamNames[t];
          }
        });
      }
    } catch (err) {
      console.error("Fehler beim Laden der Teamnamen aus game_state:", err);
    }
  },

  // Echte Spielernamen aus der Datenbank-Tabelle player_slots laden
  async fetchPlayerNames() {
    try {
      const { data, error } = await supabaseClient
        .from('player_slots')
        .select('slot_id, spieler_name');

      if (!error && data) {
        const selectEl = document.getElementById('admin-game3-active-slot');
        const currentValue = selectEl ? selectEl.value : '';

        data.forEach(item => {
          this.playerNames[item.slot_id] = item.spieler_name || item.slot_id;
        });

        if (selectEl) {
          selectEl.innerHTML = `<option value="">-- Kein Spieler ausgewählt --</option>`;
          data.forEach(item => {
            const name = item.spieler_name && item.spieler_name.trim() !== '' 
              ? item.spieler_name 
              : item.slot_id;
            selectEl.innerHTML += `<option value="${item.slot_id}">${name} (${item.slot_id})</option>`;
          });
          selectEl.value = currentValue;
        }
      }
    } catch (err) {
      console.error("Fehler beim Laden der Spielernamen aus player_slots:", err);
    }
  },

  async loadScores() {
    const { data } = await supabaseClient.from('game3_state').select('*').eq('id', 1).maybeSingle();
    if (data) {
      ['blau', 'rot', 'gruen', 'gelb'].forEach(t => {
        const scoreEl = document.getElementById(`admin-score-${t}`);
        if (scoreEl) scoreEl.innerText = data[`punkte_runde_${t}`] ?? 0;
      });
    }
  },

  async addPoints(team, amount) {
    const { data } = await supabaseClient.from('game3_state').select('*').eq('id', 1).maybeSingle();
    if (!data) return;

    const columnName = `punkte_runde_${team}`;
    const newValue = Math.max(0, (data[columnName] || 0) + amount);

    await supabaseClient.from('game3_state').update({ [columnName]: newValue }).eq('id', 1);
    this.loadScores();
  },

  async setMode(mode) {
    this.currentMode = mode;
    this.channel.send({
      type: 'broadcast',
      event: 'game3_set_mode',
      payload: { mode }
    });
    await this.saveStateToSupabase();
  },

  async fetchPantomimeWords() {
    const { data, error } = await supabaseClient
      .from('game3_pantomime_words')
      .select('*')
      .order('id', { ascending: true });

    if (!error && data) {
      this.pantomimeList = data;
      this.updatePantomimeUI();
      await this.saveStateToSupabase();
    }
  },

  async startTimerForCurrentPantomime() {
    if (this.pantomimeList.length === 0) return;

    if (this.pantomimeIndex < this.pantomimeList.length - 1) {
      this.pantomimeIndex++;
    } else {
      this.pantomimeIndex = 0;
    }
    this.updatePantomimeUI();

    const inputVal = document.getElementById('admin-pantomime-seconds').value;
    const duration = parseInt(inputVal) || 60;
    const endTime = Date.now() + duration * 1000;

    await supabaseClient.from('game3_state').update({ 
      timer_end: endTime
    }).eq('id', 1);

    this.channel.send({
      type: 'broadcast',
      event: 'game3_start_timer',
      payload: { endTime }
    });
    
    await this.broadcastState();
  },

  async loadPantomimeWord(direction) {
    if (this.pantomimeList.length === 0) return;

    if (direction === 'next') {
      if (this.pantomimeIndex < this.pantomimeList.length - 1) this.pantomimeIndex++;
    } else if (direction === 'prev') {
      if (this.pantomimeIndex > 0) this.pantomimeIndex--;
    }

    this.updatePantomimeUI();
    await this.broadcastState();
  },

  updatePantomimeUI() {
    const liveEl = document.getElementById('admin-game3-live-word');
    const nextEl = document.getElementById('admin-game3-next-word');
    const countEl = document.getElementById('admin-game3-pantomime-count');

    const currentItem = this.pantomimeList[this.pantomimeIndex];
    const nextItem = this.pantomimeList[this.pantomimeIndex + 1];

    if (liveEl) liveEl.innerText = currentItem ? currentItem.word : 'Noch nicht geladen';
    if (nextEl) nextEl.innerText = nextItem ? nextItem.word : '(Keine weiteren Begriffe)';
    if (countEl) countEl.innerText = `Fortschritt: ${Math.max(0, this.pantomimeIndex + 1)} / ${this.pantomimeList.length}`;
  },

  async fetchTabuCards() {
    const { data, error } = await supabaseClient
      .from('game3_tabu_cards')
      .select('*')
      .order('id', { ascending: true });

    if (!error && data) {
      this.tabuList = data;
      this.updateTabuUI();
      await this.saveStateToSupabase();
    }
  },

  async startTimerForCurrentTabu() {
    if (this.tabuList.length === 0) return;

    if (this.tabuIndex < this.tabuList.length - 1) {
      this.tabuIndex++;
    } else {
      this.tabuIndex = 0;
    }
    this.updateTabuUI();

    const inputVal = document.getElementById('admin-tabu-seconds').value;
    const duration = parseInt(inputVal) || 60;
    const endTime = Date.now() + duration * 1000;

    await supabaseClient.from('game3_state').update({ 
      timer_end: endTime
    }).eq('id', 1);

    this.channel.send({
      type: 'broadcast',
      event: 'game3_start_timer',
      payload: { endTime }
    });

    await this.broadcastState();
  },

  async loadTabuCard(direction) {
    if (this.tabuList.length === 0) return;

    if (direction === 'next') {
      if (this.tabuIndex < this.tabuList.length - 1) this.tabuIndex++;
    } else if (direction === 'prev') {
      if (this.tabuIndex > 0) this.tabuIndex--;
    }

    this.updateTabuUI();
    await this.broadcastState();
  },

  updateTabuUI() {
    const liveMainEl = document.getElementById('admin-game3-tabu-live-main');
    const liveForbiddenEl = document.getElementById('admin-game3-tabu-live-forbidden');
    const nextMainEl = document.getElementById('admin-game3-tabu-next-main');
    const nextForbiddenEl = document.getElementById('admin-game3-tabu-next-forbidden');
    const countEl = document.getElementById('admin-game3-tabu-count');

    const currentItem = this.tabuList[this.tabuIndex];
    const nextItem = this.tabuList[this.tabuIndex + 1];

    if (currentItem) {
      if (liveMainEl) liveMainEl.innerText = currentItem.main_word;
      const forbidden = [currentItem.forbidden_1, currentItem.forbidden_2, currentItem.forbidden_3, currentItem.forbidden_4, currentItem.forbidden_5].filter(Boolean);
      if (liveForbiddenEl) liveForbiddenEl.innerText = `Verboten: ${forbidden.join(', ')}`;
    } else {
      if (liveMainEl) liveMainEl.innerText = 'Noch nicht geladen';
      if (liveForbiddenEl) liveForbiddenEl.innerText = '---';
    }

    if (nextItem) {
      if (nextMainEl) nextMainEl.innerText = nextItem.main_word;
      const forbiddenNext = [nextItem.forbidden_1, nextItem.forbidden_2, nextItem.forbidden_3, nextItem.forbidden_4, nextItem.forbidden_5].filter(Boolean);
      if (nextForbiddenEl) nextForbiddenEl.innerText = `Verboten: ${forbiddenNext.join(', ')}`;
    } else {
      if (nextMainEl) nextMainEl.innerText = '(Keine weiteren Karten)';
      if (nextForbiddenEl) nextForbiddenEl.innerText = '---';
    }

    if (countEl) countEl.innerText = `Fortschritt: ${Math.max(0, this.tabuIndex + 1)} / ${this.tabuList.length}`;
  },

  async saveStateToSupabase() {
    const activeSlotSelect = document.getElementById('admin-game3-active-slot');
    const activeSlot = activeSlotSelect ? activeSlotSelect.value : '';
    const currentWordItem = this.pantomimeList[this.pantomimeIndex];
    const currentTabuItem = this.tabuList[this.tabuIndex];

    await supabaseClient.from('game3_state').upsert({
      id: 1,
      mode: this.currentMode,
      active_slot: activeSlot,
      current_word: currentWordItem ? currentWordItem.word : '',
      tabu_card: currentTabuItem || null
    });
  },

  async broadcastState() {
    await this.saveStateToSupabase();

    const activeSlotSelect = document.getElementById('admin-game3-active-slot');
    const activeSlot = activeSlotSelect ? activeSlotSelect.value : '';
    const currentWordItem = this.pantomimeList[this.pantomimeIndex];
    const currentTabuItem = this.tabuList[this.tabuIndex];

    this.channel.send({
      type: 'broadcast',
      event: 'game3_update_state',
      payload: {
        activeSlot: activeSlot,
        word: currentWordItem ? currentWordItem.word : '',
        tabuCard: currentTabuItem || null
      }
    });
  }
};

AdminGame3.init();