import { WebSocketServer, WebSocket } from 'ws';
import { PrismaClient } from '@prisma/client';

const socketService = (wss: WebSocketServer, prisma: PrismaClient) => {
    wss.on('connection', (ws: WebSocket) => {
        console.log('New connection');

        ws.on('message', async (message) => {
            const { event, data } = JSON.parse(message.toString());

            if (event === 'team-connect') {
                const { teamId } = data;
                try {
                    await prisma.team.update({
                        where: { id: teamId },
                        data: { socketId: (ws as any)._socket.remoteAddress },
                    });
                    console.log(`Team ${teamId} connected`);
                    await emitTeamsList(wss, prisma);
                    await emitLeaderboard(wss, prisma);
                } catch (err) {
                    console.error('Error in team-connect:', err);
                }
            }
        });

        ws.on('close', async () => {
            try {
                await prisma.team.updateMany({
                    where: { socketId: (ws as any)._socket.remoteAddress },
                    data: { socketId: null },
                });
                console.log('Socket disconnected');
                await emitTeamsList(wss, prisma);
            } catch (err) {
                console.error('Error in disconnect:', err);
            }
        });
    });
};

export async function emitLeaderboard(wss: WebSocketServer, prisma: PrismaClient) {
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

        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ event: 'leaderboard-update', data: leaderboard }));
            }
        });
    } catch (err) {
        console.error('Error emitting leaderboard:', err);
    }
}

export async function emitTeamsList(wss: WebSocketServer, prisma: PrismaClient) {
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

        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ event: 'teams-update', data: teams }));
            }
        });
    } catch (err) {
        console.error('Error emitting teams list:', err);
    }
}

export async function emitZoneStatus(wss: WebSocketServer, prisma: PrismaClient) {
    try {
        const zones = await prisma.zone.findMany({
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
            if (client.readyState === WebSocket.OPEN) {
                zones.forEach(zone => {
                    client.send(JSON.stringify({ 
                        event: 'zone-status-update', 
                        data: {
                            id: zone.id,
                            name: zone.name,
                            isLocked: zone.isLocked,
                            capturedBy: zone.capturedBy
                        }
                    }));
                });
            }
        });
    } catch (err) {
        console.error('Error emitting zone status:', err);
    }
}

export default socketService;
