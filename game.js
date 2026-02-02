const RAILWAY_DOMAIN = 'web-production-1a2e.up.railway.app'; 
const isLocal = false; // Impostato su false per usare Railway
//const serverUrl = isLocal ? 'ws://localhost:5555' : `wss://${RAILWAY_DOMAIN}`;
const serverUrl = 'wss://web-production-1a2e.up.railway.app/ws'
let socket;
function connect() {
    socket = new WebSocket(serverUrl);

    socket.onopen = () => console.log("%c Connesso al Server Railway ", "background: #004400; color: #fff;");
    
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "game_over") {
            renderFinalView(data);
            showReadyButton();
            return;
        }
        if (data.type === "error") { console.error("Errore Server:", data.msg); return; }
        if (data.p_idx !== undefined) myPlayerIdx = data.p_idx;
        if (data.hand) {
            if (!localHandOrder || localHandOrder.length !== data.hand.length) {
                localHandOrder = data.hand;
            }
        }
        renderGame(data);
    };

    socket.onclose = () => {
        console.log("%c Connessione persa. Riconnessione in corso... ", "background: #440000; color: #fff;");
        setTimeout(connect, 2000); // Tenta di riconnettersi ogni 2 secondi
    };

    socket.onerror = (err) => console.error("Errore WebSocket:", err);
}

connect();

const suitsMap = { 'Ori': 'Denari', 'Bastoni': 'Bastoni', 'Coppe': 'Coppe', 'Spade': 'Spade' };
const valuesMap = { 'F': '08', 'C': '09', 'R': '10' };

let localHandOrder = null;
let myPlayerIdx = null;
let draggedElement = null;
let touchStartX = 0;
let touchStartY = 0;
let hasMoved = false;
const moveThreshold = 10; 

function renderGame(state) {
    if (!state.game_started) return;
    document.getElementById('ready-btn')?.remove();
    document.getElementById('score-me').innerText = `TU: ${state.scores[state.p_idx] || 0}`;
    document.getElementById('score-opp').innerText = `AVV: ${state.scores[1 - state.p_idx] || 0}`;

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
    const isMyTurn = state.turn === state.p_idx;
    const canAction = isMyTurn && state.hand.length === 8;

    if (canAction) {
        console.group("%c 🃏 ANALISI MANO PER CHIUSURA ", "background: #800; color: #fff; font-weight: bold; padding: 4px;");
        console.log("Mano attuale:", hand.map(c => `${c.v} di ${c.s}`).join(" | "));
        const discardCandidate = hand[hand.length - 1]; // Assume l'ultima carta come scarto
        console.log(`%c SUGGERIMENTO: Trascina il ${discardCandidate.v} di ${discardCandidate.s} nella zona 'CHIUDI'`, "color: #00ff00; font-weight: bold;");
        console.groupEnd();
    }

    hand.forEach((card, index) => {
        const cardImg = createCardElement(card);
        cardImg.classList.add('touchable-card');
        cardImg.dataset.index = index;

        cardImg.addEventListener('touchstart', (e) => {
            draggedElement = cardImg;
            hasMoved = false;
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            cardImg.style.zIndex = "1000";
        }, {passive: false});

        cardImg.addEventListener('touchmove', (e) => {
            if (!draggedElement) return;
            const touch = e.touches[0];
            const dx = touch.clientX - touchStartX;
            const dy = touch.clientY - touchStartY;
            if (Math.abs(dx) > moveThreshold || Math.abs(dy) > moveThreshold) {
                hasMoved = true;
                e.preventDefault(); 
                draggedElement.style.transform = `translate(${dx}px, ${dy}px) scale(1.1)`;
            }
        }, {passive: false});

        cardImg.addEventListener('touchend', (e) => {
            if (!draggedElement) return;
            const touch = e.changedTouches[0];
            const closeZone = document.getElementById('close-zone');
            const rect = closeZone.getBoundingClientRect();
            const droppedInClose = (
                touch.clientX >= rect.left && touch.clientX <= rect.right &&
                touch.clientY >= rect.top && touch.clientY <= rect.bottom
            );

            if (hasMoved && droppedInClose && canAction) {
                console.log("%c INVIO CHIUSURA CON:", "color: red;", card);
                socket.send(JSON.stringify({action: "close", card: card}));
            } else if (!hasMoved && canAction) {
                socket.send(JSON.stringify({action: "discard", card: card}));
            } else if (hasMoved) {
                draggedElement.style.visibility = 'hidden';
                const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
                draggedElement.style.visibility = 'visible';
                if (targetEl) {
                    const targetCard = targetEl.closest('.touchable-card');
                    if (targetCard && targetCard !== draggedElement) {
                        const fromIdx = parseInt(draggedElement.dataset.index);
                        const toIdx = parseInt(targetCard.dataset.index);
                        [hand[fromIdx], hand[toIdx]] = [hand[toIdx], hand[fromIdx]];
                        localHandOrder = [...hand];
                        renderPlayerHand(state);
                    }
                }
            }
            draggedElement.style.zIndex = "";
            draggedElement.style.transform = "";
            draggedElement = null;
        });
        container.appendChild(cardImg);
    });
}

function renderTable(state) {
    const deckImg = document.getElementById('deck-img');
    const discardPile = document.getElementById('discard-pile');
    const isMyTurn = state.turn === state.p_idx;
    if (deckImg) deckImg.onclick = () => { if (isMyTurn && state.hand.length === 7) socket.send(JSON.stringify({action: "draw_deck"})); };
    if (discardPile) {
        discardPile.innerHTML = '';
        if (state.top_discard) {
            const topDiscard = createCardElement(state.top_discard);
            topDiscard.onclick = () => { if (isMyTurn && state.hand.length === 7) socket.send(JSON.stringify({action: "draw_discard"})); };
            discardPile.appendChild(topDiscard);
        }
    }
}

function renderFinalView(data) {
    const oppIdx = 1 - myPlayerIdx;
    const oppHandContainer = document.getElementById('opponent-hand');
    oppHandContainer.innerHTML = '';
    if (data.all_hands && data.all_hands[oppIdx]) {
        data.all_hands[oppIdx].forEach(card => oppHandContainer.appendChild(createCardElement(card)));
    }
    const winMsg = data.winner === myPlayerIdx ? "HAI VINTO IL ROUND! 🏆" : "L'AVVERSARIO HA CHIUSO! ❌";
    alert(`${winMsg}\n\nPunteggio Finale:\nTU: ${data.total_scores[myPlayerIdx]}\nAVVERSARIO: ${data.total_scores[oppIdx]}`);
}

function showReadyButton() {
    if (document.getElementById('ready-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'ready-btn';
    btn.innerText = "PROSSIMO ROUND";
    btn.style = "position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); padding: 20px 40px; font-size: 1.5rem; background: #28a745; color: white; border: none; border-radius: 12px; z-index: 9999; cursor: pointer;";
    btn.onclick = () => {
        socket.send(JSON.stringify({action: "ready_next_round"}));
        btn.innerText = "ATTESA...";
        btn.disabled = true;
    };
    document.body.appendChild(btn);
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