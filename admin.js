const supabaseClient = supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.KEY);

const AdminPanel = {
  teams: ['blau', 'rot', 'gruen', 'gelb'],

  async init() {
    await this.loadGameState();
    await this.loadPlayerSlots();
    this.initRealtimeListeners();
    this.initAllChatListeners();
  },

  async loadGameState() {
    const { data, error } = await supabaseClient.from('game_state').select('*').eq('id', 1).maybeSingle();
    if (error || !data) return;

    this.teams.forEach(t => {
      const nameInput = document.getElementById(`team-name-${t}`);
      if (nameInput && data[`team_${t}_name`]) nameInput.value = data[`team_${t}_name`];
      const scoreInput = document.getElementById(`input-score-${t}`);
      if (scoreInput) scoreInput.value = data[`punkte_gesamt_${t}`] ?? 0;
    });

    const modeSelect = document.getElementById('admin-game-mode');
    if (modeSelect && data.spiel_modus) {
      modeSelect.value = data.spiel_modus;
      this.loadAdminGameControls(data.spiel_modus);
    }
  },

  async loadPlayerSlots() {
    const container = document.getElementById('admin-slots-list');
    if (!container) return;

    const { data: slots, error } = await supabaseClient.from('player_slots').select('*').order('slot_id');
    if (error || !slots) {
      container.innerHTML = `<div style="color: #71717a; font-size: 11px;">Keine Slots gefunden.</div>`;
      return;
    }

    container.innerHTML = slots.map(slot => `
      <div style="background: #18181b; border: 1px solid #27272a; padding: 8px 10px; border-radius: 8px; display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <span style="font-size: 11px; font-weight: bold; color: #a1a1aa; width: 55px;">${slot.slot_id.replace('_', ' ').toUpperCase()}</span>
          <input type="text" value="${slot.spieler_name || ''}" onchange="AdminPanel.updatePlayerName('${slot.slot_id}', this.value)" placeholder="Spieler Name" style="flex-grow: 1; background: #09090b; border: 1px solid #27272a; color: white; padding: 4px 6px; border-radius: 4px; font-size: 11px;">
          
          <!-- CAPTAIN TOGGLE -->
          <button onclick="AdminPanel.toggleCaptain('${slot.slot_id}', ${!slot.is_captain})" style="background: ${slot.is_captain ? '#eab308' : '#27272a'}; color: ${slot.is_captain ? '#000' : '#71717a'}; border: 1px solid ${slot.is_captain ? '#ca8a04' : '#3f3f46'}; padding: 3px 8px; font-size: 10px; border-radius: 4px; cursor: pointer; font-weight: bold;" title="Zum Team-Captain ernennen">
            ${slot.is_captain ? '⭐ Captain' : 'Captain?'}
          </button>

          <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: ${slot.team === 'blau' ? '#38bdf840' : slot.team === 'rot' ? '#f8717140' : slot.team === 'gruen' ? '#4ade8040' : slot.team === 'gelb' ? '#facc1540' : '#27272a'}; color: ${slot.team === 'blau' ? '#38bdf8' : slot.team === 'rot' ? '#f87171' : slot.team === 'gruen' ? '#4ade80' : slot.team === 'gelb' ? '#facc15' : '#a1a1aa'}">
            ${slot.team ? slot.team.toUpperCase() : 'NEUTRAL'}
          </span>
        </div>

        <div style="display: flex; gap: 4px; align-items: center; border-top: 1px solid #27272a; padding-top: 4px;">
          <button onclick="AdminPanel.focusPlayer('${slot.slot_id}')" style="background: #2563eb; border: none; color: white; padding: 3px 6px; font-size: 10px; border-radius: 4px; cursor: pointer;">📺 Fokus</button>
          
          <select id="select-team-${slot.slot_id}" style="background: #09090b; color: white; border: 1px solid #27272a; font-size: 10px; padding: 2px; border-radius: 4px;">
            <option value="blau">Blau</option>
            <option value="rot">Rot</option>
            <option value="gruen">Grün</option>
            <option value="gelb">Gelb</option>
          </select>

          <button onclick="AdminPanel.assignTeamDirectly('${slot.slot_id}')" style="background: #16a34a; border: none; color: white; padding: 3px 6px; font-size: 10px; border-radius: 4px; cursor: pointer; font-weight: bold;">Zuweisen</button>
          <button onclick="AdminPanel.triggerRainbowForSlot('${slot.slot_id}')" style="background: #ca8a04; border: none; color: white; padding: 3px 6px; font-size: 10px; border-radius: 4px; cursor: pointer;">🌈 Rainbow</button>
          <button onclick="AdminPanel.resetPlayerToNeutral('${slot.slot_id}')" style="background: #27272a; border: 1px solid #3f3f46; color: #a1a1aa; padding: 3px 6px; font-size: 10px; border-radius: 4px; cursor: pointer;">❌ Neutral</button>
        </div>
      </div>
    `).join('');
  },

  async toggleCaptain(slotId, newCaptainState) {
    await supabaseClient.from('player_slots').update({ is_captain: newCaptainState }).eq('slot_id', slotId);
    await this.loadPlayerSlots();
  },

  async updatePlayerName(slotId, newName) {
    await supabaseClient.from('player_slots').update({ spieler_name: newName }).eq('slot_id', slotId);
  },

  async updateTeamName(team, newName) {
    await supabaseClient.from('game_state').update({ [`team_${team}_name`]: newName }).eq('id', 1);
  },

  async addPoints(team, amount) {
    const { data: state, error } = await supabaseClient.from('game_state').select('*').eq('id', 1).maybeSingle();
    if (error || !state) return;
    const columnName = `punkte_gesamt_${team}`;
    const newValue = Math.max(0, (state[columnName] || 0) + amount);
    await supabaseClient.from('game_state').update({ [columnName]: newValue }).eq('id', 1);
    const inputField = document.getElementById(`input-score-${team}`);
    if (inputField) inputField.value = newValue;
  },

  async setExactPoints(team, value) {
    const exactValue = Math.max(0, parseInt(value) || 0);
    await supabaseClient.from('game_state').update({ [`punkte_gesamt_${team}`]: exactValue }).eq('id', 1);
  },

  async setGameMode(mode) {
    await supabaseClient.from('game_state').update({ spiel_modus: mode }).eq('id', 1);
    await supabaseClient.channel('game-channel').send({
      type: 'broadcast',
      event: 'switch_game',
      payload: { game: mode }
    });
    this.loadAdminGameControls(mode);
  },

  async loadAdminGameControls(gameMode) {
    const controlsContainer = document.getElementById('admin-game-specific-controls');
    if (!controlsContainer) return;

    if (gameMode === 'lottery' || !gameMode) {
      controlsContainer.innerHTML = `
        <div style="font-size: 13px; font-weight: bold; color: #38bdf8;">📌 Auslosungs-Modus aktiv</div>
        <div style="font-size: 11px; color: #a1a1aa;">Nutze die Spieler-Liste rechts für Kamera-Fokus und Team-Zuweisungen.</div>
      `;
      return;
    }

    try {
      const response = await fetch(`${gameMode}/${gameMode}_admin.html`);
      if (!response.ok) throw new Error("Admin-Steuerung für dieses Spiel nicht gefunden");
      const htmlContent = await response.text();
      controlsContainer.innerHTML = htmlContent;

      const scriptId = `admin-script-${gameMode}`;
      if (!document.getElementById(scriptId)) {
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = `${gameMode}/${gameMode}_admin.js`;
        script.defer = true;
        document.body.appendChild(script);
      }
    } catch (err) {
      controlsContainer.innerHTML = `<div style="color: #ef4444; font-size: 11px;">Keine speziellen Regie-Controls für ${gameMode} gefunden.</div>`;
    }
  },

  async focusPlayer(slotId) {
    await supabaseClient.channel('game-channel').send({
      type: 'broadcast',
      event: 'focus_player',
      payload: { slotId: slotId }
    });
  },

  async unfocusPlayer() {
    await supabaseClient.channel('game-channel').send({
      type: 'broadcast',
      event: 'focus_player',
      payload: { slotId: null }
    });
  },

  async assignTeamDirectly(slotId) {
    const selectEl = document.getElementById(`select-team-${slotId}`);
    if (!selectEl) return;
    const targetTeam = selectEl.value;

    const { data: allSlots } = await supabaseClient.from('player_slots').select('slot_id, team');
    const count = allSlots ? allSlots.filter(s => s.team === targetTeam && s.slot_id !== slotId).length : 0;

    if (count >= 2) {
      alert(`Team ${targetTeam.toUpperCase()} ist bereits voll (max. 2 Spieler)!`);
      return;
    }

    await supabaseClient.channel('game-channel').send({
      type: 'broadcast',
      event: 'assign_team_animated',
      payload: { slotId: slotId, team: targetTeam }
    });

    await supabaseClient.from('player_slots').update({ team: targetTeam }).eq('slot_id', slotId);
    await this.loadPlayerSlots();
  },

  async triggerRainbowForSlot(slotId) {
    const { data: allSlots } = await supabaseClient.from('player_slots').select('slot_id, team');
    const teamCounts = { blau: 0, rot: 0, gruen: 0, gelb: 0 };
    if (allSlots) {
      allSlots.forEach(s => {
        if (teamCounts[s.team] !== undefined && s.slot_id !== slotId) teamCounts[s.team]++;
      });
    }

    const availableTeams = this.teams.filter(t => teamCounts[t] < 2);
    if (availableTeams.length === 0) {
      alert("Alle Teams sind bereits voll!");
      return;
    }

    const randomTeam = availableTeams[Math.floor(Math.random() * availableTeams.length)];

    await supabaseClient.channel('game-channel').send({
      type: 'broadcast',
      event: 'start_rainbow_lottery',
      payload: { slotId: slotId, winnerTeam: randomTeam }
    });

    setTimeout(async () => {
      await supabaseClient.from('player_slots').update({ team: randomTeam }).eq('slot_id', slotId);
      await this.loadPlayerSlots();
    }, 2200);
  },

  async resetPlayerToNeutral(slotId) {
    await supabaseClient.channel('game-channel').send({
      type: 'broadcast',
      event: 'reset_player_team',
      payload: { slotId: slotId }
    });

    await supabaseClient.from('player_slots').update({ team: 'neutral', is_captain: false }).eq('slot_id', slotId);
    await this.loadPlayerSlots();
  },

  async initAllChatListeners() {
    this.teams.forEach(team => this.setupChatForTeam(team));
  },

  async setupChatForTeam(team) {
    const container = document.getElementById(`chat-messages-${team}`);
    if (!container) return;

    const { data, error } = await supabaseClient
      .from('chat_messages')
      .select('*')
      .eq('team', team)
      .order('created_at', { ascending: true })
      .limit(40);

    if (error) {
      container.innerHTML = `<div style="color: #ef4444; text-align: center;">Fehler beim Laden.</div>`;
      return;
    }

    if (data && data.length > 0) {
      container.innerHTML = data.map(m => `
        <div style="word-break: break-word;">
          <strong style="color: ${m.sender === 'Elmo' ? '#f43f5e' : '#38bdf8'};">${m.sender || 'Spieler'}:</strong> 
          <span style="color: #f4f4f5;">${m.message}</span>
        </div>
      `).join('');
      container.scrollTop = container.scrollHeight;
    } else {
      container.innerHTML = `<div style="color: #71717a; text-align: center; margin-top: 10px;">Keine Nachrichten vorhanden.</div>`;
    }

    supabaseClient
      .channel(`admin-live-chat-${team}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `team=eq.${team}` }, payload => {
        const m = payload.new;
        if (container.innerHTML.includes('Keine Nachrichten') || container.innerHTML.includes('Fehler')) {
          container.innerHTML = '';
        }
        container.innerHTML += `
          <div style="word-break: break-word;">
            <strong style="color: ${m.sender === 'Elmo' ? '#f43f5e' : '#38bdf8'};">${m.sender || 'Spieler'}:</strong> 
            <span style="color: #f4f4f5;">${m.message}</span>
          </div>
        `;
        container.scrollTop = container.scrollHeight;
      })
      .subscribe();
  },

  async sendAdminChat(team) {
    const input = document.getElementById(`chat-input-${team}`);
    const senderNameInput = document.getElementById('admin-chat-sender-name');
    
    if (!input || !input.value.trim()) return;

    const messageText = input.value.trim();
    const senderName = senderNameInput?.value.trim() || 'Elmo';

    input.value = '';

    await supabaseClient.from('chat_messages').insert({
      team: team,
      sender: senderName,
      message: messageText
    });
  },

  initRealtimeListeners() {
    supabaseClient.channel('admin-db-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_slots' }, () => {
        this.loadPlayerSlots();
      })
      .subscribe();
  }
};

window.addEventListener('DOMContentLoaded', () => {
  AdminPanel.init();
});