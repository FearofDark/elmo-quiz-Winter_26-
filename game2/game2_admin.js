window.Game2Admin = {
  selectedContinent: 'Nordamerika',
  selectedCountry: 'USA',
  selectedDifficulty: 1,
  questionsCache: [],
  countriesCache: [],
  currentState: {},
  expandedContinents: { 'Nordamerika': true },
  claimedMilestones: {}, // Speichert bereits vergebene Meilensteine und Kontinent-Boni

  continentsStructure: {
    'Nordamerika': ['USA', 'Kanada', 'Mexico', 'Kuba'],
    'Südamerika': ['Brasilien', 'Ecuador', 'Chile', 'Argentinien'],
    'Europa': ['Island', 'Italien', 'Spanien', 'Frankreich', 'Deutschland', 'Albanien', 'Russia', 'Polen'],
    'Afrika': ['Südafrika', 'Ägypten', 'Nigeria', 'Marokko'],
    'Asien': ['China', 'Thailand', 'Südkorea', 'Indien']
  },

  async init() {
    console.log("🛠️ Game2Admin initialisiert (Mit Länder- & Kontinent-Bonus Erkennung).");
    await this.loadQuestions();
    await this.loadCountries();
    await this.loadState();
    this.renderAdminPanel();
  },

  async loadQuestions() {
    try {
      const { data } = await supabaseClient.from('game2_questions').select('*');
      this.questionsCache = data || [];
    } catch (e) { this.questionsCache = []; }
  },

  async loadCountries() {
    try {
      const { data } = await supabaseClient.from('game2_countries').select('*');
      this.countriesCache = data || [];
    } catch (e) { this.countriesCache = []; }
  },

  async loadState() {
    try {
      const { data } = await supabaseClient.from('game2_state').select('*').eq('id', 1).maybeSingle();
      this.currentState = data || { team_scores: { blau: 0, rot: 0, gruen: 0, gelb: 0 } };
    } catch (e) { this.currentState = { team_scores: { blau: 0, rot: 0, gruen: 0, gelb: 0 } }; }
  },

  toggleContinent(cName) {
    this.expandedContinents[cName] = !this.expandedContinents[cName];
    this.renderAdminPanel();
  },

  selectSelection(continent, country, diff) {
    this.selectedContinent = continent;
    this.selectedCountry = country;
    this.selectedDifficulty = diff;
    this.expandedContinents[continent] = true;
    this.renderAdminPanel();
  },

  async modifyScore(teamKey, delta) {
    await this.loadState();
    let scores = this.currentState.team_scores || { blau: 0, rot: 0, gruen: 0, gelb: 0 };
    scores[teamKey] = Math.max(0, (scores[teamKey] || 0) + delta);

    await supabaseClient.from('game2_state').update({ team_scores: scores }).eq('id', 1);
    this.currentState.team_scores = scores;
    this.renderAdminPanel();
  },

  // Zählt die Länder pro Team
  calculateTeamCountryCounts() {
    const counts = { blau: 0, rot: 0, gruen: 0, gelb: 0 };
    const allCountries = Object.values(this.continentsStructure).flat();
    
    allCountries.forEach(cName => {
      const cData = this.countriesCache.find(c => c.name && c.name.toLowerCase() === cName.toLowerCase());
      if (!cData) return;

      let ownerTeam = null;
      for (let i = 4; i >= 1; i--) {
        const t = cData[`diff_${i}_team`];
        if (t && t !== 'falsch') {
          ownerTeam = t;
          break;
        }
      }

      if (ownerTeam && counts[ownerTeam] !== undefined) {
        counts[ownerTeam]++;
      }
    });

    return counts;
  },

  // Prüft, wem ein kompletter Kontinent gehört
  getContinentOwner(contName) {
    const countries = this.continentsStructure[contName];
    let firstTeam = undefined;

    for (const cName of countries) {
      const cData = this.countriesCache.find(c => c.name && c.name.toLowerCase() === cName.toLowerCase());
      if (!cData) return null;

      let validCountryTeam = null;
      for (let i = 4; i >= 1; i--) {
        const t = cData[`diff_${i}_team`];
        if (t && t !== 'falsch') {
          validCountryTeam = t;
          break;
        }
      }

      if (!validCountryTeam) return null;
      if (firstTeam === undefined) firstTeam = validCountryTeam;
      else if (firstTeam !== validCountryTeam) return null;
    }
    return firstTeam;
  },

  renderAdminPanel() {
    const container = document.getElementById('admin-game2-controls');
    if (!container) return;

    const activeQuestionObj = this.questionsCache.find(q => 
      q.continent && q.country &&
      q.continent.toLowerCase().trim() === this.selectedContinent.toLowerCase().trim() &&
      q.country.toLowerCase().trim() === this.selectedCountry.toLowerCase().trim() &&
      parseInt(q.difficulty) === parseInt(this.selectedDifficulty)
    );

    const questionText = activeQuestionObj ? activeQuestionObj.question : "";
    const answerText = activeQuestionObj ? activeQuestionObj.answer : "";
    const teamColors = { blau: '#38bdf8', rot: '#f87171', gruen: '#4ade80', gelb: '#facc15' };
    const scores = this.currentState.team_scores || { blau: 0, rot: 0, gruen: 0, gelb: 0 };
    
    const countryCounts = this.calculateTeamCountryCounts();

    // 1. Benachrichtigungen für Länder-Meilensteine (5, 10, 15...) generieren
    let milestoneAlertsHtml = '';
    Object.entries(countryCounts).forEach(([t, count]) => {
      const currentMilestone = Math.floor(count / 5);
      if (currentMilestone > 0) {
        const milestoneKey = `country_${t}_${currentMilestone * 5}`;
        if (!this.claimedMilestones[milestoneKey]) {
          milestoneAlertsHtml += `
            <div style="background: rgba(234, 179, 8, 0.15); border: 1px solid #eab308; padding: 10px 14px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; gap: 10px;">
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <span style="color: #facc15; font-weight: bold; font-size: 11px;">⭐ LÄNDER-MEILENSTEIN (${count} Länder)</span>
                <span style="color: #e4e4e7; font-size: 11px;">Team <strong style="color: ${teamColors[t]};">${t.toUpperCase()}</strong> hat ${count} Länder erobert!</span>
              </div>
              <button onclick="Game2Admin.claimBonus('${t}', '${milestoneKey}', ${currentMilestone}, 'Länder-Bonus (${count} Länder)')" style="background: #eab308; color: #000; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; font-size: 11px; cursor: pointer; white-space: nowrap;">
                +${currentMilestone} Pkt vergeben
              </button>
            </div>
          `;
        }
      }
    });

    // 2. Benachrichtigungen für Kontinent-Boni generieren
    Object.keys(this.continentsStructure).forEach(contName => {
      const owner = this.getContinentOwner(contName);
      if (owner) {
        const bonusPoints = contName === 'Europa' ? 4 : 2;
        const continentKey = `continent_${contName}_${owner}`;
        if (!this.claimedMilestones[continentKey]) {
          milestoneAlertsHtml += `
            <div style="background: rgba(56, 189, 248, 0.15); border: 1px solid #38bdf8; padding: 10px 14px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; gap: 10px;">
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <span style="color: #38bdf8; font-weight: bold; font-size: 11px;">🌍 KONTINENT EROBERT (${contName})</span>
                <span style="color: #e4e4e7; font-size: 11px;">Team <strong style="color: ${teamColors[owner]};">${owner.toUpperCase()}</strong> besitzt den gesamten Kontinent <strong>${contName}</strong>!</span>
              </div>
              <button onclick="Game2Admin.claimBonus('${owner}', '${continentKey}', ${bonusPoints}, 'Kontinent-Bonus (${contName})')" style="background: #38bdf8; color: #000; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; font-size: 11px; cursor: pointer; white-space: nowrap;">
                +${bonusPoints} Pkt vergeben
              </button>
            </div>
          `;
        }
      }
    });

    container.innerHTML = `
      <div style="background: #121214; border: 1px solid #27272a; padding: 16px; border-radius: 10px; display: flex; flex-direction: column; gap: 12px; color: white; font-size: 13px; width: 100%; box-sizing: border-box;">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #27272a; padding-bottom: 8px;">
          <h3 style="margin: 0; font-size: 15px; color: #facc15;">⚔️ Spiel 2 Admin-Steuerung</h3>
          <span style="color: #a1a1aa; font-size: 12px; background: #18181b; padding: 3px 8px; border-radius: 4px;">Aktiv: <b style="color: #fff;">${this.selectedCountry} (S${this.selectedDifficulty})</b></span>
        </div>

        <!-- ÜBERSICHTLICHE ADMIN-BENACHRICHTIGUNGEN FÜR BONUS & MEILENSTEINE -->
        ${milestoneAlertsHtml ? `<div style="display: flex; flex-direction: column; gap: 6px; background: #18181b; padding: 10px; border-radius: 8px; border: 1px dashed #3f3f46;"><span style="font-size: 10px; color: #a1a1aa; text-transform: uppercase; font-weight: bold;">🔔 Akteneinblicke & Boni bereit:</span>${milestoneAlertsHtml}</div>` : ''}

        <!-- RUNDEN-PUNKTE ANPASSEN -->
        <div style="background: #18181b; border: 1px solid #27272a; padding: 8px 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <span style="font-size: 11px; color: #a1a1aa; font-weight: bold; text-transform: uppercase;">Runden-Punkte anpassen:</span>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            ${Object.entries(teamColors).map(([t, col]) => `
              <div style="display: flex; align-items: center; gap: 4px; background: #09090b; border: 1px solid ${col}; padding: 3px 8px; border-radius: 6px;" title="Besitz: ${countryCounts[t]} Länder">
                <span style="font-weight: bold; color: ${col}; font-size: 11px; text-transform: capitalize;">${t} (${countryCounts[t]}L): ${scores[t] || 0}P</span>
                <button onclick="Game2Admin.modifyScore('${t}', -1)" style="background: #27272a; color: #fff; border: none; width: 20px; height: 20px; border-radius: 3px; cursor: pointer; font-weight: bold;">-</button>
                <button onclick="Game2Admin.modifyScore('${t}', 1)" style="background: ${col}; color: #000; border: none; width: 20px; height: 20px; border-radius: 3px; cursor: pointer; font-weight: bold;">+</button>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Hauptbereich: 2 Spalten -->
        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
          
          <!-- LÄNDER SPALTE -->
          <div style="flex: 1; min-width: 320px; display: flex; flex-direction: column; gap: 6px;">
            <div style="font-size: 11px; color: #a1a1aa; font-weight: bold; text-transform: uppercase; margin-bottom: 2px;">1. Kontinent & Land wählen</div>
            
            ${Object.keys(this.continentsStructure).map(cName => {
              const isExpanded = !!this.expandedContinents[cName];
              const countries = this.continentsStructure[cName];
              const cOwner = this.getContinentOwner(cName);

              return `
                <div style="background: #18181b; border: 1px solid ${cOwner ? teamColors[cOwner] : '#27272a'}; border-radius: 6px; overflow: hidden; margin-bottom: 4px;">
                  <div onclick="Game2Admin.toggleContinent('${cName}')" style="padding: 8px 10px; background: #1f1f23; display: flex; justify-content: space-between; align-items: center; cursor: pointer; font-size: 12px; font-weight: bold;">
                    <span>${isExpanded ? '▼' : '►'} ${cName} ${cOwner ? `(Besitzer: ${cOwner.toUpperCase()})` : ''}</span>
                    <span style="font-size: 10px; color: #71717a;">${countries.length} Länder</span>
                  </div>

                  <div style="display: ${isExpanded ? 'flex' : 'none'}; flex-direction: column; gap: 4px; padding: 6px;">
                    ${countries.map(countryName => {
                      const countryDB = this.countriesCache.find(c => c.name && c.name.toLowerCase() === countryName.toLowerCase()) || { name: countryName };
                      const isLandSelected = this.selectedCountry.toLowerCase() === countryName.toLowerCase() && this.selectedContinent === cName;

                      return `
                        <div style="background: #09090b; border: 1px solid ${isLandSelected ? '#3b82f6' : '#27272a'}; border-radius: 5px; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center;">
                          <span style="font-size: 11px; font-weight: bold; color: #fff;">${countryName}</span>

                          <!-- Stufen S1-S4 -->
                          <div style="display: flex; gap: 4px;">
                            ${[1, 2, 3, 4].map(lvl => {
                              const isDiffSelected = isLandSelected && this.selectedDifficulty === lvl;
                              const val = countryDB[`diff_${lvl}_team`];
                              
                              let bg = '#27272a';
                              let col = '#a1a1aa';

                              if (val && val !== 'falsch' && teamColors[val]) {
                                bg = teamColors[val];
                                col = '#000000';
                              } else if (val === 'falsch') {
                                bg = '#ffffff';
                                col = '#000000';
                              }

                              if (isDiffSelected) {
                                bg = '#3b82f6';
                                col = '#ffffff';
                              }

                              return `
                                <button onclick="Game2Admin.selectSelection('${cName}', '${countryName}', ${lvl})" style="border: none; background: ${bg}; color: ${col}; font-size: 10px; font-weight: bold; padding: 4px 8px; border-radius: 3px; cursor: pointer;">
                                  S${lvl}
                                </button>
                              `;
                            }).join('')}
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- FRAGE & AKTIONEN SPALTE -->
          <div style="flex: 1.2; min-width: 320px; display: flex; flex-direction: column; gap: 12px;">
            
            <!-- Frage bearbeiten -->
            <div style="background: #09090b; border: 1px solid #27272a; padding: 12px; border-radius: 8px; display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 11px; color: #facc15; font-weight: bold;">Frage: ${this.selectedCountry} (S${this.selectedDifficulty})</span>
                <button onclick="Game2Admin.saveQuestionToSupabase()" style="background: #3b82f6; color: white; border: none; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer;">
                  💾 Speichern
                </button>
              </div>
              <textarea id="g2-admin-q-text" style="width: 100%; background: #18181b; color: white; border: 1px solid #27272a; border-radius: 4px; padding: 8px; font-size: 12px; box-sizing: border-box; resize: vertical;" rows="3">${questionText}</textarea>
              <input type="text" id="g2-admin-a-text" value="${answerText}" placeholder="Antwort / Lösung" style="width: 100%; background: #18181b; color: #4ade80; border: 1px solid #27272a; border-radius: 4px; padding: 6px 10px; font-size: 12px; box-sizing: border-box;" />
            </div>

            <!-- Haupt-Aktionen -->
            <div style="display: flex; gap: 8px;">
              <button onclick="Game2Admin.sendCurrentQuestion()" style="flex: 2; background: #22c55e; color: black; border: none; padding: 10px; border-radius: 6px; font-weight: bold; font-size: 12px; cursor: pointer;">
                📢 Frage anzeigen
              </button>
              <button onclick="Game2Admin.resetToMap()" style="flex: 1; background: #64748b; color: white; border: none; padding: 10px; border-radius: 6px; font-weight: bold; font-size: 11px; cursor: pointer;">
                🗺️ Karte
              </button>
            </div>

            <!-- Team Zuweisung / Auswertung -->
            <div style="background: #09090b; border: 1px solid #27272a; padding: 10px; border-radius: 8px;">
              <span style="font-size: 10px; color: #a1a1aa; font-weight: bold; display: block; margin-bottom: 6px;">AUSWERTUNG (STUFE ${this.selectedDifficulty}):</span>
              <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px;">
                <button onclick="Game2Admin.evaluateAnswer('blau')" style="background: #38bdf8; color: black; border: none; padding: 8px 4px; border-radius: 4px; font-weight: bold; font-size: 11px; cursor: pointer;">Blau</button>
                <button onclick="Game2Admin.evaluateAnswer('rot')" style="background: #f87171; color: black; border: none; padding: 8px 4px; border-radius: 4px; font-weight: bold; font-size: 11px; cursor: pointer;">Rot</button>
                <button onclick="Game2Admin.evaluateAnswer('gruen')" style="background: #4ade80; color: black; border: none; padding: 8px 4px; border-radius: 4px; font-weight: bold; font-size: 11px; cursor: pointer;">Grün</button>
                <button onclick="Game2Admin.evaluateAnswer('gelb')" style="background: #facc15; color: black; border: none; padding: 8px 4px; border-radius: 4px; font-weight: bold; font-size: 11px; cursor: pointer;">Gelb</button>
                <button onclick="Game2Admin.evaluateAnswer('falsch')" style="background: #ffffff; color: black; border: none; padding: 8px 4px; border-radius: 4px; font-weight: bold; font-size: 11px; cursor: pointer;" title="Falsch beantwortet">❌ Falsch</button>
              </div>
            </div>

          </div>

        </div>

        <!-- Master Reset unten -->
        <div style="border-top: 1px solid #27272a; padding-top: 10px; display: flex; justify-content: flex-end;">
          <button onclick="Game2Admin.resetGame()" style="background: #dc2626; color: white; border: none; padding: 8px 12px; border-radius: 6px; font-weight: bold; font-size: 11px; cursor: pointer;">
            🔄 Master-Reset (Alles zurücksetzen)
          </button>
        </div>

      </div>
    `;
  },

  async claimBonus(teamKey, milestoneKey, pointsToAdd, bonusTitle) {
    this.claimedMilestones[milestoneKey] = true;
    await this.modifyScore(teamKey, pointsToAdd);
    alert(`Erfolgreich ${pointsToAdd} Punkt(e) für ${bonusTitle} an Team ${teamKey.toUpperCase()} vergeben!`);
    this.renderAdminPanel();
  },

  async saveQuestionToSupabase() {
    const qInput = document.getElementById('g2-admin-q-text');
    const aInput = document.getElementById('g2-admin-a-text');
    if (!qInput || !aInput) return;

    await supabaseClient.from('game2_questions')
      .update({ question: qInput.value, answer: aInput.value })
      .match({ continent: this.selectedContinent, country: this.selectedCountry, difficulty: this.selectedDifficulty });

    alert("Frage gespeichert!");
    await this.loadQuestions();
    this.renderAdminPanel();
  },

  async sendCurrentQuestion() {
    const qInput = document.getElementById('g2-admin-q-text');
    await supabaseClient.from('game2_state').update({
      status: 'question',
      current_continent: this.selectedContinent,
      current_land: this.selectedCountry,
      current_difficulty: this.selectedDifficulty,
      current_question: qInput ? qInput.value : ""
    }).eq('id', 1);
  },

  async evaluateAnswer(resultValue) {
    const updateField = `diff_${this.selectedDifficulty}_team`;

    await supabaseClient.from('game2_countries').update({
      [updateField]: resultValue
    }).eq('name', this.selectedCountry);

    await supabaseClient.from('game2_state').update({ 
      status: 'neutral', 
      current_question: '',
      current_land: this.selectedCountry 
    }).eq('id', 1);

    await this.loadCountries();
    this.renderAdminPanel();
  },

  async resetToMap() {
    await supabaseClient.from('game2_state').update({ status: 'neutral', current_question: '' }).eq('id', 1);
  },

  async resetGame() {
    if (!confirm("Wirklich das gesamte Spiel (alle Stufen und Eroberungen) auf Null zurücksetzen?")) return;
    
    this.claimedMilestones = {};

    await supabaseClient.from('game2_countries').update({ 
      diff_1_team: null, 
      diff_2_team: null, 
      diff_3_team: null, 
      diff_4_team: null 
    }).neq('id', 0);

    await supabaseClient.from('game2_state').update({ 
      status: 'neutral', 
      current_continent: 'Nordamerika', 
      current_land: 'USA', 
      current_difficulty: 1, 
      current_question: '',
      team_scores: { blau: 0, rot: 0, gruen: 0, gelb: 0 } 
    }).eq('id', 1);

    await this.loadCountries();
    this.renderAdminPanel();
    alert("Spiel wurde komplett zurückgesetzt!");
  }
};

window.Game2Admin.init();