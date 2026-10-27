const TeamChat = {
  supabase: null,
  activeChannel: null,
  currentTeam: 'neutral',
  playerName: 'Spieler',
  mySlotId: null,
  popoutWindow: null,
  customTeamName: '',

  teamColors: {
    blau: '#38bdf8',
    rot: '#ef4444',
    gruen: '#22c55e',
    gelb: '#eab308',
    neutral: '#71717a'
  },

  emotes: ['🔥', '🎉', '💩', '😎', '❤️', '🚀', '👀', '🏆', '💀', '😂', '👍', '👏', '🧠', '⚡', '💯'],

  init(supabaseClient, slotId) {
    this.supabase = supabaseClient;
    this.mySlotId = slotId || localStorage.getItem('quiz_studio_my_slot') || 'player_1';
    this.renderHTML();
    this.initDraggable();
    this.fetchAndUpdateFromDB();
    this.initDatabaseListener();
  },

  renderHTML() {
    if (document.getElementById('team-chat-widget')) return;

    const html = `
      <div id="team-chat-widget" style="position: fixed; left: 20px; bottom: 20px; width: 320px; background: rgba(12, 12, 15, 0.96); border: 1px solid #27272a; border-radius: 12px; z-index: 9999; box-shadow: 0 10px 30px rgba(0,0,0,0.8); backdrop-filter: blur(12px); display: flex; flex-direction: column; overflow: hidden; transition: box-shadow 0.2s;">
        
        <!-- Header -->
        <div id="chat-widget-header" style="background: #18181b; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #27272a; cursor: grab; user-select: none;" title="Halten zum Verschieben">
          <div style="display: flex; align-items: center; gap: 6px; cursor: pointer;" onclick="TeamChat.toggleCollapse()">
            <span style="font-size: 11px;">💬</span>
            <span id="active-chat-title" style="font-size: 11px; font-weight: bold; color: #38bdf8;">Team-Chat</span>
          </div>
          
          <div style="display: flex; align-items: center; gap: 6px;">
            <button onclick="TeamChat.openPopout()" title="Auf 2. Bildschirm verschieben" style="background: #27272a; border: 1px solid #3f3f46; color: #f4f4f5; font-size: 9px; padding: 3px 7px; border-radius: 4px; cursor: pointer;">🗗 2. Bild</button>
            <span id="active-chat-user" style="font-size: 9px; color: #a1a1aa; background: #27272a; padding: 2px 6px; border-radius: 4px;">Name</span>
            <span id="chat-toggle-icon" style="font-size: 10px; color: #71717a; cursor: pointer;" onclick="TeamChat.toggleCollapse()">▼</span>
          </div>
        </div>

        <!-- Chat-Inhalt -->
        <div id="chat-body-container" style="display: flex; flex-direction: column; height: 260px; padding: 10px; box-sizing: border-box; background: rgba(12, 12, 15, 0.98);">
          <div id="chat-messages-box" style="flex-grow: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; font-size: 11px; padding-right: 4px; max-height: 160px;"></div>
          
          <!-- Emoji-Leiste -->
          <div style="display: flex; gap: 4px; margin: 8px 0; overflow-x: auto; padding-bottom: 2px;">
            ${this.emotes.map(e => `<button onclick="TeamChat.insertEmote('${e}')" style="background: #18181b; border: 1px solid #27272a; border-radius: 4px; padding: 3px 6px; cursor: pointer; font-size: 13px;" title="Emoji senden">${e}</button>`).join('')}
          </div>

          <!-- Eingabezeile -->
          <div style="display: flex; gap: 5px;">
            <input type="text" id="chat-input-msg" placeholder="Nachricht..." onkeydown="if(event.key==='Enter') TeamChat.send()" style="flex-grow: 1; background: #18181b; border: 1px solid #3f3f46; color: #fff; padding: 6px 8px; border-radius: 5px; font-size: 11px; outline: none;">
            <button onclick="TeamChat.send()" style="background: #22c55e; color: white; border: none; padding: 6px 10px; border-radius: 5px; font-weight: bold; cursor: pointer; font-size: 11px;">Senden</button>
          </div>
        </div>
      </div>
      <style>
        #chat-body-container.collapsed { display: none !important; }
        #chat-messages-box::-webkit-scrollbar { width: 4px; }
        #chat-messages-box::-webkit-scrollbar-thumb { background: #27272a; border-radius: 4px; }
      </style>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  },

  initDraggable() {
    const widget = document.getElementById('team-chat-widget');
    const header = document.getElementById('chat-widget-header');
    if (!widget || !header) return;

    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    header.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON' || (e.target.tagName === 'SPAN' && e.target.onclick)) return;

      isDragging = true;
      header.style.cursor = 'grabbing';
      startX = e.clientX;
      startY = e.clientY;

      const rect = widget.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      widget.style.bottom = 'auto';
      widget.style.right = 'auto';
      widget.style.left = initialLeft + 'px';
      widget.style.top = initialTop + 'px';

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    });

    function onMouseMove(e) {
      if (!isDragging) return;
      widget.style.left = (initialLeft + (e.clientX - startX)) + 'px';
      widget.style.top = (initialTop + (e.clientY - startY)) + 'px';
    }

    function onMouseUp() {
      isDragging = false;
      header.style.cursor = 'grab';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
  },

  toggleCollapse() {
    const body = document.getElementById('chat-body-container');
    const icon = document.getElementById('chat-toggle-icon');
    body.classList.toggle('collapsed');
    icon.innerText = body.classList.contains('collapsed') ? '▲' : '▼';
  },

  async insertEmote(emote) {
    if (!this.currentTeam) return;
    await this.supabase.from('chat_messages').insert({
      team: this.currentTeam,
      sender: this.playerName,
      message: emote
    });
  },

  async fetchAndUpdateFromDB() {
    if (!this.mySlotId) {
      this.mySlotId = localStorage.getItem('quiz_studio_my_slot') || 'player_1';
    }

    const { data: slotData, error } = await this.supabase
      .from('player_slots')
      .select('spieler_name, team')
      .eq('slot_id', this.mySlotId)
      .maybeSingle();

    if (error || !slotData) return;

    this.playerName = slotData.spieler_name || this.mySlotId;
    const userEl = document.getElementById('active-chat-user');
    if (userEl) userEl.innerText = this.playerName;

    const { data: gameState } = await this.supabase
      .from('game_state')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    let cName = null;
    if (gameState && slotData.team && slotData.team !== 'neutral') {
      cName = gameState[`team_${slotData.team}_name`] || slotData.team;
    }

    this.setTeamChannel(slotData.team || 'neutral', cName);
  },

  initDatabaseListener() {
    this.supabase
      .channel('chat-db-sync-global-fixed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_slots' }, payload => {
        if (!payload.new || payload.new.slot_id === this.mySlotId) {
          this.fetchAndUpdateFromDB();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_state' }, () => {
        this.fetchAndUpdateFromDB();
      })
      .subscribe();
  },

  async setTeamChannel(newTeam, customTeamName) {
    if (!newTeam) newTeam = 'neutral';
    this.customTeamName = customTeamName;
    
    let displayName = customTeamName;
    if (!displayName && newTeam !== 'neutral') {
      displayName = `Team ${newTeam.toUpperCase()}`;
    } else if (newTeam === 'neutral') {
      displayName = 'Zuschauer-Chat';
    }

    if (this.currentTeam === newTeam && this.activeChannel) {
      const titleEl = document.getElementById('active-chat-title');
      if (titleEl && titleEl.innerText !== displayName) {
        titleEl.innerText = displayName;
        titleEl.style.color = this.teamColors[newTeam] || '#38bdf8';
      }
      return;
    }

    this.currentTeam = newTeam;

    if (this.activeChannel) {
      this.supabase.removeChannel(this.activeChannel);
      this.activeChannel = null;
    }

    const teamColor = this.teamColors[newTeam] || '#38bdf8';
    const titleEl = document.getElementById('active-chat-title');
    const messagesBox = document.getElementById('chat-messages-box');
    
    if (titleEl) {
      titleEl.innerText = displayName;
      titleEl.style.color = teamColor;
    }
    if (messagesBox) messagesBox.innerHTML = '';

    // ALTE NACHRICHTEN AUS DB LADEN (Besteht nach F5 weiter!)
    const { data: history } = await this.supabase
      .from('chat_messages')
      .select('*')
      .eq('team', newTeam)
      .order('created_at', { ascending: true })
      .limit(50);

    if (history) {
      history.forEach(msg => this.appendMessage(msg.sender, msg.message));
    }

    // REALTIME LISTENER FÜR NEUE NACHRICHTEN IN DER DATENBANK
    this.activeChannel = this.supabase
      .channel(`db_chat_room_${newTeam}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'chat_messages',
        filter: `team=eq.${newTeam}` 
      }, payload => {
        this.appendMessage(payload.new.sender, payload.new.message);
      })
      .subscribe();
  },

  async send() {
    const input = document.getElementById('chat-input-msg');
    let msg = input.value.trim();
    if (!msg || !this.currentTeam) return;

    input.value = '';

    // Nachricht in DB speichern (Realtime schickt sie an alle inkl. uns selbst)
    await this.supabase.from('chat_messages').insert({
      team: this.currentTeam,
      sender: this.playerName,
      message: msg
    });
  },

  appendMessage(sender, message) {
    const box = document.getElementById('chat-messages-box');
    if (!box) return;

    const isMe = sender === this.playerName;
    const teamColor = this.teamColors[this.currentTeam] || '#38bdf8';
    
    const msgDiv = document.createElement('div');
    msgDiv.style.cssText = `background: ${isMe ? teamColor + '1a' : '#18181b'}; border: 1px solid ${isMe ? teamColor + '40' : '#27272a'}; padding: 5px 7px; border-radius: 5px; display: flex; flex-direction: column; gap: 2px;`;

    msgDiv.innerHTML = `
      <span style="font-weight: bold; font-size: 10px; color: ${isMe ? teamColor : '#a1a1aa'};">${sender}</span>
      <span style="color: #f4f4f5; word-break: break-word;">${message}</span>
    `;

    box.appendChild(msgDiv);
    box.scrollTop = box.scrollHeight;
  },

  openPopout() {
    const width = 380;
    const height = 520;
    const left = window.screen.width - width - 50;
    const top = 100;
    
    this.popoutWindow = window.open('', 'TeamChatPopout', `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`);
    
    if (this.popoutWindow) {
      const supabaseUrl = SUPABASE_CONFIG.URL;
      const supabaseKey = SUPABASE_CONFIG.KEY;
      const slotId = this.mySlotId;
      const emotesArray = JSON.stringify(this.emotes);
      const teamColorsJson = JSON.stringify(this.teamColors);

      this.popoutWindow.document.write(`
        <!DOCTYPE html>
        <html lang="de">
        <head>
          <meta charset="UTF-8">
          <title>Studio Chat - 2. Bildschirm</title>
          <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
          <style>
            body { background: #09090b; color: #f4f4f5; font-family: sans-serif; margin: 0; padding: 14px; display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; }
            #popout-messages { flex-grow: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; font-size: 12px; margin-bottom: 10px; padding-right: 4px; }
            .msg { background: #18181b; border: 1px solid #27272a; padding: 7px 10px; border-radius: 6px; display: flex; flex-direction: column; gap: 2px; }
            .sender { font-weight: bold; font-size: 10px; }
            .input-area { display: flex; gap: 6px; }
            input { flex-grow: 1; background: #18181b; border: 1px solid #3f3f46; color: #fff; padding: 8px; border-radius: 6px; font-size: 12px; outline: none; }
            button { background: #22c55e; color: white; border: none; padding: 8px 14px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; }
          </style>
        </head>
        <body>
          <h3 id="popout-title" style="margin: 0 0 10px 0; font-size: 13px; color: #38bdf8; border-bottom: 1px solid #27272a; padding-bottom: 6px;">Verbinde...</h3>
          <div id="popout-messages"></div>
          
          <div id="popout-emotes" style="display: flex; gap: 4px; margin-bottom: 8px; overflow-x: auto; padding-bottom: 2px;"></div>

          <div class="input-area">
            <input type="text" id="popout-input" placeholder="Nachricht..." onkeydown="if(event.key==='Enter') sendPopoutMsg()">
            <button onclick="sendPopoutMsg()">Senden</button>
          </div>

          <script>
            const client = supabase.createClient("${supabaseUrl}", "${supabaseKey}");
            const slotId = "${slotId}";
            const teamColors = ${teamColorsJson};
            const emotes = ${emotesArray};
            
            let activeChannel = null;
            let currentTeam = null;
            let playerName = slotId;

            const emoteContainer = document.getElementById('popout-emotes');
            emotes.forEach(e => {
              const btn = document.createElement('button');
              btn.innerText = e;
              btn.style.cssText = "background: #18181b; border: 1px solid #27272a; border-radius: 4px; padding: 4px 7px; cursor: pointer; font-size: 14px;";
              btn.onclick = () => sendPopoutEmote(e);
              emoteContainer.appendChild(btn);
            });

            async function syncPopoutFromDB() {
              const { data: slotData } = await client.from('player_slots').select('spieler_name, team').eq('slot_id', slotId).maybeSingle();
              if (!slotData) return;

              playerName = slotData.spieler_name || slotId;
              const newTeam = slotData.team || 'neutral';

              const { data: gameState } = await client.from('game_state').select('*').eq('id', 1).maybeSingle();
              
              let displayName = null;
              if (gameState && newTeam !== 'neutral') {
                displayName = gameState['team_' + newTeam + '_name'] || newTeam;
              }
              if (!displayName && newTeam !== 'neutral') displayName = 'Team ' + newTeam.toUpperCase();
              if (newTeam === 'neutral') displayName = 'Zuschauer-Chat';

              const teamColor = teamColors[newTeam] || '#38bdf8';
              const titleEl = document.getElementById('popout-title');
              if (titleEl) {
                titleEl.innerText = displayName;
                titleEl.style.color = teamColor;
                document.title = displayName + " - Studio Chat";
              }

              if (currentTeam === newTeam && activeChannel) return;
              currentTeam = newTeam;

              if (activeChannel) {
                client.removeChannel(activeChannel);
              }

              document.getElementById('popout-messages').innerHTML = '';

              // Verlauf laden
              const { data: history } = await client.from('chat_messages').select('*').eq('team', newTeam).order('created_at', { ascending: true }).limit(50);
              if (history) {
                history.forEach(m => appendPopoutMsg(m.sender, m.message));
              }

              // Realtime
              activeChannel = client.channel('db_popout_room_' + newTeam)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'team=eq.' + newTeam }, p => {
                  appendPopoutMsg(p.new.sender, p.new.message);
                })
                .subscribe();
            }

            client.channel('popout-sync-channel')
              .on('postgres_changes', { event: '*', schema: 'public', table: 'player_slots' }, p => {
                if (!p.new || p.new.slot_id === slotId) syncPopoutFromDB();
              })
              .on('postgres_changes', { event: '*', schema: 'public', table: 'game_state' }, () => syncPopoutFromDB())
              .subscribe();

            syncPopoutFromDB();

            async function sendPopoutEmote(emote) {
              if (!currentTeam) return;
              await client.from('chat_messages').insert({ team: currentTeam, sender: playerName, message: emote });
            }

            async function sendPopoutMsg() {
              const input = document.getElementById('popout-input');
              let msg = input.value.trim();
              if (!msg || !currentTeam) return;
              input.value = '';
              await client.from('chat_messages').insert({ team: currentTeam, sender: playerName, message: msg });
            }

            function appendPopoutMsg(sender, message) {
              const box = document.getElementById('popout-messages');
              const isMe = sender === playerName;
              const teamColor = teamColors[currentTeam] || '#38bdf8';
              
              const div = document.createElement('div');
              div.className = 'msg';
              div.style.background = isMe ? teamColor + '1a' : '#18181b';
              div.style.borderColor = isMe ? teamColor + '40' : '#27272a';
              div.innerHTML = '<span class="sender" style="color: ' + (isMe ? teamColor : '#a1a1aa') + '">' + sender + '</span><span style="color: #f4f4f5; word-break: break-word;">' + message + '</span>';
              box.appendChild(div);
              box.scrollTop = box.scrollHeight;
            }
          </script>
        </body>
        </html>
      `);
      this.popoutWindow.document.close();
    }
  }
};