"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSocket = exports.initSocket = void 0;
const ws_1 = require("ws");
let wss = null;
const initSocket = (server) => {
    wss = new ws_1.WebSocketServer({ server });
    return wss;
};
exports.initSocket = initSocket;
const getSocket = () => {
    if (!wss) {
        throw new Error('WebSocket server not initialized. Call initSocket first.');
    }
    return wss;
};
exports.getSocket = getSocket;
