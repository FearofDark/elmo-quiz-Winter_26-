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
    console.log("🌍 Game2Player initialisiert (Stabil).");
    
    await this.fetchTeamNames();
    await this.preloadMapSVG();
    await this.fetchCountriesAndRender(true);

    if (typeof supabaseClient !== 'undefined') {
      supabaseClient.channel('game2-state-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game2_state', filter: 'id=eq.1' }, payload => {
          if (payload.new) this.renderUI(payload.new);
        })
        .subscribe();

      supabaseClient.channel('game2-countries-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game2_countries' }, async () => {
          const { data } = await supabaseClient.from('game2_countries').select('*');
          this.countriesCache = data || [];
          this.colorizeMap();
          this.updateAccordionsOnly();
        })
        .subscribe();
    }

    setInterval(() => this.fetchSilent(), 3000);
  },

  async preloadMapSVG() {
    if (this.svgContentCache) return;
    
    const fallbackSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500" style="width: 100%; height: auto; max-height: 28vh; object-fit: contain; filter: invert(1) hue-rotate(180deg) brightness(0.85);">
      <rect width="1000" height="500" fill="#09090b"/>
      <text x="500" y="250" fill="#a1a1aa" font-size="20" text-anchor="middle" font-family="sans-serif">Weltkarte (Offline-Modus / Ladefehler)</text>
    </svg>`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const response = await fetch('https://upload.wikimedia.org/wikipedia/commons/8/80/World_map_-_low_resolution.svg', {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        let text = await response.text();
        text = text.replace('<svg ', '<svg style="width: 100%; height: auto; max-height: 28vh; object-fit: contain; filter: invert(1) hue-rotate(180deg) brightness(0.85);" ');
        this.svgContentCache = text;
      } else {
        this.svgContentCache = fallbackSVG;
      }
    } catch (e) {
      console.warn("Konnte Karte nicht online laden, nutze Fallback:", e);
      this.svgContentCache = fallbackSVG;
    }
  },

  async fetchTeamNames() {
    try {
      const { data } = await supabaseClient.from('game_state').select('team_blau_name, team_rot_name, team_gruen_name, team_gelb_name').eq('id', 1).maybeSingle();
      if (data) {
        this.teamNamesCache = {
          blau: data.team_blau_name || 'Team Blau',
          rot: data.team_rot_name || 'Team Rot',
          gruen: data.team_gruen_name || 'Team Grün',
          gelb: data.team_gelb_name || 'Team Gelb'
        };
      }
    } catch (e) { /* Fallback aktiv */ }
  },

  async fetchCountriesAndRender(fullRender = true) {
    try {
      const { data: countryData } = await supabaseClient.from('game2_countries').select('*');
      this.countriesCache = countryData || [];

      const { data: stateData } = await supabaseClient.from('game2_state').select('*').eq('id', 1).maybeSingle();
      const fallbackState = stateData || { status: 'neutral', team_scores: { blau: 0, rot: 0, gruen: 0, gelb: 0 } };

      if (fullRender) {
        this.renderUI(fallbackState);
      } else {
        this.colorizeMap();
      }
    } catch (e) {
      console.error("Fehler beim Laden der Spieldaten:", e);
      this.renderUI({ status: 'neutral', team_scores: { blau: 0, rot: 0, gruen: 0, gelb: 0 } });
    }
  },

  updateContainerPoints(scores) {
    let pointsEl = document.getElementById('g2-container-points');
    const stage = document.getElementById('g2-stage');
    if (!pointsEl && stage) {
      const wrapper = document.createElement('div');
      wrapper.id = 'g2-container-points';
      wrapper.style.cssText = 'position: absolute; top: 12px; right: 16px; display: flex; gap: 6px; z-index: 999;';
      stage.style.position = 'relative';
      stage.appendChild(wrapper);
      pointsEl = wrapper;
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
    try {
      const { data } = await supabaseClient.from('game2_state').select('*').eq('id', 1).maybeSingle();
      if (data) {
        const stateStr = JSON.stringify(data);
        if (stateStr !== this.lastStateString) {
          this.renderUI(data);
        } else {
          this.updateContainerPoints(data.team_scores);
        }
      }
    } catch (e) { /* Netzwerkpuffer */ }
  },

  toggleContinent(continentName) {
    this.expandedContinents[continentName] = !this.expandedContinents[continentName];
    this.updateAccordionsOnly();
  },

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

  renderUI(state) {
    const stage = document.getElementById('g2-stage');
    if (!stage) return;
    stage.style.position = 'relative';

    const currentState = state || { status: 'neutral', team_scores: { blau: 0, rot: 0, gruen: 0, gelb: 0 } };
    this.lastStateString = JSON.stringify(currentState);

    const badge = document.getElementById('g2-round-badge');
    const title = document.getElementById('g2-cat-title');

    if (currentState.status === 'question') {
      if (badge) badge.innerText = `Kontinent: ${currentState.current_continent || 'Welt'}`;
      if (title) title.innerText = `Land im Fokus: ${currentState.current_land || 'Auswahl'}`;

      // HIER GEÄNDERT: Moderner, cleaner weißer Rahmen statt goldenem Rand
      stage.innerHTML = `
        <div id="g2-container-points" style="position: absolute; top: 12px; right: 16px; display: flex; gap: 6px; z-index: 999;"></div>
        <div style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 12px; box-sizing: border-box; padding: 15px;">
          <div style="background: linear-gradient(135deg, #18181b 0%, #09090b 100%); padding: 35px 40px; border-radius: 16px; border: 2px solid rgba(255, 255, 255, 0.8); max-width: 800px; width: 100%; box-shadow: 0 15px 35px rgba(0,0,0,0.8), 0 0 20px rgba(255,255,255,0.1); backdrop-filter: blur(10px);">
            <div style="font-size: 11px; color: #38bdf8; text-transform: uppercase; margin-bottom: 10px; font-weight: 800; letter-spacing: 2px;">⚔️ EROBERUNGS-FRAGE (Stufe ${currentState.current_difficulty || 1} / 4)</div>
            <div style="font-size: 26px; font-weight: 700; color: #ffffff; line-height: 1.4; margin-top: 10px; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">"${currentState.current_question || ''}"</div>
          </div>
        </div>
      `;
      this.updateContainerPoints(currentState.team_scores);
      return;
    }

    if (badge) badge.innerText = "Strategische Weltkarte";
    if (title) title.innerText = "Eroberungs-Modus";

    stage.innerHTML = `
      <div id="g2-container-points" style="position: absolute; top: 12px; right: 16px; display: flex; gap: 6px; z-index: 999;"></div>
      <div style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box; padding: 4px;">
        <div style="width: 100%; max-width: 820px; display: flex; flex-direction: column; gap: 5px; align-items: center; justify-content: center;">
          <div style="width: 100%; display: flex; flex-direction: column; gap: 3px; max-height: 30vh; overflow-y: auto; padding-right: 2px;" id="g2-accordion-container">
            ${this.renderAccordionsHTML()}
          </div>
          <div style="width: 100%; display: flex; flex-direction: column; align-items: center; background: #08080a; border: 2px solid #27272a; border-radius: 8px; padding: 4px; box-shadow: inset 0 0 25px rgba(0,0,0,0.9);">
            <div id="g2-interactive-map" style="width: 100%; display: flex; justify-content: center;">
              ${this.svgContentCache ? this.svgContentCache : '<div style="color: #a1a1aa; text-align: center; padding: 10px;">Lade Weltkarte...</div>'}
            </div>
          </div>
        </div>
      </div>
    `;

    this.updateContainerPoints(currentState.team_scores);
    this.colorizeMap();
  },

  updateAccordionsOnly() {
    const container = document.getElementById('g2-accordion-container');
    if (container) {
      container.innerHTML = this.renderAccordionsHTML();
    }
  },

  renderAccordionsHTML() {
    const teamColors = { blau: '#38bdf8', rot: '#f87171', gruen: '#4ade80', gelb: '#facc15' };
    const getCountry = (name) => this.countriesCache.find(c => c.name && c.name.toLowerCase() === name.toLowerCase()) || { name, diff_1_team: null, diff_2_team: null, diff_3_team: null, diff_4_team: null };

    return Object.keys(this.continentsStructure).map(contName => {
      const isExpanded = !!this.expandedContinents[contName];
      const countries = this.continentsStructure[contName];
      const continentOwner = this.getContinentOwner(contName);
      const ownerColor = continentOwner && teamColors[continentOwner] ? teamColors[continentOwner] : '#3f3f46';
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

window.reloadGame2Only = async function() {
  console.log("🔄 Spiel 2 wird lokal neu initialisiert...");
  const stage = document.getElementById('g2-stage');
  if (stage) {
    stage.innerHTML = `<div style="color: #facc15; font-size: 14px;">Spiel wird neu geladen...</div>`;
  }
  await window.Game2Player.fetchTeamNames();
  await window.Game2Player.preloadMapSVG();
  await window.Game2Player.fetchCountriesAndRender(true);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.Game2Player.init());
} else {
  window.Game2Player.init();
}