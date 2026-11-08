const supabaseClient = supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.KEY);

let MY_SLOT = localStorage.getItem('quiz_studio_my_slot') || null;
let aktuellesGame = 'lottery';
let aktuellerFokusSlotId = null;

// Zentrale Funktion für alle performanten VDO.ninja Stream-Links im Studio (Ohne Raum-Limitierung)
function getStreamUrl(slotId) {
  const pass = "mikestinkt";
  const perfParams = "&quality=2&framerate=24&bitrate=500&max_bitrate=800&codec=vp9&maxviews=100";
  return `https://vdo.ninja/?view=${slotId}&solo=1&password=${pass}${perfParams}`;
}

window.addEventListener('DOMContentLoaded', () => {
  if (!MY_SLOT) {
    const modal = document.getElementById('player-setup-modal');
    if (modal) modal.style.display = 'flex';
  } else {
    TeamChat.init(supabaseClient, MY_SLOT);
    window.chatInitialized = true;
    ladeDatenbankZustand();
  }
  
  initGlobalGameStateListener();
});

async function savePlayerSlot() {
  const modalSelect = document.getElementById('modal-slot-select');
  if (!modalSelect) return;
  
  const selectedSlot = modalSelect.value;
  if (!selectedSlot) return;

  localStorage.setItem('quiz_studio_my_slot', selectedSlot);
  MY_SLOT = selectedSlot;
  
  const modal = document.getElementById('player-setup-modal');
  if (modal) modal.style.display = 'none';

  const { data } = await supabaseClient.from('player_slots').select('spieler_name, is_captain').eq('slot_id', MY_SLOT).single();
  if (!data || !data.spieler_name || data.spieler_name.startsWith('Spieler ')) {
    await supabaseClient.from('player_slots').update({ spieler_name: MY_SLOT }).eq('slot_id', MY_SLOT);
  }

  if (typeof TeamChat !== 'undefined' && !window.chatInitialized) {
    TeamChat.init(supabaseClient, MY_SLOT);
    window.chatInitialized = true;
  }

  ladeDatenbankZustand();
}

function openSelfElmoPopup() {
  const popup = document.getElementById('elmo-popup-overlay');
  const container = document.getElementById('elmo-popup-container');
  if (popup) popup.style.display = 'flex';
  if (container && typeof ElmoGame !== 'undefined') {
    ElmoGame.init(container, channel);
  }
}

function closeSelfElmoPopup() {
  const popup = document.getElementById('elmo-popup-overlay');
  if (popup) popup.style.display = 'none';
  if (typeof ElmoGame !== 'undefined' && typeof ElmoGame.destroy === 'function') {
    ElmoGame.destroy();
  }
}

function updateUIActiveGameHeader(mode) {
  const badge = document.getElementById('active-game-title-badge');
  const titles = {
    lottery: "Auslosung",
    game1: "🎮 Spiel 1",
    game2: "🎮 Spiel 2",
    game3: "🎮 Spiel 3",
    game4: "🎮 Spiel 4",
    game5: "🎮 Spiel 5",
    game6: "🎮 Spiel 6"
  };
  if (badge) badge.innerText = titles[mode] || mode.toUpperCase();
}

async function ladeDatenbankZustand() {
  const { data: state, error } = await supabaseClient.from('game_state').select('*').eq('id', 1).maybeSingle();
  if (!error && state) {
    const teams = ['blau', 'rot', 'gruen', 'gelb'];
    teams.forEach(t => {
      const nameEl = document.getElementById(`header-name-${t}`);
      if (nameEl) {
        const customName = state[`team_${t}_name`] || t.toUpperCase();
        const emoji = t === 'blau' ? '🔵' : t === 'rot' ? '🔴' : t === 'gruen' ? '🟢' : '🟡';
        nameEl.innerText = `${emoji} ${customName.toUpperCase()}`;
      }

      const gesamtEl = document.getElementById(`punkte-gesamt-${t}`);
      if (gesamtEl) {
        gesamtEl.innerText = state[`punkte_gesamt_${t}`] ?? 0;
      }
    });

    if (state.spiel_modus) {
      buehneRendern(state.spiel_modus);
    }
  }

  const { data: slots } = await supabaseClient.from('player_slots').select('*');
  if (slots) {
    slots.forEach(slot => {
      aktualisiereSpielerSlotUI(slot.slot_id, slot.spieler_name, slot.team, slot.is_captain);
    });
  }
}

function initGlobalGameStateListener() {
  supabaseClient
    .channel('public:game_state_global')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_state' }, payload => {
      const newData = payload.new;
      if (newData) {
        const teams = ['blau', 'rot', 'gruen', 'gelb'];
        teams.forEach(t => {
          const gesamtEl = document.getElementById(`punkte-gesamt-${t}`);
          if (gesamtEl && newData[`punkte_gesamt_${t}`] !== undefined) {
            gesamtEl.innerText = newData[`punkte_gesamt_${t}`];
          }

          const nameEl = document.getElementById(`header-name-${t}`);
          if (nameEl) {
            const customName = newData[`team_${t}_name`] || t.toUpperCase();
            const emoji = t === 'blau' ? '🔵' : t === 'rot' ? '🔴' : t === 'gruen' ? '🟢' : '🟡';
            nameEl.innerText = `${emoji} ${customName.toUpperCase()}`;
          }
        });

        if (newData.spiel_modus && newData.spiel_modus !== aktuellesGame) {
          buehneRendern(newData.spiel_modus);
        }
      }
    })
    .subscribe();
}

function aktualisiereSpielerSlotUI(slotId, name, team, isCaptain) {
  const box = document.getElementById(`box-${slotId}`);
  const titleEl = document.getElementById(`title-${slotId}`);

  if (titleEl && name) titleEl.innerText = name;

  if (box) {
    box.classList.remove('team-blau', 'team-rot', 'team-gruen', 'team-gelb');
    let targetContainerId = 'container-neutral';

    if (team && team !== 'neutral') {
      box.classList.add(`team-${team}`);
      targetContainerId = `container-${team}`;
    }

    box.classList.toggle('is-captain', isCaptain === true);

    const targetContainer = document.getElementById(targetContainerId);
    if (targetContainer && box.parentElement !== targetContainer) {
      targetContainer.appendChild(box);
    }
  }

  const neutralContainer = document.getElementById('container-neutral');
  const waitingAreaCard = document.getElementById('neutral-waiting-area');
  if (neutralContainer && waitingAreaCard) {
    waitingAreaCard.style.display = neutralContainer.children.length === 0 ? 'none' : 'block';
  }
}

async function buehneRendern(gameMode) {
  const stage = document.getElementById('dynamic-game-stage');
  aktuellesGame = gameMode;
  updateUIActiveGameHeader(gameMode);

  if (aktuellerFokusSlotId || !stage) return;

  if (gameMode === 'lottery' || !gameMode) {
    stage.innerHTML = `
      <div class="lottery-stage-box" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; gap: 10px;">
        <div class="lottery-live-badge">● LIVE</div>
        <div class="lottery-title" style="font-size: 28px; font-weight: bold; color: #f4f4f5;">Warte auf Auslosung...</div>
        <div class="lottery-subtitle" style="font-size: 14px; color: #71717a;">Gleich geht es los!</div>
      </div>
    `;
    return;
  }

  try {
    const response = await fetch(`${gameMode}/${gameMode}.html`);
    if (!response.ok) throw new Error("Spiel-HTML nicht gefunden");
    const htmlContent = await response.text();
    stage.innerHTML = htmlContent;

    const scriptId = `script-${gameMode}`;
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = `${gameMode}/${gameMode}.js`;
      script.defer = true;
      document.body.appendChild(script);
    }
  } catch (err) {
    stage.innerHTML = `<div style="color: #ef4444; padding: 20px; text-align: center;">Fehler beim Laden von ${gameMode}: ${err.message}</div>`;
  }
}

const channel = supabaseClient.channel('game-channel', { config: { broadcast: { self: true } } });

channel
  .on('broadcast', { event: 'toggle_elmo_popup' }, payload => {
    payload.payload.show ? openSelfElmoPopup() : closeSelfElmoPopup();
  })
  .on('broadcast', { event: 'reset_player_team' }, payload => {
    aktualisiereSpielerSlotUI(payload.payload.slotId, null, 'neutral', false);
  })
  .on('broadcast', { event: 'focus_player' }, payload => {
    const { slotId } = payload.payload;
    const stage = document.getElementById('dynamic-game-stage');

    if (aktuellerFokusSlotId && aktuellerFokusSlotId !== slotId) {
      const oldBox = document.getElementById(`box-${aktuellerFokusSlotId}`);
      if (oldBox) {
        oldBox.classList.remove('in-focus-stage');
        oldBox.innerHTML = `
          <div class="cam-title"><span id="title-${aktuellerFokusSlotId}">Spieler</span></div>
          <iframe id="iframe-${aktuellerFokusSlotId}" src="${getStreamUrl(aktuellerFokusSlotId)}" allow="autoplay"></iframe>
        `;
        ladeDatenbankZustand();
      }
    }

    if (slotId) {
      aktuellerFokusSlotId = slotId;
      const origBox = document.getElementById(`box-${slotId}`);
      let currentTeamClass = 'fokus-team-neutral';
      if (origBox) {
        if (origBox.classList.contains('team-blau')) currentTeamClass = 'fokus-team-blau';
        else if (origBox.classList.contains('team-rot')) currentTeamClass = 'fokus-team-rot';
        else if (origBox.classList.contains('team-gruen')) currentTeamClass = 'fokus-team-gruen';
        else if (origBox.classList.contains('team-gelb')) currentTeamClass = 'fokus-team-gelb';

        origBox.classList.add('in-focus-stage');
        const titleText = document.getElementById(`title-${slotId}`)?.innerText || slotId;
        origBox.innerHTML = `<div class="cam-title"><span>${titleText}</span></div><div class="cam-placeholder"></div>`;
      }

      if (stage) {
        stage.innerHTML = `
          <div class="fokus-stage-box" style="padding: 10px; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div class="fokus-cam-wrapper ${currentTeamClass}" id="fokus-wrapper" style="width: 100%; max-width: 900px; height: 520px; border-radius: 16px; overflow: hidden;">
              <iframe src="${getStreamUrl(slotId)}" allow="autoplay" style="width: 100%; height: 100%;"></iframe>
            </div>
          </div>
        `;
      }
    } else {
      if (aktuellerFokusSlotId) {
        const oldBox = document.getElementById(`box-${aktuellerFokusSlotId}`);
        if (oldBox) {
          oldBox.classList.remove('in-focus-stage');
          oldBox.innerHTML = `
            <div class="cam-title"><span id="title-${aktuellerFokusSlotId}">Spieler</span></div>
            <iframe id="iframe-${aktuellerFokusSlotId}" src="${getStreamUrl(aktuellerFokusSlotId)}" allow="autoplay"></iframe>
          `;
        }
        aktuellerFokusSlotId = null;
        ladeDatenbankZustand();
      }
      buehneRendern(aktuellesGame);
    }
  })
  .on('broadcast', { event: 'assign_team_animated' }, payload => {
    const { slotId, team } = payload.payload;
    setTimeout(async () => {
      const { data } = await supabaseClient.from('player_slots').select('*').eq('slot_id', slotId).maybeSingle();
      if (data) {
        aktualisiereSpielerSlotUI(data.slot_id, data.spieler_name, data.team, data.is_captain);
      } else {
        aktualisiereSpielerSlotUI(slotId, null, team, false);
      }
    }, 600);
  })
  .on('broadcast', { event: 'start_rainbow_lottery' }, async payload => {
    const { slotId, winnerTeam } = payload.payload;
    
    const fokusWrapper = document.getElementById('fokus-wrapper');
    const isCurrentlyFocused = (aktuellerFokusSlotId === slotId && fokusWrapper);

    const targetElement = isCurrentlyFocused ? fokusWrapper : document.getElementById(`box-${slotId}`);
    
    if (targetElement) {
      targetElement.classList.add('rainbow-spinning');
    }

    setTimeout(async () => {
      if (targetElement) {
        targetElement.classList.remove('rainbow-spinning');
      }
      const { data } = await supabaseClient.from('player_slots').select('*').eq('slot_id', slotId).maybeSingle();
      if (data) {
        aktualisiereSpielerSlotUI(data.slot_id, data.spieler_name, data.team, data.is_captain);
      } else {
        aktualisiereSpielerSlotUI(slotId, null, winnerTeam, false);
      }
    }, 2500);
  })
  .on('broadcast', { event: 'switch_game' }, payload => {
    buehneRendern(payload.payload.game);
  })
  .subscribe();

supabaseClient.channel('db-channel')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'player_slots' }, () => ladeDatenbankZustand())
  .subscribe();