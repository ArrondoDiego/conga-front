const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

/** * CONFIGURAZIONE SERVER
 * Sostituisci il dominio qui sotto con quello fornito da Railway
 */
const RAILWAY_DOMAIN = 'web-production-1a2e.up.railway.app'; 

const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const serverUrl = isLocal ? 'ws://localhost:5555' : `wss://${RAILWAY_DOMAIN}`;

console.log(`Tentativo di connessione a: ${serverUrl}`);
const socket = new WebSocket(serverUrl);

let gameState = null;
let draggedCard = null;
let offset = { x: 0, y: 0 };
let mouse = { x: 0, y: 0 };
const images = {};

// Dimensioni Carte
const CARD_W = 75; 
const CARD_H = 126; 

// Mapping per i nomi dei file (Basato sulla tua cartella assets)
const suitsMap = { 'Ori': 'Denari', 'Bastoni': 'Bastoni', 'Coppe': 'Coppe', 'Spade': 'Spade' };
const valuesMap = { 'F': '08', 'C': '09', 'R': '10' };

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
            images[key].onerror = () => {
                console.warn(`Immagine mancante: assets/${key}.png`);
                checkLoad();
            };
        });
    });
    images['_Dorso'] = new Image();
    images['_Dorso'].src = `assets/Dorso.png`;
    images['_Dorso'].onload = checkLoad;
}

socket.onmessage = (event) => {
    gameState = JSON.parse(event.data);
};

socket.onopen = () => console.log("Connesso al server con successo!");
socket.onerror = (err) => console.error("Errore WebSocket:", err);
socket.onclose = () => console.warn("Connessione chiusa.");

function drawCard(card, x, y, isBack = false) {
    if (isBack) {
        if (images['_Dorso']) ctx.drawImage(images['_Dorso'], x, y, CARD_W, CARD_H);
        return;
    }
    if (card) {
        let vStr = valuesMap[card.v] || card.v.padStart(2, '0');
        let sStr = suitsMap[card.s];
        const img = images[`${sStr}${vStr}`];
        if (img) {
            ctx.drawImage(img, x, y, CARD_W, CARD_H);
        } else {
            // Fallback se l'immagine non carica
            ctx.fillStyle = "white";
            ctx.fillRect(x, y, CARD_W, CARD_H);
            ctx.strokeStyle = "black";
            ctx.strokeRect(x, y, CARD_W, CARD_H);
            ctx.fillStyle = "black";
            ctx.fillText(`${card.v}${card.s[0]}`, x + 5, y + 20);
        }
    }
}

function renderLoop() {
    ctx.fillStyle = "#1b5e20"; // Tavolo Verde
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!gameState || !gameState.game_started) {
        ctx.fillStyle = "white"; 
        ctx.textAlign = "center";
        ctx.font = "24px Arial";
        ctx.fillText("IN ATTESA DI UN AVVERSARIO...", canvas.width/2, canvas.height/2);
    } else {
        // Punteggi
        ctx.fillStyle = "white";
        ctx.textAlign = "left";
        ctx.font = "16px Arial";
        ctx.fillText(`TU: ${gameState.scores[gameState.p_idx]}`, 820, 30);
        ctx.fillText(`AVVERSARIO: ${gameState.scores[1-gameState.p_idx]}`, 820, 60);

        // Mazzo e Scarti
        drawCard(null, 350, 250, true);
        if (gameState.top_discard) drawCard(gameState.top_discard, 450, 250);

        // Turno
        if (gameState.turn === gameState.p_idx && !gameState.game_over) {
            ctx.strokeStyle = "#00ff00"; 
            ctx.lineWidth = 3;
            ctx.strokeRect(95, 515, (gameState.hand.length * 95), CARD_H + 10);
        }

        // Mano Avversario
        for (let i = 0; i < gameState.opp_count; i++) drawCard(null, 100+i*95, 50, true);

        // Mano Giocatore
        gameState.hand.forEach((card, i) => {
            if (draggedCard && draggedCard.index === i) return;
            drawCard(card, 100+i*95, 520);
        });

        // Trascinamento
        if (draggedCard) {
            drawCard(draggedCard.card, mouse.x + offset.x, mouse.y + offset.y);
        }

        if (gameState.game_over) {
            ctx.fillStyle = "rgba(0,0,0,0.7)";
            ctx.fillRect(0,0,canvas.width, canvas.height);
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.fillText("ROUND FINITO", canvas.width/2, canvas.height/2);
            ctx.fillText("Clicca per continuare", canvas.width/2, canvas.height/2 + 40);
        }
    }
    requestAnimationFrame(renderLoop);
}

// Eventi Mouse
canvas.addEventListener('mousedown', (e) => {
    if (!gameState || gameState.game_over) return;
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top;
    
    gameState.hand.forEach((card, i) => {
        const x = 100+i*95, y = 520;
        if (mouse.x > x && mouse.x < x+CARD_W && mouse.y > y && mouse.y < y+CARD_H) {
            draggedCard = { card, index: i };
            offset.x = x - mouse.x; offset.y = y - mouse.y;
        }
    });

    if (gameState.turn === gameState.p_idx && gameState.hand.length === 7) {
        if (mouse.x > 350 && mouse.x < 350+CARD_W && mouse.y > 250 && mouse.y < 250+CARD_H) 
            socket.send(JSON.stringify({action: "draw_deck"}));
        if (gameState.top_discard && mouse.x > 450 && mouse.x < 450+CARD_W && mouse.y > 250 && mouse.y < 250+CARD_H) 
            socket.send(JSON.stringify({action: "draw_discard"}));
    }
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top;
});

canvas.addEventListener('mouseup', () => {
    if (draggedCard) {
        // Scarto
        if (mouse.x > 450 && mouse.x < 525 && mouse.y > 250 && mouse.y < 376) 
            socket.send(JSON.stringify({action: "discard", card: draggedCard.card}));
        // Chiusura (Zona a destra degli scarti)
        else if (mouse.x > 550 && mouse.x < 625 && mouse.y > 250 && mouse.y < 376) 
            socket.send(JSON.stringify({action: "close", card: draggedCard.card}));
        // Riordinamento
        else if (mouse.y > 470) {
            let nIdx = Math.floor((mouse.x - 100 + CARD_W/2) / 95);
            nIdx = Math.max(0, Math.min(nIdx, gameState.hand.length - 1));
            const card = gameState.hand.splice(draggedCard.index, 1)[0];
            gameState.hand.splice(nIdx, 0, card);
            socket.send(JSON.stringify({action: "reorder", new_hand: gameState.hand}));
        }
        draggedCard = null;
    }
});

canvas.addEventListener('click', () => {
    if (gameState && gameState.game_over) {
        socket.send(JSON.stringify({action: "next_round"}));
    }
});

preloadImages();