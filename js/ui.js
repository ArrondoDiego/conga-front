export const UI = {
    createCardElement(card, isOpponent = false) {
        const img = document.createElement('img');
        if (isOpponent || !card) {
            img.src = 'assets/Dorso.png';
            img.className = 'card opponent-card';
        } else {
            // Supporto per formato Denari01, Denari08, etc.
            const valStr = card.v.toString().padStart(2, '0');
            img.src = `assets/${card.s}${valStr}.png`;
            img.className = 'card';
            img.dataset.v = card.v;
            img.dataset.s = card.s;
        }
        return img;
    },

    analyzeHandLog(state) {
        if (!state || !state.hand) return;
        console.log("%c--- ANALISI MANO ---", "color: #2ecc71; font-weight: bold;");
        if (state.hand.length === 8) console.log("👉 Puoi scartare o trascinare su CHIUDI.");
    },

    renderScore(scores, myIdx) {
        const meEl = document.getElementById('score-me');
        const oppEl = document.getElementById('score-opp');
        
        if (meEl && oppEl && scores && scores.length >= 2) {
            meEl.textContent = scores[myIdx];
            oppEl.textContent = scores[1 - myIdx];
        } else {
            console.warn("Elementi punteggio non ancora pronti o dati mancanti:", {meEl, oppEl, scores});
        }
    },

    renderReadyButton(callback) {
        if (document.getElementById('ready-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'ready-btn';
        btn.textContent = 'SONO PRONTO';
        btn.className = 'ready-button-overlay';
        btn.onclick = callback;
        document.body.appendChild(btn);
    },

    analyzeHandLog(state) {
        if (!state.hand) return;
        console.clear(); // Pulisce la console a ogni turno per leggibilità
        console.log("%c MANO GIOCATORE ", "background: #2ecc71; color: white; font-weight: bold;");
        console.table(state.hand.map(c => ({ Valore: c.v, Seme: c.s })));
    }
};