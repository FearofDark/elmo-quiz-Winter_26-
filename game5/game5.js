window.Game5 = {
  state: null,
  currentObjectData: null,
  subscription: null,
  slotSubscription: null,
  isLocalDragging: false,
  dragTimeout: null,
  mySlotId: localStorage.getItem('quiz_studio_my_slot') || null,
  myTeam: null,
  isTeamCaptain: false,

  async init() {
    await this.fetchPlayerSlotInfo();
    await this.loadState();
    this.subscribeRealtime();
  },

  async fetchPlayerSlotInfo() {
    if (!this.mySlotId) return;
    const { data, error } = await supabaseClient
      .from('player_slots')
      .select('*')
      .eq('slot_id', this.mySlotId)
      .maybeSingle();

    if (!error && data) {
      this.myTeam = data.team;
      this.isTeamCaptain = data.is_captain === true;
    }
  },

  async loadState() {
    const { data: stateData, error } = await supabaseClient
      .from('game5_state')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (!error && stateData) {
      this.state = stateData;
      await this.loadObjectDetails(stateData.aktive_runde);
    }
  },

  async loadObjectDetails(roundNum) {
    const { data } = await supabaseClient
      .from('game5_objects')
      .select('*')
      .eq('runden_nummer', roundNum)
      .maybeSingle();

    if (data) this.currentObjectData = data;
    this.render();
  },

  subscribeRealtime() {
    if (this.subscription) return;

    this.subscription = supabaseClient
      .channel('public:game5_combined')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game5_state' }, async payload => {
        if (payload.new) {
          const oldRound = this.state?.aktive_runde;
          const oldReveal = this.state?.reveal_aktiv;
          this.state = payload.new;
          
          if (!oldReveal && this.state.reveal_aktiv && this.state.richtige_groesse) {
            this.state.skalierung = this.state.richtige_groesse;
          }

          if (oldRound !== this.state.aktive_runde) {
            await this.loadObjectDetails(this.state.aktive_runde);
          } else {
            // Ignoriere Realtime-Updates, während der lokale Spieler selbst am Regler zieht (verhindert Lagging)
            if (!this.isLocalDragging) this.render();
          }
        }
      })
      .subscribe();

    this.slotSubscription = supabaseClient
      .channel('public:game5_slots')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'player_slots', filter: `slot_id=eq.${this.mySlotId}` }, async payload => {
        if (payload.new) {
          await this.fetchPlayerSlotInfo();
          this.render();
        }
      })
      .subscribe();
  },

  render() {
    if (!this.state) return;

    const screenOverview = document.getElementById('game5-screen-overview');
    const screenPlaying = document.getElementById('game5-screen-playing');
    const submitBtn = document.getElementById('submit-guess-btn');

    if (this.state.status === 'overview' || !this.myTeam || this.myTeam === 'neutral') {
      if (screenOverview) screenOverview.style.display = 'flex';
      if (screenPlaying) screenPlaying.style.display = 'none';
      return;
    } else {
      if (screenOverview) screenOverview.style.display = 'none';
      if (screenPlaying) screenPlaying.style.display = 'flex';
    }

    if (submitBtn && !submitBtn.dataset.submittedState) {
      if (this.isTeamCaptain) {
        submitBtn.disabled = false;
        submitBtn.innerText = "Tipp absenden";
      } else {
        submitBtn.disabled = true;
        submitBtn.innerText = "Nur der Captain sendet";
      }
    }

    document.getElementById('score-val-1').innerText = this.state.punkte_blau || 0;
    document.getElementById('score-val-2').innerText = this.state.punkte_rot || 0;
    document.getElementById('score-val-3').innerText = this.state.punkte_gruen || 0;
    document.getElementById('score-val-4').innerText = this.state.punkte_gelb || 0;

    if (!this.currentObjectData) return;

    const roundBadge = document.getElementById('game5-round-badge');
    const labelRef = document.getElementById('game5-label-ref');
    const labelTarget = document.getElementById('game5-label-target');
    const refContainer = document.getElementById('game5-ref-outline-container');
    const targetWrapper = document.getElementById('game5-target-wrapper');
    const slider = document.getElementById('game5-slider');
    const scaleVal = document.getElementById('game5-scale-value');

    const currentScale = (this.state.reveal_aktiv && this.state.richtige_groesse) 
      ? parseFloat(this.state.richtige_groesse) 
      : (parseFloat(this.state.skalierung) || 1.0);

    const roundNum = this.state?.aktive_runde || 1;

    const cleanRefName = this.currentObjectData.referenz_name.replace(/\s*\(.*?\)/g, '');
    const cleanTargetName = this.currentObjectData.ziel_name.replace(/\s*\(.*?\)/g, '');

    if (roundBadge) roundBadge.innerText = `🎯 RUNDE ${roundNum} / 20`;
    
    if (this.state.reveal_aktiv) {
      if (labelRef) labelRef.innerText = `${cleanRefName} (${this.currentObjectData.referenz_groesse_text})`;
      if (labelTarget) labelTarget.innerText = `${cleanTargetName} (${this.currentObjectData.ziel_groesse_text})`;
    } else {
      if (labelRef) labelRef.innerText = cleanRefName;
      if (labelTarget) labelTarget.innerText = cleanTargetName;
    }

    const refFileId = roundNum * 2 - 1;
    const targetFileId = roundNum * 2;

    if (refContainer) {
      refContainer.innerHTML = `
        <img src="game5/svg/${refFileId}.svg" alt="${cleanRefName}" onerror="this.style.display='none'" style="width: 80px; height: 80px; object-fit: contain; filter: drop-shadow(0 0 10px rgba(255,255,255,0.3)); display: block;" />
      `;
    }

    let targetHtml = `
      <img src="game5/svg/${targetFileId}.svg" alt="${cleanTargetName}" onerror="this.style.display='none'" style="width: 80px; height: 80px; object-fit: contain; transform: scale(${currentScale}); transform-origin: bottom left; filter: drop-shadow(0 0 16px rgba(192,132,252,0.7)); display: block;" />
    `;

    if (this.state.reveal_aktiv) {
      const teamsToRender = [
        { num: 1, name: 'Blau', revealed: this.state.reveal_t1, val: this.state.tipp_team_1, color: 'rgba(56, 189, 248, 0.8)' },
        { num: 2, name: 'Rot', revealed: this.state.reveal_t2, val: this.state.tipp_team_2, color: 'rgba(248, 113, 113, 0.8)' },
        { num: 3, name: 'Grün', revealed: this.state.reveal_t3, val: this.state.tipp_team_3, color: 'rgba(74, 222, 128, 0.8)' },
        { num: 4, name: 'Gelb', revealed: this.state.reveal_t4, val: this.state.tipp_team_4, color: 'rgba(234, 179, 8, 0.8)' }
      ];

      teamsToRender.forEach(t => {
        if (t.revealed && t.val) {
          const factor = parseFloat(t.val);
          targetHtml += `
            <div style="position: absolute; bottom: 0; left: 0; pointer-events: none;">
              <img src="game5/svg/${targetFileId}.svg" style="width: 80px; height: 80px; object-fit: contain; transform: scale(${factor}); transform-origin: bottom left; filter: drop-shadow(0 0 14px ${t.color}); opacity: 0.85; display: block;" />
              <span style="position: absolute; bottom: ${factor * 80 + 5}px; left: 0; background: rgba(15, 23, 42, 0.9); color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; border: 1px solid ${t.color}; z-index: 20; white-space: nowrap;">Team ${t.name}: ${factor.toFixed(2)}x</span>
            </div>
          `;
        }
      });
    }

    if (targetWrapper) {
      targetWrapper.innerHTML = targetHtml;
    }

    if (scaleVal) scaleVal.innerText = `${currentScale.toFixed(2)}x`;
    if (slider && !this.isLocalDragging) slider.value = currentScale;
  },

  // Robustes, flüssiges Skalieren ohne Lag durch Debouncing
  async onSliderChange(val) {
    if (this.state?.reveal_aktiv) return;
    this.isLocalDragging = true;
    const newScale = parseFloat(val);

    const scaleVal = document.getElementById('game5-scale-value');
    if (scaleVal) scaleVal.innerText = `${newScale.toFixed(2)}x`;

    const targetImg = document.querySelector('#game5-target-wrapper img');
    if (targetImg) targetImg.style.transform = `scale(${newScale})`;

    if (this.dragTimeout) clearTimeout(this.dragTimeout);

    this.dragTimeout = setTimeout(async () => {
      await supabaseClient.from('game5_state').update({ skalierung: newScale, updated_at: new Date() }).eq('id', 1);
      setTimeout(() => { this.isLocalDragging = false; }, 150);
    }, 60);
  },

  async resetScale() {
    if (this.state?.reveal_aktiv) return;
    this.isLocalDragging = false;
    await supabaseClient.from('game5_state').update({ skalierung: 1.0, updated_at: new Date() }).eq('id', 1);
  },

  async submitGuess() {
    if (!this.isTeamCaptain) return;

    const currentScale = parseFloat(this.state?.skalierung) || 1.0;
    const columnMapping = { 'blau': 'tipp_team_1', 'rot': 'tipp_team_2', 'gruen': 'tipp_team_3', 'gelb': 'tipp_team_4' };
    const targetColumn = columnMapping[this.myTeam];

    if (!targetColumn) return;

    const updateObj = { updated_at: new Date() };
    updateObj[targetColumn] = currentScale;

    const { error } = await supabaseClient.from('game5_state').update(updateObj).eq('id', 1);

    const submitBtn = document.getElementById('submit-guess-btn');
    if (!error && submitBtn) {
      submitBtn.dataset.submittedState = "true";
      submitBtn.style.background = "#3b82f6";
      submitBtn.innerText = "Tipp gesendet! ✓";
      setTimeout(() => {
        submitBtn.dataset.submittedState = "";
        submitBtn.style.background = "";
        submitBtn.innerText = "Tipp absenden";
      }, 2500);
    }
  }
};

window.reloadGame5Only = async function() {
  console.log("🔄 Spiel 5 wird lokal neu initialisiert...");
  await window.Game5.loadState();
};

Game5.init();