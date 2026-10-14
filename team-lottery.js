// team-lottery.js - Modul für die animierte Team-Auslosung
const TeamLottery = {
  container: null,
  channel: null,

  init(containerElement, supabaseChannel, isHost = false) {
    this.container = containerElement;
    this.channel = supabaseChannel;

    this.container.innerHTML = `
      <style>
        .lottery-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          text-align: center;
          padding: 20px;
        }
        .lottery-card {
          background: #1a1f2c;
          border: 2px solid #0070f3;
          border-radius: 16px;
          padding: 30px;
          min-width: 320px;
          box-shadow: 0 0 30px rgba(0, 112, 243, 0.4);
          animation: popIn 0.5s ease-out;
        }
        @keyframes popIn {
          0% { transform: scale(0.7); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .lottery-name {
          font-size: 28px;
          font-weight: 900;
          margin: 15px 0;
          color: #ffffff;
          min-height: 40px;
        }
        .team-reveal {
          font-size: 32px;
          font-weight: 900;
          text-transform: uppercase;
          margin-top: 15px;
          opacity: 0;
          transition: all 0.4s ease;
        }
        .team-reveal.show { opacity: 1; transform: scale(1.1); }
        .team-reveal.blau { color: #0070f3; text-shadow: 0 0 15px rgba(0,112,243,0.8); }
        .team-reveal.rot { color: #ff3b30; text-shadow: 0 0 15px rgba(255,59,48,0.8); }
        .shuffle-anim {
          animation: shuffleText 0.1s infinite alternate;
        }
        @keyframes shuffleText {
          0% { opacity: 0.5; transform: translateY(-2px); }
          100% { opacity: 1; transform: translateY(2px); }
        }
      </style>
      <div class="lottery-wrapper">
        <h2 style="color: #ff0070; margin-bottom: 5px;">🎰 LIVE TEAM-AUSLOSUNG</h2>
        <p style="color: #9ca3af; font-size: 13px; margin-top: 0;">Die Teams werden jetzt per Zufall ermittelt!</p>
        
        <div class="lottery-card">
          <div style="font-size: 12px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px;">Kandidat / Slot</div>
          <div id="lottery-player-name" class="lottery-name">Bereit machen...</div>
          <div id="lottery-team-result" class="team-reveal">?</div>
        </div>
      </div>
    `;

    // Höre auf Auslosungs-Animationen von Supabase
    this.channel.on('broadcast', { event: 'lottery_step' }, payload => {
      this.animateStep(payload.payload);
    });
  },

  animateStep(data) {
    const nameEl = document.getElementById('lottery-player-name');
    const resultEl = document.getElementById('lottery-team-result');
    if (!nameEl || !resultEl) return;

    // Phase 1: Name anzeigen & Trommelwirbel
    nameEl.innerText = data.playerName;
    nameEl.classList.add('shuffle-anim');
    resultEl.className = 'team-reveal';
    resultEl.innerText = '🎲 Ziehe Team...';

    // Phase 2: Auflösung der Teamfarbe mit Verzögerung
    setTimeout(() => {
      nameEl.classList.remove('shuffle-anim');
      resultEl.innerText = data.team === 'blau' ? '🔵 TEAM BLAU' : '🔴 TEAM ROT';
      resultEl.className = `team-reveal show ${data.team}`;
    }, 1200);
  }
};