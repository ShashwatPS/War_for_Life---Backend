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
const socketService = (io, prisma) => {
    io.on('connection', (socket) => {
        console.log(`New connection: ${socket.id}`);
        socket.on('team-connect', (_a) => __awaiter(void 0, [_a], void 0, function* ({ teamId }) {
            try {
                yield prisma.team.update({
                    where: { id: teamId },
                    data: { socketId: socket.id },
                });
                console.log(`Team ${teamId} connected with socket ${socket.id}`);
                emitTeamsList(io, prisma);
                emitLeaderboard(io, prisma);
            }
            catch (err) {
                console.error('Error in team-connect:', err);
            }
        }));
        socket.on('disconnect', () => __awaiter(void 0, void 0, void 0, function* () {
            try {
                yield prisma.team.updateMany({
                    where: { socketId: socket.id },
                    data: { socketId: null },
                });
                console.log(`Socket ${socket.id} disconnected`);
            }
            catch (err) {
                console.error('Error in disconnect:', err);
            }
        }));
    });
};
function emitLeaderboard(io, prisma) {
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
            io.emit('leaderboard-update', leaderboard);
        }
        catch (err) {
            console.error('Error emitting leaderboard:', err);
        }
    });
}
function emitTeamsList(io, prisma) {
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
            io.emit('teams-update', teams);
        }
        catch (err) {
            console.error('Error emitting teams list:', err);
        }
    });
}
exports.default = socketService;
