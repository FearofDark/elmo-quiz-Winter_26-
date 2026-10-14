// drawing-game.js - Das eigenständige Team-Zeichen-Modul
const DrawingGame = {
  canvas: null,
  ctx: null,
  isDrawing: false,
  role: 'none',
  secretWord: '',
  channel: null,

  // Startet das Spiel im DOM-Container
  init(containerElement, userRole, word, supabaseChannel) {
    this.role = userRole;
    this.secretWord = word;
    this.channel = supabaseChannel;

    // HTML-Inhalt für das Zeichenspiel in die Mitte injizieren
    containerElement.innerHTML = `
      <div style="display: flex; flex-direction: column; height: 100%; justify-content: space-between;">
        <div style="display: flex; justify-content: space-between; align-items: center; background: #1a1f2c; padding: 10px 15px; border-radius: 8px;">
          <span style="font-weight: bold; color: #0070f3;" id="draw-status-text">Lade Team-Duell...</span>
          <span id="word-box" style="font-size: 16px; font-weight: bold; color: #00ff7f; display: none;">Wort: ${this.secretWord}</span>
        </div>

        <div style="position: relative; display: flex; justify-content: center; align-items: center; flex-grow: 1; padding: 10px;">
          <canvas id="team-canvas" width="550" height="320" style="background: white; border-radius: 8px; cursor: crosshair; box-shadow: 0 4px 15px rgba(0,0,0,0.5);"></canvas>
        </div>

        <div id="painter-tools" style="display: none; gap: 10px; justify-content: center; background: #1a1f2c; padding: 8px; border-radius: 8px;">
          <input type="color" id="paint-color" value="#000000" style="width: 35px; height: 35px; border: none; cursor: pointer; background: none;">
          <select id="paint-size" style="padding: 6px; background: #090a0f; color: white; border: 1px solid #3a475d; border-radius: 4px;">
            <option value="3">Dünn</option>
            <option value="6" selected>Mittel</option>
            <option value="12">Dick</option>
          </select>
          <button onclick="DrawingGame.clearCanvas()" style="background: #dc2626; border: none; color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;">🗑️ Löschen</button>
        </div>
      </div>
    `;

    this.canvas = document.getElementById('team-canvas');
    this.ctx = this.canvas.getContext('2d');

    const statusText = document.getElementById('draw-status-text');
    const wordBox = document.getElementById('word-box');
    const tools = document.getElementById('painter-tools');

    if (this.role === 'painter') {
      statusText.innerText = "👩‍🎨 DU BIST DER MALER! Zeichne das Wort für dein Team.";
      wordBox.style.display = 'block';
      tools.style.display = 'flex';
      this.enableDrawingEvents();
    } else {
      statusText.innerText = "🕵️ DU RÄTST! Sieh zu, was dein Team zeichnet.";
      wordBox.style.display = 'none';
      tools.style.display = 'none';
    }

    // Höre auf Live-Zeichen-Events von Supabase
    this.channel.on('broadcast', { event: 'draw_stroke' }, payload => {
      if (this.role === 'guesser') {
        this.drawRemote(payload.payload);
      }
    }).on('broadcast', { event: 'clear_canvas' }, () => {
      if (this.role === 'guesser') {
        this.clearCanvasLocal();
      }
    });
  },

  enableDrawingEvents() {
    this.canvas.addEventListener('mousedown', e => {
      this.isDrawing = true;
      const pos = this.getPos(e);
      this.drawLocal(pos.x, pos.y, document.getElementById('paint-color').value, document.getElementById('paint-size').value);
      this.sendStroke(pos.x, pos.y, document.getElementById('paint-color').value, document.getElementById('paint-size').value);
    });

    this.canvas.addEventListener('mousemove', e => {
      if (!this.isDrawing) return;
      const pos = this.getPos(e);
      this.drawLocal(pos.x, pos.y, document.getElementById('paint-color').value, document.getElementById('paint-size').value);
      this.sendStroke(pos.x, pos.y, document.getElementById('paint-color').value, document.getElementById('paint-size').value);
    });

    window.addEventListener('mouseup', () => this.isDrawing = false);
  },

  getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  },

  drawLocal(x, y, color, size) {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    this.ctx.fill();
  },

  drawRemote(data) {
    this.drawLocal(data.x, data.y, data.color, data.size);
  },

  clearCanvasLocal() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  },

  async clearCanvas() {
    if (this.role !== 'painter') return;
    this.clearCanvasLocal();
    await this.channel.send({ type: 'broadcast', event: 'clear_canvas', payload: {} });
  },

  async sendStroke(x, y, color, size) {
    await this.channel.send({
      type: 'broadcast',
      event: 'draw_stroke',
      payload: { x, y, color, size }
    });
  }
};