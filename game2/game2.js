window.Game2Player = {
  lastStateString: "",
  teamNamesCache: { blau: 'Team Blau', rot: 'Team Rot', gruen: 'Team Grün', gelb: 'Team Gelb' },
  countriesCache: [],
  svgContentCache: null,
  expandedContinents: { 'Nordamerika': true, 'Südamerika': false, 'Europa': false, 'Afrika': false, 'Asien': false },

  countryMapping: {
    'USA': ['us', 'usa', 'united-states'],
    'Kanada': ['ca', 'can', 'canada'],
    'Mexico': ['mx', 'mex', 'mexico'],
    'Kuba': ['cu', 'cub', 'cuba'],
    'Brasilien': ['br', 'bra', 'brazil'],
    'Ecuador': ['ec', 'ecu', 'ecuador'],
    'Chile': ['cl', 'chl', 'chile'],
    'Argentinien': ['ar', 'arg', 'argentina'],
    'Island': ['is', 'isl', 'iceland'],
    'Italien': ['it', 'ita', 'italy'],
    'Spanien': ['es', 'esp', 'spain'],
    'Frankreich': ['fr', 'fra', 'france'],
    'Deutschland': ['de', 'deu', 'germany'],
    'Albanien': ['al', 'alb', 'albania'],
    'Russia': ['ru', 'rus', 'russia'],
    'Polen': ['pl', 'pol', 'poland'],
    'Südafrika': ['za', 'zaf', 'south-africa', 'south africa'],
    'Ägypten': ['eg', 'egy', 'egypt'],
    'Nigeria': ['ng', 'nga', 'nigeria'],
    'Marokko': ['ma', 'mar', 'morocco'],
    'China': ['cn', 'chn', 'china'],
    'Thailand': ['th', 'tha', 'thailand'],
    'Südkorea': ['kr', 'kor', 'south-korea', 'south korea'],
    'Indien': ['in', 'ind', 'india']
  },

  continentsStructure: {
    'Nordamerika': ['USA', 'Kanada', 'Mexico', 'Kuba'],
    'Südamerika': ['Brasilien', 'Ecuador', 'Chile', 'Argentinien'],
    'Europa': ['Island', 'Italien', 'Spanien', 'Frankreich', 'Deutschland', 'Albanien', 'Russia', 'Polen'],
    'Afrika': ['Südafrika', 'Ägypten', 'Nigeria', 'Marokko'],
    'Asien': ['China', 'Thailand', 'Südkorea', 'Indien']
  },

  async init() {
    console.log("🌍 Game2Player initialisiert.");
    await this.fetchTeamNames();
    await this.preloadMapSVG();
    await this.fetchCountriesAndRender(true);

    supabaseClient.channel('game2-state-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game2_state', filter: 'id=eq.1' }, payload => {
        this.renderUI(payload.new);
      })
      .subscribe();

    supabaseClient.channel('game2-countries-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game2_countries' }, async () => {
        const { data } = await supabaseClient.from('game2_countries').select('*');
        if (data) {
          this.countriesCache = data;
          this.colorizeMap();
          this.updateAccordionsOnly();
        }
      })
      .subscribe();

    setInterval(() => this.fetchSilent(), 2000);
  },

  async preloadMapSVG() {
    if (this.svgContentCache) return;
    try {
      const response = await fetch('https://upload.wikimedia.org/wikipedia/commons/8/80/World_map_-_low_resolution.svg');
      if (response.ok) {
        let text = await response.text();
        text = text.replace('<svg ', '<svg style="width: 100%; height: auto; max-height: 28vh; object-fit: contain; filter: invert(1) hue-rotate(180deg) brightness(0.85);" ');
        this.svgContentCache = text;
      }
    } catch (e) {
      console.error("Fehler beim Laden der SVG-Karte:", e);
    }
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

  async fetchCountriesAndRender(fullRender = true) {
    const { data } = await supabaseClient.from('game2_countries').select('*');
    if (data) {
      this.countriesCache = data;
      const { data: stateData } = await supabaseClient.from('game2_state').select('*').eq('id', 1).maybeSingle();
      if (stateData) {
        if (fullRender) this.renderUI(stateData);
        else this.colorizeMap();
      }
    }
  },

  updateContainerPoints(scores) {
    let pointsEl = document.getElementById('g2-container-points');
    if (!pointsEl) {
      // Erzwingt die Erstellung des Containers oben rechts auf der Bühne, falls er fehlt
      const stage = document.getElementById('g2-stage');
      if (stage && !document.getElementById('g2-container-points')) {
        const wrapper = document.createElement('div');
        wrapper.id = 'g2-container-points';
        wrapper.style.cssText = 'position: absolute; top: 12px; right: 16px; display: flex; gap: 6px; z-index: 999;';
        stage.style.position = 'relative';
        stage.appendChild(wrapper);
        pointsEl = wrapper;
      }
    }
    if (!pointsEl) return;

    const teamColors = { blau: '#38bdf8', rot: '#f87171', gruen: '#4ade80', gelb: '#facc15' };
    const currentScores = scores || { blau: 0, rot: 0, gruen: 0, gelb: 0 };

    pointsEl.innerHTML = Object.entries(teamColors).map(([t, col]) => `
      <div title="${this.teamNamesCache[t]}" style="background: #121216; border: 2px solid ${col}; width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; color: ${col}; box-shadow: 0 4px 8px rgba(0,0,0,0.6);">
        ${currentScores[t] !== undefined ? currentScores[t] : 0}
      </div>
    `).join('');
  },

  async fetchSilent() {
    const { data } = await supabaseClient.from('game2_state').select('*').eq('id', 1).maybeSingle();
    if (data) {
      const stateStr = JSON.stringify(data);
      if (stateStr !== this.lastStateString) {
        this.renderUI(data);
      } else {
        this.updateContainerPoints(data.team_scores);
      }
    }
  },

  toggleContinent(continentName) {
    this.expandedContinents[continentName] = !this.expandedContinents[continentName];
    this.updateAccordionsOnly();
  },

  getContinentOwner(contName) {
    const countries = this.continentsStructure[contName];
    let firstTeam = undefined;

    for (const cName of countries) {
      const cData = this.countriesCache.find(c => c.name.toLowerCase() === cName.toLowerCase());
      if (!cData) return null;

      let countryTeam = null;
      for (let i = 4; i >= 1; i--) {
        const t = cData[`diff_${i}_team`];
        if (t && t !== 'falsch') {
          countryTeam = t;
          break;
        }
      }

      if (!countryTeam) return null;
      if (firstTeam === undefined) firstTeam = countryTeam;
      else if (firstTeam !== countryTeam) return null;
    }
    return firstTeam;
  },

  renderUI(state) {
    if (!state) return;
    this.lastStateString = JSON.stringify(state);

    const badge = document.getElementById('g2-round-badge');
    const title = document.getElementById('g2-cat-title');
    const stage = document.getElementById('g2-stage');

    if (!stage) return;
    stage.style.position = 'relative'; // Wichtig für die absolute Platzierung oben rechts

    if (state.status === 'question') {
      if (badge) badge.innerText = `Kontinent: ${state.current_continent || 'Welt'}`;
      if (title) title.innerText = `Land im Fokus: ${state.current_land || 'Auswahl'}`;

      stage.innerHTML = `
        <div id="g2-container-points" style="position: absolute; top: 12px; right: 16px; display: flex; gap: 6px; z-index: 999;"></div>
        <div style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 12px; box-sizing: border-box; padding: 10px;">
          <div style="background: #18181b; padding: 25px; border-radius: 12px; border: 2px solid #facc15; max-width: 750px; box-shadow: 0 4px 20px rgba(0,0,0,0.6);">
            <div style="font-size: 12px; color: #facc15; text-transform: uppercase; margin-bottom: 6px; font-weight: bold; letter-spacing: 1px;">⚔️ EROBERUNGS-FRAGE (Stufe ${state.current_difficulty} / 4)</div>
            <div style="font-size: 22px; font-weight: bold; color: white; line-height: 1.3; margin-top: 8px;">"${state.current_question || ''}"</div>
          </div>
          <div style="color: #a1a1aa; font-size: 13px; font-style: italic;">Besprecht euch im Team. Der Admin wertet gleich aus!</div>
        </div>
      `;
      this.updateContainerPoints(state.team_scores);
      return;
    }

    if (badge) badge.innerText = "Strategische Weltkarte";
    if (title) title.innerText = "Eroberungs-Modus";

    stage.innerHTML = `
      <div id="g2-container-points" style="position: absolute; top: 12px; right: 16px; display: flex; gap: 6px; z-index: 999;"></div>
      <div style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box; padding: 4px;">
        
        <div style="width: 100%; max-width: 820px; display: flex; flex-direction: column; gap: 5px; align-items: center; justify-content: center;">
          
          <!-- Oben: Kontinente & Stufen -->
          <div style="width: 100%; display: flex; flex-direction: column; gap: 3px; max-height: 30vh; overflow-y: auto; padding-right: 2px;" id="g2-accordion-container">
            ${this.renderAccordionsHTML()}
          </div>

          <!-- Unten: Weltkarte -->
          <div style="width: 100%; display: flex; flex-direction: column; align-items: center; background: #08080a; border: 2px solid #27272a; border-radius: 8px; padding: 4px; box-shadow: inset 0 0 25px rgba(0,0,0,0.9);">
            <div id="g2-interactive-map" style="width: 100%; display: flex; justify-content: center;">
              ${this.svgContentCache ? this.svgContentCache : '<div style="color: #a1a1aa; text-align: center; padding: 10px;">Lade Weltkarte...</div>'}
            </div>
          </div>

        </div>

      </div>
    `;

    this.updateContainerPoints(state.team_scores);
    this.colorizeMap();
  },

  updateAccordionsOnly() {
    const container = document.getElementById('g2-accordion-container');
    if (container) {
      container.innerHTML = this.renderAccordionsHTML();
    }
  },

  getContinentOwner(contName) {
    const countries = this.continentsStructure[contName];
    let firstTeam = undefined;

    for (const cName of countries) {
      const cData = this.countriesCache.find(c => c.name.toLowerCase() === cName.toLowerCase());
      if (!cData) return null;

      let countryTeam = null;
      for (let i = 4; i >= 1; i--) {
        const t = countryTeam || cData[`diff_${i}_team`]; // Logik zur Team-Bestimmung
        if (t && t !== 'falsch') {
          countryTeam = t;
          break;
        }
      }

      // Korrigierte Prüfung über alle Stufen hinweg pro Land
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

  renderAccordionsHTML() {
    const teamColors = { blau: '#38bdf8', rot: '#f87171', gruen: '#4ade80', gelb: '#facc15' };
    const getCountry = (name) => this.countriesCache.find(c => c.name.toLowerCase() === name.toLowerCase()) || { name, diff_1_team: null, diff_2_team: null, diff_3_team: null, diff_4_team: null };

    return Object.keys(this.continentsStructure).map(contName => {
      const isExpanded = !!this.expandedContinents[contName];
      const countries = this.continentsStructure[contName];
      const continentOwner = this.getContinentOwner(contName);
      const ownerColor = continentOwner && teamColors[continentOwner] ? teamColors[continentOwner] : '#3f3f46';

      // Spezieller Bonus-Text: Europa gibt +4 Punkte, alle anderen Kontinente standardmäßig +2 (oder anpassbar)
      const bonusPoints = contName === 'Europa' ? 4 : 2;
      const bonusLabel = continentOwner ? `<span style="font-size: 7px; background: ${ownerColor}; color: #000; padding: 1px 4px; border-radius: 2px; font-weight: bold;">BONUS (+${bonusPoints} Pkt: ${continentOwner.toUpperCase()})</span>` : '';

      return `
        <div style="background: #121216; border: 1px solid ${continentOwner ? ownerColor : '#27272a'}; border-radius: 5px; overflow: hidden;">
          <div onclick="Game2Player.toggleContinent('${contName}')" style="background: #18181b; padding: 4px 8px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;">
            <div style="display: flex; align-items: center; gap: 5px;">
              <span style="color: #facc15; font-size: 8px;">${isExpanded ? '▼' : '►'}</span>
              <span style="font-size: 10px; font-weight: bold; color: #ffffff;">${contName}</span>
              ${bonusLabel}
            </div>
            <span style="font-size: 8px; color: #71717a;">${countries.length} Länder</span>
          </div>

          <div style="display: ${isExpanded ? 'grid' : 'none'}; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 3px; padding: 4px;">
            ${countries.map(countryName => {
              const cData = getCountry(countryName);

              return `
                <div style="background: #18181b; border: 1px solid #27272a; border-radius: 3px; padding: 3px; display: flex; flex-direction: column; gap: 2px;">
                  <span style="font-size: 9px; font-weight: bold; color: #ffffff;">${countryName}</span>

                  <div style="display: flex; gap: 2px;">
                    ${[1, 2, 3, 4].map(lvl => {
                      const val = cData[`diff_${lvl}_team`];
                      let bg = '#27272a';
                      let col = '#a1a1aa';
                      let label = `S${lvl}`;

                      if (val && val !== 'falsch' && teamColors[val]) {
                        bg = teamColors[val];
                        col = '#000000';
                        label = `${val[0].toUpperCase()}${lvl}`;
                      } else if (val === 'falsch') {
                        bg = '#ffffff';
                        col = '#000000';
                        label = `X${lvl}`;
                      }

                      return `
                        <div style="flex: 1; text-align: center; background: ${bg}; color: ${col}; font-size: 7px; font-weight: bold; padding: 1px 0; border-radius: 2px;" title="Stufe ${lvl}: ${val ? val : 'Offen'}">
                          ${label}
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
  },

  colorizeMap() {
    const container = document.getElementById('g2-interactive-map');
    if (!container) return;

    let svgDoc = container.querySelector('svg');
    if (!svgDoc && this.svgContentCache) {
      container.innerHTML = this.svgContentCache;
      svgDoc = container.querySelector('svg');
    }
    if (!svgDoc) return;

    const teamColors = { blau: '#38bdf8', rot: '#f87171', gruen: '#4ade80', gelb: '#facc15' };
    const svgElements = svgDoc.querySelectorAll('path, g, polygon, rect');

    this.countriesCache.forEach(country => {
      const cName = country.name;
      
      let highestTeam = null;
      for (let i = 4; i >= 1; i--) {
        const t = country[`diff_${i}_team`];
        if (t && t !== 'falsch') {
          highestTeam = t;
          break;
        }
      }

      const activeColor = highestTeam && teamColors[highestTeam] ? teamColors[highestTeam] : null;
      const aliases = this.countryMapping[cName] || [];

      svgElements.forEach(el => {
        const id = (el.getAttribute('id') || '').toLowerCase();
        const cls = (el.getAttribute('class') || '').toLowerCase();

        const isMatch = aliases.some(alias => 
          id === alias || 
          id === alias + '_path' ||
          id.startsWith(alias + '-') || 
          cls === alias || 
          cls.includes(alias)
        );

        if (isMatch) {
          if (activeColor) {
            el.style.fill = activeColor;
            el.style.stroke = '#ffffff';
            el.style.strokeWidth = '1px';
            el.style.opacity = '1';
          } else {
            el.style.fill = '';
            el.style.stroke = '';
            el.style.opacity = '';
          }
        }
      });
    });
  }
};

window.Game2Player.init();