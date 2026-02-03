import { getServerUrl } from './config.js';

let socket;

export function initSocket(onMessageCallback) {
    socket = new WebSocket(getServerUrl());
    socket.onmessage = (event) => onMessageCallback(JSON.parse(event.data));
}

export function sendAction(action, payload = {}) {
    if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action, ...payload }));
    }
}