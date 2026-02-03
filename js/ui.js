export const UI = {
    // Gestore audio centralizzato per evitare sovrapposizioni
    playSound(soundId) {
        const sound = document.getElementById(soundId);
        if (sound) {
            sound.pause();           // Ferma l'audio se è già in esecuzione
            sound.currentTime = 0;   // Lo riporta all'inizio (fondamentale per pescate rapide)
            sound.play().catch(e => console.warn("Audio play bloccato dal browser:", e));
        }
    },

    createCardElement(card, isOpponent = false) {
        const img = document.createElement('img');
        if (isOpponent || !card) {
            img.src = 'assets/Dorso.png';
            img.className = 'card opponent-card';
        } else {
            const valStr = card.v.toString().padStart(2, '0');
            img.src = `assets/${card.s}${valStr}.png`;
            img.className = 'card';
            img.dataset.v = card.v;
            img.dataset.s = card.s;
        }
        return img;
    },

    // Funzione da chiamare quando qualcuno pesca (sia io che avversario)
    playDrawSound() {
        this.playSound('card-draw-sound'); // Assicurati che l'ID nell'HTML sia questo
    },

    renderScore(scores, myIdx) {
        const meEl = document.getElementById('score-me');
        const oppEl = document.getElementById('score-opp');
        
        if (meEl && oppEl && scores && scores.length >= 2) {
            meEl.textContent = scores[myIdx];
            oppEl.textContent = scores[1 - myIdx];
        } else {
            console.warn("Elementi punteggio non ancora pronti:", {meEl, oppEl, scores});
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
        if (!state || !state.hand) return;
        console.clear(); 
        console.log("%c MANO GIOCATORE ", "background: #2ecc71; color: white; font-weight: bold;");
        console.table(state.hand.map(c => ({ Valore: c.v, Seme: c.s })));
        
        if (state.hand.length === 8) {
            console.log("%c👉 Puoi scartare o trascinare su CHIUDI.", "color: #f1c40f;");
        }
    }
};