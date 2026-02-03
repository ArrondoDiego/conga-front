import { CONFIG } from './config.js';
import { initSocket, sendAction } from './socket.js';
import { UI } from './ui.js';

// --- CONFIGURAZIONE LOG (FLAG) ---
const DEBUG_CONFIG = {
    SHOW_SOCKET: false,      // Messaggi grezzi dal server
    SHOW_GAMEPLAY: true,    // Pesca, scarta, turni
    SHOW_AUDIO: true,       // Trigger dei suoni
    SHOW_ANALYSIS: false     // Suggerimenti Tris/Scale
};

// --- UTILITY DI LOGGING ---
const Logger = {
    socket: (data) => DEBUG_CONFIG.SHOW_SOCKET && console.log("%c🔌 [SOCKET]", "color: #9b59b6", data),
    audio: (msg) => DEBUG_CONFIG.SHOW_AUDIO && console.log(`%c🔊 [AUDIO] ${msg}`, "color: #f1c40f; font-weight: bold"),
    game: (msg, type = 'info') => {
        if (!DEBUG_CONFIG.SHOW_GAMEPLAY) return;
        const styles = {
            draw: "color: #3498db; font-weight: bold",
            discard: "color: #e67e22; font-weight: bold",
            info: "color: #bdc3c7"
        };
        console.log(`%c🎮 [GAME] ${msg}`, styles[type] || styles.info);
    },
    error: (msg) => console.error(`%c❌ [ERROR] ${msg}`, "background: red; color: white"),
    analysis: (msg) => DEBUG_CONFIG.SHOW_ANALYSIS && console.log(`%c💡 [TIPS] ${msg}`, "color: #2ecc71")
};

let myPlayerIdx = null;
let localHandOrder = null;
let draggedElement = null;
let touchState = { startX: 0, startY: 0, hasMoved: false };
let isShowingResults = false;
let lastTopDiscard = null; // Per tracciare lo scarto precedente

const audioRussia = new Audio('./sound/russia.mp3');
audioRussia.addEventListener('error', () => Logger.error("File audio non trovato in ./sound/russia.mpeg"));

function init() {
    Logger.game("Sistema Inizializzato");

    initSocket((data) => {
        Logger.socket(data);

        if (data.effect) {
            Logger.game(`Effetto speciale ricevuto dal server: ${data.effect}`, 'info');
        }

        // Controllo trigger audio
        if (data.effect === "russia") {
            Logger.audio("TRAPPOLE RUSSE! Pescata doppia dagli scarti rilevata.");
            audioRussia.pause();
            audioRussia.currentTime = 0; 
            audioRussia.play().catch(e => Logger.error("Audio bloccato dal browser."));
        }
        
        if (data.type === "game_over" || data.type === "round_over") {
            handleGameOver(data);
            return;
        }

        if (data.p_idx !== undefined) myPlayerIdx = data.p_idx;
        
        // Log Pesca (Confronto mano)
        if (data.hand && data.hand.length === 8 && localHandOrder?.length === 7) {
            const newCard = data.hand.find(h => !localHandOrder.some(l => l.s === h.s && l.v === h.v));
            if (newCard) Logger.game(`HAI PESCATO: ${newCard.v} di ${newCard.s}`, 'draw');
        }

        // Log Scarto
        if (data.top_discard) {
            if (!lastTopDiscard || (lastTopDiscard.s !== data.top_discard.s || lastTopDiscard.v !== data.top_discard.v)) {
                Logger.game(`CARTA SUL TAVOLO: ${data.top_discard.v} di ${data.top_discard.s}`, 'discard');
                lastTopDiscard = data.top_discard;
            }
        }

        // Gestione Audio
        if (data.effect === "russia" || data.effect === "double_discard_draw" || data.action === "double_discard_draw") {
            Logger.audio("Riproduzione effetto Russia (Doppia pescata)");
            audioRussia.pause();
            audioRussia.currentTime = 0; 
            audioRussia.play().catch(e => Logger.error("Audio bloccato: Interagisci con la pagina."));
        }

        // Sincronizzazione Mano
        if (data.hand && !isShowingResults) {
            if (!localHandOrder || localHandOrder.length !== data.hand.length) {
                localHandOrder = [...data.hand];
            } else {
                localHandOrder = localHandOrder.map(localCard => 
                    data.hand.find(serverCard => serverCard.s === localCard.s && serverCard.v === localCard.v) || localCard
                );
            }
        }
        
        if (!isShowingResults) renderGame(data);
    });

}

function debugHandAnalysis(hand) {
    if (!DEBUG_CONFIG.SHOW_ANALYSIS) return;
    
    const values = {};
    hand.forEach(c => values[c.v] = (values[c.v] || 0) + 1);
    const potentialSets = Object.keys(values).filter(v => values[v] >= 3);
    if (potentialSets.length > 0) Logger.analysis("Combinazioni (Tris/Poker): " + potentialSets.join(", "));

    const suits = { 'Denari': [], 'Bastoni': [], 'Coppe': [], 'Spade': [] };
    hand.forEach(c => suits[c.s].push(parseInt(c.v)));
    
    Object.keys(suits).forEach(s => {
        const vList = suits[s].sort((a, b) => a - b);
        let count = 1;
        for (let i = 1; i < vList.length; i++) {
            if (vList[i] === vList[i-1] + 1) count++;
            else {
                if (count >= 3) Logger.analysis(`Scala di ${s} trovata!`);
                count = 1;
            }
        }
        if (count >= 3) Logger.analysis(`Scala di ${s} trovata!`);
    });
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
        const isMyTurn = state.turn === myPlayerIdx;
        turnEl.textContent = isMyTurn ? "TUO TURNO" : "TURNO AVVERSARIO";
        turnEl.className = isMyTurn ? "my-turn" : "opp-turn";
    }

    UI.renderScore(state.scores, myPlayerIdx);
    const canDraw = (state.turn === myPlayerIdx) && state.hand.length === 7;

    const deckCountEl = document.getElementById('deck-count');
    if (deckCountEl) deckCountEl.textContent = state.deck_count;
    
    const deckImg = document.getElementById('deck-img');
    if (deckImg) deckImg.onclick = () => { if (canDraw) sendAction("draw_deck"); };

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

function renderPlayerHand(state) {
    const container = document.getElementById('player-hand');
    if (!container) return;
    container.innerHTML = '';
    const hand = localHandOrder || state.hand;

    if (state.turn === myPlayerIdx && !isShowingResults) debugHandAnalysis(hand);

    hand.forEach((card, index) => {
        const img = UI.createCardElement(card);
        img.classList.add('touchable-card');
        img.dataset.index = index;
        setupTouchEvents(img, card, state, state.turn === myPlayerIdx);
        container.appendChild(img);
    });
}

function renderOpponentHand(count) {
    const container = document.getElementById('opponent-hand');
    if (!container) return;
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

function handleGameOver(data) {
    isShowingResults = true;
    const isMe = data.winner === myPlayerIdx;
    
    setTimeout(() => {
        const winMsg = isMe ? "CONGA! 🏆" : "L'avversario ha chiuso! ❌";
        alert(`${winMsg}\n\nPunti Round: Tu ${myPlayerIdx === 0 ? data.p0_points : data.p1_points} - Avv ${myPlayerIdx === 0 ? data.p1_points : data.p0_points}`);
        
        localHandOrder = null;
        UI.renderReadyButton(() => {
            isShowingResults = false;
            sendAction("ready_next_round");
        });
    }, 800);
}

init();