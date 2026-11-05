const Game6Admin = {
  currentBid: 0,
  outSlots: [],
  allSlots: [],
  biddingMode: 'captains',
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
      select.innerHTML = data.map(c => `<option value="${c.title}">${c.id}. ${c.title}</option>`).join('');
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
      this.currentBid = stateData.current_highest_bid || 0;
      this.outSlots = stateData.out_slots || [];
      this.biddingMode = stateData.bidding_mode || 'captains';
    }
    this.render();
  },

  setupRealtimeWithReconnect() {
    if (this.channel) supabaseClient.removeChannel(this.channel);

    this.channel = supabaseClient
      .channel('game6_admin_clean_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game6_state' }, payload => {
        if (payload.new) {
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

    this.updateModeButtonsUI();
    this.renderOutToggles();
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
    const cat = catSelect.value;

    this.currentBid = 0;
    this.outSlots = [];
    this.render();

    await supabaseClient.from('game6_state').update({ 
      topic: cat,
      bidding_mode: this.biddingMode,
      current_highest_bid: 0,
      highest_bidder_slot: null,
      out_slots: [],
      phase: this.biddingMode === 'challenge' ? 'challenge' : 'bidding',
      updated_at: new Date().toISOString() 
    }).eq('id', 1);
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
        <button onclick="Game6Admin.toggleOut('${sId}')" style="background: ${isOut ? '#dc2626' : '#27272a'}; color: white; border: 1px solid #3f3f46; padding: 4px; border-radius: 4px; font-size: 9px; cursor: pointer; font-weight: bold;">
          ${name}: ${isOut ? '❌ FOLD' : 'Aktiv'}
        </button>
      `;
    }).join('');
  },

  async addBid(amount) {
    this.currentBid = Math.max(0, this.currentBid + amount);
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

  // Startet den Challenge-Modus sauber ohne das alte Global-Layout aufzurufen
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

  async resetRound() {
    this.currentBid = 0;
    this.outSlots = [];
    this.biddingMode = 'captains';
    
    await supabaseClient.from('game6_state').update({
      phase: 'bidding',
      bidding_mode: 'captains',
      current_highest_bid: 0,
      highest_bidder_slot: null,
      active_performer_slot: null,
      out_slots: [],
      updated_at: new Date().toISOString()
    }).eq('id', 1);
  }
};

Game6Admin.init();