const RAILWAY_DOMAIN = 'web-production-1a2e.up.railway.app'; 
const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const serverUrl = isLocal ? 'ws://localhost:5555' : `wss://${RAILWAY_DOMAIN}`;
let socket = new WebSocket(serverUrl);

const suitsMap = { 'Ori': 'Denari', 'Bastoni': 'Bastoni', 'Coppe': 'Coppe', 'Spade': 'Spade' };
const valuesMap = { 'F': '08', 'C': '09', 'R': '10' };

let localHandOrder = null;
let myPlayerIdx = null;

let draggedElement = null;
let touchStartX = 0;
let touchStartY = 0;
let hasMoved = false;
const moveThreshold = 10; 

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "game_over") {
        renderFinalView(data);
        showReadyButton();
        return;
    }
    if (data.type === "error") { alert(data.msg); return; }
    if (data.p_idx !== undefined) myPlayerIdx = data.p_idx;
    if (data.hand) {
        if (!localHandOrder || localHandOrder.length !== data.hand.length) {
            localHandOrder = data.hand;
        }
    }
    renderGame(data);
};

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
            cardImg.style.transition = "none";
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
            
            if (!hasMoved) {
                // TAP -> SCARTA SEMPLICE
                if (canAction) {
                    socket.send(JSON.stringify({action: "discard", card: card}));
                }
            } else {
                // DRAG -> RILEVAZIONE BERSAGLIO SOTTO IL DITO
                draggedElement.style.visibility = 'hidden'; // Uso visibility per non perdere il layout
                const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
                draggedElement.style.visibility = 'visible';

                if (targetEl) {
                    const closeZone = targetEl.closest('#close-zone');
                    const targetCard = targetEl.closest('.touchable-card');

                    if (closeZone && canAction) {
                        // CHIUSURA: Invio la carta da scartare per chiudere
                        socket.send(JSON.stringify({action: "close", card: card}));
                    } else if (targetCard && targetCard !== draggedElement) {
                        // SCAMBIO ORDINE MANO
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
            draggedElement.style.transition = "transform 0.1s";
            draggedElement = null;
        });

        container.appendChild(cardImg);
    });
}

function renderTable(state) {
    const deckImg = document.getElementById('deck-img');
    const discardPile = document.getElementById('discard-pile');
    const isMyTurn = state.turn === state.p_idx;

    if (deckImg) {
        deckImg.onclick = () => { 
            if (isMyTurn && state.hand.length === 7) socket.send(JSON.stringify({action: "draw_deck"})); 
        };
    }

    if (discardPile) {
        discardPile.innerHTML = '';
        if (state.top_discard) {
            const topDiscard = createCardElement(state.top_discard);
            topDiscard.onclick = () => { 
                if (isMyTurn && state.hand.length === 7) socket.send(JSON.stringify({action: "draw_discard"})); 
            };
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
    alert(`FINE ROUND!\nChiude P${data.winner + 1}\nTu: ${data.total_scores[myPlayerIdx]} | Avv: ${data.total_scores[oppIdx]}`);
}

function showReadyButton() {
    if (document.getElementById('ready-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'ready-btn';
    btn.innerText = "PROSSIMO ROUND";
    btn.onclick = () => {
        socket.send(JSON.stringify({action: "ready_next_round"}));
        btn.innerText = "ATTENDI...";
        btn.disabled = true;
    };
    document.body.appendChild(btn);
}

function createCardElement(card, isBack = false) {
    const img = document.createElement('img');
    img.className = 'card';
    if (isBack) {
        img.src = 'assets/Dorso.png';
    } else {
        const v = card.v.toString();
        const vStr = valuesMap[v] || v.padStart(2, '0');
        const sStr = suitsMap[card.s] || card.s;
        img.src = `assets/${sStr}${vStr}.png`;
    }
    return img;
}