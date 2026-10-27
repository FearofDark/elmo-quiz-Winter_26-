const TeamLottery = {
  container: null,
  channel: null,

  init(containerEl, channel) {
    this.container = containerEl;
    this.channel = channel;
    this.render();
  },

  render() {
    if (!this.container) return;

    // Wir erstellen einen Container für die UI und laden das Elmo-Spiel direkt hinein
    this.container.innerHTML = `
      <div id="lottery-main-wrapper" style="width: 100%; height: 100%; display: flex; flex-direction: column;">
        <div id="elmo-game-container" style="width: 100%; height: 100%;"></div>
      </div>
    `;

    // Das ausgelagerte Elmo-Minispiel in den Container starten
    if (typeof ElmoGame !== 'undefined') {
      ElmoGame.init(document.getElementById('elmo-game-container'), this.channel);
    } else {
      console.error("ElmoGame ist nicht geladen! Bitte lade elmo-game.js vor team-lottery.js.");
    }
  },

  destroy() {
    if (typeof ElmoGame !== 'undefined' && typeof ElmoGame.destroy === 'function') {
      ElmoGame.destroy();
    }
  }
};