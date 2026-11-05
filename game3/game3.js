window.Game3 = {
  canvas: null,
  ctx: null,
  isDrawing: false,
  isPainter: false,
  channel: null,
  currentSecretWord: '',
  currentTabuCard: null,
  spoilerActive: false,
  currentActiveSlot: null,
  timerInterval: null,
  previousActiveSlot: null,
  currentColor: '#000000',

  async init() {
    this.canvas = document.getElementById('game3-canvas');
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
      this.setupCanvasEvents();
    }

    // 1. Zuerst exakten Zustand aus game3_state laden
    await this.ladeZustand();

    // 2. Realtime-Channel für Broadcast-Events (z. B. Zeichnen)
    this.channel = supabaseClient.channel('game3_room_channel');
    
    this.channel
      .on('broadcast', { event: 'game3_state_changed' }, payload => {
        this.updateGameState(payload.payload);
      })
      .on('broadcast', { event: 'game3_set_mode' }, payload => {
        this.setModeUI(payload.payload.mode);
      })
      .on('broadcast', { event: 'game3_draw' }, payload => {
        this.drawRemoteLine(payload.payload.x0, payload.payload.y0, payload.payload.x1, payload.payload.y1, payload.payload.color, payload.payload.width);
      })
      .on('broadcast', { event: 'game3_clear' }, () => {
        this.clearCanvasLocal();
      })
      .on('broadcast', { event: 'game3_start_timer' }, payload => {
        this.runTimer(payload.payload.endTime);
      })
      .on('broadcast', { event: 'game3_stop_timer' }, () => {
        this.stopTimerUI();
      })
      .subscribe();

    // 3. Supabase Postgres Changes auf game3_state
    supabaseClient
      .channel('game3_db_state_all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game3_state' }, payload => {
        if (payload.new) {
          this.setModeUI(payload.new.mode);
          this.updateGameState({
            activeSlot: payload.new.active_slot,
            word: payload.new.current_word,
            tabuCard: payload.new.tabu_card
          });
          this.updateScoresUI(payload.new);
          
          if (payload.new.timer_end && payload.new.timer_end > Date.now()) {
            this.runTimer(payload.new.timer_end);
          } else {
            this.stopTimerUI();
          }
        }
      })
      .subscribe();
  },

  async ladeZustand() {
    try {
      const { data, error } = await supabaseClient.from('game3_state').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      
      if (data) {
        this.setModeUI(data.mode);
        this.updateGameState({
          activeSlot: data.active_slot,
          word: data.current_word,
          tabuCard: data.tabu_card
        });
        this.updateScoresUI(data);

        if (data.timer_end && data.timer_end > Date.now()) {
          this.runTimer(data.timer_end);
        } else {
          this.stopTimerUI();
        }
      }
    } catch (err) {
      console.error("Fehler beim Abrufen von game3_state beim Neuladen:", err);
    }
  },

  updateScoresUI(data) {
    if (!data) return;
    ['blau', 'rot', 'gruen', 'gelb'].forEach(t => {
      const el = document.getElementById(`game3-score-${t}`);
      if (el) el.innerText = data[`punkte_runde_${t}`] ?? 0;
    });
  },

  setModeUI(mode) {
    const introView = document.getElementById('game3-intro-view');
    const standardView = document.getElementById('game3-standard-view');
    const drawingContainer = document.getElementById('game3-drawing-container-main');
    const pantomimeBox = document.getElementById('game3-pantomime-box');
    const tabuBox = document.getElementById('game3-tabu-box');

    if (introView) introView.style.display = 'none';
    if (standardView) standardView.style.display = 'none';
    if (drawingContainer) drawingContainer.style.display = 'none';
    if (pantomimeBox) pantomimeBox.style.display = 'none';
    if (tabuBox) tabuBox.style.display = 'none';

    const titleEl = document.getElementById('game3-mode-title');
    const subEl = document.getElementById('game3-mode-subtitle');

    if (mode === 'intro') {
      if (titleEl) titleEl.innerText = "🎮 Game 3: Arena";
      if (subEl) subEl.innerText = "Warte auf den Start durch die Regie...";
      if (introView) introView.style.display = 'flex';
    } else if (mode === 'pantomime') {
      if (titleEl) titleEl.innerText = "🎭 Pantomime Runde";
      if (subEl) subEl.innerText = "Der Spieler stellt den Begriff in der Live-Bühne dar!";
      if (standardView) standardView.style.display = 'flex';
      if (pantomimeBox) pantomimeBox.style.display = 'block';
    } else if (mode === 'drawing') {
      if (titleEl) titleEl.innerText = "🎨 Malen & Raten";
      if (subEl) subEl.innerText = "Der Maler zeichnet im Großformat auf dem Canvas!";
      if (drawingContainer) drawingContainer.style.display = 'flex';
    } else if (mode === 'tabu') {
      if (titleEl) titleEl.innerText = "🚫 Tabu Runde (2vs2vs2vs2)";
      if (subEl) subEl.innerText = "Erkläre den Begriff ohne die verbotenen Wörter!";
      if (standardView) standardView.style.display = 'flex';
      if (tabuBox) tabuBox.style.display = 'block';
    }

    if (this.currentActiveSlot && mode !== 'intro') {
      this.renderActiveCamera(this.currentActiveSlot, mode);
    }
  },

  updateGameState(data) {
    if (!data) return;
    
    const isIntroActive = document.getElementById('game3-intro-view')?.style.display === 'flex';
    this.currentActiveSlot = data.activeSlot;
    
    if (!isIntroActive) {
      const currentMode = document.getElementById('game3-drawing-container-main')?.style.display === 'flex' ? 'drawing' : 'standard';
      this.renderActiveCamera(data.activeSlot, currentMode);
    } else {
      if (this.previousActiveSlot) {
        this.restoreSideBox(this.previousActiveSlot);
        this.previousActiveSlot = null;
      }
    }

    const currentMySlot = typeof MY_SLOT !== 'undefined' ? MY_SLOT : null;
    const isMainPlayer = (currentMySlot && currentMySlot === data.activeSlot);
    
    const mySideBox = currentMySlot ? document.getElementById(`box-${currentMySlot}`) : null;
    let myTeam = null;
    let activePlayerTeam = null;
    
    const activeSideBox = data.activeSlot ? document.getElementById(`box-${data.activeSlot}`) : null;
    if (activeSideBox) {
      if (activeSideBox.classList.contains('team-blau')) activePlayerTeam = 'blau';
      else if (activeSideBox.classList.contains('team-rot')) activePlayerTeam = 'rot';
      else if (activeSideBox.classList.contains('team-gruen')) activePlayerTeam = 'gruen';
      else if (activeSideBox.classList.contains('team-gelb')) activePlayerTeam = 'gelb';
    }
    if (mySideBox) {
      if (mySideBox.classList.contains('team-blau')) myTeam = 'blau';
      else if (mySideBox.classList.contains('team-rot')) myTeam = 'rot';
      else if (mySideBox.classList.contains('team-gruen')) myTeam = 'gruen';
      else if (mySideBox.classList.contains('team-gelb')) myTeam = 'gelb';
    }

    const isTeammate = (myTeam && activePlayerTeam && myTeam === activePlayerTeam && !isMainPlayer);

    this.currentSecretWord = data.word || '';
    this.isPainter = isMainPlayer;

    const pantomimeWordEl = document.getElementById('game3-pantomime-word');
    const drawWordEl = document.getElementById('game3-draw-word');
    const toolsEl = document.getElementById('game3-tools');
    const spoilerBtn = document.getElementById('game3-spoiler-btn');
    const drawSpoilerBtn = document.getElementById('game3-draw-spoiler-btn');

    if (isMainPlayer) {
      if (pantomimeWordEl) pantomimeWordEl.innerText = this.currentSecretWord;
      if (drawWordEl) drawWordEl.innerText = this.currentSecretWord;
      if (spoilerBtn) spoilerBtn.style.display = 'none';
      if (drawSpoilerBtn) drawSpoilerBtn.style.display = 'none';
    } else if (isTeammate) {
      if (pantomimeWordEl) pantomimeWordEl.innerText = "🔒 DU RATET! (Geschützt)";
      if (drawWordEl) drawWordEl.innerText = "🔒 DU RATET! (Geschützt)";
      if (spoilerBtn) spoilerBtn.style.display = 'none';
      if (drawSpoilerBtn) drawSpoilerBtn.style.display = 'none';
    } else {
      if (spoilerBtn) spoilerBtn.style.display = 'inline-block';
      if (drawSpoilerBtn) drawSpoilerBtn.style.display = 'inline-block';
      this.updateSpoilerUIs();
    }

    if (toolsEl) {
      toolsEl.style.display = this.isPainter ? 'flex' : 'none';
    }

    this.currentTabuCard = data.tabuCard;
    const tabuMainEl = document.getElementById('game3-tabu-main');
    const tabuListEl = document.getElementById('game3-tabu-forbidden');

    if (isMainPlayer) {
      if (this.currentTabuCard && tabuMainEl) {
        tabuMainEl.innerText = this.currentTabuCard.main_word;
        const forbidden = [this.currentTabuCard.forbidden_1, this.currentTabuCard.forbidden_2, this.currentTabuCard.forbidden_3, this.currentTabuCard.forbidden_4, this.currentTabuCard.forbidden_5].filter(Boolean);
        if (tabuListEl) tabuListEl.innerHTML = forbidden.map(w => `<li>❌ ${w}</li>`).join('');
      }
    } else if (isTeammate) {
      if (tabuMainEl) tabuMainEl.innerText = "🔒 DU RATET!";
      if (tabuListEl) tabuListEl.innerHTML = "<li>Teampartner erklärt. Keine Ansicht!</li>";
    } else {
      this.updateTabuSpoilerUI();
    }
  },

  restoreSideBox(targetSlot) {
    if (!targetSlot) return;
    const box = document.getElementById(`box-${targetSlot}`);
    if (box) {
      box.classList.remove('is-fused-out');
      const videoContainer = box.querySelector('.video-container') || box.querySelector('div[style*="height"]');
      if (videoContainer) {
        // Nutzt zentrale Performance-URL
        const sideStreamUrl = typeof getStreamUrl === 'function' ? getStreamUrl(targetSlot) : `https://vdo.ninja/?view=${targetSlot}&solo=1&room=DieElmigos_Stream&password=mikestinkt&quality=2&framerate=24&bitrate=500&max_bitrate=800&codec=vp9`;
        videoContainer.innerHTML = `<iframe src="${sideStreamUrl}" allow="autoplay" style="width: 100%; height: 100%; border: none;"></iframe>`;
      }
    }
  },

  renderActiveCamera(slotId, mode) {
    const viewContainer = document.getElementById('game3-active-player-slot-view');
    const cornerCamContainer = document.getElementById('game3-corner-cam-view');
    const cornerCamWrapper = document.getElementById('game3-corner-cam-wrapper');
    const wrapper = document.getElementById('game3-fokus-wrapper');

    let borderColor = '#27272a';
    let teamColorClass = 'fokus-team-neutral';

    if (this.previousActiveSlot && this.previousActiveSlot !== slotId) {
      this.restoreSideBox(this.previousActiveSlot);
    }

    if (!slotId) {
      if (this.previousActiveSlot) {
        this.restoreSideBox(this.previousActiveSlot);
        this.previousActiveSlot = null;
      }
      if (wrapper) wrapper.className = 'fokus-cam-wrapper';
      if (viewContainer) viewContainer.innerHTML = `Kein Spieler im Fokus`;
      if (cornerCamContainer) cornerCamContainer.innerHTML = ``;
      return;
    }

    this.previousActiveSlot = slotId;
    const sideBox = document.getElementById(`box-${slotId}`);
    if (sideBox) {
      sideBox.classList.add('is-fused-out');
      const videoContainer = sideBox.querySelector('.video-container') || sideBox.querySelector('div[style*="height"]');
      if (videoContainer) {
        if (!videoContainer.dataset.originalHtml) {
          videoContainer.dataset.originalHtml = videoContainer.innerHTML;
        }
        videoContainer.innerHTML = `<div style="display:flex; align-items:center; justify-content:center; height:100%; color:#71717a; font-size:11px; font-weight:bold; background:#121216;">Im Fokus</div>`;
      }
      
      if (sideBox.classList.contains('team-blau')) { teamColorClass = 'fokus-team-blau'; borderColor = '#38bdf8'; }
      else if (sideBox.classList.contains('team-rot')) { teamColorClass = 'fokus-team-rot'; borderColor = '#ef4444'; }
      else if (sideBox.classList.contains('team-gruen')) { teamColorClass = 'fokus-team-gruen'; borderColor = '#22c55e'; }
      else if (sideBox.classList.contains('team-gelb')) { teamColorClass = 'fokus-team-gelb'; borderColor = '#eab308'; }
    }

    if (wrapper) wrapper.className = `fokus-cam-wrapper ${teamColorClass}`;
    if (cornerCamWrapper) cornerCamWrapper.style.borderColor = borderColor;
    
    // Nutzt zentrale Performance-URL
    const targetUrl = typeof getStreamUrl === 'function' ? getStreamUrl(slotId) : `https://vdo.ninja/?view=${slotId}&solo=1&room=DieElmigos_Stream&password=mikestinkt&quality=2&framerate=24&bitrate=500&max_bitrate=800&codec=vp9`;
    const isDrawingMode = (mode === 'drawing' || document.getElementById('game3-drawing-container-main')?.style.display === 'flex');

    if (isDrawingMode) {
      if (viewContainer) viewContainer.innerHTML = `Kein Spieler im Fokus`;
      let cornerIframe = cornerCamContainer ? cornerCamContainer.querySelector('iframe') : null;
      if (!cornerIframe && cornerCamContainer) {
        cornerCamContainer.innerHTML = `<iframe src="${targetUrl}" allow="autoplay" style="width: 100%; height: 100%; border: none;"></iframe>`;
      } else if (cornerIframe && cornerIframe.src !== targetUrl) {
        cornerIframe.src = targetUrl;
      }
    } else {
      if (cornerCamContainer) cornerCamContainer.innerHTML = ``;
      let centerIframe = viewContainer ? viewContainer.querySelector('iframe') : null;
      if (!centerIframe && viewContainer) {
        viewContainer.innerHTML = `<iframe src="${targetUrl}" allow="autoplay" style="width: 100%; height: 100%; border: none;"></iframe>`;
      } else if (centerIframe && centerIframe.src !== targetUrl) {
        centerIframe.src = targetUrl;
      }
    }
  },

  runTimer(endTime) {
    if (this.timerInterval) clearInterval(this.timerInterval);
    const countdownEl = document.getElementById('game3-timer-countdown');

    this.timerInterval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      const mins = Math.floor(remaining / 60).toString().padStart(2, '0');
      const secs = (remaining % 60).toString().padStart(2, '0');
      if (countdownEl) countdownEl.innerText = `${mins}:${secs}`;

      if (remaining <= 0) {
        clearInterval(this.timerInterval);
      }
    }, 1000);
  },

  stopTimerUI() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    const countdownEl = document.getElementById('game3-timer-countdown');
    if (countdownEl) countdownEl.innerText = "00:00";
  },

  setColor(color) {
    this.currentColor = color;
    const picker = document.getElementById('game3-color-picker');
    if (picker) picker.value = color;
    const eraserBtn = document.getElementById('game3-eraser-btn');
    if (eraserBtn) eraserBtn.style.background = '#27272a';
  },

  setEraser() {
    this.currentColor = '#ffffff';
    const picker = document.getElementById('game3-color-picker');
    if (picker) picker.value = '#ffffff';
    const eraserBtn = document.getElementById('game3-eraser-btn');
    if (eraserBtn) eraserBtn.style.background = '#eab308';
  },

  toggleSpoiler() {
    this.spoilerActive = !this.spoilerActive;
    this.updateSpoilerUIs();
    this.updateTabuSpoilerUI();
  },

  updateSpoilerUIs() {
    const pantomimeWordEl = document.getElementById('game3-pantomime-word');
    const drawWordEl = document.getElementById('game3-draw-word');
    const btn1 = document.getElementById('game3-spoiler-btn');
    const btn2 = document.getElementById('game3-draw-spoiler-btn');

    const text = this.spoilerActive ? (this.currentSecretWord || '---') : "•••••••• (Versteckt)";
    const btnText = this.spoilerActive ? "🙈 Verstecken" : "👁️ Anzeigen";
    const btnBg = this.spoilerActive ? "#f43f5e" : "#27272a";

    if (pantomimeWordEl) pantomimeWordEl.innerText = text;
    if (drawWordEl && !this.isPainter) drawWordEl.innerText = text;
    if (btn1) { btn1.innerText = btnText; btn1.style.background = btnBg; }
    if (btn2) { btn2.innerText = btnText; btn2.style.background = btnBg; }
  },

  updateTabuSpoilerUI() {
    const tabuMainEl = document.getElementById('game3-tabu-main');
    const tabuListEl = document.getElementById('game3-tabu-forbidden');
    const tabuBtn = document.getElementById('game3-tabu-spoiler-btn');
    if (!tabuMainEl || !this.currentTabuCard) return;

    if (this.spoilerActive) {
      tabuMainEl.innerText = this.currentTabuCard.main_word;
      const forbidden = [this.currentTabuCard.forbidden_1, this.currentTabuCard.forbidden_2, this.currentTabuCard.forbidden_3, this.currentTabuCard.forbidden_4, this.currentTabuCard.forbidden_5].filter(Boolean);
      if (tabuListEl) tabuListEl.innerHTML = forbidden.map(w => `<li>❌ ${w}</li>`).join('');
      if (tabuBtn) tabuBtn.innerText = "🙈 Verstecken";
    } else {
      tabuMainEl.innerText = "••••••••";
      if (tabuListEl) tabuListEl.innerHTML = "<li>Versteckt...</li>";
      if (tabuBtn) tabuBtn.innerText = "👁️ Anzeigen";
    }
  },

  setupCanvasEvents() {
    this.canvas = document.getElementById('game3-canvas');
    if (!this.canvas) return;
    let lastX = 0;
    let lastY = 0;

    const getMousePos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    };

    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.isPainter) return;
      this.isDrawing = true;
      const pos = getMousePos(e);
      lastX = pos.x;
      lastY = pos.y;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.isDrawing || !this.isPainter) return;
      const pos = getMousePos(e);
      
      const color = this.currentColor || document.getElementById('game3-color-picker')?.value || '#000000';
      const width = document.getElementById('game3-line-width')?.value || 6;
      
      this.drawRemoteLine(lastX, lastY, pos.x, pos.y, color, width);
      
      if (this.channel) {
        this.channel.send({ 
          type: 'broadcast', 
          event: 'game3_draw', 
          payload: { x0: lastX, y0: lastY, x1: pos.x, y1: pos.y, color, width } 
        });
      }
      
      lastX = pos.x; 
      lastY = pos.y;
    });

    window.addEventListener('mouseup', () => { 
      this.isDrawing = false; 
    });
  },

  drawRemoteLine(x0, y0, x1, y1, color, width) {
    if (!this.ctx && this.canvas) this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;
    this.ctx.beginPath();
    this.ctx.moveTo(x0, y0);
    this.ctx.lineTo(x1, y1);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.lineCap = 'round';
    this.ctx.stroke();
    this.ctx.closePath();
  },

  clearCanvasLocal() {
    if (!this.ctx && this.canvas) this.ctx = this.canvas.getContext('2d');
    if (this.ctx && this.canvas) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  },

  clearCanvas() {
    if (!this.isPainter) return;
    this.clearCanvasLocal();
    this.channel.send({ type: 'broadcast', event: 'game3_clear', payload: {} });
  }
};

Game3.init();