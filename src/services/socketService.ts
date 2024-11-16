import { Server as SocketServer } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const socketService = (io: SocketServer, prisma: PrismaClient) => {
    io.on('connection', (socket) => {
        console.log(`New connection: ${socket.id}`);

        socket.on('team-connect', async ({ teamId }) => {
            try {
                await prisma.team.update({
                    where: { id: teamId },
                    data: { socketId: socket.id },
                });
                console.log(`Team ${teamId} connected with socket ${socket.id}`);
                emitTeamsList(io, prisma);
                emitLeaderboard(io, prisma);
            } catch (err) {
                console.error('Error in team-connect:', err);
            }
        });

        socket.on('disconnect', async () => {
            try {
                await prisma.team.updateMany({
                    where: { socketId: socket.id },
                    data: { socketId: null },
                });
                console.log(`Socket ${socket.id} disconnected`);
            } catch (err) {
                console.error('Error in disconnect:', err);
            }
        });
    });
};

export async function emitLeaderboard(io: SocketServer, prisma: PrismaClient) {
    try {
        const leaderboard = await prisma.team.findMany({
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
    } catch (err) {
        console.error('Error emitting leaderboard:', err);
    }
}


export async function emitTeamsList(io: SocketServer, prisma: PrismaClient) {
    try {
        const teams = await prisma.team.findMany({
            select: {
                id: true,
                teamName: true,
                isLocked: true,
                currentPhase: true,
                score: true,
            },
        });

        io.emit('teams-update', teams);
    } catch (err) {
        console.error('Error emitting teams list:', err);
    }
}

export default socketService;
