export const CONFIG = {
    RAILWAY_DOMAIN: 'web-production-1a2e.up.railway.app',
    PORT: 5555,
    SUITS_MAP: { 'Ori': 'Denari', 'Bastoni': 'Bastoni', 'Coppe': 'Coppe', 'Spade': 'Spade' },
    VALUES_MAP: { 'F': '08', 'C': '09', 'R': '10' },
    MOVE_THRESHOLD: 10
};

export const getServerUrl = () => 
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? `ws://localhost:${CONFIG.PORT}` 
    : `wss://${CONFIG.RAILWAY_DOMAIN}`;