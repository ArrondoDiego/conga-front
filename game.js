const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

/** * SERVER CONNECTION SETTINGS
 * Replace 'conga-server-production.up.railway.app' with the domain Railway gave you.
 */
const RAILWAY_DOMAIN = 'conga-server-production.up.railway.app'; 

const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const serverUrl = isLocal ? 'ws://localhost:5555' : `wss://${RAILWAY_DOMAIN}`;

console.log(`Connecting to server: ${serverUrl}`);
const socket = new WebSocket(serverUrl);

let gameState = null;
let draggedCard = null;
let offset = { x: 0, y: 0 };
let mouse = { x: 0, y: 0 };
const images = {};

// Card Dimensions (Ratio 356x600)
const CARD_W = 75; 
const CARD_H = 126; 

// Mapping server data to image filenames
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
                console.warn(`Missing image: assets/${key}.png`);
                checkLoad();
            };
        });
    });
    images['_Dorso'] = new Image();
    images['_Dorso'].src = `assets/_Dorso.png`;
    images['_Dorso'].onload = checkLoad;
}

socket.onmessage = (event) => {
    gameState = JSON.parse(event.data);
};

socket.onopen = () => console.log("Successfully connected to server!");
socket.onerror = (err) => console.error("WebSocket error observed:", err);
socket.onclose = () => console.warn("Disconnected from server.");

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
            // Fallback: draw a simple card if image is missing
            ctx.fillStyle = "white";
            ctx.fillRect(x, y, CARD_W, CARD_H);
            ctx.strokeStyle = "black";
            ctx.strokeRect(x, y, CARD_W, CARD_H);
            ctx.fillStyle = "red";
            ctx.font = "14px Arial";
            ctx.fillText(`${card.v}${card.s[0]}`, x + 5, y + 20);
        }
    }
}

function renderLoop() {
    // Green Table Background
    ctx.fillStyle = "#1b5e20";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!gameState || !gameState.game_started) {
        ctx.fillStyle = "white"; 
        ctx.textAlign = "center";
        ctx.font = "24px Arial";
        ctx.fillText("WAITING FOR OPPONENT...", canvas.width/2, canvas.height/2);
    } else {
        // Scores UI
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath();
        ctx.roundRect(810, 230, 180, 110, 10);
        ctx.fill();
        
        ctx.fillStyle = "#FFD700"; 
        ctx.font = "bold 18px Arial"; 
        ctx.textAlign = "left";
        ctx.fillText("POINTS:", 825, 260);
        ctx.fillStyle = "white";
        ctx.font = "16px Arial";
        ctx.fillText(`YOU: ${gameState.scores[gameState.p_idx]}`, 825, 290);
        ctx.fillText(`OPP: ${gameState.scores[1-gameState.p_idx]}`, 825, 320);

        // Deck & Discard Pile
        drawCard(null, 350, 250, true);
        if (gameState.top_discard) drawCard(gameState.top_discard, 450, 250);

        // Turn Indicator Frame
        if (gameState.turn === gameState.p_idx && !gameState.game_over) {
            ctx.strokeStyle = "#00ff00"; 
            ctx.lineWidth = 5;
            ctx.strokeRect(95, 515, (gameState.hand.length * 95), CARD_H + 10);
            ctx.fillStyle = "#00ff00";
            ctx.font = "bold 14px Arial";
            ctx.fillText("YOUR TURN", 100, 505);
        }

        // Opponent's Area
        if (gameState.game_over && gameState.opp_hand) {
            gameState.opp_hand.forEach((c, i) => drawCard(c, 100+i*95, 50));
        } else {
            for (let i = 0; i < gameState.opp_count; i++) drawCard(null, 100+i*95, 50, true);
        }

        // Player's Area
        gameState.hand.forEach((card, i) => {
            if (draggedCard && draggedCard.index === i) return;
            drawCard(card, 100+i*95, 520);
        });

        // Dragging Card
        if (draggedCard) {
            ctx.shadowBlur = 10; ctx.shadowColor = "black";
            drawCard(draggedCard.card, mouse.x + offset.x, mouse.y + offset.y);
            ctx.shadowBlur = 0;
        }

        if (gameState.game_over) drawSummaryPopup();
    }
    requestAnimationFrame(renderLoop);
}

function drawSummaryPopup() {
    ctx.fillStyle = "rgba(0,0,0,0.8)"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = "#2c3e50"; 
    ctx.beginPath(); 
    ctx.roundRect(canvas.width/2 - 200, 200, 400, 280, 15); 
    ctx.fill();
    ctx.strokeStyle = "#FFD700"; ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#FFD700"; ctx.font = "bold 26px Arial"; ctx.textAlign = "center";
    ctx.fillText("ROUND OVER", canvas.width/2, 250);

    const det = gameState.last_round_details;
    if (det) {
        const iClosed = det.closer === gameState.p_idx;
        ctx.fillStyle = "white"; ctx.font = "18px Arial";
        ctx.fillText(iClosed ? "You closed the round!" : "Opponent closed the round", canvas.width/2, 295);
        ctx.fillText(`Your round score: +${iClosed ? det.p_closer : det.p_opponent}`, canvas.width/2, 335);
        ctx.fillText(`Opponent round score: +${iClosed ? det.p_opponent : det.p_closer}`, canvas.width/2, 365);
    }

    const ready = gameState.ready_next[gameState.p_idx];
    ctx.fillStyle = ready ? "#7f8c8d" : "#27ae60";
    ctx.beginPath(); 
    ctx.roundRect(canvas.width/2 - 120, 400, 240, 50, 10); 
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.fillText(ready ? "WAITING..." : "READY FOR NEXT", canvas.width/2, 432);
}

// Input Event Listeners
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
        // Discard or Close
        if (mouse.x > 450 && mouse.x < 525 && mouse.y > 250 && mouse.y < 376) 
            socket.send(JSON.stringify({action: "discard", card: draggedCard.card}));
        else if (mouse.x > 550 && mouse.x < 625 && mouse.y > 250 && mouse.y < 376) 
            socket.send(JSON.stringify({action: "close", card: draggedCard.card}));
        // Internal Reordering
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
        if (x > canvas.width/2 - 120 && x < canvas.width/2 + 120 && y > 400 && y < 450) {
            socket.send(JSON.stringify({action: "next_round"}));
        }
    }
});

preloadImages();