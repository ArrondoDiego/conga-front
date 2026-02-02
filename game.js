const RAILWAY_DOMAIN = 'web-production-1a2e.up.railway.app';
const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const serverUrl = isLocal ? 'ws://localhost:5555' : `wss://${RAILWAY_DOMAIN}`;

let socket = new WebSocket(serverUrl);

const suitsMap = { 'Ori': 'Denari', 'Bastoni': 'Bastoni', 'Coppe': 'Coppe', 'Spade': 'Spade' };
const valuesMap = { 'F': '08', 'C': '09', 'R': '10' };

let myPlayerIdx = null;
let localHandOrder = null;
let draggedElement = null;
let touchStartX = 0;
let touchStartY = 0;
let hasMoved = false;
const moveThreshold = 10;

// --- ANALISI COMBINAZIONI IN CONSOLE ---
function analyzeHand(hand) {
    console.group("%c 🔍 ANALISI MANO ATTUALE ", "background: #222; color: #bada55; font-weight: bold; padding: 4px;");
    const counts = {};
    hand.forEach(c => { counts[c.v] = (counts[c.v] || 0) + 1; });
    for (let v in counts) {
        if (counts[v] >= 3) console.log(`✅ Gruppo trovato: ${counts[v]} carte del valore ${v}`);
    }
    console.log("Carte totali in mano:", hand.length);
    console.groupEnd();
}

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "game_over") {
        renderGameOver(data);
        return;
    }
    if (data.p_idx !== undefined) myPlayerIdx = data.p_idx;
    
    // Aggiorna l'ordine locale solo se il numero di carte cambia (nuova pescata/scarto)
    if (data.hand) {
        if (!localHandOrder || localHandOrder.length !== data.hand.length) {
            localHandOrder = [...data.hand];
        }
    }
    renderGame(data);
};

function renderGame(state) {
    if (!state.game_started) return;
    document.getElementById('ready-btn')?.remove();

    document.getElementById('score-me').innerText = `TU: ${state.scores[myPlayerIdx] || 0}`;
    document.getElementById('score-opp').innerText = `AVV: ${state.scores[1 - myPlayerIdx] || 0}`;

    // Tavolo
    const deckImg = document.getElementById('deck-img');
    deckImg.onclick = () => {
        if (state.turn === myPlayerIdx && state.hand.length === 7) {
            socket.send(JSON.stringify({ action: "draw_deck" }));
        }
    };

    const discardPile = document.getElementById('discard-pile');
    discardPile.innerHTML = '';
    if (state.top_discard) {
        const top = createCardElement(state.top_discard);
        top.onclick = () => {
            if (state.turn === myPlayerIdx && state.hand.length === 7) {
                socket.send(JSON.stringify({ action: "draw_discard" }));
            }
        };
        discardPile.appendChild(top);
    }

    const oppHand = document.getElementById('opponent-hand');
    oppHand.innerHTML = '';
    for (let i = 0; i < state.opp_count; i++) {
        oppHand.appendChild(createCardElement(null, true));
    }

    renderPlayerHand(state);
}

function renderPlayerHand(state) {
    const container = document.getElementById('player-hand');
    container.innerHTML = '';
    
    // Usiamo l'ordine locale per permettere lo scambio
    const hand = localHandOrder || state.hand;
    const isMyTurn = state.turn === myPlayerIdx;
    const canAction = isMyTurn && hand.length === 8;

    if (canAction) analyzeHand(hand);

    hand.forEach((card, index) => {
        const img = createCardElement(card);
        img.classList.add('touchable-card');
        img.dataset.index = index;
        
        img.addEventListener('touchstart', (e) => {
            draggedElement = img;
            hasMoved = false;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            img.style.zIndex = "1000";
        }, { passive: false });

        img.addEventListener('touchmove', (e) => {
            if (!draggedElement) return;
            const dx = e.touches[0].clientX - touchStartX;
            const dy = e.touches[0].clientY - touchStartY;
            if (Math.abs(dx) > moveThreshold || Math.abs(dy) > moveThreshold) {
                hasMoved = true;
                e.preventDefault();
                img.style.transform = `translate(${dx}px, ${dy}px) scale(1.1)`;
            }
        }, { passive: false });

        img.addEventListener('touchend', (e) => {
            if (!draggedElement) return;
            const touch = e.changedTouches[0];
            const closeZone = document.getElementById('close-zone');
            const rect = closeZone.getBoundingClientRect();
            
            const inCloseZone = (
                touch.clientX >= rect.left && touch.clientX <= rect.right &&
                touch.clientY >= rect.top && touch.clientY <= rect.bottom
            );

            if (hasMoved) {
                if (inCloseZone && canAction) {
                    // CHIUSURA
                    socket.send(JSON.stringify({ action: "close", card: card }));
                } else {
                    // SCAMBIO CARTE (Logica Visiva)
                    draggedElement.style.visibility = 'hidden';
                    const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
                    draggedElement.style.visibility = 'visible';
                    
                    const targetCard = targetEl?.closest('.touchable-card');
                    if (targetCard && targetCard !== draggedElement) {
                        const fromIdx = parseInt(draggedElement.dataset.index);
                        const toIdx = parseInt(targetCard.dataset.index);
                        // Inverti nell'array locale
                        [localHandOrder[fromIdx], localHandOrder[toIdx]] = [localHandOrder[toIdx], localHandOrder[fromIdx]];
                        renderPlayerHand(state); // Refresh immediato
                    }
                }
            } else if (canAction) {
                // SCARTO SEMPLICE (Click senza trascinamento)
                socket.send(JSON.stringify({ action: "discard", card: card }));
            }

            img.style.transform = "";
            img.style.zIndex = "";
            draggedElement = null;
        });

        container.appendChild(img);
    });
}

function renderGameOver(data) {
    const winMsg = data.winner === myPlayerIdx ? "HAI VINTO IL ROUND! 🏆" : "L'AVVERSARIO HA CHIUSO! ❌";
    alert(`${winMsg}\n\nPunteggi Totali:\nTU: ${data.total_scores[myPlayerIdx]}\nAVVERSARIO: ${data.total_scores[1 - myPlayerIdx]}`);
    
    localHandOrder = null; // Reset ordine per il round successivo

    if (!document.getElementById('ready-btn')) {
        const btn = document.createElement('button');
        btn.id = 'ready-btn';
        btn.innerText = "PRONTO PER IL PROSSIMO ROUND";
        btn.style = "position:fixed; bottom:50px; left:50%; transform:translateX(-50%); padding:20px; font-size:20px; z-index:9999;";
        btn.onclick = () => {
            socket.send(JSON.stringify({ action: "ready_next_round" }));
            btn.innerText = "IN ATTESA...";
            btn.disabled = true;
        };
        document.body.appendChild(btn);
    }
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