const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
//const socket = new WebSocket('ws://localhost:5555');
const socket = new WebSocket('wss://bright-goats-run.loca.lt');
let gameState = null;
let draggedCard = null;
let offset = { x: 0, y: 0 };
let mouse = { x: 0, y: 0 };
const images = {};

// Aspect ratio 356x600 adjusted for UI
const CARD_W = 75; 
const CARD_H = 126; 

// Mapping server names to your file names
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
        });
    });
    images['_Dorso'] = new Image();
    images['_Dorso'].src = `assets/_Dorso.png`;
    images['_Dorso'].onload = checkLoad;
}

socket.onmessage = (event) => {
    gameState = JSON.parse(event.data);
};

function drawCard(card, x, y, isBack = false) {
    if (isBack) {
        ctx.drawImage(images['_Dorso'], x, y, CARD_W, CARD_H);
        return;
    }
    if (card) {
        let vStr = valuesMap[card.v] || card.v.padStart(2, '0');
        let sStr = suitsMap[card.s];
        const img = images[`${sStr}${vStr}`];
        if (img) ctx.drawImage(img, x, y, CARD_W, CARD_H);
    }
}

function renderLoop() {
    // Table Background
    ctx.fillStyle = "#1b5e20";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!gameState || !gameState.game_started) {
        ctx.fillStyle = "white"; ctx.textAlign = "center";
        ctx.fillText("WAITING FOR OPPONENT...", canvas.width/2, canvas.height/2);
    } else {
        // Scores (Right Side)
        ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.roundRect(820, 240, 160, 100, 10); ctx.fill();
        ctx.fillStyle = "#FFD700"; ctx.font = "bold 16px Arial"; ctx.textAlign = "left";
        ctx.fillText("TOTALS:", 835, 265);
        ctx.fillStyle = "white";
        ctx.fillText(`YOU: ${gameState.scores[gameState.p_idx]}`, 835, 290);
        ctx.fillText(`OPP: ${gameState.scores[1-gameState.p_idx]}`, 835, 315);

        // Deck & Discard
        ctx.drawImage(images['_Dorso'], 350, 250, CARD_W, CARD_H);
        if (gameState.top_discard) drawCard(gameState.top_discard, 450, 250);

        // Turn Indicator
        if (gameState.turn === gameState.p_idx && !gameState.game_over) {
            ctx.strokeStyle = "#4caf50"; ctx.lineWidth = 4;
            ctx.strokeRect(50, 480, 900, 180);
        }

        // Opponent's Hand (Revealed if game_over)
        if (gameState.game_over && gameState.opp_hand) {
            gameState.opp_hand.forEach((c, i) => drawCard(c, 100+i*95, 50));
        } else {
            for (let i = 0; i < gameState.opp_count; i++) drawCard(null, 100+i*95, 50, true);
        }

        // Player's Hand
        gameState.hand.forEach((card, i) => {
            if (draggedCard && draggedCard.index === i) return;
            drawCard(card, 100+i*95, 520);
        });

        if (draggedCard) drawCard(draggedCard.card, mouse.x + offset.x, mouse.y + offset.y);

        if (gameState.game_over) drawSummaryPopup();
    }
    requestAnimationFrame(renderLoop);
}

function drawSummaryPopup() {
    ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#2c3e50"; ctx.beginPath(); ctx.roundRect(canvas.width/2 - 200, 200, 400, 280, 15); ctx.fill();
    ctx.strokeStyle = "white"; ctx.stroke();

    ctx.fillStyle = "yellow"; ctx.font = "bold 24px Arial"; ctx.textAlign = "center";
    ctx.fillText("ROUND SUMMARY", canvas.width/2, 245);

    const det = gameState.last_round_details;
    if (det) {
        const iClosed = det.closer === gameState.p_idx;
        ctx.fillStyle = "white"; ctx.font = "18px Arial";
        ctx.fillText(iClosed ? "YOU CLOSED!" : "OPPONENT CLOSED", canvas.width/2, 290);
        ctx.fillText(`Your Points: +${iClosed ? det.p_closer : det.p_opponent}`, canvas.width/2, 330);
        ctx.fillText(`Opp Points: +${iClosed ? det.p_opponent : det.p_closer}`, canvas.width/2, 360);
    }

    const ready = gameState.ready_next[gameState.p_idx];
    ctx.fillStyle = ready ? "#7f8c8d" : "#27ae60";
    ctx.beginPath(); ctx.roundRect(canvas.width/2 - 120, 395, 240, 50, 10); ctx.fill();
    ctx.fillStyle = "white";
    ctx.fillText(ready ? "WAITING..." : "NEXT ROUND", canvas.width/2, 427);
}

// Input Handlers
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
        if (mouse.x > 450 && mouse.x < 525 && mouse.y > 250 && mouse.y < 376) 
            socket.send(JSON.stringify({action: "discard", card: draggedCard.card}));
        else if (mouse.x > 550 && mouse.x < 625 && mouse.y > 250 && mouse.y < 376) 
            socket.send(JSON.stringify({action: "close", card: draggedCard.card}));
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

canvas.addEventListener('click', (e) => {
    if (gameState?.game_over) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        if (x > canvas.width/2 - 120 && x < canvas.width/2 + 120 && y > 395 && y < 445) {
            socket.send(JSON.stringify({action: "next_round"}));
        }
    }
});

preloadImages();