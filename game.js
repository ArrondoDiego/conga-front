const RAILWAY_DOMAIN = 'web-production-1a2e.up.railway.app'; 
// Proviamo prima senza /ws, che è lo standard per Railway se non specificato diversamente nel backend
//let serverUrl = `wss://${RAILWAY_DOMAIN}`;
const serverUrl = 'wss://web-production-1a2e.up.railway.app'
let socket;
let myPlayerIdx = null;
let localHandOrder = null;

function connect() {
    console.log("%c🔌 Tentativo di connessione a: " + serverUrl, "color: cyan");
    socket = new WebSocket(serverUrl);

    socket.onopen = () => {
        console.log("%c✅ Connesso al Server Railway", "background: #004400; color: #fff; padding: 5px;");
    };

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
            // Aggiorna la mano locale solo se il numero di carte cambia (pesca/scarto)
            if (!localHandOrder || localHandOrder.length !== data.hand.length) {
                localHandOrder = data.hand;
            }
        }
        renderGame(data);
    };

    socket.onclose = (e) => {
        console.log("%c❌ Connessione persa.", "color: red");
        // Se il primo tentativo fallisce, proviamo ad aggiungere /ws al prossimo tentativo
        if (!serverUrl.endsWith('/ws')) {
            serverUrl += '/ws';
            console.log("Provo con il path alternativo: " + serverUrl);
        }
        setTimeout(connect, 3000); 
    };

    socket.onerror = (err) => {
        console.error("Errore WebSocket rilevato.");
    };
}

connect();

const suitsMap = { 'Ori': 'Denari', 'Bastoni': 'Bastoni', 'Coppe': 'Coppe', 'Spade': 'Spade' };
const valuesMap = { 'F': '08', 'C': '09', 'R': '10' };

let draggedElement = null;
let touchStartX = 0;
let touchStartY = 0;
let hasMoved = false;
const moveThreshold = 10; 

function renderGame(state) {
    if (!state.game_started) return;
    
    // Gestione punteggi
    const me = document.getElementById('score-me');
    const opp = document.getElementById('score-opp');
    if (me) me.innerText = `TU: ${state.scores[myPlayerIdx] || 0}`;
    if (opp) opp.innerText = `AVV: ${state.scores[1 - myPlayerIdx] || 0}`;

    // Mano avversario
    const oppHand = document.getElementById('opponent-hand');
    if (oppHand) {
        oppHand.innerHTML = '';
        for (let i = 0; i < state.opp_count; i++) {
            oppHand.appendChild(createCardElement(null, true));
        }
    }

    renderTable(state);
    renderPlayerHand(state);
}

function renderPlayerHand(state) {
    const container = document.getElementById('player-hand');
    if (!container) return;
    container.innerHTML = '';
    
    const hand = localHandOrder || state.hand;
    const isMyTurn = state.turn === myPlayerIdx;
    const canAction = isMyTurn && hand.length === 8;

    // Suggerimento per la chiusura in console
    if (canAction) {
        console.group("%c🃏 ANALISI MANO", "background: #222; color: #bada55");
        console.log("La tua mano:", hand.map(c => `${c.v} di ${c.s}`).join(" | "));
        const scarto = hand[hand.length - 1];
        console.log(`%cCONSIGLIO: Trascina il ${scarto.v} di ${scarto.s} in CHIUDI!`, "color: #ff0000; font-weight: bold;");
        console.groupEnd();
    }

    hand.forEach((card, index) => {
        const cardImg = createCardElement(card);
        cardImg.classList.add('touchable-card');
        cardImg.dataset.index = index;

        // Logica Touch (Drag & Drop)
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
            
            let droppedInClose = false;
            if (closeZone) {
                const rect = closeZone.getBoundingClientRect();
                droppedInClose = (
                    touch.clientX >= rect.left && touch.clientX <= rect.right &&
                    touch.clientY >= rect.top && touch.clientY <= rect.bottom
                );
            }

            if (hasMoved && droppedInClose && canAction) {
                socket.send(JSON.stringify({action: "close", card: card}));
            } else if (!hasMoved && canAction) {
                socket.send(JSON.stringify({action: "discard", card: card}));
            } else if (hasMoved) {
                // Riordinamento manuale della mano
                draggedElement.style.visibility = 'hidden';
                const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
                draggedElement.style.visibility = 'visible';
                const targetCard = targetEl?.closest('.touchable-card');
                if (targetCard && targetCard !== draggedElement) {
                    const fromIdx = parseInt(draggedElement.dataset.index);
                    const toIdx = parseInt(targetCard.dataset.index);
                    [hand[fromIdx], hand[toIdx]] = [hand[toIdx], hand[fromIdx]];
                    localHandOrder = [...hand];
                    renderPlayerHand(state);
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
    const isMyTurn = state.turn === myPlayerIdx;

    if (deckImg) {
        deckImg.onclick = () => { 
            if (isMyTurn && state.hand.length === 7) socket.send(JSON.stringify({action: "draw_deck"})); 
        };
    }
    if (discardPile) {
        discardPile.innerHTML = '';
        if (state.top_discard) {
            const topCard = createCardElement(state.top_discard);
            topCard.onclick = () => { 
                if (isMyTurn && state.hand.length === 7) socket.send(JSON.stringify({action: "draw_discard"})); 
            };
            discardPile.appendChild(topCard);
        }
    }
}

function renderFinalView(data) {
    const oppIdx = 1 - myPlayerIdx;
    const winMsg = data.winner === myPlayerIdx ? "HAI VINTO IL ROUND! 🏆" : "L'AVVERSARIO HA CHIUSO! ❌";
    alert(`${winMsg}\n\nPunteggio Finale:\nTU: ${data.total_scores[myPlayerIdx]}\nAVVERSARIO: ${data.total_scores[oppIdx]}`);
}

function showReadyButton() {
    if (document.getElementById('ready-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'ready-btn';
    btn.innerText = "GIOCA PROSSIMO ROUND";
    btn.style = "position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); padding: 20px 40px; font-size: 1.5rem; background: #28a745; color: white; border: none; border-radius: 12px; z-index: 9999; cursor: pointer;";
    btn.onclick = () => {
        socket.send(JSON.stringify({action: "ready_next_round"}));
        btn.innerText = "IN ATTESA...";
        btn.style.background = "#6c757d";
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