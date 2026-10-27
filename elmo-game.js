const ElmoGame = {
  canvas: null,
  ctx: null,
  animationId: null,
  isPaused: false,
  score: 0,
  gameOver: false,
  fireworks: [],
  baseSpeed: 3.8,
  currentSpeed: 3.8,
  spawnRate: 120,
  currentSpawnRate: 120,
  channel: null,
  
  elmo: {
    x: 100,
    y: 255,
    width: 28,
    height: 40,
    vy: 0,
    gravity: 0.5,
    jumpPower: -11,
    isGrounded: false
  },
  
  police: [],
  spawnTimer: 0,

  init(containerEl, channel) {
    this.channel = channel;
    this.render(containerEl);
    this.bindEvents();
    this.startMiniGame();
  },

  render(containerEl) {
    containerEl.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; position: relative; background: #09090b; border-radius: 14px; overflow: hidden; user-select: none; box-sizing: border-box; padding: 20px; gap: 15px;">
        
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; max-width: 900px; z-index: 10;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div id="roulette-wheel" style="width: 32px; height: 32px; border-radius: 50%; border: 2px dashed #71717a; display: flex; align-items: center; justify-content: center; background: #18181b; transition: transform 0.5s;">
            </div>
            <span id="roulette-status-text" style="font-size: 14px; font-weight: bold; color: #f4f4f5; letter-spacing: 0.5px;">Elmo liebt dich</span>
          </div>
          <span id="elmo-game-score" style="color: #38bdf8; font-weight: bold; font-size: 16px;">Score: 0</span>
        </div>

        <!-- Elmo Minispiel Canvas -->
        <div style="position: relative; width: 100%; max-width: 900px; flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <canvas id="elmo-canvas" width="850" height="340" style="background: linear-gradient(to bottom, #121216, #18181b); border: 1px solid #27272a; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.7); width: 100%; height: 100%; max-height: 360px;"></canvas>
        </div>

        <div style="font-size: 12px; color: #71717a;">
          Flieh vor der Polizei! Drücke <strong style="color: #f4f4f5;">LEERTASTE</strong> oder klicke ins Spielfeld zum Springen.
        </div>
      </div>

      <style>
        .spinning-fast {
          animation: fastSpin 0.25s linear infinite !important;
        }
        @keyframes fastSpin {
          0% { transform: rotate(0deg); border-color: #38bdf8; }
          33% { transform: rotate(120deg); border-color: #22c55e; }
          66% { transform: rotate(240deg); border-color: #eab308; }
          100% { transform: rotate(360deg); border-color: #ef4444; }
        }
      </style>
    `;
  },

  startMiniGame() {
    this.canvas = document.getElementById('elmo-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.resetGameValues();

    const handleKey = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this.jump();
      }
    };

    const handleClick = () => {
      this.jump();
    };

    window.addEventListener('keydown', handleKey);
    this.canvas.addEventListener('click', handleClick);

    const loop = () => {
      if (this.isPaused) return;
      this.update();
      this.draw();
      this.animationId = requestAnimationFrame(loop);
    };

    loop();
  },

  resetGameValues() {
    this.score = 0;
    this.police = [];
    this.fireworks = [];
    this.currentSpeed = this.baseSpeed;
    this.currentSpawnRate = this.spawnRate;
    this.spawnTimer = 0;
    this.elmo.y = 255;
    this.elmo.vy = 0;
    this.gameOver = false;
    this.isPaused = false;
    const scoreEl = document.getElementById('elmo-game-score');
    if (scoreEl) scoreEl.innerText = `Score: ${this.score}`;
  },

  jump() {
    if (this.gameOver) {
      this.resetGameValues();
      return;
    }
    if (this.elmo.isGrounded) {
      this.elmo.vy = this.elmo.jumpPower;
      this.elmo.isGrounded = false;
    }
  },

  triggerMassiveFireworks() {
    const colors = ['#f43f5e', '#38bdf8', '#22c55e', '#eab308', '#a855f7', '#ff6f61', '#ffffff', '#00ffff'];
    const centers = [
      { x: this.canvas.width * 0.3, y: this.canvas.height * 0.4 },
      { x: this.canvas.width * 0.7, y: this.canvas.height * 0.35 },
      { x: this.canvas.width * 0.5, y: this.canvas.height * 0.25 }
    ];

    centers.forEach(center => {
      for (let i = 0; i < 80; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 8 + 2;
        this.fireworks.push({
          x: center.x,
          y: center.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: colors[Math.floor(Math.random() * colors.length)],
          alpha: 1,
          decay: Math.random() * 0.01 + 0.007
        });
      }
    });
  },

  update() {
    if (this.gameOver) return;

    this.elmo.vy += this.elmo.gravity;
    this.elmo.y += this.elmo.vy;

    const groundLevel = 255;
    if (this.elmo.y >= groundLevel) {
      this.elmo.y = groundLevel;
      this.elmo.vy = 0;
      this.elmo.isGrounded = true;
    }

    this.spawnTimer++;
    if (this.spawnTimer > this.currentSpawnRate) {
      this.spawnTimer = 0;
      this.police.push({
        x: this.canvas.width,
        y: 250,
        width: 24,
        height: 40,
        speed: this.currentSpeed
      });
    }

    for (let i = this.police.length - 1; i >= 0; i--) {
      let cop = this.police[i];
      cop.x -= cop.speed;

      if (
        this.elmo.x < cop.x + cop.width &&
        this.elmo.x + this.elmo.width > cop.x &&
        this.elmo.y < cop.y + cop.height &&
        this.elmo.y + this.elmo.height > cop.y
      ) {
        this.gameOver = true;
      }

      if (!cop.passed && cop.x + cop.width < this.elmo.x) {
        cop.passed = true;
        this.score += 1;
        
        this.currentSpeed = this.baseSpeed + (this.score * 0.16);
        this.currentSpawnRate = Math.max(45, this.spawnRate - (this.score * 1.2));

        const scoreEl = document.getElementById('elmo-game-score');
        if (scoreEl) scoreEl.innerText = `Score: ${this.score}`;

        if (this.score === 2 || this.score === 69) {
          this.triggerMassiveFireworks();
        }
      }

      if (cop.x + cop.width < 0) {
        this.police.splice(i, 1);
      }
    }

    for (let i = this.fireworks.length - 1; i >= 0; i--) {
      let fw = this.fireworks[i];
      fw.x += fw.vx;
      fw.y += fw.vy;
      fw.vy += 0.04;
      fw.alpha -= fw.decay;

      if (fw.alpha <= 0) {
        this.fireworks.splice(i, 1);
      }
    }
  },

  draw() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Boden
    this.ctx.fillStyle = '#27272a';
    this.ctx.fillRect(0, 295, this.canvas.width, 45);

    // Feuerwerk
    this.fireworks.forEach(fw => {
      this.ctx.save();
      this.ctx.globalAlpha = fw.alpha;
      this.ctx.fillStyle = fw.color;
      this.ctx.beginPath();
      this.ctx.arc(fw.x, fw.y, 4, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    });

    // Text
    if ((this.score === 2 || this.score === 69) && this.fireworks.length > 0) {
      this.ctx.save();
      this.ctx.font = '900 52px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      
      const text = this.score === 2 ? 'FCK CPS 1312' : 'LEGENDE! 69!';
      
      this.ctx.shadowColor = '#f43f5e';
      this.ctx.shadowBlur = 30;
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillText(text, this.canvas.width / 2, this.canvas.height / 2 - 30);
      this.ctx.restore();
    }

    // Elmo Zeichnen
    const ex = this.elmo.x;
    const ey = this.elmo.y;
    
    this.ctx.fillStyle = '#e11d48';
    this.ctx.fillRect(ex + 4, ey + 15, 20, 18);
    this.ctx.fillRect(ex + 2, ey + 19, 3, 9);
    this.ctx.fillRect(ex + 23, ey + 19, 3, 9);
    this.ctx.fillRect(ex + 6, ey + 33, 5, 7);
    this.ctx.fillRect(ex + 17, ey + 33, 5, 7);

    this.ctx.beginPath();
    this.ctx.arc(ex + 14, ey + 10, 11, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = '#111827';
    this.ctx.beginPath();
    this.ctx.arc(ex + 14, ey + 13, 7, 0, Math.PI, false);
    this.ctx.fill();

    this.ctx.fillStyle = '#f97316';
    this.ctx.beginPath();
    this.ctx.ellipse(ex + 14, ey + 9, 3.5, 4.5, 0, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = '#ffffff';
    this.ctx.beginPath();
    this.ctx.arc(ex + 9, ey + 4, 4.5, 0, Math.PI * 2);
    this.ctx.arc(ex + 19, ey + 4, 4.5, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = '#000000';
    this.ctx.beginPath();
    this.ctx.arc(ex + 10, ey + 4, 2, 0, Math.PI * 2);
    this.ctx.arc(ex + 18, ey + 4, 2, 0, Math.PI * 2);
    this.ctx.fill();

    // Polizisten
    this.police.forEach(cop => {
      let cx = cop.x;
      let cy = cop.y;

      this.ctx.fillStyle = '#0f172a';
      this.ctx.fillRect(cx + 4, cy + 28, 5, 12);
      this.ctx.fillRect(cx + 15, cy + 28, 5, 12);

      this.ctx.fillStyle = '#1d4ed8';
      this.ctx.fillRect(cx + 2, cy + 14, 20, 15);

      this.ctx.fillStyle = '#eab308';
      this.ctx.fillRect(cx + 15, cy + 18, 3, 3);

      this.ctx.fillStyle = '#fde047';
      this.ctx.fillRect(cx + 5, cy + 6, 14, 8);

      this.ctx.fillStyle = '#1e3a8a';
      this.ctx.fillRect(cx + 2, cy + 2, 20, 5);
      this.ctx.fillStyle = '#000000';
      this.ctx.fillRect(cx, cy + 7, 24, 2);

      this.ctx.fillStyle = '#eab308';
      this.ctx.fillRect(cx + 11, cy + 3, 2, 2);
    });

    if (this.gameOver) {
      this.ctx.fillStyle = 'rgba(3, 3, 5, 0.85)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      this.ctx.fillStyle = '#ef4444';
      this.ctx.font = 'bold 24px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('ERWISCHT VON DER POLIZEI!', this.canvas.width / 2, this.canvas.height / 2 - 15);

      this.ctx.fillStyle = '#f4f4f5';
      this.ctx.font = '14px sans-serif';
      this.ctx.fillText('Klicke oder drücke Leertaste zum Neustarten', this.canvas.width / 2, this.canvas.height / 2 + 20);
      this.ctx.textAlign = 'left';
    }
  },

  bindEvents() {
    if (!this.channel) return;
    
    this.channel.on('broadcast', { event: 'start_rainbow_lottery' }, payload => {
      const wheel = document.getElementById('roulette-wheel');
      const statusText = document.getElementById('roulette-status-text');
      const winnerTeam = payload.payload.winnerTeam;

      const teamNames = {
        blau: 'TEAM BLAU',
        rot: 'TEAM ROT',
        gruen: 'TEAM GRÜN',
        gelb: 'TEAM GELB'
      };

      if (wheel && statusText) {
        wheel.classList.add('spinning-fast');
        statusText.innerHTML = `<span style="color: #38bdf8;">Wähle Team...</span>`;

        setTimeout(() => {
          wheel.classList.remove('spinning-fast');
          statusText.innerHTML = `<span style="color: #22c55e;">➔ Zugeteilt zu ${teamNames[winnerTeam] || winnerTeam.toUpperCase()}!</span>`;
        }, 2200);
      }
    });
  },

  destroy() {
    this.isPaused = true;
    cancelAnimationFrame(this.animationId);
  }
};