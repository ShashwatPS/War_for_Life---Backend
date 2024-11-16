import { Request, Response, RequestHandler } from "express";
import { BuffDebuffType, GamePhase } from "@prisma/client";
import { getSocket } from "../services/socketInstance";
import pclient from "../db/client";
import { emitLeaderboard, emitTeamsList } from "../services/socketService";
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

export const addQuestion: RequestHandler = async (req, res): Promise<any> => {
    const { content, images, correctAnswer, type, zoneId, phaseId, order, points, difficulty } = req.body

    const question = await pclient.question.create({
        data: {
            content,
            images,
            correctAnswer,
            type,
            zoneId,
            phaseId,
            order,
            points,
            difficulty
        }
    })

    return res.json(question)
}

export const getNextQuestion: RequestHandler = async (req, res): Promise<any> => {
    const { teamId, zoneId } = req.params;
    
    const team = await pclient.team.findUnique({
        where: { id: teamId },
        include: {
            answeredQuestions: true,
            skippedQuestions: true,
            extraQuestions: true
        }
    });

    if (!team) {
        return res.status(404).json({ error: 'Team not found' });
    }

    let question = null;

    switch (team.currentPhase) {
        case 'PHASE_1': {
            if (!zoneId) {
                return res.status(400).json({ error: 'Zone ID required for Phase 1 questions' });
            }

            // Get questions specific to the requested zone that team hasn't answered yet
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
                        // Ensure zone isn't phase 1 complete
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
            // Phase 2 remains unchanged - not zone specific
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
            question = await pclient.question.findFirst({
                where: {
                    id: {
                        in: team.extraQuestions.map(q => q.id)
                    }
                }
            });

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

    if (question) {
        await pclient.team.update({
            where: { id: teamId },
            data: { currentQuestionId: question.id }
        });
    }

    return res.json(question);
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
    const { type, targetTeamId, sourceTeamId } = req.body as {
        type: BuffDebuffType;
        targetTeamId: string;
        sourceTeamId: string;
    };

    // Validate source team and available buffs
    const sourceTeam = await pclient.team.findUnique({
        where: { id: sourceTeamId },
        select: { availableBuffs: true, currentPhase: true }
    });

    if (!sourceTeam) {
        return res.status(404).json({ error: 'Source team not found' });
    }

    const availableBuffs = sourceTeam.availableBuffs as BuffDebuffType[];
    if (!availableBuffs.includes(type)) {
        return res.status(400).json({ error: 'Buff not available' });
    }

    let expiresAt = new Date();
    
    try {
        switch (type) {
            case 'LOCK_ONE_TEAM':
                expiresAt = await lockTeam(targetTeamId, BUFF_DURATIONS.LOCK_ONE_TEAM);
                break;

            case 'LOCK_ALL_EXCEPT_ONE':
                expiresAt = await lockAllTeamsExcept(targetTeamId, BUFF_DURATIONS.LOCK_ALL_EXCEPT_ONE);
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
    const { teamId, answer, zoneId } = req.body;
    const wss = getSocket();

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
    const isCorrect = answer === question.correctAnswer;

    if (isCorrect) {
        let points = question.points || 10;
        let transactions = [];

        // Base transaction for answering question
        transactions.push(
            pclient.team.update({
                where: { id: teamId },
                data: {
                    score: { increment: points },
                    answeredQuestions: { connect: { id: question.id } },
                    currentQuestionId: null
                }
            }),
            pclient.questionProgress.create({
                data: {
                    teamId,
                    questionId: question.id,
                    isCompleted: true,
                    endTime: new Date()
                }
            })
        );

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
                    if (answered + 1 >= total) {
                        // All zone questions completed, capture zone
                        transactions.push(
                            pclient.zone.update({
                                where: { id: zoneId },
                                data: {
                                    capturedById: teamId,
                                    phase1Complete: true
                                }
                            })
                        );

                        // Generate buff for zone capture
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
                            data: { capturedById: null }
                        }),
                        pclient.zone.update({
                            where: { id: zoneId },
                            data: { capturedById: teamId }
                        })
                    );
                }
                break;
            }

            case 'PHASE_3': {
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

        try {
            await pclient.$transaction(transactions);

            if (zoneId) {
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ event: 'zone-update', data: { zoneId, teamId, phase: team.currentPhase } }));
                    }
                });
            }

            emitLeaderboard(wss, pclient);
            return res.json({ 
                success: true, 
                points, 
                zoneId: zoneId || undefined 
            });
        } catch (error) {
            console.error('Transaction failed:', error);
            return res.status(500).json({ error: 'Failed to process answer' });
        }
    }

    // Handle incorrect answer
    await pclient.questionProgress.upsert({
        where: {
            teamId_questionId: {
                teamId,
                questionId: question.id
            }
        },
        update: { attempts: { increment: 1 } },
        create: {
            teamId,
            questionId: question.id,
            attempts: 1
        }
    });

    return res.status(400).json({ error: 'Incorrect answer' });
};

// Add API to create phase-specific questions
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
    try {
        const { phase, questionData } = req.body as {
            phase: GamePhase;
            questionData: PhaseQuestionData;
        };

        if (!Object.values(GamePhase).includes(phase)) {
            return res.status(400).json({ error: "Invalid phase" });
        }

        // Get the phase record first
        const phaseRecord = await pclient.phase.findUnique({
            where: { phase }
        });

        if (!phaseRecord) {
            return res.status(404).json({ error: "Phase not found" });
        }

        const question = await pclient.question.create({
            data: {
                ...questionData,
                type: QUESTION_TYPES[phase],
                phaseId: phaseRecord.id,
                points: questionData.points || 10,
                images: questionData.images || []
            }
        });

        return res.json({ success: true, question });
    } catch (error) {
        console.error('Error adding phase question:', error);
        return res.status(500).json({ error: 'Failed to add question' });
    }
};

export const adminLockTeam: RequestHandler = async (req, res): Promise<any> => {
    const { teamId, duration = 1 } = req.body;
    
    try {
        const expiresAt = await lockTeam(teamId, duration);
        return res.json({ success: true, teamId, expiresAt });
    } catch (error) {
        console.error('Error locking team:', error);
        return res.status(500).json({ error: 'Failed to lock team' });
    }
};

export const adminUnlockTeam: RequestHandler = async (req, res): Promise<any> => {
    const { teamId } = req.body;
    
    try {
        await unlockTeam(teamId);
        return res.json({ success: true, teamId });
    } catch (error) {
        console.error('Error unlocking team:', error);
        return res.status(500).json({ error: 'Failed to unlock team' });
    }
};

export const adminLockAllTeams: RequestHandler = async (req, res): Promise<any> => {
    const { duration = 1 } = req.body;
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + duration);
    
    try {
        await pclient.team.updateMany({
            data: {
                isLocked: true,
                lockedUntil: expiresAt
            }
        });
        const io = getSocket();
        io.emit('teams-locked', { expiresAt });
        return res.json({ success: true, expiresAt });
    } catch (error) {
        console.error('Error locking all teams:', error);
        return res.status(500).json({ error: 'Failed to lock teams' });
    }
};

export const adminUnlockAllTeams: RequestHandler = async (req, res): Promise<any> => {
    try {
        await unlockAllTeams();
        return res.json({ success: true });
    } catch (error) {
        console.error('Error unlocking all teams:', error);
        return res.status(500).json({ error: 'Failed to unlock teams' });
    }
};
