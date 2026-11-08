window.Game5Admin = {
  currentState: null,
  currentObject: null,

  async init() {
    await this.loadData();
    
    supabaseClient.channel('game5_admin_state')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game5_state' }, payload => {
        if (payload.new) {
          this.currentState = payload.new;
          this.updateUI();
          if (!this.currentObject || this.currentObject.runden_nummer !== this.currentState.aktive_runde) {
            this.loadObjectData(this.currentState.aktive_runde);
          }
        }
      })
      .subscribe();

    supabaseClient.channel('game5_admin_objects')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game5_objects' }, payload => {
        if (payload.new && this.currentState && payload.new.runden_nummer === this.currentState.aktive_runde) {
          this.currentObject = payload.new;
          this.updateUI();
        }
      })
      .subscribe();
  },

  async loadData() {
    const { data: stateData } = await supabaseClient.from('game5_state').select('*').eq('id', 1).maybeSingle();
    if (stateData) {
      this.currentState = stateData;
      await this.loadObjectData(stateData.aktive_runde);
    }
  },

  async loadObjectData(roundNum) {
    const { data } = await supabaseClient.from('game5_objects').select('*').eq('runden_nummer', roundNum).maybeSingle();
    if (data) {
      this.currentObject = data;
    }
    this.updateUI();
  },

  updateUI() {
    if (!this.currentState) return;

    const btnOverview = document.getElementById('btn-status-overview');
    const btnPlaying = document.getElementById('btn-status-playing');
    
    if (this.currentState.status === 'overview') {
      if (btnOverview) { btnOverview.style.background = '#eab308'; btnOverview.style.color = '#000'; }
      if (btnPlaying) { btnPlaying.style.background = '#334155'; btnPlaying.style.color = '#fff'; }
    } else {
      if (btnOverview) { btnOverview.style.background = '#334155'; btnOverview.style.color = '#fff'; }
      if (btnPlaying) { btnPlaying.style.background = '#10b981'; btnPlaying.style.color = '#fff'; }
    }

    const roundLabel = document.getElementById('admin-game5-round-label');
    if (roundLabel) roundLabel.innerText = `🎯 Runde ${this.currentState.aktive_runde} / 20`;
    
    const korrekterFaktor = parseFloat(this.currentObject?.loesung_faktor || 1.0);

    const refNameEl = document.getElementById('admin-ref-name');
    const refMeterEl = document.getElementById('admin-ref-meter');
    const targetNameEl = document.getElementById('admin-target-name');
    const targetMeterEl = document.getElementById('admin-target-meter');
    const targetFactorEl = document.getElementById('admin-target-factor');

    if (refNameEl) refNameEl.innerText = this.currentObject ? this.currentObject.referenz_name : 'Lade...';
    if (refMeterEl) refMeterEl.innerText = this.currentObject ? `Größe: ${this.currentObject.referenz_groesse_text}` : '';
    
    if (targetNameEl) targetNameEl.innerText = this.currentObject ? this.currentObject.ziel_name : 'Lade...';
    if (targetMeterEl) targetMeterEl.innerText = this.currentObject ? `Größe: ${this.currentObject.ziel_groesse_text}` : '';
    if (targetFactorEl) targetFactorEl.innerText = `${korrekterFaktor.toFixed(2)}x`;

    const teams = [
      { key: 'blau', colReveal: 'reveal_t1', colTip: 'tipp_team_1', colScore: 'punkte_blau', name: 'Blau', border: '#38bdf8' },
      { key: 'rot', colReveal: 'reveal_t2', colTip: 'tipp_team_2', colScore: 'punkte_rot', name: 'Rot', border: '#f87171' },
      { key: 'gruen', colReveal: 'reveal_t3', colTip: 'tipp_team_3', colScore: 'punkte_gruen', name: 'Grün', border: '#4ade80' },
      { key: 'gelb', colReveal: 'reveal_t4', colTip: 'tipp_team_4', colScore: 'punkte_gelb', name: 'Gelb', border: '#eab308' }
    ];

    teams.forEach(t => {
      const tipVal = this.currentState[t.colTip];
      t.hasTip = tipVal !== null && tipVal !== undefined;
      t.tipNum = t.hasTip ? parseFloat(tipVal) : null;
      t.diff = t.hasTip ? Math.abs(t.tipNum - korrekterFaktor) : -1;
    });

    teams.sort((a, b) => {
      if (!a.hasTip && !b.hasTip) return 0;
      if (!a.hasTip) return 1;
      if (!b.hasTip) return -1;
      return b.diff - a.diff;
    });

    const container = document.getElementById('admin-teams-container');
    if (!container) return;

    let html = '';
    teams.forEach(t => {
      const score = this.currentState[t.colScore] || 0;
      const isRevealed = this.currentState[t.colReveal];
      
      let tipText = 'Wartet...';
      if (t.hasTip) {
        tipText = isRevealed 
          ? `${t.tipNum.toFixed(2)}x (Diff: ${t.diff.toFixed(2)}) [Aufgedeckt]` 
          : `${t.tipNum.toFixed(2)}x (Eingereicht ✓)`;
      }

      html += `
        <div style="background: #09090b; padding: 8px; border-radius: 6px; border-left: 3px solid ${t.border}; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px;">${t.name} (${score} P): ${tipText}</span>
          <div style="display: flex; gap: 4px;">
            <button onclick="Game5Admin.revealTeam('${t.colReveal}')" style="background: #2563eb; color: white; border: none; padding: 3px 8px; font-size: 10px; border-radius: 3px; cursor: pointer;">Aufdecken</button>
            <button onclick="Game5Admin.addPoints('${t.colScore}', 1)" style="background: #047857; color: white; border: none; padding: 3px 6px; font-size: 10px; border-radius: 3px; cursor: pointer;" title="Punkt dazu">+1 Pkt</button>
            <button onclick="Game5Admin.addPoints('${t.colScore}', -1)" style="background: #b91c1c; color: white; border: none; padding: 3px 6px; font-size: 10px; border-radius: 3px; cursor: pointer;" title="Punkt abziehen">-1</button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  async setStatus(newStatus) {
    await supabaseClient.from('game5_state').update({
      status: newStatus,
      updated_at: new Date()
    }).eq('id', 1);
  },

  async changeRound(direction) {
    let newRound = (this.currentState?.aktive_runde || 1) + direction;
    if (newRound < 1) newRound = 1;
    if (newRound > 20) newRound = 20;

    await supabaseClient.from('game5_state').update({
      aktive_runde: newRound,
      skalierung: 1.0,
      reveal_aktiv: false,
      reveal_t1: false,
      reveal_t2: false,
      reveal_t3: false,
      reveal_t4: false,
      tipp_team_1: null,
      tipp_team_2: null,
      tipp_team_3: null,
      tipp_team_4: null,
      updated_at: new Date()
    }).eq('id', 1);

    await this.loadObjectData(newRound);
  },

  // Reset auf Runde 1 und Zurücksetzen aller Spielstände / Punkte
  async resetGame() {
    if (!confirm("Möchtest du das Spiel wirklich komplett auf Runde 1 zurücksetzen?")) return;

    await supabaseClient.from('game5_state').update({
      aktive_runde: 1,
      status: 'overview',
      skalierung: 1.0,
      reveal_aktiv: false,
      reveal_t1: false,
      reveal_t2: false,
      reveal_t3: false,
      reveal_t4: false,
      tipp_team_1: null,
      tipp_team_2: null,
      tipp_team_3: null,
      tipp_team_4: null,
      punkte_blau: 0,
      punkte_rot: 0,
      punkte_gruen: 0,
      punkte_gelb: 0,
      updated_at: new Date()
    }).eq('id', 1);

    await this.loadObjectData(1);
  },

  async setMasterReveal(isOpen) {
    const korrekterFaktor = this.currentObject?.loesung_faktor || 1.0;

    let updateData = { 
      reveal_aktiv: isOpen, 
      richtige_groesse: korrekterFaktor,
      skalierung: isOpen ? korrekterFaktor : this.currentState.skalierung,
      updated_at: new Date() 
    };

    if (isOpen) {
      updateData.reveal_t1 = false;
      updateData.reveal_t2 = false;
      updateData.reveal_t3 = false;
      updateData.reveal_t4 = false;
    }

    await supabaseClient.from('game5_state').update(updateData).eq('id', 1);
  },

  async revealTeam(columnName) {
    const korrekterFaktor = this.currentObject?.loesung_faktor || 1.0;
    let updateObj = { 
      reveal_aktiv: true, 
      richtige_groesse: korrekterFaktor,
      skalierung: korrekterFaktor, 
      updated_at: new Date() 
    };
    updateObj[columnName] = true;
    await supabaseClient.from('game5_state').update(updateObj).eq('id', 1);
  },

  async addPoints(columnName, amount) {
    const currentScore = this.currentState[columnName] || 0;
    const newScore = Math.max(0, currentScore + amount);

    let updateObj = { updated_at: new Date() };
    updateObj[columnName] = newScore;

    await supabaseClient.from('game5_state').update(updateObj).eq('id', 1);
  }
};

Game5Admin.init();