window.Game1Admin = {
  isLocalInteracting: false,

  async init() {
    console.log("🎬 Game1Admin initialisiert.");
    await this.fetchAndUpdateUI();

    supabaseClient.channel('game1-admin-resistant')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game1_state', filter: 'id=eq.1' }, payload => {
        if (!this.isLocalInteracting && payload.new) {
          this.renderUI(payload.new);
        }
      })
      .subscribe();

    setInterval(() => {
      if (!this.isLocalInteracting) {
        this.fetchAndUpdateUI();
      }
    }, 1000);
  },

  async fetchAndUpdateUI() {
    const { data } = await supabaseClient.from('game1_state').select('*').eq('id', 1).maybeSingle();
    if (data) this.renderUI(data);
  },

  renderUI(state) {
    const statusEl = document.getElementById('g1-adm-status');
    const catEl = document.getElementById('g1-adm-cat');
    const roundSelect = document.getElementById('g1-round-select');
    
    if (statusEl) statusEl.innerText = (state.status || 'neutral').toUpperCase();
    if (catEl) catEl.innerText = state.current_category || "Wavelength";
    if (roundSelect && state.current_round !== undefined && document.activeElement !== roundSelect) {
      roundSelect.value = state.current_round;
    }

    const preview = document.getElementById('g1-teams-preview');
    if (!preview) return;

    const teams = ['blau', 'rot', 'gruen', 'gelb'];
    const globalSecret = state.secret_value || '-';
    const clues = state.clues || {};
    const guesses = state.guesses || {};
    const scores = state.team_scores || { blau: 0, rot: 0, gruen: 0, gelb: 0 };

    preview.innerHTML = teams.map(t => {
      const clueVal = clues[t];
      const guessVal = guesses[t];
      const hasClue = clueVal !== undefined && clueVal !== "";
      const hasGuess = guessVal !== undefined;
      const teamPts = scores[t] || 0;

      return `
        <div style="background: #09090b; border: 1px solid ${hasClue ? '#10b981' : '#27272a'}; padding: 10px; border-radius: 6px; font-size: 11px; display: flex; flex-direction: column; gap: 5px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight:bold; color:${t==='blau'?'#38bdf8':t==='rot'?'#f87171':t==='gruen'?'#4ade80':'#facc15'}">Team ${t.toUpperCase()}</span>
            <span style="background: #18181b; padding: 2px 6px; border-radius: 4px; font-size: 11px; color: #facc15; font-weight: bold;">Punkte: ${teamPts}</span>
          </div>
          <div style="color:#71717a;">Geheimzahl: <span style="color:#f43f5e; font-weight:bold;">${globalSecret}</span></div>
          <div style="color:#71717a;">Begriff: <span style="color:${hasClue ? '#34d399' : '#71717a'}; font-weight:bold;">${hasClue ? `"${clueVal}"` : 'Wartet...'}</span></div>
          <div style="color:#71717a;">Tipp: <span style="color:${hasGuess ? '#34d399' : '#71717a'}; font-weight:bold;">${hasGuess ? '🔒 ' + guessVal : '-'}</span></div>
          
          <div style="display: flex; gap: 4px; margin-top: 4px;">
            <button onclick="Game1Admin.adjustPoints('${t}', -1)" style="background: #7f1d1d; color: white; border: none; padding: 4px; border-radius: 3px; font-size: 9px; cursor: pointer; flex: 1; font-weight: bold;">-1 Pkt</button>
            <button onclick="Game1Admin.adjustPoints('${t}', 1)" style="background: #065f46; color: white; border: none; padding: 4px; border-radius: 3px; font-size: 9px; cursor: pointer; flex: 1; font-weight: bold;">+1 Pkt</button>
          </div>
        </div>
      `;
    }).join('');
  },

  async adjustPoints(team, amount) {
    this.isLocalInteracting = true;
    const { data: state } = await supabaseClient.from('game1_state').select('team_scores').eq('id', 1).maybeSingle();
    let scores = state?.team_scores || { blau: 0, rot: 0, gruen: 0, gelb: 0 };
    
    scores[team] = Math.max(0, (scores[team] || 0) + amount);

    await supabaseClient.from('game1_state').update({ team_scores: scores }).eq('id', 1);
    await this.fetchAndUpdateUI();
    setTimeout(() => { this.isLocalInteracting = false; }, 400);
  },

  async setNeutralState() {
    this.isLocalInteracting = true;
    const neutralPayload = {
      status: 'neutral',
      current_round: 0,
      current_category: 'Wavelength',
      current_description: 'Warten auf Spielstart',
      clues: {},
      guesses: {}
    };
    await supabaseClient.from('game1_state').update(neutralPayload).eq('id', 1);
    this.renderUI(neutralPayload);
    setTimeout(() => { this.isLocalInteracting = false; }, 500);
  },

  async changeRound(newRoundVal) {
    this.isLocalInteracting = true;
    
    if (newRoundVal === "0" || newRoundVal === 0) {
      await this.setNeutralState();
      return;
    }

    const roundNum = parseInt(newRoundVal);

    const { data: catData } = await supabaseClient.from('game1_categories').select('category_name').eq('id', roundNum).maybeSingle();
    let cat = catData ? catData.category_name : `Runde ${roundNum}`;

    const updatePayload = {
      current_round: roundNum,
      current_category: cat,
      status: 'neutral',
      clues: {},
      guesses: {}
    };

    await supabaseClient.from('game1_state').update(updatePayload).eq('id', 1);
    const catEl = document.getElementById('g1-adm-cat');
    if (catEl) catEl.innerText = cat;
    setTimeout(() => { this.isLocalInteracting = false; }, 500);
  },

  async resetGame() {
    this.isLocalInteracting = true;
    const resetPayload = {
      current_round: 0,
      current_category: "Wavelength",
      current_description: "",
      secret_value: null,
      clues: {},
      guesses: {},
      team_roles: {},
      team_scores: { blau: 0, rot: 0, gruen: 0, gelb: 0 },
      status: 'neutral'
    };
    await supabaseClient.from('game1_state').update(resetPayload).eq('id', 1);
    this.renderUI(resetPayload);
    setTimeout(() => { this.isLocalInteracting = false; }, 500);
    alert("Spiel wurde komplett zurückgesetzt!");
  },

  async startNewRound() {
    this.isLocalInteracting = true;
    const roundSelect = document.getElementById('g1-round-select');
    const currentRound = roundSelect ? parseInt(roundSelect.value) : 1;

    if (currentRound === 0) {
      await this.setNeutralState();
      return;
    }

    let cat = `Runde ${currentRound}`;
    const { data: catData } = await supabaseClient.from('game1_categories').select('category_name').eq('id', currentRound).maybeSingle();
    if (catData && catData.category_name) {
      cat = catData.category_name;
    }

    const { data: slots } = await supabaseClient.from('player_slots').select('slot_id, team');
    const teamSlots = { blau: [], rot: [], gruen: [], gelb: [] };
    if (slots) slots.forEach(s => { if (teamSlots[s.team]) teamSlots[s.team].push(s.slot_id); });

    const teamRoles = {};
    const sharedSecretValue = Math.floor(Math.random() * 10) + 1;

    ['blau', 'rot', 'gruen', 'gelb'].forEach(team => {
      const members = teamSlots[team] || [];
      if (members.length >= 2) {
        const cIdx = (currentRound - 1) % members.length;
        teamRoles[team] = { cluegiver: members[cIdx], rater: members[1 - cIdx] };
      }
    });

    const updatePayload = {
      current_round: currentRound,
      current_category: cat,
      current_description: "0 = Schlecht / Schrecklich  |  10 = Perfekt / Genial",
      secret_value: sharedSecretValue,
      clues: {},
      guesses: {},
      team_roles: teamRoles,
      status: 'collecting',
      max_rounds: 20
    };

    await supabaseClient.from('game1_state').update(updatePayload).eq('id', 1);
    this.renderUI(updatePayload);
    setTimeout(() => { this.isLocalInteracting = false; }, 500);
  },

  async releaseClues() {
    this.isLocalInteracting = true;
    await supabaseClient.from('game1_state').update({ status: 'ready_to_guess' }).eq('id', 1);
    await this.fetchAndUpdateUI();
    setTimeout(() => { this.isLocalInteracting = false; }, 500);
  },

  async evaluateRound() {
    this.isLocalInteracting = true;
    const { data: state } = await supabaseClient.from('game1_state').select('*').eq('id', 1).maybeSingle();
    if (!state) return;

    const secret = state.secret_value || 5;
    const guesses = state.guesses || {};
    let scores = state.team_scores || { blau: 0, rot: 0, gruen: 0, gelb: 0 };

    for (const [team, guess] of Object.entries(guesses)) {
      if (guess !== undefined) {
        const diff = Math.abs(secret - guess);
        let pts = diff === 0 ? 3 : (diff === 1 ? 1 : 0);
        if (pts > 0) {
          scores[team] = (scores[team] || 0) + pts;
        }
      }
    }

    await supabaseClient.from('game1_state').update({ team_scores: scores, status: 'revealed' }).eq('id', 1);
    await this.fetchAndUpdateUI();
    setTimeout(() => { this.isLocalInteracting = false; }, 500);
  }
};

window.Game1Admin.init();