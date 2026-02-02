const RAILWAY_DOMAIN = 'web-production-1a2e.up.railway.app';
const serverUrl = `wss://${RAILWAY_DOMAIN}`; // Railway usa HTTPS/WSS (porta 443)

let socket;
let myPlayerIdx = null;
let localHandOrder = null;

function connect() {
    socket = new WebSocket(serverUrl);

    socket.onopen = () => console.log("✅ Connesso a Railway");
    
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "game_over") {
            renderFinalView(data);
            showReadyButton();
            return;
        }
        if (data.p_idx !== undefined) myPlayerIdx = data.p_idx;
        if (data.hand) {
            if (!localHandOrder || localHandOrder.length !== data.hand.length) {
                localHandOrder = data.hand;
            }
        }
        renderGame(data);
    };

    socket.onclose = () => {
        console.log("❌ Connessione persa. Riprovo...");
        setTimeout(connect, 2000);
    };

    socket.onerror = (err) => console.error("Errore WebSocket:", err);
}

// Chiama la connessione all'avvio
connect();

// Mappe per le immagini
const suitsMap = { 'Ori': 'Denari', 'Bastoni': 'Bastoni', 'Coppe': 'Coppe', 'Spade': 'Spade' };
const valuesMap = { 'F': '08', 'C': '09', 'R': '10' };

function renderGame(state) {
    if (!state.game_started) return;
    document.getElementById('ready-btn')?.remove();
    document.getElementById('score-me').innerText = `TU: ${state.scores[myPlayerIdx] || 0}`;
    document.getElementById('score-opp').innerText = `AVV: ${state.scores[1 - myPlayerIdx] || 0}`;

    const oppHand = document.getElementById('opponent-hand');
    oppHand.innerHTML = '';
    for (let i = 0; i < state.opp_count; i++) {
        oppHand.appendChild(createCardElement(null, true));
    }
    renderTable(state);
    renderPlayerHand(state);
}

function renderPlayerHand(state) {
    const container = document.getElementById('player-hand');
    container.innerHTML = '';
    const hand = localHandOrder || state.hand;
    const isMyTurn = state.turn === myPlayerIdx;
    const canAction = isMyTurn && hand.length === 8;

    hand.forEach((card, index) => {
        const img = createCardElement(card);
        img.onclick = () => {
            if (canAction) {
                // Semplice click per scartare se non si usa il drag
                socket.send(JSON.stringify({action: "discard", card: card}));
            }
        };
        container.appendChild(img);
    });
}

function renderTable(state) {
    const deck = document.getElementById('deck-img');
    const discard = document.getElementById('discard-pile');
    const isMyTurn = state.turn === myPlayerIdx;
    
    if (deck) deck.onclick = () => {
        if (isMyTurn && state.hand.length === 7) socket.send(JSON.stringify({action: "draw_deck"}));
    };
    
    if (discard) {
        discard.innerHTML = '';
        if (state.top_discard) {
            const img = createCardElement(state.top_discard);
            img.onclick = () => {
                if (isMyTurn && state.hand.length === 7) socket.send(JSON.stringify({action: "draw_discard"}));
            };
            discard.appendChild(img);
        }
    }
}

function createCardElement(card, isBack = false) {
    const img = document.createElement('img');
    img.className = 'card';
    if (isBack) img.src = 'assets/Dorso.png';
    else {
        const v = card.v.toString();
        const vStr = valuesMap[v] || v.padStart(2, '0');
        const sStr = suitsMap[card.s] || card.s;
        img.src = `assets/${sStr}${vStr}.png`;
    }
    return img;
}

function renderFinalView(data) {
    alert("Round Terminato! Vincitore: Giocatore " + data.winner);
}

function showReadyButton() {
    const btn = document.createElement('button');
    btn.id = 'ready-btn';
    btn.innerText = "PROSSIMO ROUND";
    btn.onclick = () => {
        socket.send(JSON.stringify({action: "ready_next_round"}));
        btn.disabled = true;
    };
    document.body.appendChild(btn);
}