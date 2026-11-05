window.Game5Admin = {
    currentState: null,
    currentObject: null,

    async init() {
        await this.loadData();
        
        supabaseClient.channel('game5_admin_state')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'game5_state' }, payload => {
                if (payload.new) {
                    this.currentState = payload.new;
                    this.updateUI();
                    if (!this.currentObject || this.currentObject.runden_nummer !== this.currentState.aktive_runde) {
                        this.loadObjectData(this.currentState.aktive_runde);
                    }
                }
            })
            .subscribe();

        supabaseClient.channel('game5_admin_objects')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'game5_objects' }, payload => {
                if (payload.new && this.currentState && payload.new.runden_nummer === this.currentState.aktive_runde) {
                    this.currentObject = payload.new;
                    this.updateUI();
                }
            })
            .subscribe();
    },

    async loadData() {
        const { data: stateData } = await supabaseClient.from('game5_state').select('*').eq('id', 1).maybeSingle();
        if (stateData) {
            this.currentState = stateData;
            await this.loadObjectData(stateData.aktive_runde);
        }
    },

    async loadObjectData(roundNum) {
        const { data } = await supabaseClient.from('game5_objects').select('*').eq('runden_nummer', roundNum).maybeSingle();
        if (data) {
            this.currentObject = data;
        }
        this.updateUI();
    },

    updateUI() {
        if (!this.currentState) return;

        // Status-Buttons im Admin visuell hervorheben
        const btnOverview = document.getElementById('btn-status-overview');
        const btnPlaying = document.getElementById('btn-status-playing');
        
        if (this.currentState.status === 'overview') {
            if (btnOverview) { btnOverview.style.background = '#eab308'; btnOverview.style.color = '#000'; }
            if (btnPlaying) { btnPlaying.style.background = '#334155'; btnPlaying.style.color = '#fff'; }
        } else {
            if (btnOverview) { btnOverview.style.background = '#334155'; btnOverview.style.color = '#fff'; }
            if (btnPlaying) { btnPlaying.style.background = '#10b981'; btnPlaying.style.color = '#fff'; }
        }

        const roundLabel = document.getElementById('admin-game5-round-label');
        if (roundLabel) roundLabel.innerText = `🎯 Runde ${this.currentState.aktive_runde} / 20`;
        
        const korrekterFaktor = this.currentObject?.loesung_faktor || 1.0;

        const refNameEl = document.getElementById('admin-ref-name');
        const refMeterEl = document.getElementById('admin-ref-meter');
        const targetNameEl = document.getElementById('admin-target-name');
        const targetMeterEl = document.getElementById('admin-target-meter');
        const targetFactorEl = document.getElementById('admin-target-factor');

        if (refNameEl) refNameEl.innerText = this.currentObject ? this.currentObject.referenz_name : 'Lade...';
        if (refMeterEl) refMeterEl.innerText = this.currentObject ? `Größe: ${this.currentObject.referenz_groesse_text}` : '';
        
        if (targetNameEl) targetNameEl.innerText = this.currentObject ? this.currentObject.ziel_name : 'Lade...';
        if (targetMeterEl) targetMeterEl.innerText = this.currentObject ? `Größe: ${this.currentObject.ziel_groesse_text}` : '';
        if (targetFactorEl) targetFactorEl.innerText = `${parseFloat(korrekterFaktor).toFixed(2)}x`;

        const formatTip = (val, revealed) => {
            if (!val) return 'Wartet...';
            return revealed ? `${parseFloat(val).toFixed(2)}x (Aufgedeckt)` : `${parseFloat(val).toFixed(2)}x (Eingereicht ✓)`;
        };

        const t1 = document.getElementById('admin-label-t1');
        const t2 = document.getElementById('admin-label-t2');
        const t3 = document.getElementById('admin-label-t3');
        const t4 = document.getElementById('admin-label-t4');

        if (t1) t1.innerText = `Blau (${this.currentState.punkte_blau || 0} P): ${formatTip(this.currentState.tipp_team_1, this.currentState.reveal_t1)}`;
        if (t2) t2.innerText = `Rot (${this.currentState.punkte_rot || 0} P): ${formatTip(this.currentState.tipp_team_2, this.currentState.reveal_t2)}`;
        if (t3) t3.innerText = `Grün (${this.currentState.punkte_gruen || 0} P): ${formatTip(this.currentState.tipp_team_3, this.currentState.reveal_t3)}`;
        if (t4) t4.innerText = `Gelb (${this.currentState.punkte_gelb || 0} P): ${formatTip(this.currentState.tipp_team_4, this.currentState.reveal_t4)}`;
    },

    // NEU: Status umschalten ('overview' für Pause/Intro, 'playing' für aktiv)
    async setStatus(newStatus) {
        await supabaseClient.from('game5_state').update({
            status: newStatus,
            updated_at: new Date()
        }).eq('id', 1);
    },

    async changeRound(direction) {
        let newRound = (this.currentState?.aktive_runde || 1) + direction;
        if (newRound < 1) newRound = 1;
        if (newRound > 20) newRound = 20;

        await supabaseClient.from('game5_state').update({
            aktive_runde: newRound,
            skalierung: 1.0,
            reveal_aktiv: false,
            reveal_t1: false,
            reveal_t2: false,
            reveal_t3: false,
            reveal_t4: false,
            tipp_team_1: null,
            tipp_team_2: null,
            tipp_team_3: null,
            tipp_team_4: null,
            updated_at: new Date()
        }).eq('id', 1);

        await this.loadObjectData(newRound);
    },

    async setMasterReveal(isOpen) {
        const korrekterFaktor = this.currentObject?.loesung_faktor || 1.0;

        let updateData = { 
            reveal_aktiv: isOpen, 
            richtige_groesse: korrekterFaktor,
            skalierung: isOpen ? korrekterFaktor : this.currentState.skalierung,
            updated_at: new Date() 
        };

        if (isOpen) {
            updateData.reveal_t1 = false;
            updateData.reveal_t2 = false;
            updateData.reveal_t3 = false;
            updateData.reveal_t4 = false;
        }

        await supabaseClient.from('game5_state').update(updateData).eq('id', 1);
    },

    async revealTeam(columnName) {
        const korrekterFaktor = this.currentObject?.loesung_faktor || 1.0;
        let updateObj = { 
            reveal_aktiv: true, 
            richtige_groesse: korrekterFaktor,
            skalierung: korrekterFaktor, 
            updated_at: new Date() 
        };
        updateObj[columnName] = true;
        await supabaseClient.from('game5_state').update(updateObj).eq('id', 1);
    },

    async revealAll() {
        const korrekterFaktor = this.currentObject?.loesung_faktor || 1.0;
        await supabaseClient.from('game5_state').update({
            reveal_aktiv: true,
            richtige_groesse: korrekterFaktor,
            skalierung: korrekterFaktor,
            reveal_t1: true,
            reveal_t2: true,
            reveal_t3: true,
            reveal_t4: true,
            updated_at: new Date()
        }).eq('id', 1);
    },

    async addPoints(columnName, amount) {
        const currentScore = this.currentState[columnName] || 0;
        const newScore = Math.max(0, currentScore + amount);

        let updateObj = { updated_at: new Date() };
        updateObj[columnName] = newScore;

        await supabaseClient.from('game5_state').update(updateObj).eq('id', 1);
    }
};

Game5Admin.init();