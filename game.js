function renderFinalView(data) {
    const oppIdx = 1 - myPlayerIdx;
    
    // Mostra le carte dell'avversario
    const oppHandContainer = document.getElementById('opponent-hand');
    oppHandContainer.innerHTML = '';
    if (data.all_hands && data.all_hands[oppIdx]) {
        data.all_hands[oppIdx].forEach(card => oppHandContainer.appendChild(createCardElement(card)));
    }

    // Alert con i punteggi
    const winMsg = data.winner === myPlayerIdx ? "HAI VINTO IL ROUND!" : "L'AVVERSARIO HA CHIUSO!";
    alert(`${winMsg}\n\nPUNTI TOTALI:\nTU: ${data.total_scores[myPlayerIdx]}\nAVVERSARIO: ${data.total_scores[oppIdx]}`);
}

function showReadyButton() {
    if (document.getElementById('ready-btn')) return;
    
    const btn = document.createElement('button');
    btn.id = 'ready-btn';
    btn.innerText = "GIOCA PROSSIMO ROUND";
    
    // Stile rapido per mobile
    Object.assign(btn.style, {
        position: 'fixed',
        bottom: '30px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '20px 40px',
        fontSize: '1.2rem',
        backgroundColor: '#28a745',
        color: 'white',
        border: 'none',
        borderRadius: '10px',
        zIndex: '2000',
        boxShadow: '0 4px 10px rgba(0,0,0,0.5)'
    });

    btn.onclick = () => {
        socket.send(JSON.stringify({ action: "ready_next_round" }));
        btn.innerText = "IN ATTESA...";
        btn.style.backgroundColor = "#6c757d";
        btn.disabled = true;
    };
    
    document.body.appendChild(btn);
}