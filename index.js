const supabaseClient = supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.KEY);

let MY_SLOT = localStorage.getItem('quiz_studio_my_slot') || null;

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
  if (!selectedSlot) {
    alert("Bitte wähle deinen Slot aus!");
    return;
  }

  localStorage.setItem('quiz_studio_my_slot', selectedSlot);
  MY_SLOT = selectedSlot;
  
  const modal = document.getElementById('player-setup-modal');
  if (modal) modal.style.display = 'none';

  const { data } = await supabaseClient.from('player_slots').select('spieler_name').eq('slot_id', MY_SLOT).single();
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

let aktuellesGame = 'lottery';
let aktuellerFokusSlotId = null;

function updateUIActiveGameHeader(mode) {
  const badge = document.getElementById('active-game-title-badge');
  const items = {
    lottery: "Auslosung",
    game_1: "🎮 Spiel 1"
  };

  if (badge) {
    badge.innerText = items[mode] || "Auslosung";
  }
}

async function ladeDatenbankZustand() {
  // 1. Spiel-Zustand (Punkte, Modus, Team-Namen) laden
  const { data: state, error } = await supabaseClient.from('game_state').select('*').eq('id', 1).maybeSingle();
  if (!error && state) {
    const teams = ['blau', 'rot', 'gruen', 'gelb'];
    teams.forEach(t => {
      const nameEl = document.getElementById(`header-name-${t}`);
      if (nameEl && state[`team_${t}_name`]) {
        const emoji = t === 'blau' ? '🔵' : t === 'rot' ? '🔴' : t === 'gruen' ? '🟢' : '🟡';
        nameEl.innerText = `${emoji}  ${state[`team_${t}_name`].toUpperCase()}`;
      }

      const gesamtEl = document.getElementById(`punkte-gesamt-${t}`);
      if (gesamtEl) {
        gesamtEl.innerText = (state[`punkte_gesamt_${t}`] !== undefined && state[`punkte_gesamt_${t}`] !== null) ? state[`punkte_gesamt_${t}`] : 0;
      }
    });

    if (state.spiel_modus) {
      buehneRendern(state.spiel_modus);
    }
  }

  // 2. WICHTIG: Alle Spieler-Slots aus der Datenbank laden und UI korrekt setzen!
  const { data: slots, error: slotError } = await supabaseClient.from('player_slots').select('*');
  if (!slotError && slots) {
    slots.forEach(slot => {
      // Setzt jeden Spieler in das korrekte Team (oder in den neutralen Wartebereich)
      aktualisiereSpielerSlotUI(slot.slot_id, slot.spieler_name, slot.team);
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
          if (gesamtEl && newData[`punkte_gesamt_${t}`] !== undefined && newData[`punkte_gesamt_${t}`] !== null) {
            gesamtEl.innerText = newData[`punkte_gesamt_${t}`];
          }

          const nameEl = document.getElementById(`header-name-${t}`);
          if (nameEl && newData[`team_${t}_name`]) {
            const emoji = t === 'blau' ? '🔵' : t === 'rot' ? '🔴' : t === 'gruen' ? '🟢' : '🟡';
            nameEl.innerText = `${emoji}${newData[`team_${t}_name`].toUpperCase()}`;
          }
        });

        if (newData.spiel_modus && newData.spiel_modus !== aktuellesGame) {
          buehneRendern(newData.spiel_modus);
        }
      }
    })
    .subscribe();
}

function aktualisiereSpielerSlotUI(slotId, name, team) {
  const box = document.getElementById(`box-${slotId}`);
  const titleEl = document.getElementById(`title-${slotId}`);

  if (titleEl && name) {
    titleEl.innerText = name;
  }

  if (box) {
    box.classList.remove('team-blau', 'team-rot', 'team-gruen', 'team-gelb');

    let targetContainerId = 'container-neutral';
    
    if (team && team !== 'neutral') {
      box.classList.add(`team-${team}`);
      targetContainerId = `container-${team}`;
    }

    const targetContainer = document.getElementById(targetContainerId);
    if (targetContainer && box.parentElement !== targetContainer) {
      targetContainer.appendChild(box);
    }
  }

  const neutralContainer = document.getElementById('container-neutral');
  const waitingAreaCard = document.getElementById('neutral-waiting-area');
  if (neutralContainer && waitingAreaCard) {
    if (neutralContainer.children.length === 0) {
      waitingAreaCard.style.display = 'none';
    } else {
      waitingAreaCard.style.display = 'block';
    }
  }
}

function buehneRendern(gameMode) {
  const stage = document.getElementById('dynamic-game-stage');

  aktuellesGame = gameMode;
  updateUIActiveGameHeader(gameMode);

  if (aktuellerFokusSlotId) return;

  if (stage) {
    if (gameMode === 'game_1') {
      // PROTOTOYP / PLATZHALTER FÜR SPIEL 1
      stage.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; gap: 10px;">
          <div style="font-size: 32px; font-weight: bold; color: #38bdf8;">🎮 SPIEL 1</div>
          <div style="font-size: 16px; color: #a1a1aa;">Das erste Spiel läuft! HIER SPIEL 1 LOGIK EINBAUEN.</div>
        </div>
      `;
    } else {
      // STANDARD AUSLOSUNGSMODUS
      stage.innerHTML = `
        <div class="lottery-stage-box" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; gap: 10px;">
          <div class="lottery-live-badge">● LIVE</div>
          <div class="lottery-title" style="font-size: 28px; font-weight: bold; color: #f4f4f5;">Warte auf Auslosung...</div>
          <div class="lottery-subtitle" style="font-size: 14px; color: #71717a;">Gleich geht es los!</div>
        </div>
      `;
    }
  }
}

const channel = supabaseClient.channel('game-channel', { config: { broadcast: { self: true } } });

channel
  .on('broadcast', { event: 'toggle_elmo_popup' }, payload => {
    if (payload.payload.show) {
      openSelfElmoPopup();
    } else {
      closeSelfElmoPopup();
    }
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
          <iframe id="iframe-${aktuellerFokusSlotId}" src="https://vdo.ninja/?view=${aktuellerFokusSlotId}&solo=1&room=DieElmigos_Stream&password=mikestinkt" allow="autoplay"></iframe>
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
        const titleText = document.getElementById(`title-${slotId}`) ? document.getElementById(`title-${slotId}`).innerText : slotId;
        origBox.innerHTML = `
          <div class="cam-title"><span>${titleText}</span></div>
          <div class="cam-placeholder"></div>
        `;
      }

      if (stage) {
        stage.innerHTML = `
          <div class="fokus-stage-box" style="padding: 10px; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div class="fokus-cam-wrapper ${currentTeamClass}" id="fokus-wrapper" style="width: 100%; max-width: 900px; height: 520px; border-radius: 16px; overflow: hidden; transition: all 0.3s ease;">
              <iframe src="https://vdo.ninja/?view=${slotId}&solo=1&room=DieElmigos_Stream&password=mikestinkt" allow="autoplay" style="width: 100%; height: 100%;"></iframe>
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
            <iframe id="iframe-${aktuellerFokusSlotId}" src="https://vdo.ninja/?view=${aktuellerFokusSlotId}&solo=1&room=DieElmigos_Stream&password=mikestinkt" allow="autoplay"></iframe>
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
    const wrapper = document.getElementById('fokus-wrapper');
    if (wrapper) wrapper.className = `fokus-cam-wrapper flash-${team}`;

    setTimeout(() => {
      aktualisiereSpielerSlotUI(slotId, null, team);
    }, 600);
  })
  .on('broadcast', { event: 'start_rainbow_lottery' }, async payload => {
    const { slotId, winnerTeam } = payload.payload;
    const stage = document.getElementById('dynamic-game-stage');

    if (stage && !document.getElementById('fokus-wrapper')) {
      stage.innerHTML = `
        <div class="fokus-stage-box" style="padding: 10px; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <div class="fokus-cam-wrapper fokus-team-neutral" id="fokus-wrapper" style="width: 100%; max-width: 900px; height: 520px; border-radius: 16px; overflow: hidden; transition: all 0.3s ease;">
            <iframe src="https://vdo.ninja/?view=${slotId}&solo=1&room=DieElmigos_Stream&password=mikestinkt" allow="autoplay" style="width: 100%; height: 100%;"></iframe>
          </div>
        </div>
      `;
    }

    const wrapper = document.getElementById('fokus-wrapper');
    if (wrapper) {
      wrapper.className = 'fokus-cam-wrapper rainbow-spinning';
      await new Promise(resolve => setTimeout(resolve, 2500));

      wrapper.className = `fokus-cam-wrapper fokus-team-${winnerTeam}`;
      setTimeout(() => {
        aktualisiereSpielerSlotUI(slotId, null, winnerTeam);
      }, 300);
    }
  })
  .on('broadcast', { event: 'switch_game' }, payload => {
    buehneRendern(payload.payload.game);
  })
  .subscribe();

supabaseClient.channel('db-channel')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'player_slots' }, () => ladeDatenbankZustand())
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_state' }, payload => {
    const newData = payload.new;
    if (newData) {
      const teams = ['blau', 'rot', 'gruen', 'gelb'];
      teams.forEach(t => {
        const gesamtEl = document.getElementById(`punkte-gesamt-${t}`);
        if (gesamtEl && newData[`punkte_gesamt_${t}`] !== undefined && newData[`punkte_gesamt_${t}`] !== null) {
          gesamtEl.innerText = newData[`punkte_gesamt_${t}`];
        }

        const nameEl = document.getElementById(`header-name-${t}`);
        if (nameEl && newData[`team_${t}_name`]) {
          const emoji = t === 'blau' ? '🔵' : t === 'rot' ? '🔴' : t === 'gruen' ? '🟢' : '🟡';
          nameEl.innerText = `${emoji} TEAM ${newData[`team_${t}_name`].toUpperCase()}`;
        }
      });

      if (newData.spiel_modus && newData.spiel_modus !== aktuellesGame) {
        buehneRendern(newData.spiel_modus);
      }
    }
  })
  .subscribe();