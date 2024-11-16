import { BuffDebuffType, GamePhase, PrismaClient, QuestionType } from "@prisma/client";
import { getSocket } from "../services/socketInstance";
import { emitTeamsList } from "../services/socketService";
import { WebSocketServer } from 'ws';

const prisma = new PrismaClient();

type BuffDurations = {
    [key in BuffDebuffType]: number;
};

export type PhaseQuestionTypes = {
    [key in GamePhase]: QuestionType;
};

// Constants
export const QUESTION_TYPES: PhaseQuestionTypes = {
    PHASE_1: "ZONE_SPECIFIC",
    PHASE_2: "ZONE_CAPTURE",
    PHASE_3: "COMMON"
} as const;

const BUFF_DURATIONS: BuffDurations = {
    LOCK_ONE_TEAM: 1,
    LOCK_ALL_EXCEPT_ONE: 0.5,
    EXTRA_QUESTION: 0,
    QUESTION_SKIP: 0
};

// Buff/Debuff Generation
export const generateRandomBuffDebuff = (): BuffDebuffType => {
    const buffs = Object.values(BuffDebuffType);
    return buffs[Math.floor(Math.random() * buffs.length)];
};

// Question Management
export const assignExtraQuestion = async (teamId: string) => {
    const team = await prisma.team.findUnique({
        where: { id: teamId },
        include: {
            answeredQuestions: true,
            extraQuestions: true,
            skippedQuestions: true
        }
    });

    if (!team) throw new Error('Team not found');

    // Get a new question based on team's current phase
    const extraQuestion = await prisma.question.findFirst({
        where: {
            type: QUESTION_TYPES[team.currentPhase],
            isUsed: false,  // Only get unused questions
            NOT: {
                id: {
                    in: [
                        ...team.answeredQuestions.map(q => q.id),
                        ...team.extraQuestions.map(q => q.id),
                        ...team.skippedQuestions.map(q => q.id)
                    ]
                }
            }
        },
        orderBy: { order: 'asc' }
    });

    if (!extraQuestion) throw new Error('No available questions for extra question buff');

    // Transaction ensures both operations happen together
    await prisma.$transaction([
        prisma.team.update({
            where: { id: teamId },
            data: {
                extraQuestions: {
                    connect: { id: extraQuestion.id }
                }
            }
        }),
        prisma.question.update({
            where: { id: extraQuestion.id },
            data: { isUsed: true }
        })
    ]);

    return extraQuestion;
};

export const skipCurrentQuestion = async (teamId: string): Promise<void> => {
    const team = await prisma.team.findUnique({
        where: { id: teamId }
    });

    if (team?.currentQuestionId) {
        await prisma.team.update({
            where: { id: teamId },
            data: {
                skippedQuestions: {
                    connect: { id: team.currentQuestionId }
                },
                currentQuestionId: null
            }
        });
    }
};

// Team Lock/Unlock Functions
export const lockTeam = async (teamId: string, duration: number): Promise<Date> => {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + duration);

    await prisma.team.update({
        where: { id: teamId },
        data: {
            isLocked: true,
            lockedUntil: expiresAt
        }
    });

    const wss = getSocket();
    emitTeamsList(wss, prisma);
    return expiresAt;
};

export const unlockTeam = async (teamId: string): Promise<void> => {
    await prisma.team.update({
        where: { id: teamId },
        data: {
            isLocked: false,
            lockedUntil: null
        }
    });

    const wss = getSocket();
    emitTeamsList(wss, prisma);
};

export const lockAllTeamsExcept = async (exceptTeamId: string, duration: number): Promise<Date> => {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + duration);

    await prisma.team.updateMany({
        where: {
            id: { not: exceptTeamId }
        },
        data: {
            isLocked: true,
            lockedUntil: expiresAt
        }
    });

    const wss = getSocket();
    emitTeamsList(wss, prisma);
    return expiresAt;
};

export const unlockAllTeams = async (): Promise<void> => {
    await prisma.team.updateMany({
        data: {
            isLocked: false,
            lockedUntil: null
        }
    });

    const wss = getSocket();
    emitTeamsList(wss, prisma);
};

export const startUnlockSystem = (wss: WebSocketServer): NodeJS.Timeout => {
    if (!wss) {
        console.error('WebSocket server not provided to startUnlockSystem');
        return setInterval(() => {}, 1000);
    }

    return setInterval(async () => {
        try {
            const now = new Date();
            const lockedTeams = await prisma.team.findMany({
                where: {
                    isLocked: true,
                    lockedUntil: { lte: now }
                }
            });

            if (lockedTeams.length > 0) {
                await prisma.team.updateMany({
                    where: {
                        id: { in: lockedTeams.map(t => t.id) }
                    },
                    data: {
                        isLocked: false,
                        lockedUntil: null
                    }
                });
                emitTeamsList(wss, prisma);
            }
        } catch (error) {
            console.error('Error in auto unlock interval:', error);
        }
    }, 1000);
};

export const getBuff = (type: BuffDebuffType): number => {
    return BUFF_DURATIONS[type] || 0;
};