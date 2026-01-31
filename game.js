const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const RAILWAY_DOMAIN = 'web-production-1a2e.up.railway.app'; 
const isLocal = window.location.hostname === "localhost" || 
                window.location.hostname === "127.0.0.1" || 
                window.location.href === "file:";

const serverUrl = isLocal ? 'ws://localhost:5555' : `wss://${RAILWAY_DOMAIN}`;
const socket = new WebSocket(serverUrl);

const V_WIDTH = 900;
const V_HEIGHT = 700;
const CARD_W = 85; 
const CARD_H = 140; 

let gameState = null;
let draggedCard = null;
let mouse = { x: 0, y: 0 };
const images = {};

// Logica Nomi e Monitoraggio
const myName = "Player_" + Math.floor(Math.random() * 999);
let gameStartedLogged = false;
let lastTurnLogged = -1;
let p0_turns = 0, p1_turns = 0;

const suitsMap = { 'Ori': 'Denari', 'Bastoni': 'Bastoni', 'Coppe': 'Coppe', 'Spade': 'Spade' };
const valuesMap = { 'F': '08', 'C': '09', 'R': '10' };

function resizeCanvas() {
    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;
    const gameRatio = V_WIDTH / V_HEIGHT;
    const screenRatio = containerWidth / containerHeight;
    canvas.style.width = (screenRatio > gameRatio) ? (containerHeight * gameRatio) + "px" : containerWidth + "px";
    canvas.style.height = (screenRatio > gameRatio) ? containerHeight + "px" : (containerWidth / gameRatio) + "px";
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function preloadImages() {
    const suits = ['Bastoni', 'Coppe', 'Denari', 'Spade'];
    const values = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'];
    let loaded = 0;
    const total = 41; 

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
    
    // CARICAMENTO DORSO (Sempre Dorso.png)
    images['Dorso'] = new Image();
    images['Dorso'].src = `assets/Dorso.png`; 
    images['Dorso'].onload = checkLoad;
    images['Dorso'].onerror = () => { console.error("Immagine Dorso.png non trovata!"); checkLoad(); };
}

socket.onmessage = (event) => { 
    gameState = JSON.parse(event.data);

    // LOG: Giocatori trovati all'avvio
    if (gameState.game_started && !gameStartedLogged) {
        console.log(`%c PARTITA COMINCIATA! `, 'background: #222; color: #00ff00; font-size: 14px;');
        console.log(`GIOCATORE 0: ${gameState.p_idx === 0 ? myName + " (TU)" : "Avversario"}`);
        console.log(`GIOCATORE 1: ${gameState.p_idx === 1 ? myName + " (TU)" : "Avversario"}`);
        gameStartedLogged = true;
    }

    // LOG: Conteggio turni per ogni giocatore
    if (gameState.turn !== lastTurnLogged) {
        if (gameState.turn === 0) p0_turns++; else p1_turns++;
        console.log(`TURNO PASSA A: Player ${gameState.turn} | Turni totali -> P0: ${p0_turns}, P1: ${p1_turns}`);
        lastTurnLogged = gameState.turn;
    }
};

function drawCard(card, x, y, angle = 0, isBack = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    if (isBack) {
        if (images['Dorso']) ctx.drawImage(images['Dorso'], -CARD_W/2, -CARD_H/2, CARD_W, CARD_H);
    } else if (card) {
        let vStr = valuesMap[card.v] || card.v.toString().padStart(2, '0');
        let sStr = suitsMap[card.s];
        const img = images[`${sStr}${vStr}`];
        if (img) ctx.drawImage(img, -CARD_W/2, -CARD_H/2, CARD_W, CARD_H);
    }
    ctx.restore();
}

function renderLoop() {
    ctx.fillStyle = "#1a4a1e"; 
    ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

    if (!gameState || !gameState.game_started) {
        ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.font = "22px Arial";
        ctx.fillText(`CIAO ${myName}`, V_WIDTH/2, V_HEIGHT/2 - 20);
        ctx.fillText("IN ATTESA DI UN AVVERSARIO...", V_WIDTH/2, V_HEIGHT/2 + 20);
    } else {
        // Avversario (Sopra)
        for (let i = 0; i < gameState.opp_count; i++) {
            const angle = (i - (gameState.opp_count-1)/2) * 0.08;
            drawCard(null, V_WIDTH/2 + (i*15) - (gameState.opp_count*7.5), 80, angle + Math.PI, true);
        }

        // Tavolo (Centro)
        drawCard(null, 380, 320, 0, true);
        if (gameState.top_discard) drawCard(gameState.top_discard, 520, 320, 0, false);

        // Mano (Sotto a ventaglio)
        const pivotX = V_WIDTH / 2; const pivotY = V_HEIGHT + 300; 
        gameState.hand.forEach((card, i) => {
            if (draggedCard && draggedCard.index === i) return;
            const angle = (i - (gameState.hand.length - 1) / 2) * 0.12;
            const x = pivotX + Math.sin(angle) * 750;
            const y = pivotY - Math.cos(angle) * 750;
            if (gameState.turn === gameState.p_idx) { ctx.shadowBlur = 15; ctx.shadowColor = "#00ff00"; }
            drawCard(card, x, y, angle);
            ctx.shadowBlur = 0;
        });

        if (draggedCard) drawCard(draggedCard.card, mouse.x, mouse.y - 50, 0);

        document.getElementById('statusText').innerText = 
            `${myName} (${gameState.scores[gameState.p_idx]}) vs OPPONENT (${gameState.scores[1-gameState.p_idx]}) | TURNO: ${gameState.turn === gameState.p_idx ? 'TUO' : 'AVVERSARIO'}`;
    }
    requestAnimationFrame(renderLoop);
}

// Interazione
function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
    const clientY = (e.touches ? e.touches[0].clientY : e.clientY);
    return { x: (clientX - rect.left) * (V_WIDTH / rect.width), y: (clientY - rect.top) * (V_HEIGHT / rect.height) };
}

const handleDown = (e) => {
    const pos = getPos(e); mouse = pos;
    if (!gameState) return;
    gameState.hand.forEach((card, i) => {
        const angle = (i - (gameState.hand.length - 1) / 2) * 0.12;
        const x = (V_WIDTH / 2) + Math.sin(angle) * 750;
        const y = (V_HEIGHT + 300) - Math.cos(angle) * 750;
        if (Math.abs(pos.x - x) < 45 && Math.abs(pos.y - y) < 70) draggedCard = { card, index: i };
    });
    if (gameState.turn === gameState.p_idx && gameState.hand.length === 7) {
        if (Math.abs(pos.x - 380) < 45 && Math.abs(pos.y - 320) < 70) socket.send(JSON.stringify({action: "draw_deck"}));
        if (gameState.top_discard && Math.abs(pos.x - 520) < 45 && Math.abs(pos.y - 320) < 70) socket.send(JSON.stringify({action: "draw_discard"}));
    }
};

canvas.addEventListener('mousedown', handleDown);
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handleDown(e); }, {passive: false});
window.addEventListener('mousemove', (e) => { mouse = getPos(e); });
window.addEventListener('touchmove', (e) => { e.preventDefault(); mouse = getPos(e); }, {passive: false});
window.addEventListener('mouseup', () => {
    if (draggedCard) {
        if (Math.abs(mouse.x - 520) < 60 && Math.abs(mouse.y - 320) < 80) socket.send(JSON.stringify({action: "discard", card: draggedCard.card}));
        else if (mouse.x > 750 && mouse.y < 200) socket.send(JSON.stringify({action: "close", card: draggedCard.card}));
        draggedCard = null;
    }
});

preloadImages();