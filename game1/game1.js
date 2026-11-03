window.Game1Player = {
  lastStateString: "",
  isRevealing: false,
  teamNamesCache: { blau: 'Team Blau', rot: 'Team Rot', gruen: 'Team Grün', gelb: 'Team Gelb' },

  init() {
    console.log("🎮 Game1Player initialisiert.");
    this.fetchTeamNames();
    this.fetchAndRender();

    supabaseClient.channel('game1-state-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game1_state', filter: 'id=eq.1' }, payload => {
        this.renderUI(payload.new);
      })
      .subscribe();

    setInterval(() => this.fetchSilent(), 2000);
  },

  async fetchTeamNames() {
    const { data } = await supabaseClient.from('game_state').select('team_blau_name, team_rot_name, team_gruen_name, team_gelb_name').eq('id', 1).maybeSingle();
    if (data) {
      this.teamNamesCache = {
        blau: data.team_blau_name || 'Team Blau',
        rot: data.team_rot_name || 'Team Rot',
        gruen: data.team_gruen_name || 'Team Grün',
        gelb: data.team_gelb_name || 'Team Gelb'
      };
    }
  },

  updateContainerPoints(scores, forceShow = false) {
    const pointsEl = document.getElementById('g1-container-points');
    if (!pointsEl) return;

    if (this.isRevealing && !forceShow) {
      pointsEl.innerHTML = '';
      return;
    }

    const teamColors = { blau: '#38bdf8', rot: '#f87171', gruen: '#4ade80', gelb: '#facc15' };
    const currentScores = scores || { blau: 0, rot: 0, gruen: 0, gelb: 0 };

    pointsEl.innerHTML = Object.entries(teamColors).map(([t, col]) => `
      <div title="${this.teamNamesCache[t]}" style="background: #09090b; border: 2px solid ${col}; padding: 6px 10px; border-radius: 8px; font-size: 15px; font-weight: bold; color: ${col}; box-shadow: 0 3px 8px rgba(0,0,0,0.5);">
        ${currentScores[t] !== undefined ? currentScores[t] : 0}
      </div>
    `).join('');
  },

  async fetchSilent() {
    const { data } = await supabaseClient.from('game1_state').select('*').eq('id', 1).maybeSingle();
    if (data) {
      const stateStr = JSON.stringify(data);
      if (stateStr !== this.lastStateString) {
        this.renderUI(data);
      } else {
        this.updateContainerPoints(data.team_scores);
      }
    }
  },

  async fetchAndRender() {
    await this.fetchTeamNames();
    const { data } = await supabaseClient.from('game1_state').select('*').eq('id', 1).maybeSingle();
    if (data) this.renderUI(data);
  },

  renderUI(state) {
    if (!state) return;
    this.lastStateString = JSON.stringify(state);

    const badge = document.getElementById('g1-round-badge');
    const title = document.getElementById('g1-cat-title');
    const stage = document.getElementById('g1-stage');

    if (!stage) return;

    if (state.status === 'revealed') {
      this.isRevealing = true;
    } else {
      this.isRevealing = false;
    }

    this.updateContainerPoints(state.team_scores);

    if (state.status === 'neutral' || !state.status || state.current_round === 0) {
      if (badge) badge.innerText = "Bereit";
      if (title) title.innerText = "Wavelength";
      stage.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; width: 100%; min-height: 350px; text-align: center;">
          <img src="https://i.ibb.co/QqK732R/image.png" alt="Spiel Logo" style="max-width: 80%; max-height: 260px; border-radius: 12px; object-fit: contain; box-shadow: 0 10px 25px rgba(0,0,0,0.5); display: block; margin: 0 auto;">
          <div style="color: #71717a; font-size: 16px;">Warten auf Spielbeginn durch den Admin...</div>
        </div>
      `;
      return;
    }

    if (badge) badge.innerText = `Runde ${state.current_round || 1} / ${state.max_rounds || 20}`;
    if (title) title.innerText = state.current_category || "Wavelength";

    if (!MY_SLOT) {
      stage.innerHTML = `<div style="color: #ef4444; font-size: 16px; padding: 40px; text-align: center;">Kein Spieler-Slot zugewiesen!</div>`;
      return;
    }

    const roles = state.team_roles || {};
    let myTeam = null, myRole = null;

    for (const [team, assignment] of Object.entries(roles)) {
      if (assignment.cluegiver === MY_SLOT) { myTeam = team; myRole = 'cluegiver'; }
      if (assignment.rater === MY_SLOT) { myTeam = team; myRole = 'rater'; }
    }

    if (!myTeam) {
      stage.innerHTML = `<div style="color: #71717a; font-size: 16px; padding: 40px; text-align: center;">Du bist in dieser Runde kein aktiver Spieler in einem Team.</div>`;
      return;
    }

    const secretValue = state.secret_value || 5;
    const clues = state.clues || {};
    const guesses = state.guesses || {};
    const myClue = clues[myTeam] || '';
    const myGuess = guesses[myTeam];

    if (myRole === 'cluegiver') {
      const isLocked = !!myClue;

      if (state.status === 'revealed') {
        this.renderRevealStage(stage, secretValue, guesses, state.team_scores, clues);
        return;
      }

      stage.innerHTML = `
        <div style="width: 100%; display: flex; flex-direction: column; gap: 24px;">
          <div style="background: #18181b; padding: 25px; border-radius: 14px; border: 1px solid #27272a; text-align: center; box-shadow: inset 0 2px 4px rgba(0,0,0,0.4);">
            <div style="font-size: 13px; color: #a1a1aa; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 1.5px;">Geheime Zielzahl</div>
            <div style="font-size: 52px; font-weight: bold; color: #facc15; text-shadow: 0 0 15px rgba(250, 204, 21, 0.3);">${secretValue}</div>
          </div>

          ${isLocked ? `
            <div style="background: #18181b; border: 1px solid #059669; padding: 30px; border-radius: 14px; text-align: center;">
              <div style="font-size: 13px; color: #34d399; text-transform: uppercase; margin-bottom: 10px; font-weight: bold; letter-spacing: 1px;">Dein Begriff</div>
              <div style="font-size: 42px; font-weight: bold; color: white;">"${myClue}"</div>
              <div style="font-size: 14px; color: #71717a; margin-top: 14px;">Warte auf den Tipp von ${this.teamNamesCache[myTeam]}...</div>
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 16px; width: 100%;">
              <input type="text" id="g1-input-clue" placeholder="Begriff eingeben..." style="background: #18181b; border: 1px solid #3f3f46; color: white; padding: 18px; border-radius: 10px; font-size: 20px; text-align: center; width: 100%; box-sizing: border-box; outline: none;">
              <button onclick="Game1Player.submitClue('${myTeam}')" style="background: #2563eb; color: white; border: none; padding: 16px; border-radius: 10px; font-weight: bold; cursor: pointer; font-size: 18px; width: 100%; box-shadow: 0 4px 10px rgba(37, 99, 235, 0.4);">Begriff abschicken</button>
            </div>
          `}
        </div>
      `;
    } else {
      if (!myClue || state.status === 'collecting') {
        stage.innerHTML = `
          <div style="width: 100%; display: flex; flex-direction: column; gap: 24px;">
            <div style="text-align: center; padding: 50px; background: #18181b; border-radius: 14px; border: 1px solid #27272a;">
              <div style="color: #71717a; font-size: 18px; font-style: italic;">Warte auf den Begriff des Hinweisgebers...</div>
            </div>
          </div>
        `;
      } else if (state.status === 'ready_to_guess' || state.status === 'collecting_guesses') {
        const isGuessLocked = myGuess !== undefined;
        stage.innerHTML = `
          <div style="width: 100%; display: flex; flex-direction: column; gap: 24px;">
            <div style="background: #18181b; border: 1px solid #3f3f46; padding: 25px; border-radius: 14px; text-align: center; box-shadow: inset 0 2px 4px rgba(0,0,0,0.4);">
              <div style="font-size: 13px; color: #a1a1aa; text-transform: uppercase; margin-bottom: 10px; letter-spacing: 1.5px;">Gesuchter Begriff</div>
              <div style="font-size: 46px; font-weight: bold; color: white; letter-spacing: 0.5px; text-shadow: 0 0 15px rgba(56, 189, 248, 0.3);">"${myClue}"</div>
            </div>

            ${isGuessLocked ? `
              <div style="background: #18181b; border: 1px solid #059669; padding: 30px; border-radius: 14px; text-align: center;">
                <div style="font-size: 18px; color: #34d399; font-weight: bold;">Tipp eingeloggt: ${myGuess}</div>
                <div style="font-size: 14px; color: #71717a; margin-top: 8px;">Warte auf die Auswertung...</div>
              </div>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 16px; width: 100%; max-width: 550px; margin: 0 auto; text-align: center; background: #18181b; padding: 25px; border-radius: 14px; border: 1px solid #27272a; box-sizing: border-box; box-shadow: 0 8px 20px rgba(0,0,0,0.5);">
                <input type="range" id="g1-slider" min="0" max="10" value="5" oninput="document.getElementById('g1-val').innerText=this.value" style="width: 100%; accent-color: #38bdf8; cursor: pointer; height: 10px; box-sizing: border-box;">
                <div style="font-size: 44px; font-weight: bold; color: white;" id="g1-val">5</div>
                <button onclick="Game1Player.submitGuess('${myTeam}')" style="background: #16a34a; color: white; border: none; padding: 16px; border-radius: 10px; font-weight: bold; cursor: pointer; font-size: 18px; width: 100%; box-shadow: 0 4px 10px rgba(22, 163, 74, 0.4);">Tipp abgeben</button>
              </div>
            `}
          </div>
        `;
      } else if (state.status === 'revealed') {
        this.renderRevealStage(stage, secretValue, guesses, state.team_scores, clues);
      }
    }
  },

  renderRevealStage(stage, secretValue, guesses, teamScores, cluesData) {
    const teamColors = { blau: '#38bdf8', rot: '#f87171', gruen: '#4ade80', gelb: '#facc15' };
    const secretPercent = (secretValue / 10) * 100;
    const clues = cluesData || {};

    const zoneLeft = Math.max(0, secretPercent - 10);
    const zoneWidth = 20;

    stage.innerHTML = `
      <div style="width: 100%; display: flex; flex-direction: column; gap: 24px;">
        <div style="background: #18181b; border: 2px solid #3f3f46; padding: 30px; border-radius: 14px; text-align: center; box-shadow: inset 0 0 20px rgba(0,0,0,0.6);">
          <div style="font-size: 16px; font-weight: bold; color: #facc15; margin-bottom: 24px; letter-spacing: 2px; text-shadow: 0 0 10px rgba(250,204,21,0.4);">⚡ DRAMATISCHE AUSWERTUNG ⚡</div>
          
          <div style="display: flex; flex-direction: column; gap: 14px; margin: 10px 0;">
            ${['blau', 'rot', 'gruen', 'gelb'].map(t => {
              const col = teamColors[t];
              const tName = this.teamNamesCache[t];
              const clueVal = clues[t] ? `"${clues[t]}"` : 'Kein Begriff';

              return `
                <div style="background: #121216; border-radius: 10px; padding: 14px 18px; border: 1px solid #27272a; text-align: left; box-shadow: 0 4px 10px rgba(0,0,0,0.4);">
                  <div style="font-size: 14px; font-weight: bold; color: ${col}; margin-bottom: 8px;">
                    ${tName}
                  </div>

                  <div style="background: #27272a; height: 18px; border-radius: 9px; position: relative; overflow: visible; box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);">
                    <!-- Transparenter goldener Ziel-Bereich (erscheint erst mit dem Marker zusammen) -->
                    <div id="gold-zone" style="position: absolute; left: ${zoneLeft}%; width: ${zoneWidth}%; top: 0; bottom: 0; background: rgba(245, 158, 11, 0.25); border-left: 1px dashed rgba(245, 158, 11, 0.6); border-right: 1px dashed rgba(245, 158, 11, 0.6); z-index: 5; opacity: 0; transition: opacity 0.8s ease;"></div>
                    
                    <!-- Animierter Team-Balken -->
                    <div class="reveal-bar-${t}" style="background: linear-gradient(90deg, ${col}aa, ${col}); width: 0%; height: 100%; transition: width 12s cubic-bezier(0.25, 1, 0.5, 1); border-radius: 9px; box-shadow: 0 0 10px ${col}66; position: relative; z-index: 2;"></div>
                    
                    <!-- Exakter goldener Ziel-Marker -->
                    <div id="gold-marker" style="position: absolute; left: ${secretPercent}%; top: -7px; bottom: -7px; width: 5px; background: #f59e0b; box-shadow: 0 0 18px #f59e0b, 0 0 8px #fff; z-index: 10; opacity: 0; transition: opacity 0.8s ease;"></div>
                  </div>

                  <div style="font-size: 11px; color: #a1a1aa; margin-top: 6px;">
                    Begriff: <strong style="color: #e4e4e7;">${clueVal}</strong>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 13px; color: #71717a; padding: 0 4px; margin-top: 15px; font-weight: bold;">
            <span>0</span><span>2</span><span>4</span><span>6</span><span>8</span><span>10</span>
          </div>
        </div>
      </div>
    `;

    setTimeout(() => {
      ['blau', 'rot', 'gruen', 'gelb'].forEach(t => {
        const teamGuess = guesses[t] !== undefined ? guesses[t] : 0;
        const percent = Math.max(1, (teamGuess / 10) * 100);
        const bar = document.querySelector(`.reveal-bar-${t}`);
        if (bar) bar.style.width = `${percent}%`;
      });
    }, 300);

    // Nach 13 Sekunden (wenn die Balken fertig gefahren sind) blenden der goldene Strich und die Punkte-Zone ein
    setTimeout(() => {
      document.querySelectorAll('#gold-marker').forEach(marker => {
        marker.style.opacity = '1';
      });
      document.querySelectorAll('#gold-zone').forEach(zone => {
        zone.style.opacity = '1';
      });
      this.isRevealing = false;
      this.updateContainerPoints(teamScores, true);
    }, 13000);
  },

  async submitClue(team) {
    const el = document.getElementById('g1-input-clue');
    if (!el || !el.value.trim()) return;
    const clue = el.value.trim();

    const { data } = await supabaseClient.from('game1_state').select('clues').eq('id', 1).single();
    const clues = data?.clues || {};
    clues[team] = clue;

    await supabaseClient.from('game1_state').update({ clues }).eq('id', 1);
  },

  async submitGuess(team) {
    const slider = document.getElementById('g1-slider');
    if (!slider) return;
    const guess = parseInt(slider.value);

    const { data } = await supabaseClient.from('game1_state').select('guesses').eq('id', 1).single();
    const guesses = data?.guesses || {};
    guesses[team] = guess;

    await supabaseClient.from('game1_state').update({ guesses }).eq('id', 1);
  }
};

window.Game1Player.init();