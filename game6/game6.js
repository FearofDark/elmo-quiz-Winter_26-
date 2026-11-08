const Game6 = {
  state: null,
  allSlots: [],
  captains: [],
  teammates: [],
  activeRenderedSlots: ['', '', '', ''],
  renderedFocusSlot: null,
  channel: null,

  async init() {
    await this.fullResync();
    this.setupRealtimeWithReconnect();
    window.addEventListener('focus', () => this.fullResync());
  },

  async fullResync() {
    await this.fetchSlots();
    await this.fetchState();
  },

  async fetchSlots() {
    const { data } = await supabaseClient.from('player_slots').select('*').order('slot_id');
    if (data) {
      this.allSlots = data;
      // FIX: Hier waren Kapitäne und Teammates vertauscht.
      // Kapitäne sind die Spieler mit is_captain === true. 
      // Teammates sind alle anderen aktiven Spieler in Teams.
      this.captains = data.filter(s => s.is_captain === true).map(s => s.slot_id);
      this.teammates = data.filter(s => (!s.is_captain || s.is_captain === false) && s.team && s.team !== 'neutral').map(s => s.slot_id);
    }
  },

  async fetchState() {
    const { data } = await supabaseClient.from('game6_state').select('*').eq('id', 1).maybeSingle();
    if (data) {
      this.state = data;
      this.render();
    }
  },

  setupRealtimeWithReconnect() {
    if (this.channel) supabaseClient.removeChannel(this.channel);

    this.channel = supabaseClient
      .channel('game6_player_robust_reconnect')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game6_state' }, payload => {
        if (payload.new) {
          this.state = payload.new;
          this.render();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_slots' }, async () => {
        await this.fetchSlots();
        this.render();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.fullResync();
        }
        if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
          setTimeout(() => this.setupRealtimeWithReconnect(), 2000);
        }
      });
  },

  updateGlobalSidebarFade(isChallengeMode, activeBiddingSlots, focusedSlot) {
    const allSidebarBoxes = document.querySelectorAll('.cam-box');
    
    allSidebarBoxes.forEach(box => {
      const boxId = box.id;
      const slotName = boxId.replace('box-', '');

      if (isChallengeMode) {
        box.classList.add('is-fused-out');
      } else {
        const isActiveBidding = activeBiddingSlots.includes(slotName);
        const isCurrentlyFocused = (focusedSlot && slotName === focusedSlot);

        if (isActiveBidding || isCurrentlyFocused) {
          box.classList.add('is-fused-out');
        } else {
          box.classList.remove('is-fused-out');
        }
      }
    });
  },

  render() {
    if (!this.state) {
      const bannerTitle = document.getElementById('g6-banner-title');
      if (bannerTitle) bannerTitle.innerText = 'Lade Spielstatus...';
      return;
    }

    const scoreBlau = document.getElementById('g6-score-blau');
    const scoreRot = document.getElementById('g6-score-rot');
    const scoreGruen = document.getElementById('g6-score-gruen');
    const scoreGelb = document.getElementById('g6-score-gelb');

    if (scoreBlau) scoreBlau.innerText = this.state.punkte_blau || 0;
    if (scoreRot) scoreRot.innerText = this.state.punkte_rot || 0;
    if (scoreGruen) scoreGruen.innerText = this.state.punkte_gruen || 0;
    if (scoreGelb) scoreGelb.innerText = this.state.punkte_gelb || 0;

    const isChallengeMode = (this.state.bidding_mode === 'challenge' || this.state.phase === 'challenge');
    const isCaptainsMode = (this.state.bidding_mode === 'captains');
    const focusedSlot = this.state.active_performer_slot;

    // FIX: Im Kapitäns-Modus nehmen wir die echten Kapitäne, im Teammates-Modus die Teammates
    const activeBiddingSlots = isCaptainsMode 
      ? (this.captains.length > 0 ? this.captains : ['player_1', 'player_2', 'player_3', 'player_4'])
      : (this.teammates.length > 0 ? this.teammates : ['player_5', 'player_6', 'player_7', 'player_8']);

    this.updateGlobalSidebarFade(isChallengeMode, activeBiddingSlots, focusedSlot);

    const normalBanner = document.getElementById('g6-normal-banner');
    const biddingGridView = document.getElementById('g6-bidding-grid-view');
    const challengeFocusView = document.getElementById('g6-challenge-focus-view');

    if (isChallengeMode) {
      if (normalBanner) normalBanner.style.display = 'none';
      if (biddingGridView) biddingGridView.style.display = 'none';
      if (challengeFocusView) challengeFocusView.style.display = 'flex';

      const topicText = document.getElementById('g6-challenge-topic-text');
      const targetVal = document.getElementById('g6-challenge-target-val');

      if (topicText) topicText.innerText = this.state.topic || 'Kategorie';
      if (targetVal) targetVal.innerText = this.state.current_highest_bid || 0;

      const focusWrap = document.getElementById('g6-focus-iframe-wrap');
      const focusBoxBorder = document.getElementById('g6-focus-box-border');

      if (focusedSlot) {
        const slotObj = this.allSlots.find(s => s.slot_id === focusedSlot);
        const team = slotObj?.team?.toLowerCase();

        let teamBorderColor = '#3b82f6';
        if (team === 'rot' || team === 'red') teamBorderColor = '#ef4444';
        else if (team === 'blau' || team === 'blue') teamBorderColor = '#0070f3';
        else if (team === 'grün' || team === 'green' || team === 'gruen') teamBorderColor = '#22c55e';
        else if (team === 'gelb' || team === 'yellow') teamBorderColor = '#eab308';

        if (focusBoxBorder) {
          focusBoxBorder.style.borderColor = teamBorderColor;
          focusBoxBorder.style.boxShadow = `0 20px 50px rgba(0,0,0,0.9), 0 0 35px ${teamBorderColor}55`;
        }
      }

      if (focusedSlot && focusWrap) {
        if (this.renderedFocusSlot !== focusedSlot || !focusWrap.hasChildNodes()) {
          this.renderedFocusSlot = focusedSlot;
          const streamUrl = typeof getStreamUrl === 'function' ? getStreamUrl(focusedSlot) : `https://vdo.ninja/?view=${focusedSlot}&solo=1&room=DieElmigos_Stream&password=mikestinkt&quality=2&framerate=24&bitrate=500&max_bitrate=800&codec=vp9`;
          focusWrap.innerHTML = `<iframe src="${streamUrl}" allow="autoplay; camera; microphone; fullscreen; display-capture" style="width:100%; height:100%; border:none;"></iframe>`;
        }
      }
    } else {
      if (normalBanner) normalBanner.style.display = 'flex';
      if (biddingGridView) biddingGridView.style.display = 'flex';
      if (challengeFocusView) challengeFocusView.style.display = 'none';
      this.renderedFocusSlot = null;

      const bannerTitle = document.getElementById('g6-banner-title');
      if (bannerTitle) bannerTitle.innerText = this.state.topic || 'Warte auf Kategorie...';

      const chipsVal = document.getElementById('g6-poker-chips-val');
      if (chipsVal) {
        chipsVal.innerText = this.state.current_highest_bid || 0;
      }

      const displaySlots = activeBiddingSlots;
      const outSlots = this.state.out_slots || [];

      displaySlots.forEach((slotId, idx) => {
        const titleEl = document.getElementById(`g6-seat-title-${idx}`);
        const wrapEl = document.getElementById(`g6-iframe-wrap-${idx}`);
        const boxEl = document.getElementById(`g6-seat-box-${idx}`);
        const overlayEl = document.getElementById(`g6-seat-overlay-${idx}`);

        const slotObj = this.allSlots.find(s => s.slot_id === slotId);
        const displayName = slotObj?.spieler_name || slotId.replace('_', ' ').toUpperCase();
        const isCap = slotObj?.is_captain === true;

        if (titleEl) titleEl.innerText = `${isCap ? '👑' : '👤'} ${displayName}`;

        // FIX: Erzwingt das korrekte Laden der iFrames in den 4 Raster-Boxen der Mitte
        if (wrapEl) {
          if (this.activeRenderedSlots[idx] !== slotId || !wrapEl.querySelector('iframe')) {
            this.activeRenderedSlots[idx] = slotId;
            const streamUrl = typeof getStreamUrl === 'function' ? getStreamUrl(slotId) : `https://vdo.ninja/?view=${slotId}&solo=1&room=DieElmigos_Stream&password=mikestinkt&quality=2&mesh=0&maxviews=100&codec=vp9&clean`;
            wrapEl.innerHTML = `<iframe src="${streamUrl}" allow="autoplay; camera; microphone; fullscreen; display-capture" style="width:100%; height:100%; border:none;"></iframe>`;
          }
        }

        const isOut = outSlots.includes(slotId);
        if (overlayEl) overlayEl.style.display = isOut ? 'flex' : 'none';

        if (boxEl) {
          if (isOut) {
            boxEl.className = "g6-poker-seat g6-seat-normal";
            boxEl.style.opacity = '0.35';
            boxEl.style.filter = 'grayscale(100%)';
            boxEl.style.borderColor = '#dc2626';
          } else {
            boxEl.className = "g6-poker-seat g6-seat-normal";
            boxEl.style.opacity = '1';
            boxEl.style.filter = 'none';
            boxEl.style.borderColor = '#27272a';
          }
        }
      });
    }
  }
};

window.reloadGame6Only = async function() {
  await Game6.fullResync();
};

Game6.init();