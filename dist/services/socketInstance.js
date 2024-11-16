"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSocket = exports.initSocket = void 0;
const socket_io_1 = require("socket.io");
let io = null;
const initSocket = (server) => {
    io = new socket_io_1.Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
    });
    return io;
};
exports.initSocket = initSocket;
const getSocket = () => {
    if (!io) {
        throw new Error("Socket.io not initialized. Call initSocket first.");
    }
    return io;
};
exports.getSocket = getSocket;
