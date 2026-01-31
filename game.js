const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

/**
 * CONFIGURAZIONE SERVER
 */
const RAILWAY_DOMAIN = 'web-production-1a2e.up.railway.app'; 
const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

// Usa localhost se sei in locale, altrimenti Railway
// const serverUrl = isLocal ? 'ws://localhost:5555' : `wss://${RAILWAY_DOMAIN}`;
// const socket = new WebSocket(serverUrl);
const serverUrl = 'ws://localhost:5555';
const socket = new WebSocket(serverUrl);
/**
 * COSTANTI GRAFICHE E STATO
 */
const V_WIDTH = 900;  // Larghezza virtuale
const V_HEIGHT = 700; // Altezza virtuale
const CARD_W = 90;    // Larghezza base della carta

let gameState = null;
let draggedCard = null;
let offset = { x: 0, y: 0 };
let mouse = { x: 0, y: 0 };
const images = {};

// Mapping per i nomi dei file e semi
const suitsMap = { 'Ori': 'Denari', 'Denari': 'Denari', 'Bastoni': 'Bastoni', 'Coppe': 'Coppe', 'Spade': 'Spade' };
const valuesMap = { 'F': '08', 'C': '09', 'R': '10' };

/**
 * GESTIONE RESIZE (Previene lo stretch del Canvas)
 */
function resizeCanvas() {
    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;
    const gameRatio = V_WIDTH / V_HEIGHT;
    const screenRatio = containerWidth / containerHeight;

    if (screenRatio > gameRatio) {
        // Schermo più largo del gioco: fissiamo l'altezza
        canvas.style.height = containerHeight + "px";
        canvas.style.width = (containerHeight * gameRatio) + "px";
    } else {
        // Schermo più stretto del gioco: fissiamo la larghezza
        canvas.style.width = containerWidth + "px";
        canvas.style.height = (containerWidth / gameRatio) + "px";
    }
}
window.addEventListener('resize', resizeCanvas);
window.addEventListener('load', resizeCanvas);
resizeCanvas();

/**
 * CARICAMENTO IMMAGINI
 */
function preloadImages() {
    const suits = ['Bastoni', 'Coppe', 'Denari', 'Spade'];
    const values = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'];
    let loaded = 0;
    const total = 41; // 40 carte + 1 dorso

    const checkLoad = () => { 
        loaded++;
        if (loaded === total) renderLoop(); 
    };

    suits.forEach(s => {
        values.forEach(v => {
            const key = `${s}${v}`;
            images[key] = new Image();
            images[key].src = `assets/${key}.png`;
            images[key].onload = checkLoad;
            images[key].onerror = checkLoad;
        });
    });

    images['Dorso'] = new Image();
    images['Dorso'].src = `assets/Dorso.png`; 
    images['Dorso'].onload = checkLoad;
    images['Dorso'].onerror = checkLoad;
}

/**
 * COORDINATE MANO (3 sopra, 4 sotto)
 */
function getCardHandPos(index) {
    const startX = 180;
    const startY = 380;
    const gapX = 135;
    const gapY = 160;

    let row = index < 3 ? 0 : 1;
    let col = index < 3 ? index : index - 3;
    let offsetX = row === 0 ? 65 : 0; 

    return {
        x: startX + (col * gapX) + offsetX,
        y: startY + (row * gapY)
    };
}

/**
 * LOGICA DI DISEGNO CARTA (Mantiene proporzioni immagine)
 */
function drawCard(card, x, y, isBack = false) {
    let img = isBack ? images['Dorso'] : null;

    if (!isBack && card) {
        let vStr = valuesMap[card.v] || card.v.toString().padStart(2, '0');
        let sStr = suitsMap[card.s] || card.s;
        img = images[`${sStr}${vStr}`];
    }

    if (img && img.complete && img.naturalWidth !== 0) {
        // Calcola l'altezza basandosi sul rapporto originale della foto
        const ratio = img.naturalHeight / img.naturalWidth;
        const realH = CARD_W * ratio;
        ctx.drawImage(img, x, y, CARD_W, realH);
    } else {
        // Fallback rettangolo se l'immagine non carica
        ctx.fillStyle = "#fff";
        ctx.fillRect(x, y, CARD_W, CARD_W * 1.5);
        ctx.strokeRect(x, y, CARD_W, CARD_W * 1.5);
    }
}

/**
 * LOOP PRINCIPALE
 */
function renderLoop() {
    ctx.clearRect(0, 0, V_WIDTH, V_HEIGHT);
    ctx.fillStyle = "#1a4a1e"; 
    ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

    if (!gameState || !gameState.game_started) {
        ctx.fillStyle = "white"; 
        ctx.textAlign = "center";
        ctx.font = "30px Arial";
        ctx.fillText("IN ATTESA DI UN AVVERSARIO...", V_WIDTH/2, V_HEIGHT/2);
    } else {
        // 1. Avversario
        for (let i = 0; i < gameState.opp_count; i++) {
            drawCard(null, 250 + (i * 40), 20, true);
        }

        // 2. Centro
        drawCard(null, 250, 180, true);
        if (gameState.top_discard) drawCard(gameState.top_discard, 450, 180);

        // Zona "Chiudi"
        ctx.strokeStyle = "rgba(255,255,0,0.5)";
        ctx.strokeRect(650, 180, CARD_W, CARD_W * 1.5);
        ctx.fillStyle = "yellow";
        ctx.fillText("CHIUDI", 700, 170);

        // 3. Mano Giocatore
        gameState.hand.forEach((card, i) => {
            if (draggedCard && draggedCard.index === i) return;
            const pos = getCardHandPos(i);
            if (gameState.turn === gameState.p_idx) {
                ctx.shadowBlur = 10;
                ctx.shadowColor = "#00ff00";
            }
            drawCard(card, pos.x, pos.y);
            ctx.shadowBlur = 0;
        });

        // 4. Trascinamento
        if (draggedCard) {
            drawCard(draggedCard.card, mouse.x + offset.x, mouse.y + offset.y);
        }

        // 5. UI Punteggi
        ctx.fillStyle = "white";
        ctx.textAlign = "left";
        ctx.font = "20px Arial";
        ctx.fillText(`TU: ${gameState.scores[gameState.p_idx]}`, 30, 40);
        ctx.textAlign = "right";
        ctx.fillText(`AVV: ${gameState.scores[1-gameState.p_idx]}`, V_WIDTH - 30, 40);
    }
    requestAnimationFrame(renderLoop);
}

/**
 * GESTIONE INPUT (Touch & Mouse)
 */
function getScaledPos(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (clientX - rect.left) * (V_WIDTH / rect.width),
        y: (clientY - rect.top) * (V_HEIGHT / rect.height)
    };
}

function handleStart(x, y) {
    if (!gameState) return;
    mouse.x = x; mouse.y = y;

    gameState.hand.forEach((card, i) => {
        const p = getCardHandPos(i);
        const h = CARD_W * 1.5; // Stima altezza per collisione
        if (x > p.x && x < p.x + CARD_W && y > p.y && y < p.y + h) {
            draggedCard = { card, index: i };
            offset.x = p.x - x;
            offset.y = p.y - y;
        }
    });

    if (gameState.turn === gameState.p_idx && gameState.hand.length === 7) {
        if (x > 250 && x < 250+CARD_W && y > 180 && y < 180+300) 
            socket.send(JSON.stringify({action: "draw_deck"}));
        if (x > 450 && x < 450+CARD_W && y > 180 && y < 180+300) 
            socket.send(JSON.stringify({action: "draw_discard"}));
    }
}

function handleEnd() {
    if (draggedCard) {
        const h = CARD_W * 1.5;
        if (mouse.x > 450 && mouse.x < 450+CARD_W && mouse.y > 180 && mouse.y < 180+h) 
            socket.send(JSON.stringify({action: "discard", card: draggedCard.card}));
        else if (mouse.x > 650 && mouse.x < 650+CARD_W && mouse.y > 180 && mouse.y < 180+h) 
            socket.send(JSON.stringify({action: "close", card: draggedCard.card}));
        draggedCard = null;
    }
}

socket.onmessage = (event) => { gameState = JSON.parse(event.data); };

canvas.addEventListener('mousedown', (e) => {
    const pos = getScaledPos(e.clientX, e.clientY);
    handleStart(pos.x, pos.y);
});
canvas.addEventListener('mousemove', (e) => {
    const pos = getScaledPos(e.clientX, e.clientY);
    mouse.x = pos.x; mouse.y = pos.y;
});
window.addEventListener('mouseup', handleEnd);

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const pos = getScaledPos(e.touches[0].clientX, e.touches[0].clientY);
    handleStart(pos.x, pos.y);
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
    const pos = getScaledPos(e.touches[0].clientX, e.touches[0].clientY);
    mouse.x = pos.x; mouse.y = pos.y;
});
canvas.addEventListener('touchend', handleEnd);

preloadImages();