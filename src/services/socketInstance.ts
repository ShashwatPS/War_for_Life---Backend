import { WebSocketServer } from 'ws';
import { Server as HttpServer } from 'http';

let wss: WebSocketServer | null = null;

export const initSocket = (server: HttpServer): WebSocketServer => {
    wss = new WebSocketServer({ server });
    return wss;
};

export const getSocket = (): WebSocketServer => {
    if (!wss) {
        throw new Error('WebSocket server not initialized. Call initSocket first.');
    }
    return wss;
};
