import { Request, Response, RequestHandler } from "express";
import { BuffDebuffType, GamePhase, QuestionType } from "@prisma/client";
import { getSocket } from "../services/socketInstance";
import pclient from "../db/client";
import { emitLeaderboard, emitTeamsList, emitZoneStatus } from "../services/socketService";
import {
    generateRandomBuffDebuff,
    assignExtraQuestion,
    skipCurrentQuestion,
    lockTeam,
    lockAllTeamsExcept,
    unlockTeam,
    unlockAllTeams,
    getBuff,
    QUESTION_TYPES
} from "../helpers/buffDebuffs";
import { WebSocket } from 'ws';

// New interfaces
interface ZoneData {
    name: string;
    description?: string;
    order: number;
}

interface QuestionData {
    content: string;
    correctAnswer: string;
    points: number;
    order: number;
    zoneId?: string;
    type: QuestionType;
    images: string[];
    difficulty?: string;
}

export const startPhase: RequestHandler = async (req, res): Promise<any> => {
    const { phase }: { phase: GamePhase } = req.body;
    const wss = getSocket();

    await pclient.phase.updateMany({
        data: { isActive: false },
    });

    const updatedPhase = await pclient.phase.update({
        where: { phase },
        data: {
            isActive: true,
            startTime: new Date(),
        },
    });

    await pclient.team.updateMany({
        data: { currentPhase: phase },
    });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ event: 'phase-change', data: { phase, startTime: updatedPhase.startTime } }));
        }
    });

    return res.json({ success: true });
};

export const getNextQuestion: RequestHandler = async (req, res): Promise<any> => {
    const { zoneId } = req.body;
    const teamId = (req as any).user.userId;
    
    const team = await pclient.team.findUnique({
        where: { id: teamId },
        include: {
            answeredQuestions: true,
            skippedQuestions: true,
            extraQuestions: true,
            capturedZones: true
        }
    });

    if (!team) {
        return res.status(404).json({ error: 'Team not found' });
    }

    let question = null;

    switch (team.currentPhase) {
        case 'PHASE_1': {
            if (team.capturedZones.length > 0) {
                return res.status(400).json({ 
                    error: 'You have already captured a zone in Phase 1. Wait for Phase 2 to capture more zones.' 
                });
            }

            if (!zoneId) {
                return res.status(400).json({ error: 'Zone ID required for Phase 1 questions' });
            }

            const zone = await pclient.zone.findUnique({
                where: { id: zoneId }
            });

            if (zone?.phase1Complete && zone.capturedById !== teamId) {
                return res.status(400).json({ error: 'Zone is already captured' });
            }
            question = await pclient.question.findFirst({
                where: {
                    type: 'ZONE_SPECIFIC',
                    zoneId: zoneId,
                    NOT: {
                        id: {
                            in: team.answeredQuestions.map(q => q.id)
                        }
                    },
                    zone: {
                        phase1Complete: false
                    }
                },
                include: {
                    zone: true
                },
                orderBy: { order: 'asc' }
            });
            break;
        }
        
        case 'PHASE_2': {
            question = await pclient.question.findFirst({
                where: {
                    type: 'ZONE_CAPTURE',
                    isUsed: false,
                    NOT: {
                        id: {
                            in: [
                                ...team.answeredQuestions.map(q => q.id),
                                ...team.skippedQuestions.map(q => q.id)
                            ]
                        }
                    }
                },
                orderBy: { order: 'asc' }
            });
            break;
        }
        
        case 'PHASE_3': {
            // First check for extra questions
            question = await pclient.question.findFirst({
                where: {
                    id: {
                        in: team.extraQuestions.map(q => q.id)
                    }
                }
            });

            // If no extra questions, get regular question
            if (!question) {
                question = await pclient.question.findFirst({
                    where: {
                        type: 'COMMON',
                        NOT: {
                            id: {
                                in: [
                                    ...team.answeredQuestions.map(q => q.id),
                                    ...team.skippedQuestions.map(q => q.id)
                                ]
                            }
                        }
                    },
                    orderBy: { order: 'asc' }
                });
            }
            break;
        }
    }

    if (!question) {
        return res.status(404).json({ error: "Question not found" });
    }

// Update team data if the question exists
    await pclient.team.update({
        where: { id: teamId },
        data: { currentQuestionId: question.id }
    });

// Remove the correctAnswer field before sending the response
    const { correctAnswer, ...filteredQuestion } = question;
    return res.json(filteredQuestion);
};

type BuffDurations = {
    [key in BuffDebuffType]: number;
};

const BUFF_DURATIONS: BuffDurations = {
    LOCK_ONE_TEAM: 1,
    LOCK_ALL_EXCEPT_ONE: 0.5,
    EXTRA_QUESTION: 0,
    QUESTION_SKIP: 0
};

export const applyBuffDebuff: RequestHandler = async (req, res): Promise<any> => {
    const { type, targetTeamId } = req.body as {
        type: BuffDebuffType;
        targetTeamId: string;
    };
    const sourceTeamId = (req as any).user.userId;

    // Validate source team and available buffs
    const sourceTeam = await pclient.team.findUnique({
        where: { id: sourceTeamId },
        select: { availableBuffs: true, currentPhase: true }
    });

    if (!sourceTeam) {
        return res.status(404).json({ error: 'Source team not found' });
    }

    // Validate target team is online
    const targetTeam = await pclient.team.findUnique({
        where: { 
            id: targetTeamId,
            socketId: { not: null }
        }
    });

    if (!targetTeam) {
        return res.status(400).json({ error: 'Target team is not online' });
    }

    const availableBuffs = sourceTeam.availableBuffs as BuffDebuffType[];
    if (!availableBuffs.includes(type)) {
        return res.status(400).json({ error: 'Buff not available' });
    }

    let expiresAt = new Date();
    const wss = getSocket();
    
    try {
        switch (type) {
            case 'LOCK_ONE_TEAM':
                expiresAt = await lockTeam(targetTeamId, BUFF_DURATIONS.LOCK_ONE_TEAM);
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ event: 'team-locked', data: { teamId: targetTeamId, expiresAt } }));
                    }
                });
                break;

            case 'LOCK_ALL_EXCEPT_ONE':
                expiresAt = await lockAllTeamsExcept(targetTeamId, BUFF_DURATIONS.LOCK_ALL_EXCEPT_ONE);
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ event: 'teams-locked-except-one', data: { teamId: targetTeamId, expiresAt } }));
                    }
                });
                break;

            case 'EXTRA_QUESTION':
                await assignExtraQuestion(targetTeamId);
                break;

            case 'QUESTION_SKIP':
                await skipCurrentQuestion(targetTeamId);
                break;
        }

        await pclient.$transaction([
            pclient.buffDebuff.create({
                data: {
                    type,
                    appliedById: sourceTeamId,
                    appliedToId: targetTeamId,
                    expiresAt,
                    phase: sourceTeam.currentPhase,
                    isUsed: true
                }
            }),
            pclient.team.update({
                where: { id: sourceTeamId },
                data: {
                    availableBuffs: availableBuffs.filter(b => b !== type)
                }
            })
        ]);

        emitTeamsList(getSocket(), pclient);
        return res.json({ success: true, expiresAt });

    } catch (error) {
        console.error('Error applying buff/debuff:', error);
        return res.status(500).json({ error: 'Failed to apply buff/debuff' });
    }
};

export const broadcastMessage: RequestHandler = async (req, res): Promise<any> => {
    const { message, senderId, type, priority } = req.body;
    const wss = getSocket();

    const broadcast = await pclient.broadcast.create({
        data: {
            message,
            senderId,
            type,
            priority,
            pastMessages: {}
        }
    });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ event: 'broadcast', data: broadcast }));
        }
    });

    return res.json(broadcast);
};

export const getGameStatus: RequestHandler = async (req, res): Promise<any> => {
    const [teams, zones, currentPhase] = await Promise.all([
        pclient.team.findMany({
            where: {
                socketId: {
                    not: null
                }
            },
            select: {
                id: true,
                teamName: true,
                score: true,
                isLocked: true,
                currentPhase: true,
                capturedZones: { select: { id: true, name: true } }
            }
        }),
        pclient.zone.findMany({
            include: {
                capturedBy: { select: { teamName: true } }
            },
            orderBy: {
                name: 'asc'  // Add this ordering
            }
        }),
        pclient.phase.findFirst({
            where: { isActive: true }
        })
    ]);

    return res.json({
        teams,
        zones,
        currentPhase,
        timestamp: new Date()
    });
};

export const answerQuestion: RequestHandler = async (req, res): Promise<any> => {
    const { answer, zoneId } = req.body;
    const teamId = (req as any).user.userId;
    const wss = getSocket();

    try {
        const team = await pclient.team.findUnique({
            where: { id: teamId },
            include: {
                currentQuestion: {
                    include: {
                        zone: true
                    }
                },
                extraQuestions: true,
                answeredQuestions: true
            }
        });

        if (!team?.currentQuestion) {
            return res.status(400).json({ error: 'No active question' });
        }

        const question = team.currentQuestion;
        const isCorrect = answer.toLowerCase() === question.correctAnswer.toLowerCase();

        // Create or update progress regardless of previous attempts
        const questionProgress = await pclient.questionProgress.upsert({
            where: {
                teamId_questionId: {
                    teamId,
                    questionId: question.id
                }
            },
            update: {
                attempts: { increment: 1 },
                isCompleted: isCorrect,
                ...(isCorrect ? { endTime: new Date() } : {})
            },
            create: {
                teamId,
                questionId: question.id,
                attempts: 1,
                isCompleted: isCorrect,
                startTime: new Date(),
                ...(isCorrect ? { endTime: new Date() } : {})
            }
        });

        if (isCorrect) {
            let points = question.points || 10;
            let transactions = [];

            // Only process correct answer if not already answered
            if (!team.answeredQuestions.some(q => q.id === question.id)) {
                transactions.push(
                    pclient.team.update({
                        where: { id: teamId },
                        data: {
                            score: { increment: points },
                            answeredQuestions: { connect: { id: question.id } },
                            currentQuestionId: null
                        }
                    })
                );

                // Rest of phase-specific logic
                switch (team.currentPhase) {
                    case 'PHASE_1': {
                        if (question.type === 'ZONE_SPECIFIC' && zoneId) {
                            const zoneQuestions = await pclient.$transaction([
                                pclient.question.count({
                                    where: {
                                        zoneId,
                                        type: 'ZONE_SPECIFIC'
                                    }
                                }),
                                pclient.question.count({
                                    where: {
                                        zoneId,
                                        type: 'ZONE_SPECIFIC',
                                        answeredByTeams: { some: { id: teamId } }
                                    }
                                })
                            ]);

                            const [total, answered] = zoneQuestions;
// ...existing code...
                            if (answered + 1 >= total) {
                                // All zone questions completed, capture zone
                                const zone = await pclient.zone.findUnique({
                                    where: { id: zoneId },
                                    select: { name: true }
                                });

                                transactions.push(
                                    pclient.zone.update({
                                        where: { id: zoneId },
                                        data: {
                                            capturedById: teamId,
                                            phase1Complete: true
                                        }
                                    })
                                );

                                // Emit zone capture event
                                wss.clients.forEach(client => {
                                    if (client.readyState === WebSocket.OPEN) {
                                        client.send(JSON.stringify({
                                            event: 'zone-captured',
                                            data: {
                                                zoneId,
                                                teamId,
                                                teamName: team.teamName,
                                                zoneName: zone?.name,
                                                phase: 'PHASE_1',
                                                timestamp: new Date()
                                            }
                                        }));
                                    }
                                });

                                const buff = generateRandomBuffDebuff();
                                transactions.push(
                                    pclient.team.update({
                                        where: { id: teamId },
                                        data: {
                                            availableBuffs: {
                                                push: buff
                                            }
                                        }
                                    })
                                );
                            }
                        }
                        break;
                    }

                    case 'PHASE_2': {
                        if (question.type === 'ZONE_CAPTURE' && zoneId) {
                            transactions.push(
                                pclient.zone.updateMany({
                                    where: { capturedById: teamId },
                                    data: {
                                        capturedById: null,
                                        phase1Complete: true
                                    }
                                })
                            );

                            const zone = await pclient.zone.findUnique({
                                where: { id: zoneId },
                                select: { name: true }
                            });

                            // Then capture the new zone
                            transactions.push(
                                pclient.zone.update({
                                    where: { id: zoneId },
                                    data: {
                                        capturedById: teamId,
                                        phase1Complete: true
                                    }
                                })
                            );

                            // Emit zone capture event
                            wss.clients.forEach(client => {
                                if (client.readyState === WebSocket.OPEN) {
                                    client.send(JSON.stringify({
                                        event: 'zone-captured',
                                        data: {
                                            zoneId,
                                            teamId,
                                            teamName: team.teamName,
                                            zoneName: zone?.name,
                                            phase: 'PHASE_2',
                                            timestamp: new Date()
                                        }
                                    }));
                                }
                            });
                        }
                        break;
                    }

                    case 'PHASE_3': {
                        const hasZoneFromPhase2 = await pclient.zone.findFirst({
                            where: { capturedById: teamId }
                        });

                        if (!hasZoneFromPhase2) {
                            return res.status(403).json({
                                error: 'Team must have captured a zone in Phase 2 to participate in Phase 3'
                            });
                        }

                        if (team.extraQuestions.some(q => q.id === question.id)) {
                            points = Math.floor(points * 1.5); // 50% bonus for extra questions
                            transactions[0] = pclient.team.update({
                                where: { id: teamId },
                                data: {
                                    score: { increment: points },
                                    answeredQuestions: { connect: { id: question.id } },
                                    currentQuestionId: null,
                                    extraQuestions: {
                                        disconnect: { id: question.id }
                                    }
                                }
                            });
                        }
                        break;
                    }
                }

                await pclient.$transaction(transactions);

                const [teamName, zoneName] = await pclient.$transaction([
                    pclient.team.findFirst({ where: { id: teamId }, select: { teamName: true } }),
                    pclient.zone.findFirst({ where: { id: zoneId }, select: { name: true } })
                ]);

                if (zoneId) {  // Only send zone update if zoneId exists
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                event: 'zone-update',
                                data: { 
                                    zoneId,          // ID of the zone being updated
                                    teamId,          // ID of the team that answered correctly
                                    phase: team.currentPhase,  // Current game phase
                                    teamName,        // Name of the team
                                    zoneName         // Name of the zone
                                }
                            }));
                        }
                    });
                }

                emitLeaderboard(wss, pclient);
                return res.json({
                    success: true,
                    points,
                    zoneId: zoneId || undefined
                });
            } else {
                return res.status(400).json({ error: 'Question already answered' });
            }
        } else {
            return res.json({
                success: false,
                error: 'Incorrect answer',
                attempts: questionProgress.attempts,
                canRetry: true
            });
        }

    } catch (error) {
        console.error('Error processing answer:', error);
        return res.status(500).json({ error: 'Failed to process answer' });
    }
};

interface PhaseQuestionData {
    content: string;
    images: any;
    correctAnswer: string;
    zoneId?: string;
    order: number;
    points?: number;
    difficulty?: string;
}

export const addPhaseQuestion: RequestHandler = async (req, res): Promise<any> => {
    const { phase, questionData } = req.body as {
        phase: GamePhase;
        questionData: QuestionData;
    };

    try {
        switch (phase) {
            case 'PHASE_1':
                if (!questionData.zoneId) {
                    return res.status(400).json({ error: "Zone ID required for Phase 1 questions" });
                }
                questionData.type = 'ZONE_SPECIFIC';
                break;
            case 'PHASE_2':
                questionData.type = 'ZONE_CAPTURE';
                break;
            case 'PHASE_3':
                questionData.type = 'COMMON';
                delete questionData.zoneId; // No zones in Phase 3
                break;
            default:
                return res.status(400).json({ error: "Invalid phase" });
        }

        const phaseRecord = await pclient.phase.upsert({
            where: { phase },
            create: { phase, isActive: false },
            update: {}
        });

        const question = await pclient.question.create({
            data: {
                ...questionData,
                phaseId: phaseRecord.id,
            }
        });

        return res.json({ success: true, question });
    } catch (error) {
        console.error('Error adding phase question:', error);
        return res.status(500).json({ error: 'Failed to add question' });
    }
};

export const adminLockTeam: RequestHandler = async (req, res): Promise<any> => {
    const { duration = 1, teamId } = req.body;
    const wss = getSocket();
    
    try {
        const expiresAt = await lockTeam(teamId, duration);
        
        // Set up unlock timer
        setTimeout(async () => {
            try {
                await unlockTeam(teamId);
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ event: 'team-unlocked', data: { teamId } }));
                    }
                });
            } catch (error) {
                console.error('Error in auto unlock:', error);
            }
        }, duration * 60 * 1000);

        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ event: 'team-locked', data: { teamId, expiresAt } }));
            }
        });
        return res.json({ success: true, teamId, expiresAt });
    } catch (error) {
        console.error('Error locking team:', error);
        return res.status(500).json({ error: 'Failed to lock team' });
    }
};

export const adminUnlockTeam: RequestHandler = async (req, res): Promise<any> => {
    const { teamId } = req.body;
    const wss = getSocket();

    try {
        if (!teamId) {
            return res.status(400).json({ error: "Team ID is required" });
        }

        const team = await pclient.team.findUnique({
            where: { id: teamId },
            select: { isLocked: true }
        });

        if (!team) {
            return res.status(404).json({ error: "Team not found" });
        }

        if (!team.isLocked) {
            return res.json({ message: "Team is already unlocked" });
        }

        await pclient.team.update({
            where: { id: teamId },
            data: {
                isLocked: false,
                lockedUntil: null
            }
        });
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ event: 'team-unlocked', data: { teamId } }));
            }
        });

        return res.json({ message: "Team unlocked successfully" });
    } catch (error) {
        console.error("Error unlocking team:", error);
        return res.status(500).json({ error: "Failed to unlock team" });
    }
};

export const adminLockAllTeams: RequestHandler = async (req, res): Promise<any> => {
    const { duration = 1 } = req.body;
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + duration);
    const wss = getSocket();
    
    try {
        await pclient.team.updateMany({
            data: {
                isLocked: true,
                lockedUntil: expiresAt
            }
        });
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ event: 'teams-locked', data: { expiresAt } }));
            }
        });
        return res.json({ success: true, expiresAt });
    } catch (error) {
        console.error('Error locking all teams:', error);
        return res.status(500).json({ error: 'Failed to lock teams' });
    }
};

export const adminUnlockAllTeams: RequestHandler = async (req, res): Promise<any> => {
    const wss = getSocket();
    
    try {
        await unlockAllTeams();
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ event: 'teams-unlocked' }));
            }
        });
        return res.json({ success: true });
    } catch (error) {
        console.error('Error unlocking all teams:', error);
        return res.status(500).json({ error: 'Failed to unlock all teams' });
    }
};

export const getLeaderboard: RequestHandler = async (req, res): Promise<any> => {
    try {
        const leaderboard = await pclient.team.findMany({
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
        return res.json(leaderboard);
    } catch (error) {
        console.error('Error getting leaderboard:', error);
        return res.status(500).json({ error: 'Failed to get leaderboard' });
    }
}

export const changePhase: RequestHandler = async (req, res): Promise<any> => {
    const { phase }: { phase: GamePhase } = req.body;
    const wss = getSocket();

    await pclient.phase.updateMany({
        data: { isActive: false },
    });

    const updatedPhase = await pclient.phase.update({
        where: { phase },
        data: {
            isActive: true,
            startTime: new Date(),
        },
    });

    await pclient.team.updateMany({
        data: { currentPhase: phase },
    });

    const phaseData = {
        phase,
        startTime: updatedPhase.startTime,
        message: `Phase changed to ${phase}`
    };
    if (phase === 'PHASE_3') {
        const teamsWithZones = await pclient.team.findMany({
            where: {
                capturedZones: {
                    some: {}
                }
            },
            select: {
                id: true,
                teamName: true,
                capturedZones: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });

        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ 
                    event: 'phase3-eligible-teams',
                    data: {
                        teams: teamsWithZones,
                        message: 'Teams eligible for Phase 3',
                        timestamp: new Date()
                    }
                }));
            }
        });
    }

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ event: 'phase-change', data: phaseData }));
        }
    });

    return res.json({ success: true, data: phaseData });
};

export const createZone: RequestHandler = async (req, res): Promise<any> => {
    const zoneData: ZoneData = req.body;
    
    try {
        const zone = await pclient.zone.create({
            data: {
                ...zoneData,
                phase1Complete: false
            }
        });
        return res.json({ success: true, zone });
    } catch (error) {
        console.error('Error creating zone:', error);
        return res.status(500).json({ error: 'Failed to create zone' });
    }
};

export const updateZone: RequestHandler = async (req, res): Promise<any> => {
    const { id, ...zoneData }: ZoneData & { id: string } = req.body;
    
    try {
        const zone = await pclient.zone.update({
            where: { id },
            data: zoneData
        });
        return res.json({ success: true, zone });
    } catch (error) {
        console.error('Error updating zone:', error);
        return res.status(500).json({ error: 'Failed to update zone' });
    }
};

export const createPhase: RequestHandler = async (req, res): Promise<any> => {
    const { phase, isActive = false }: { phase: GamePhase; isActive: boolean } = req.body;
    
    try {
        const phaseRecord = await pclient.phase.create({
            data: {
                phase,
                isActive,
                startTime: isActive ? new Date() : null
            }
        });
        return res.json({ success: true, phase: phaseRecord });
    } catch (error) {
        console.error('Error creating phase:', error);
        return res.status(500).json({ error: 'Failed to create phase' });
    }
};

export const getAvailableBuffs: RequestHandler = async (req, res): Promise<any> => {
    const teamId = (req as any).user.userId;

    try {
        const sourceTeam = await pclient.team.findUnique({
            where: { id: teamId },
            select: { 
                availableBuffs: true,
                currentPhase: true
            }
        });

        if (!sourceTeam) {
            return res.status(404).json({ error: 'Team not found' });
        }

        const onlineTeams = await pclient.team.findMany({
            where: {
                socketId: { not: null },
                id: { not: teamId }
            },
            select: {
                id: true,
                teamName: true,
                isLocked: true
            }
        });

        const buffInfo = (sourceTeam.availableBuffs as BuffDebuffType[]).map(buff => ({
            type: buff,
            duration: BUFF_DURATIONS[buff],
            description: getBuffDescription(buff)
        }));

        return res.json({
            availableBuffs: buffInfo,
            targetTeams: onlineTeams
        });
    } catch (error) {
        console.error('Error getting available buffs:', error);
        return res.status(500).json({ error: 'Failed to get available buffs' });
    }
};

export const checkLock = async (req: Request, res: Response): Promise<any> => {

        try {
        const teamId = (req as any).user.userId;
        const team = await pclient.team.findUnique({
            where: {id: teamId},
            select: {isLocked: true}
        });
        if(!team){
            return res.status(404).json({ error: 'Team not found' });
        }
        if(team.isLocked) {
            return res.status(400).json({ error: 'Team is locked' });
        } else {
            return res.status(200).json({ success: true });
        }
        } catch (error) {
            console.error('Error checking lock:', error);
            return res.status(500).json({ error: 'Failed to check lock' });
        }
}

function getBuffDescription(type: BuffDebuffType): string {
    switch (type) {
        case 'LOCK_ONE_TEAM':
            return `Lock a team for ${BUFF_DURATIONS.LOCK_ONE_TEAM} minute(s)`;
        case 'LOCK_ALL_EXCEPT_ONE':
            return `Lock all teams except one for ${BUFF_DURATIONS.LOCK_ALL_EXCEPT_ONE} minute(s)`;
        case 'EXTRA_QUESTION':
            return 'Give a team an extra question with 50% bonus points';
        case 'QUESTION_SKIP':
            return 'Force a team to skip their current question';
        default:
            return 'Unknown buff type';
    }
}

export const getCurrentPhase: RequestHandler = async (req, res): Promise<any> => {
    try {
        const currentPhase = await pclient.phase.findFirst({
            where: { isActive: true },
            select: {
                phase: true,
                startTime: true
            }
        });
        
        return res.json(currentPhase || { phase: null, startTime: null });
    } catch (error) {
        console.error('Error getting current phase:', error);
        return res.status(500).json({ error: 'Failed to get current phase' });
    }
};

export const getZoneStatus: RequestHandler = async (req, res): Promise<any> => {
    try {
        const zones = await pclient.zone.findMany({
            select: {
                id: true,
                name: true,
                phase1Complete: true,
                capturedBy: {
                    select: {
                        id: true,
                        teamName: true
                    }
                }
            },
            orderBy: {
                name: 'asc'
            }
        });

        return res.json({
            zones,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('Error getting zone status:', error);
        return res.status(500).json({ error: 'Failed to get zone status' });
    }
};

export const getBroadcasts: RequestHandler = async (req, res): Promise<any> => {
    try {
        const broadcasts = await pclient.broadcast.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                message: true,
                priority: true,
                createdAt: true,
            }
        });
        return res.json(broadcasts);
    } catch (error) {
        console.error('Error getting broadcasts:', error);
        return res.status(500).json({ error: 'Failed to get broadcasts' });
    }
};

export const lockZone: RequestHandler = async (req, res): Promise<any> => {
    const { zoneId } = req.body;
    const wss = getSocket();

    try {
        const zone = await pclient.zone.update({
            where: { id: zoneId },
            data: { isLocked: true },
            include: {
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
                client.send(JSON.stringify({ 
                    event: 'zone-locked',
                    data: {
                        id: zone.id,
                        name: zone.name,
                        capturedBy: zone.capturedBy
                    }
                }));
            }
        });
        return res.json({ success: true, message: 'Zone locked successfully' });
    } catch (error) {
        console.error('Error locking zone:', error);
        return res.status(500).json({ error: 'Failed to lock zone' });
    }
};

export const unlockZone: RequestHandler = async (req, res): Promise<any> => {
    const { zoneId } = req.body;
    const wss = getSocket();

    try {
        const zone = await pclient.zone.update({
            where: { id: zoneId },
            data: { isLocked: false },
            include: {
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
                client.send(JSON.stringify({ 
                    event: 'zone-unlocked',
                    data: {
                        id: zone.id,
                        name: zone.name,
                        capturedBy: zone.capturedBy
                    }
                }));
            }
        });
        return res.json({ success: true, message: 'Zone unlocked successfully' });
    } catch (error) {
        console.error('Error unlocking zone:', error);
        return res.status(500).json({ error: 'Failed to unlock zone' });
    }
};

export const lockAllZones: RequestHandler = async (req, res): Promise<any> => {
    const wss = getSocket();

    try {
        const zones = await pclient.zone.findMany({
            include: {
                capturedBy: {
                    select: {
                        id: true,
                        teamName: true
                    }
                }
            }
        });

        await pclient.zone.updateMany({
            data: { isLocked: true }
        });

        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                // Send all-zones-locked event first
                client.send(JSON.stringify({ 
                    event: 'all-zones-locked',
                    data: {
                        timestamp: new Date(),
                        zoneCount: zones.length
                    }
                }));

                // Then send individual zone updates
                zones.forEach(zone => {
                    client.send(JSON.stringify({ 
                        event: 'zone-locked',
                        data: {
                            id: zone.id,
                            name: zone.name,
                            capturedBy: zone.capturedBy
                        }
                    }));
                });
            }
        });

        return res.json({ success: true, message: 'All zones locked successfully' });
    } catch (error) {
        console.error('Error locking all zones:', error);
        return res.status(500).json({ error: 'Failed to lock all zones' });
    }
};

export const unlockAllZones: RequestHandler = async (req, res): Promise<any> => {
    const wss = getSocket();

    try {
        const zones = await pclient.zone.findMany({
            include: {
                capturedBy: {
                    select: {
                        id: true,
                        teamName: true
                    }
                }
            }
        });

        await pclient.zone.updateMany({
            data: { isLocked: false }
        });

        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                // Send all-zones-unlocked event first
                client.send(JSON.stringify({ 
                    event: 'all-zones-unlocked',
                    data: {
                        timestamp: new Date(),
                        zoneCount: zones.length
                    }
                }));

                // Then send individual zone updates
                zones.forEach(zone => {
                    client.send(JSON.stringify({ 
                        event: 'zone-unlocked',
                        data: {
                            id: zone.id,
                            name: zone.name,
                            capturedBy: zone.capturedBy
                        }
                    }));
                });
            }
        });

        return res.json({ success: true, message: 'All zones unlocked successfully' });
    } catch (error) {
        console.error('Error unlocking all zones:', error);
        return res.status(500).json({ error: 'Failed to unlock all zones' });
    }
};

export const checkZoneLock: RequestHandler = async (req, res): Promise<any> => {
    const { zoneId } = req.body;

    try {
        const zone = await pclient.zone.findUnique({
            where: { id: zoneId },
            select: { isLocked: true }
        });

        if (!zone) {
            return res.status(404).json({ error: 'Zone not found' });
        }

        return res.json({ isLocked: zone.isLocked });
    } catch (error) {
        console.error('Error checking zone lock:', error);
        return res.status(500).json({ error: 'Failed to check zone lock' });
    }
};