const RAILWAY_DOMAIN = 'web-production-1a2e.up.railway.app'; 
const isLocal = window.location.href === "file:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const serverUrl = isLocal ? 'ws://localhost:5555' : `wss://${RAILWAY_DOMAIN}`;
const socket = new WebSocket(serverUrl);

const suitsMap = { 'Ori': 'Denari', 'Denari': 'Denari', 'Bastoni': 'Bastoni', 'Coppe': 'Coppe', 'Spade': 'Spade' };
const valuesMap = { 'F': '08', 'C': '09', 'R': '10' };

socket.onmessage = (event) => {
    const gameState = JSON.parse(event.data);
    console.log("Stato ricevuto dal server:", gameState); // DEBUG
    renderGame(gameState);
};

function renderGame(state) {
    const statusText = document.getElementById('status-text');
    
    if (!state.game_started) {
        if (statusText) statusText.innerText = "IN ATTESA DI UN AVVERSARIO...";
        return;
    }
    if (statusText) statusText.innerText = state.turn === state.p_idx ? "IL TUO TURNO" : "TURNO AVVERSARIO";

    // 1. Punteggi
    document.getElementById('score-me').innerText = `TU: ${state.scores[state.p_idx]}`;
    document.getElementById('score-opp').innerText = `AVV: ${state.scores[1 - state.p_idx]}`;

    // 2. Mano Avversario
    const oppHand = document.getElementById('opponent-hand');
    oppHand.innerHTML = '';
    for (let i = 0; i < state.opp_count; i++) {
        oppHand.appendChild(createCardElement(null, true));
    }

    // 3. Centro Tavolo
    renderTable(state);

    // 4. Mano Giocatore
    renderPlayerHand(state);
}

function renderTable(state) {
    const deckImg = document.getElementById('deck-img');
    const discardPile = document.getElementById('discard-pile');
    const isMyTurn = state.turn === state.p_idx;
    const canDraw = isMyTurn && state.hand.length === 7;

    // Mazzo
    if (deckImg) {
        deckImg.style.display = 'block'; // Assicura che sia visibile
        deckImg.onclick = () => {
            if (canDraw) socket.send(JSON.stringify({action: "draw_deck"}));
        };
    }

    // Scarti
    discardPile.innerHTML = '';
    if (state.top_discard) {
        const topDiscard = createCardElement(state.top_discard);
        topDiscard.onclick = () => {
            if (canDraw) socket.send(JSON.stringify({action: "draw_discard"}));
        };
        discardPile.appendChild(topDiscard);
    }
}

function renderPlayerHand(state) {
    const container = document.getElementById('player-hand');
    if (!container) {
        console.error("ERRORE: Div #player-hand non trovato nell'HTML!");
        return;
    }
    container.innerHTML = '';

    if (!state.hand || state.hand.length === 0) {
        console.warn("ATTENZIONE: La mano ricevuta è vuota.");
        return;
    }
    console.log("aaaaaaaa")
    state.hand.forEach((card) => {
        const cardImg = createCardElement(card);
        
        // Se è il mio turno e ho 8 carte, posso scartare o chiudere
        if (state.turn === state.p_idx && state.hand.length === 8) {
            cardImg.classList.add('my-turn');
            
            // Click normale per scartare
            cardImg.onclick = () => {
                socket.send(JSON.stringify({action: "discard", card: card}));
            };

            // Tasto destro (o pressione prolungata) per chiudere
            cardImg.oncontextmenu = (e) => {
                e.preventDefault();
                socket.send(JSON.stringify({action: "close", card: card}));
            };
        }
        
        container.appendChild(cardImg);
    });
}

function createCardElement(card, isBack = false) {
    const img = document.createElement('img');
    img.className = 'card';
    
    if (isBack) {
        img.src = 'assets/Dorso.png';
    } else {
        const vStr = valuesMap[card.v] || card.v.toString().padStart(2, '0');
        const sStr = suitsMap[card.s] || card.s;
        img.src = `assets/${sStr}${vStr}.png`;
        img.onerror = () => {
            console.error(`Immagine non trovata: assets/${sStr}${vStr}.png`);
            img.src = 'assets/Dorso.png'; // Fallback se manca il file
        };
    }
    return img;
}