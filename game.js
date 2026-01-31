const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

/** * SERVER CONFIGURATION */
const RAILWAY_DOMAIN = 'web-production-1a2e.up.railway.app'; 
// const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
// Ricordati di rimettere il link Railway quando carichi online!
// const serverUrl = `wss://${RAILWAY_DOMAIN}`;
const serverUrl = 'ws://localhost:5555';

const socket = new WebSocket(serverUrl);

// GAME STATE & ASSETS
let gameState = null;
let draggedCard = null;
let offset = { x: 0, y: 0 };
let mouse = { x: 0, y: 0 };
const images = {};

// VIRTUAL RESOLUTION
const V_WIDTH = 900;
const V_HEIGHT = 700;
const CARD_W = 100; // Aumentate per mobile
const CARD_H = 145; 

const suitsMap = { 'Ori': 'Denari', 'Bastoni': 'Bastoni', 'Coppe': 'Coppe', 'Spade': 'Spade' };
const valuesMap = { 'F': '08', 'C': '09', 'R': '10' };

/**
 * RESPONSIVE SCALING
 */
function resizeCanvas() {
    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;
    const gameRatio = V_WIDTH / V_HEIGHT;
    const screenRatio = containerWidth / containerHeight;

    if (screenRatio > gameRatio) {
        canvas.style.height = containerHeight + "px";
        canvas.style.width = (containerHeight * gameRatio) + "px";
    } else {
        canvas.style.width = containerWidth + "px";
        canvas.style.height = (containerWidth / gameRatio) + "px";
    }
}
//window.addEventListener('resize', resizeCanvas);
//window.addEventListener('load', resizeCanvas);
//resizeCanvas();

/**
 * ASSET PRELOADING
 */
function preloadImages() {
    const suits = ['Bastoni', 'Coppe', 'Denari', 'Spade'];
    const values = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'];
    let loaded = 0;
    const total = (suits.length * values.length) + 1;
    const checkLoad = () => { if (++loaded === total) renderLoop(); };

    suits.forEach(s => {
        values.forEach(v => {
            const key = `${s}${v}`;
            images[key] = new Image();
            images[key].src = `assets/${key}.png`;
            images[key].onload = checkLoad;
            images[key].onerror = checkLoad;
        });
    });
    images['_Dorso'] = new Image();
    images['_Dorso'].src = `assets/Dorso.png`; 
    images['_Dorso'].onload = checkLoad;
}

/**
 * POSIZIONAMENTO CARTE (3 sopra, 4 sotto)
 */
function getCardHandPos(index) {
    const startX = 180;  // Spostato per centrare nel 900x700
    const startY = 380;  // Altezza riga superiore
    const gapX = 130;
    const gapY = 160;

    let row = index < 3 ? 0 : 1;
    let col = index < 3 ? index : index - 3;
    let offsetX = row === 0 ? 65 : 0; // Offset per centrare la riga da 3

    return {
        x: startX + (col * gapX) + offsetX,
        y: startY + (row * gapY)
    };
}

/**
 * NETWORK HANDLERS
 */
socket.onmessage = (event) => { gameState = JSON.parse(event.data); };

/**
 * DRAWING LOGIC
 */
function drawCard(card, x, y, isBack = false) {
    if (isBack) {
        if (images['_Dorso']) ctx.drawImage(images['_Dorso'], x, y, CARD_W, CARD_H);
        return;
    }
    if (card) {
        let vStr = valuesMap[card.v] || card.v.toString().padStart(2, '0');
        let sStr = suitsMap[card.s] || card.s;
        const img = images[`${sStr}${vStr}`];
        if (img) ctx.drawImage(img, x, y, CARD_W, CARD_H);
    }
}

function renderLoop() {
    ctx.fillStyle = "#1a4a1e"; 
    ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

    if (!gameState || !gameState.game_started) {
        ctx.fillStyle = "white"; 
        ctx.textAlign = "center";
        ctx.font = "30px Arial";
        ctx.fillText("IN ATTESA DI UN AVVERSARIO...", V_WIDTH/2, V_HEIGHT/2);
    } else {
        // 1. AREA AVVERSARIO (Semplificata in alto)
        for (let i = 0; i < gameState.opp_count; i++) {
            drawCard(null, 250 + (i * 40), 20, true);
        }

        // 2. CENTRO (Mazzo e Scarto)
        drawCard(null, 250, 180, true); // Mazzo
        if (gameState.top_discard) drawCard(gameState.top_discard, 450, 180); // Scarto

        // Area "CHIUDI" (zona bersaglio a destra dello scarto)
        ctx.strokeStyle = "rgba(255,255,0,0.5)";
        ctx.lineWidth = 3;
        ctx.strokeRect(650, 180, CARD_W, CARD_H);
        ctx.fillStyle = "yellow";
        ctx.font = "14px Arial";
        ctx.fillText("CHIUDI", 700, 170);

        // 3. MANO GIOCATORE (3 sopra, 4 sotto)
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

        // 4. TRASCINAMENTO
        if (draggedCard) {
            drawCard(draggedCard.card, mouse.x + offset.x, mouse.y + offset.y);
        }

        // 5. HUD
        ctx.fillStyle = "white";
        ctx.textAlign = "left";
        ctx.fillText(`TU: ${gameState.scores[gameState.p_idx]}`, 30, 40);
        ctx.textAlign = "right";
        ctx.fillText(`AVV: ${gameState.scores[1-gameState.p_idx]}`, V_WIDTH - 30, 40);
    }
    requestAnimationFrame(renderLoop);
}

/**
 * INPUT LOGIC
 */
function getScaledPos(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (clientX - rect.left) * (V_WIDTH / rect.width),
        y: (clientY - rect.top) * (V_HEIGHT / rect.height)
    };
}

function handleStart(x, y) {
    if (!gameState || gameState.game_over) return;
    mouse.x = x; mouse.y = y;

    // Controllo collisione mano
    gameState.hand.forEach((card, i) => {
        const p = getCardHandPos(i);
        if (x > p.x && x < p.x + CARD_W && y > p.y && y < p.y + CARD_H) {
            draggedCard = { card, index: i };
            offset.x = p.x - x;
            offset.y = p.y - y;
        }
    });

    // Pesca
    if (gameState.turn === gameState.p_idx && gameState.hand.length === 7) {
        if (x > 250 && x < 250+CARD_W && y > 180 && y < 180+CARD_H) 
            socket.send(JSON.stringify({action: "draw_deck"}));
        if (x > 450 && x < 450+CARD_W && y > 180 && y < 180+CARD_H) 
            socket.send(JSON.stringify({action: "draw_discard"}));
    }
}

function handleEnd() {
    if (draggedCard) {
        // Scarta
        if (mouse.x > 450 && mouse.x < 450+CARD_W && mouse.y > 180 && mouse.y < 180+CARD_H) 
            socket.send(JSON.stringify({action: "discard", card: draggedCard.card}));
        // Chiudi
        else if (mouse.x > 650 && mouse.x < 650+CARD_W && mouse.y > 180 && mouse.y < 180+CARD_H) 
            socket.send(JSON.stringify({action: "close", card: draggedCard.card}));
        
        draggedCard = null;
    }
}

// Event Listeners
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
    e.preventDefault();
    const pos = getScaledPos(e.touches[0].clientX, e.touches[0].clientY);
    mouse.x = pos.x; mouse.y = pos.y;
}, { passive: false });
canvas.addEventListener('touchend', handleEnd);

preloadImages();