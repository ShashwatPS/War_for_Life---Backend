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
exports.getBuff = exports.startUnlockSystem = exports.unlockAllTeams = exports.lockAllTeamsExcept = exports.unlockTeam = exports.lockTeam = exports.skipCurrentQuestion = exports.assignExtraQuestion = exports.generateRandomBuffDebuff = exports.QUESTION_TYPES = void 0;
const client_1 = require("@prisma/client");
const socketInstance_1 = require("../services/socketInstance");
const socketService_1 = require("../services/socketService");
const prisma = new client_1.PrismaClient();
// Constants
exports.QUESTION_TYPES = {
    PHASE_1: "ZONE_SPECIFIC",
    PHASE_2: "ZONE_CAPTURE",
    PHASE_3: "COMMON"
};
const BUFF_DURATIONS = {
    LOCK_ONE_TEAM: 1,
    LOCK_ALL_EXCEPT_ONE: 0.5,
    EXTRA_QUESTION: 0,
    QUESTION_SKIP: 0
};
// Buff/Debuff Generation
const generateRandomBuffDebuff = () => {
    const buffs = Object.values(client_1.BuffDebuffType);
    return buffs[Math.floor(Math.random() * buffs.length)];
};
exports.generateRandomBuffDebuff = generateRandomBuffDebuff;
// Question Management
const assignExtraQuestion = (teamId) => __awaiter(void 0, void 0, void 0, function* () {
    const team = yield prisma.team.findUnique({
        where: { id: teamId },
        include: { extraQuestions: true }
    });
    if (!team)
        return;
    const extraQuestion = yield prisma.question.findFirst({
        where: {
            type: team.currentPhase === 'PHASE_3' ? 'COMMON' : 'ZONE_CAPTURE',
            NOT: {
                id: { in: team.extraQuestions.map(q => q.id) }
            }
        },
        orderBy: { order: 'asc' }
    });
    if (extraQuestion) {
        yield prisma.team.update({
            where: { id: teamId },
            data: {
                extraQuestions: {
                    connect: { id: extraQuestion.id }
                }
            }
        });
    }
});
exports.assignExtraQuestion = assignExtraQuestion;
const skipCurrentQuestion = (teamId) => __awaiter(void 0, void 0, void 0, function* () {
    const team = yield prisma.team.findUnique({
        where: { id: teamId }
    });
    if (team === null || team === void 0 ? void 0 : team.currentQuestionId) {
        yield prisma.team.update({
            where: { id: teamId },
            data: {
                skippedQuestions: {
                    connect: { id: team.currentQuestionId }
                },
                currentQuestionId: null
            }
        });
    }
});
exports.skipCurrentQuestion = skipCurrentQuestion;
// Team Lock/Unlock Functions
const lockTeam = (teamId, duration) => __awaiter(void 0, void 0, void 0, function* () {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + duration);
    yield prisma.team.update({
        where: { id: teamId },
        data: {
            isLocked: true,
            lockedUntil: expiresAt
        }
    });
    const wss = (0, socketInstance_1.getSocket)();
    (0, socketService_1.emitTeamsList)(wss, prisma);
    return expiresAt;
});
exports.lockTeam = lockTeam;
const unlockTeam = (teamId) => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.team.update({
        where: { id: teamId },
        data: {
            isLocked: false,
            lockedUntil: null
        }
    });
    const wss = (0, socketInstance_1.getSocket)();
    (0, socketService_1.emitTeamsList)(wss, prisma);
});
exports.unlockTeam = unlockTeam;
const lockAllTeamsExcept = (exceptTeamId, duration) => __awaiter(void 0, void 0, void 0, function* () {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + duration);
    yield prisma.team.updateMany({
        where: {
            id: { not: exceptTeamId }
        },
        data: {
            isLocked: true,
            lockedUntil: expiresAt
        }
    });
    const wss = (0, socketInstance_1.getSocket)();
    (0, socketService_1.emitTeamsList)(wss, prisma);
    return expiresAt;
});
exports.lockAllTeamsExcept = lockAllTeamsExcept;
const unlockAllTeams = () => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.team.updateMany({
        data: {
            isLocked: false,
            lockedUntil: null
        }
    });
    const wss = (0, socketInstance_1.getSocket)();
    (0, socketService_1.emitTeamsList)(wss, prisma);
});
exports.unlockAllTeams = unlockAllTeams;
const startUnlockSystem = (wss) => {
    if (!wss) {
        console.error('WebSocket server not provided to startUnlockSystem');
        return setInterval(() => { }, 1000);
    }
    return setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const now = new Date();
            const lockedTeams = yield prisma.team.findMany({
                where: {
                    isLocked: true,
                    lockedUntil: { lte: now }
                }
            });
            if (lockedTeams.length > 0) {
                yield prisma.team.updateMany({
                    where: {
                        id: { in: lockedTeams.map(t => t.id) }
                    },
                    data: {
                        isLocked: false,
                        lockedUntil: null
                    }
                });
                (0, socketService_1.emitTeamsList)(wss, prisma);
            }
        }
        catch (error) {
            console.error('Error in auto unlock interval:', error);
        }
    }), 1000);
};
exports.startUnlockSystem = startUnlockSystem;
const getBuff = (type) => {
    return BUFF_DURATIONS[type] || 0;
};
exports.getBuff = getBuff;
