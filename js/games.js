import { CONFIG } from './config.js';
import { initSocket, sendAction } from './socket.js';
import { UI } from './ui.js';

let myPlayerIdx = null;
let localHandOrder = null;
let draggedElement = null;
let touchState = { startX: 0, startY: 0, hasMoved: false };

function init() {
    initSocket((data) => {
        // Gestione fine round o gioco
        if (data.type === "game_over" || data.type === "round_over") {
            handleGameOver(data);
            return;
        }

        // Assegnazione indice giocatore (0 o 1)
        if (data.p_idx !== undefined) myPlayerIdx = data.p_idx;
        
        // Sincronizzazione ordine locale carte per il riordino manuale
        if (data.hand) {
            if (!localHandOrder || localHandOrder.length !== data.hand.length) {
                localHandOrder = [...data.hand];
            } else {
                // Sincronizza i dati mantenendo la posizione scelta dall'utente
                localHandOrder = localHandOrder.map(localCard => 
                    data.hand.find(serverCard => serverCard.s === localCard.s && serverCard.v === localCard.v) || localCard
                );
            }
        }
        
        renderGame(data);
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
    
    // Rimuove il tasto pronto se presente
    document.getElementById('ready-btn')?.remove();

    // Aggiorna Info Turno (usa ?. per evitare errori se l'ID manca)
    const turnEl = document.getElementById('turn-info');
    if (turnEl) {
        turnEl.textContent = state.turn === myPlayerIdx ? "TUO TURNO" : "TURNO AVVERSARIO";
        turnEl.className = state.turn === myPlayerIdx ? "my-turn" : "opp-turn";
    }

    // Aggiorna Punteggi
    UI.renderScore(state.scores, myPlayerIdx);

    const isMyTurn = state.turn === myPlayerIdx;
    const canDraw = isMyTurn && state.hand.length === 7;

    // Gestione Mazzo (Deck)
    const deckCountEl = document.getElementById('deck-count');
    if (deckCountEl) deckCountEl.textContent = state.deck_count;

    const deckImg = document.getElementById('deck-img');
    if (deckImg) {
        deckImg.onclick = () => { if (canDraw) sendAction("draw_deck"); };
    }

    // Gestione Pozzo Scarti (Discard Pile)
    const discardPile = document.getElementById('discard-pile');
    if (discardPile) {
        discardPile.innerHTML = '';
        if (state.top_discard) {
            const top = UI.createCardElement(state.top_discard);
            top.onclick = () => { if (canDraw) sendAction("draw_discard"); };
            discardPile.appendChild(top);
        }
    }

    // Render Mani
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

    // Log di analisi mano (apri F12 nel browser per vederli)
    if (isMyTurn) UI.analyzeHandLog(state);

    hand.forEach((card, index) => {
        const img = UI.createCardElement(card);
        img.classList.add('touchable-card');
        img.dataset.index = index;
        
        setupTouchEvents(img, card, state, isMyTurn);
        container.appendChild(img);
    });
}

function setupTouchEvents(img, card, state, isMyTurn) {
    const canAction = isMyTurn && (state.hand.length === 8);

    img.addEventListener('touchstart', (e) => {
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
        // Tap semplice: scarta la carta
        sendAction("discard", { card });
    }
}

function handleGameOver(data) {
    console.log("Dati ricevuti alla chiusura:", data); // Debug fondamentale

    const isMe = data.winner === myPlayerIdx;
    const winMsg = isMe ? "CONGA! Hai vinto il round! 🏆" : "L'avversario ha chiuso! ❌";
    
    // Salviamo i valori subito per evitare che vadano persi nel timeout
    const p0_round = data.p0_points || 0;
    const p1_round = data.p1_points || 0;
    const punteggiTotali = data.total_scores || [0, 0];

    // Aggiorna subito la UI
    UI.renderScore(punteggiTotali, myPlayerIdx);

    setTimeout(() => {
        const mioTotale = punteggiTotali[myPlayerIdx];
        const oppTotale = punteggiTotali[1 - myPlayerIdx];
        
        alert(`${winMsg}\n\nPunti Round: Tu ${myPlayerIdx === 0 ? p0_round : p1_round} - Avv ${myPlayerIdx === 0 ? p1_round : p0_round}\nTotale Partita: Tu ${mioTotale} - Avv ${oppTotale}`);
        
        localHandOrder = null;
        UI.renderReadyButton(() => sendAction("ready_next_round"));
    }, 500);
}

init();