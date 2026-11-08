const Game6Admin = {
  currentBid: 0,
  outSlots: [],
  allSlots: [],
  biddingMode: 'captains',
  categories: [],
  currentCategory: null,
  checkedAnswers: new Set(),
  currentState: null,
  channel: null,

  async init() {
    await this.loadCategories();
    await this.fullResync();
    this.setupRealtimeWithReconnect();
    window.addEventListener('focus', () => this.fullResync());
  },

  async fullResync() {
    await this.loadSlots();
    await this.fetchState();
  },

  async loadCategories() {
    const { data } = await supabaseClient.from('game6_categories').select('*').order('id');
    const select = document.getElementById('g6-adm-categories-select');
    if (select && data) {
      this.categories = data;
      select.innerHTML = data.map(c => `<option value="${c.id}">${c.id}. ${c.kategorie || c.title}</option>`).join('');
      this.onCategorySelectChange();
    }
  },

  onCategorySelectChange() {
    const select = document.getElementById('g6-adm-categories-select');
    if (!select || !this.categories.length) return;
    
    const catId = parseInt(select.value);
    const cat = this.categories.find(c => c.id === catId);
    const wikiBtn = document.getElementById('g6-adm-wiki-link');

    if (cat && cat.quelle_url) {
      wikiBtn.href = cat.quelle_url;
      wikiBtn.style.display = 'inline-block';
    } else if (wikiBtn) {
      wikiBtn.style.display = 'none';
    }
  },

  async loadSlots() {
    const { data: slots } = await supabaseClient.from('player_slots').select('*').order('slot_id');
    if (!slots) return;
    this.allSlots = slots;
    this.renderOutToggles();

    const perfSel = document.getElementById('g6-adm-performer-select');
    if (perfSel) {
      perfSel.innerHTML = slots.map(s => `<option value="${s.slot_id}">${s.spieler_name || s.slot_id} (${s.team || 'neutral'})</option>`).join('');
    }
  },

  async fetchState() {
    const { data: stateData } = await supabaseClient.from('game6_state').select('*').eq('id', 1).maybeSingle();
    if (stateData) {
      this.currentState = stateData;
      this.currentBid = stateData.current_highest_bid || 0;
      this.outSlots = stateData.out_slots || [];
      this.biddingMode = stateData.bidding_mode || 'captains';

      if (stateData.topic && this.categories.length) {
        const matchingCat = this.categories.find(c => (c.kategorie || c.title) === stateData.topic);
        if (matchingCat && matchingCat !== this.currentCategory) {
          this.currentCategory = matchingCat;
          this.renderAnswersGrid();
        }
      }
    }
    this.render();
  },

  setupRealtimeWithReconnect() {
    if (this.channel) supabaseClient.removeChannel(this.channel);

    this.channel = supabaseClient
      .channel('game6_admin_clean_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game6_state' }, payload => {
        if (payload.new) {
          this.currentState = payload.new;
          this.currentBid = payload.new.current_highest_bid || 0;
          this.outSlots = payload.new.out_slots || [];
          this.biddingMode = payload.new.bidding_mode || 'captains';
          this.render();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_slots' }, async () => {
        await this.loadSlots();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') this.fullResync();
        if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
          setTimeout(() => this.setupRealtimeWithReconnect(), 2000);
        }
      });
  },

  render() {
    const bidDisp = document.getElementById('g6-adm-bid-disp');
    if (bidDisp) bidDisp.innerText = this.currentBid;

    const targetBidDisp = document.getElementById('g6-adm-target-bid');
    if (targetBidDisp) targetBidDisp.innerText = this.currentBid;

    if (this.currentState) {
      ['blau', 'rot', 'gruen', 'gelb'].forEach(t => {
        const input = document.getElementById(`g6-score-input-${t}`);
        if (input && document.activeElement !== input) {
          input.value = this.currentState[`punkte_${t}`] || 0;
        }
      });
    }

    this.updateModeButtonsUI();
    this.renderOutToggles();
    this.updateCheckCount();
  },

  updateModeButtonsUI() {
    const btnCaps = document.getElementById('g6-adm-mode-caps');
    const btnTeams = document.getElementById('g6-adm-mode-teams');
    const btnChallenge = document.getElementById('g6-adm-mode-challenge');
    
    if (!btnCaps || !btnTeams || !btnChallenge) return;

    [btnCaps, btnTeams, btnChallenge].forEach(b => {
      b.style.background = '#27272a';
      b.style.color = '#a1a1aa';
    });

    if (this.biddingMode === 'captains') {
      btnCaps.style.background = '#2563eb';
      btnCaps.style.color = 'white';
    } else if (this.biddingMode === 'teammates') {
      btnTeams.style.background = '#2563eb';
      btnTeams.style.color = 'white';
    } else if (this.biddingMode === 'challenge') {
      btnChallenge.style.background = '#2563eb';
      btnChallenge.style.color = 'white';
    }
  },

  async setBiddingMode(mode) {
    this.biddingMode = mode;
    this.outSlots = this.outSlots || [];
    this.render();

    await supabaseClient.from('game6_state').update({
      bidding_mode: mode,
      phase: mode === 'challenge' ? 'challenge' : 'bidding',
      out_slots: [],
      updated_at: new Date().toISOString()
    }).eq('id', 1);
  },

  async sendCategory() {
    const catSelect = document.getElementById('g6-adm-categories-select');
    if (!catSelect) return;
    
    const catId = parseInt(catSelect.value);
    const selectedCat = this.categories.find(c => c.id === catId);
    if (!selectedCat) return;

    this.currentCategory = selectedCat;
    this.currentBid = 0;
    this.outSlots = [];
    this.checkedAnswers.clear();

    const topicTitle = selectedCat.kategorie || selectedCat.title;

    this.render();
    this.renderAnswersGrid();

    await supabaseClient.from('game6_state').update({ 
      topic: topicTitle,
      bidding_mode: this.biddingMode,
      current_highest_bid: 0,
      highest_bidder_slot: null,
      out_slots: [],
      phase: this.biddingMode === 'challenge' ? 'challenge' : 'bidding',
      updated_at: new Date().toISOString() 
    }).eq('id', 1);
  },

  renderAnswersGrid() {
    const container = document.getElementById('g6-adm-answers-grid');
    if (!container) return;

    if (!this.currentCategory) {
      container.innerHTML = `<div style="color:#71717a; grid-column: span 2; text-align:center; padding:6px;">Keine Kategorie gewählt</div>`;
      return;
    }

    let answers = [];
    if (Array.isArray(this.currentCategory.antworten_liste)) {
      answers = this.currentCategory.antworten_liste;
    } else if (typeof this.currentCategory.antworten_liste === 'string') {
      answers = this.currentCategory.antworten_liste.split(';').map(a => a.trim());
    }

    container.innerHTML = answers.map((ans, idx) => {
      const isChecked = this.checkedAnswers.has(idx);
      return `
        <button onclick="Game6Admin.toggleAnswerCheck(${idx})" style="
          background: ${isChecked ? '#16a34a' : '#27272a'}; 
          color: ${isChecked ? 'white' : '#d4d4d8'}; 
          border: 1px solid ${isChecked ? '#22c55e' : '#3f3f46'}; 
          padding: 2px 4px; 
          border-radius: 3px; 
          font-size: 9px; 
          line-height: 1.1;
          text-align: left; 
          cursor: pointer; 
          font-weight: ${isChecked ? 'bold' : 'normal'};
          display: flex; 
          align-items: center; 
          gap: 3px;
          height: 22px;
        ">
          <span style="font-size: 8px;">${isChecked ? '✅' : '⚪'}</span>
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${ans}</span>
        </button>
      `;
    }).join('');

    this.updateCheckCount();
  },

  toggleAnswerCheck(index) {
    if (this.checkedAnswers.has(index)) {
      this.checkedAnswers.delete(index);
    } else {
      this.checkedAnswers.add(index);
    }
    this.renderAnswersGrid();
  },

  resetChecklist() {
    this.checkedAnswers.clear();
    this.renderAnswersGrid();
  },

  updateCheckCount() {
    const countSpan = document.getElementById('g6-adm-checked-count');
    if (countSpan) {
      countSpan.innerText = this.checkedAnswers.size;
      if (this.currentBid > 0 && this.checkedAnswers.size >= this.currentBid) {
        countSpan.style.color = '#22c55e';
      } else {
        countSpan.style.color = 'white';
      }
    }
  },

  renderOutToggles() {
    const container = document.getElementById('g6-adm-out-toggles');
    if (!container) return;

    const isCaptains = (this.biddingMode === 'captains');
    const activeSlots = isCaptains 
      ? this.allSlots.filter(s => s.is_captain === true)
      : this.allSlots.filter(s => !s.is_captain && s.team && s.team !== 'neutral');

    container.innerHTML = activeSlots.map(s => {
      const sId = s.slot_id;
      const isOut = this.outSlots.includes(sId);
      const name = s.spieler_name || sId.toUpperCase();
      return `
        <button onclick="Game6Admin.toggleOut('${sId}')" style="background: ${isOut ? '#dc2626' : '#27272a'}; color: white; border: 1px solid #3f3f46; padding: 3px; border-radius: 4px; font-size: 9px; cursor: pointer; font-weight: bold;">
          ${name}: ${isOut ? '❌ FOLD' : 'Aktiv'}
        </button>
      `;
    }).join('');
  },

  async addBid(amount) {
    this.currentBid = Math.max(0, this.currentBid + amount);
    this.render();

    await supabaseClient.from('game6_state').update({ 
      current_highest_bid: this.currentBid, 
      updated_at: new Date().toISOString() 
    }).eq('id', 1);
  },

  async toggleOut(slotId) {
    if (this.outSlots.includes(slotId)) {
      this.outSlots = this.outSlots.filter(s => s !== slotId);
    } else {
      this.outSlots.push(slotId);
    }
    this.renderOutToggles();

    await supabaseClient.from('game6_state').update({ 
      out_slots: this.outSlots, 
      updated_at: new Date().toISOString() 
    }).eq('id', 1);
  },

  async startChallenge() {
    const performer = document.getElementById('g6-adm-performer-select').value;
    
    this.biddingMode = 'challenge';
    this.render();

    await supabaseClient.from('game6_state').update({
      bidding_mode: 'challenge',
      phase: 'challenge',
      active_performer_slot: performer,
      updated_at: new Date().toISOString()
    }).eq('id', 1);
  },

  async setPoints(team, val) {
    const points = parseInt(val) || 0;
    const updateObj = { updated_at: new Date().toISOString() };
    updateObj[`punkte_${team}`] = points;

    await supabaseClient.from('game6_state').update(updateObj).eq('id', 1);
  },

  async resetRound() {
    this.currentBid = 0;
    this.outSlots = [];
    this.biddingMode = 'captains';
    this.checkedAnswers.clear();
    this.renderAnswersGrid();
    
    await supabaseClient.from('game6_state').update({
      phase: 'bidding',
      bidding_mode: 'captains',
      current_highest_bid: 0,
      highest_bidder_slot: null,
      active_performer_slot: null,
      out_slots: [],
      updated_at: new Date().toISOString()
    }).eq('id', 1);
  },

  async resetCompleteGame() {
    if (!confirm("Möchtest du Spiel 6 komplett zurücksetzen (Punkte auf 0, Gebote löschen)?")) return;

    this.currentBid = 0;
    this.outSlots = [];
    this.biddingMode = 'captains';
    this.checkedAnswers.clear();
    this.renderAnswersGrid();

    await supabaseClient.from('game6_state').update({
      topic: null,
      phase: 'bidding',
      bidding_mode: 'captains',
      current_highest_bid: 0,
      highest_bidder_slot: null,
      active_performer_slot: null,
      out_slots: [],
      punkte_blau: 0,
      punkte_rot: 0,
      punkte_gruen: 0,
      punkte_gelb: 0,
      updated_at: new Date().toISOString()
    }).eq('id', 1);
  }
};

Game6Admin.init();