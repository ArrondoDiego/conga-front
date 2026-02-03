import { CONFIG } from './config.js';
import { initSocket, sendAction } from './socket.js';
import { UI } from './ui.js';

let myPlayerIdx = null;
let localHandOrder = null;
let draggedElement = null;
let touchState = { startX: 0, startY: 0, hasMoved: false };
let isShowingResults = false; // Stato per gestire la visualizzazione a fine round

function init() {
    initSocket((data) => {
        // Gestione fine round o gioco
        if (data.type === "game_over" || data.type === "round_over") {
            handleGameOver(data);
            return;
        }

        // Assegnazione indice giocatore (0 o 1)
        if (data.p_idx !== undefined) myPlayerIdx = data.p_idx;
        
        // Se riceviamo un sync e il gioco è ricominciato, resettiamo la visualizzazione risultati
        if (data.type === "sync" && data.game_started && isShowingResults) {
            isShowingResults = false;
        }

        // Sincronizzazione ordine locale carte
        if (data.hand && !isShowingResults) {
            if (!localHandOrder || localHandOrder.length !== data.hand.length) {
                localHandOrder = [...data.hand];
            } else {
                localHandOrder = localHandOrder.map(localCard => 
                    data.hand.find(serverCard => serverCard.s === localCard.s && serverCard.v === localCard.v) || localCard
                );
            }
        }
        
        // Renderizza il gioco solo se non siamo nella schermata dei risultati finali
        if (!isShowingResults) {
            renderGame(data);
        }
    });
}

function renderGame(state) {
    // Se il gioco non è iniziato, mostra il tasto pronto
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

    //UI.renderScore(state.scores, myPlayerIdx);

    const isMyTurn = state.turn === myPlayerIdx;
    const canDraw = isMyTurn && state.hand.length === 7;

    const deckCountEl = document.getElementById('deck-count');
    if (deckCountEl) deckCountEl.textContent = state.deck_count;

    const deckImg = document.getElementById('deck-img');
    if (deckImg) {
        deckImg.onclick = () => { if (canDraw) sendAction("draw_deck"); };
    }

    const discardPile = document.getElementById('discard-pile');
    if (discardPile) {
        discardPile.innerHTML = '';
        if (state.top_discard) {
            const top = UI.createCardElement(state.top_discard);
            top.onclick = () => { if (canDraw) sendAction("draw_discard"); };
            discardPile.appendChild(top);
        }
    }

    renderOpponentHand(state.opp_count);
    renderPlayerHand(state);
}

function renderOpponentHand(count) {
    const container = document.getElementById('opponent-hand');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        container.appendChild(UI.createCardElement(null, true));
    }
}

function renderPlayerHand(state) {
    const container = document.getElementById('player-hand');
    if (!container) return;
    
    container.innerHTML = '';
    const hand = localHandOrder || state.hand;
    const isMyTurn = state.turn === myPlayerIdx;

    if (isMyTurn && !isShowingResults) {
        debugHandAnalysis(hand);
    }
    
    hand.forEach((card, index) => {
        const img = UI.createCardElement(card);
        img.classList.add('touchable-card');
        img.dataset.index = index;
        
        setupTouchEvents(img, card, state, isMyTurn);
        container.appendChild(img);
    });
    UI.analyzeHandLog(state);
}

/**
 * Mostra le mani scoperte di entrambi i giocatori applicando l'opacità
 * alle carte che fanno parte di una combinazione (meld).
 */
function showFinalHands(data) {
    isShowingResults = true;
    const oppIdx = 1 - myPlayerIdx;
    
    // 1. Mostra mano avversario scoperta
    const oppContainer = document.getElementById('opponent-hand');
    if (oppContainer && data.hands_at_end) {
        oppContainer.innerHTML = '';
        const oppData = data.hands_at_end[oppIdx];
        oppData.cards.forEach(card => {
            const img = UI.createCardElement(card);
            const isMeld = oppData.melds.some(m => m.s === card.s && m.v === card.v);
            if (isMeld) img.classList.add('meld-card');
            oppContainer.appendChild(img);
        });
    }

    // 2. Mostra la propria mano scoperta
    const myContainer = document.getElementById('player-hand');
    if (myContainer && data.hands_at_end) {
        myContainer.innerHTML = '';
        const myData = data.hands_at_end[myPlayerIdx];
        myData.cards.forEach(card => {
            const img = UI.createCardElement(card);
            const isMeld = myData.melds.some(m => m.s === card.s && m.v === card.v);
            if (isMeld) img.classList.add('meld-card');
            myContainer.appendChild(img);
        });
    }
}

function handleGameOver(data) {
    console.log("Fine Round. Risultati:", data);

    const isMe = data.winner === myPlayerIdx;
    const winMsg = isMe ? "CONGA! Hai vinto il round! 🏆" : "L'avversario ha chiuso! ❌";
    
    const punteggiTotali = data.total_scores || [0, 0];
    UI.renderScore(punteggiTotali, myPlayerIdx);

    // Rivela le carte prima di mostrare l'alert
    showFinalHands(data);

    setTimeout(() => {
        const mioTotale = punteggiTotali[myPlayerIdx];
        const oppTotale = punteggiTotali[1 - myPlayerIdx];
        
        // Punti fatti nel round specifico
        const p0_round = data.p0_points || 0;
        const p1_round = data.p1_points || 0;
        const mieiPuntiRound = myPlayerIdx === 0 ? p0_round : p1_round;
        const oppPuntiRound = myPlayerIdx === 0 ? p1_round : p0_round;

        alert(`${winMsg}\n\nPunti Round: Tu ${mieiPuntiRound} - Avv ${oppPuntiRound}\nTotale Partita: Tu ${mioTotale} - Avv ${oppTotale}`);
        
        localHandOrder = null;
        UI.renderReadyButton(() => sendAction("ready_next_round"));
    }, 1000);
}

function setupTouchEvents(img, card, state, isMyTurn) {
    const canAction = isMyTurn && (state.hand.length === 8);

    img.addEventListener('touchstart', (e) => {
        if (isShowingResults) return; // Disabilita drag se il round è finito
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
            // Logica Scambio Carte Locale
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
        sendAction("discard", { card });
    }
}

function debugHandAnalysis(hand) {
    console.log("--- ANALISI MANO ATTUALE ---");
    const handStr = hand.map(c => `${c.v}${c.s[0]}`).join(", ");
    console.log("Carte:", handStr);

    // Raggruppa per valore (per Tris/Poker)
    const values = {};
    hand.forEach(c => {
        values[c.v] = (values[c.v] || 0) + 1;
    });

    const potentialSets = Object.keys(values).filter(v => values[v] >= 3);
    if (potentialSets.length > 0) {
        console.log("Combinazioni (Tris/Poker) trovate:", potentialSets);
    }

    // Raggruppa per seme (per Scale)
    const suits = { 'Denari': [], 'Bastoni': [], 'Coppe': [], 'Spade': [] };
    hand.forEach(c => suits[c.s].push(parseInt(c.v)));
    
    Object.keys(suits).forEach(s => {
        const vList = suits[s].sort((a, b) => a - b);
        if (vList.length >= 3) {
            // Controllo sequenza minima di 3
            let count = 1;
            for (let i = 1; i < vList.length; i++) {
                if (vList[i] === vList[i-1] + 1) {
                    count++;
                } else {
                    if (count >= 3) console.log(`Potenziale Scala di ${s} trovata!`);
                    count = 1;
                }
            }
            if (count >= 3) console.log(`Potenziale Scala di ${s} trovata!`);
        }
    });
    console.log("----------------------------");
}

init();