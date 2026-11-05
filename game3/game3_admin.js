window.AdminGame3 = {
  channel: null,
  pantomimeList: [],
  pantomimeIndex: -1,
  tabuList: [],
  tabuIndex: -1,
  currentMode: 'intro',

  async init() {
    this.channel = supabaseClient.channel('game3_room_channel');
    await this.channel.subscribe();

    await this.fetchPantomimeWords();
    await this.fetchTabuCards();
    await this.loadScores();

    // Live-Sync für die Punkteanzeige im Admin-Panel über game3_state
    supabaseClient
      .channel('admin_scores_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game3_state' }, () => {
        this.loadScores();
      })
      .subscribe();
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
    }
  },

  async loadPantomimeWord(direction) {
    if (this.pantomimeList.length === 0) return;

    if (direction === 'next') {
      if (this.pantomimeIndex < this.pantomimeList.length - 1) this.pantomimeIndex++;
    } else if (direction === 'prev') {
      if (this.pantomimeIndex > 0) this.pantomimeIndex--;
    }

    this.updatePantomimeUI();
    // AUTOMATISCH TIMER STOPPEN BEIM BEGRIFFS-WECHSEL
    await this.stopTimer();
    await this.broadcastState();
  },

  updatePantomimeUI() {
    const liveEl = document.getElementById('admin-game3-live-word');
    const nextEl = document.getElementById('admin-game3-next-word');
    const countEl = document.getElementById('admin-game3-pantomime-count');

    const currentItem = this.pantomimeList[this.pantomimeIndex];
    const nextItem = this.pantomimeList[this.pantomimeIndex + 1];

    if (liveEl) liveEl.innerText = currentItem ? currentItem.word : 'Noch nicht gestartet';
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
    }
  },

  async loadTabuCard(direction) {
    if (this.tabuList.length === 0) return;

    if (direction === 'next') {
      if (this.tabuIndex < this.tabuList.length - 1) this.tabuIndex++;
    } else if (direction === 'prev') {
      if (this.tabuIndex > 0) this.tabuIndex--;
    }

    this.updateTabuUI();
    // AUTOMATISCH TIMER STOPPEN BEIM KARTEN-WECHSEL
    await this.stopTimer();
    await this.broadcastState();
  },

  async startTimer() {
    const inputVal = document.getElementById('admin-timer-seconds').value;
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
  },

  async stopTimer() {
    await supabaseClient.from('game3_state').update({ timer_end: null }).eq('id', 1);
    this.channel.send({
      type: 'broadcast',
      event: 'game3_stop_timer',
      payload: {}
    });
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
      if (liveMainEl) liveMainEl.innerText = 'Noch nicht gestartet';
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