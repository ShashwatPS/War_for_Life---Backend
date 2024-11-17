"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitLeaderboard = emitLeaderboard;
exports.emitTeamsList = emitTeamsList;
exports.emitZoneStatus = emitZoneStatus;
const ws_1 = require("ws");
const socketService = (wss, prisma) => {
    wss.on('connection', (ws) => {
        console.log('New connection');
        ws.on('message', (message) => __awaiter(void 0, void 0, void 0, function* () {
            const { event, data } = JSON.parse(message.toString());
            if (event === 'team-connect') {
                const { teamId } = data;
                try {
                    yield prisma.team.update({
                        where: { id: teamId },
                        data: { socketId: ws._socket.remoteAddress },
                    });
                    console.log(`Team ${teamId} connected`);
                    yield emitTeamsList(wss, prisma);
                    yield emitLeaderboard(wss, prisma);
                }
                catch (err) {
                    console.error('Error in team-connect:', err);
                }
            }
        }));
        ws.on('close', () => __awaiter(void 0, void 0, void 0, function* () {
            try {
                yield prisma.team.updateMany({
                    where: { socketId: ws._socket.remoteAddress },
                    data: { socketId: null },
                });
                console.log('Socket disconnected');
                yield emitTeamsList(wss, prisma);
            }
            catch (err) {
                console.error('Error in disconnect:', err);
            }
        }));
    });
};
function emitLeaderboard(wss, prisma) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const leaderboard = yield prisma.team.findMany({
                select: {
                    id: true,
                    teamName: true,
                    score: true,
                    capturedZones: {
                        select: { id: true, name: true },
                    },
                },
                orderBy: [
                    { score: 'desc' },
                    { teamName: 'asc' },
                ],
            });
            wss.clients.forEach(client => {
                if (client.readyState === ws_1.WebSocket.OPEN) {
                    client.send(JSON.stringify({ event: 'leaderboard-update', data: leaderboard }));
                }
            });
        }
        catch (err) {
            console.error('Error emitting leaderboard:', err);
        }
    });
}
function emitTeamsList(wss, prisma) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const teams = yield prisma.team.findMany({
                select: {
                    id: true,
                    teamName: true,
                    isLocked: true,
                    currentPhase: true,
                    score: true,
                },
            });
            wss.clients.forEach(client => {
                if (client.readyState === ws_1.WebSocket.OPEN) {
                    client.send(JSON.stringify({ event: 'teams-update', data: teams }));
                }
            });
        }
        catch (err) {
            console.error('Error emitting teams list:', err);
        }
    });
}
function emitZoneStatus(wss, prisma) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const zones = yield prisma.zone.findMany({
                select: {
                    id: true,
                    name: true,
                    isLocked: true,
                    capturedBy: {
                        select: {
                            id: true,
                            teamName: true
                        }
                    }
                }
            });
            wss.clients.forEach(client => {
                if (client.readyState === ws_1.WebSocket.OPEN) {
                    client.send(JSON.stringify({ event: 'zones-update', data: zones }));
                }
            });
        }
        catch (err) {
            console.error('Error emitting zone status:', err);
        }
    });
}
exports.default = socketService;
