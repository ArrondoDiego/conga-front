import { CONFIG } from './config.js';
import { initSocket, sendAction } from './socket.js';
import { UI } from './ui.js';

let myPlayerIdx = null;
let localHandOrder = null;
let draggedElement = null;
let touchState = { startX: 0, startY: 0, hasMoved: false };
let isShowingResults = false;

// Audio Effects - Assicurati che i file esistano nella cartella musica
const audioRussia = new Audio('./sound/russia.mpeg');
// const audioGatto = new Audio('../musica/gatto.mp3');

function init() {
    initSocket((data) => {
        // Gestione fine round o gioco
        if (data.type === "game_over" || data.type === "round_over") {
            handleGameOver(data);
            return;
        }

        if (data.p_idx !== undefined) myPlayerIdx = data.p_idx;
        
        // Reset flag risultati se il gioco ricomincia
        if (data.type === "sync" && data.game_started && isShowingResults) {
            isShowingResults = false;
        }

        // Trigger audio per doppia pesca scarti (notifica dal server)
        if (data.effect === "russia" || data.effect === "double_discard_draw") {
            audioRussia.play().catch(e => console.log("Audio play blocked"));
        }

        // Gestione sincronizzazione mano e ordinamento locale
        if (data.hand && !isShowingResults) {
            if (!localHandOrder || localHandOrder.length !== data.hand.length) {
                localHandOrder = [...data.hand];
            } else {
                // Aggiorna i dati delle carte mantenendo l'ordine visuale dell'utente
                localHandOrder = localHandOrder.map(localCard => 
                    data.hand.find(serverCard => serverCard.s === localCard.s && serverCard.v === localCard.v) || localCard
                );
            }
        }
        
        if (!isShowingResults) renderGame(data);
    });
}

/**
 * Analisi della mano per suggerire tris o scale in console
 */
function debugHandAnalysis(hand) {
    console.clear();
    console.log("%c --- ANALISI MANO ATTUALE --- ", "background: #2ecc71; color: white; padding: 2px 5px;");
    
    // Raggruppa per valore (Tris/Poker)
    const values = {};
    hand.forEach(c => values[c.v] = (values[c.v] || 0) + 1);
    const potentialSets = Object.keys(values).filter(v => values[v] >= 3);
    if (potentialSets.length > 0) console.log("Combinazioni (Tris/Poker):", potentialSets.join(", "));

    // Raggruppa per seme (Scale)
    const suits = { 'Denari': [], 'Bastoni': [], 'Coppe': [], 'Spade': [] };
    hand.forEach(c => suits[c.s].push(parseInt(c.v)));
    
    Object.keys(suits).forEach(s => {
        const vList = suits[s].sort((a, b) => a - b);
        let count = 1;
        for (let i = 1; i < vList.length; i++) {
            if (vList[i] === vList[i-1] + 1) count++;
            else {
                if (count >= 3) console.log(`Scala di ${s} trovata!`);
                count = 1;
            }
        }
        if (count >= 3) console.log(`Scala di ${s} trovata!`);
    });
    console.table(hand.map(c => ({ Valore: c.v, Seme: c.s })));
}

function renderGame(state) {
    if (!state.game_started) {
        UI.renderReadyButton(() => {
            localHandOrder = null;
            sendAction("ready_next_round");
        });
        return;
    }
    
    document.getElementById('ready-btn')?.remove();
    const turnEl = document.getElementById('turn-info');
    if (turnEl) {
        turnEl.textContent = state.turn === myPlayerIdx ? "TUO TURNO" : "TURNO AVVERSARIO";
        turnEl.className = state.turn === myPlayerIdx ? "my-turn" : "opp-turn";
    }

    UI.renderScore(state.scores, myPlayerIdx);
    const isMyTurn = state.turn === myPlayerIdx;
    const canDraw = isMyTurn && state.hand.length === 7;

    document.getElementById('deck-count').textContent = state.deck_count;
    document.getElementById('deck-img').onclick = () => { if (canDraw) sendAction("draw_deck"); };

    const discardPile = document.getElementById('discard-pile');
    discardPile.innerHTML = '';
    if (state.top_discard) {
        const top = UI.createCardElement(state.top_discard);
        top.onclick = () => { if (canDraw) sendAction("draw_discard"); };
        discardPile.appendChild(top);
    }

    renderOpponentHand(state.opp_count);
    renderPlayerHand(state);
}

function renderPlayerHand(state) {
    const container = document.getElementById('player-hand');
    container.innerHTML = '';
    const hand = localHandOrder || state.hand;
    const isMyTurn = state.turn === myPlayerIdx;

    if (isMyTurn && !isShowingResults) debugHandAnalysis(hand);

    hand.forEach((card, index) => {
        const img = UI.createCardElement(card);
        img.classList.add('touchable-card');
        img.dataset.index = index;
        setupTouchEvents(img, card, state, isMyTurn);
        container.appendChild(img);
    });
}

function renderOpponentHand(count) {
    const container = document.getElementById('opponent-hand');
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.backgroundImage = "url('assets/Dorso.png')";
        container.appendChild(card);
    }
}

function setupTouchEvents(img, card, state, isMyTurn) {
    const canAction = isMyTurn && (state.hand.length === 8);

    img.addEventListener('touchstart', (e) => {
        if (isShowingResults) return;
        draggedElement = img;
        touchState.hasMoved = false;
        touchState.startX = e.touches[0].clientX;
        touchState.startY = e.touches[0].clientY;
        img.style.zIndex = "1000";
        img.style.transition = "none";
    }, { passive: false });

    img.addEventListener('touchmove', (e) => {
        if (!draggedElement) return;
        const dx = e.touches[0].clientX - touchState.startX;
        const dy = e.touches[0].clientY - touchState.startY;
        
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
            touchState.hasMoved = true;
            e.preventDefault();
            img.style.transform = `translate(${dx}px, ${dy}px) scale(1.1)`;
        }
    }, { passive: false });

    img.addEventListener('touchend', (e) => {
        if (!draggedElement) return;
        handleTouchEnd(e, card, canAction, state);
        img.style.transform = "";
        img.style.zIndex = "";
        img.style.transition = "transform 0.2s";
        draggedElement = null;
    });
}

function handleTouchEnd(e, card, canAction, state) {
    const touch = e.changedTouches[0];
    const closeZoneEl = document.getElementById('close-zone');
    
    let inCloseZone = false;
    if (closeZoneEl) {
        const rect = closeZoneEl.getBoundingClientRect();
        inCloseZone = (
            touch.clientX >= rect.left && touch.clientX <= rect.right &&
            touch.clientY >= rect.top && touch.clientY <= rect.bottom
        );
    }

    if (touchState.hasMoved) {
        if (inCloseZone && canAction) {
            sendAction("close", { card });
        } else {
            // Scambio posizioni locale
            draggedElement.style.visibility = 'hidden';
            const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
            draggedElement.style.visibility = 'visible';
            const targetCard = targetEl?.closest('.touchable-card');
            
            if (targetCard && targetCard !== draggedElement) {
                const fromIdx = parseInt(draggedElement.dataset.index);
                const toIdx = parseInt(targetCard.dataset.index);
                [localHandOrder[fromIdx], localHandOrder[toIdx]] = [localHandOrder[toIdx], localHandOrder[fromIdx]];
            }
            renderPlayerHand(state);
        }
    } else if (canAction) {
        // Tap semplice: Scarta carta
        sendAction("discard", { card });
    }
}

function handleGameOver(data) {
    isShowingResults = true;
    const isMe = data.winner === myPlayerIdx;
    
    // Suono Gatto se chiusura immediata (Conga!)
    if (data.instant_win) {
        //.play().catch(e => console.log("Audio play blocked"));
    }

    // Qui potresti chiamare una funzione per mostrare le carte dell'avversario sul tavolo
    
    setTimeout(() => {
        const winMsg = isMe ? "CONGA! 🏆" : "L'avversario ha chiuso! ❌";
        const p0 = data.p0_points || 0;
        const p1 = data.p1_points || 0;
        alert(`${winMsg}\n\nPunti Round: Tu ${myPlayerIdx === 0 ? p0 : p1} - Avv ${myPlayerIdx === 0 ? p1 : p0}`);
        
        localHandOrder = null;
        UI.renderReadyButton(() => {
            isShowingResults = false;
            sendAction("ready_next_round");
        });
    }, 800);
}

init();