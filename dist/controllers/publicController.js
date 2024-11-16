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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLeaderboard = exports.adminUnlockAllTeams = exports.adminLockAllTeams = exports.adminUnlockTeam = exports.adminLockTeam = exports.addPhaseQuestion = exports.answerQuestion = exports.getGameStatus = exports.broadcastMessage = exports.applyBuffDebuff = exports.getNextQuestion = exports.startPhase = void 0;
const client_1 = require("@prisma/client");
const socketInstance_1 = require("../services/socketInstance");
const client_2 = __importDefault(require("../db/client"));
const socketService_1 = require("../services/socketService");
const buffDebuffs_1 = require("../helpers/buffDebuffs");
const startPhase = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { phase } = req.body;
    const wss = (0, socketInstance_1.getSocket)();
    yield client_2.default.phase.updateMany({
        data: { isActive: false },
    });
    const updatedPhase = yield client_2.default.phase.update({
        where: { phase },
        data: {
            isActive: true,
            startTime: new Date(),
        },
    });
    yield client_2.default.team.updateMany({
        data: { currentPhase: phase },
    });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ event: 'phase-change', data: { phase, startTime: updatedPhase.startTime } }));
        }
    });
    return res.json({ success: true });
});
exports.startPhase = startPhase;
const getNextQuestion = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { teamId, zoneId } = req.params;
    const team = yield client_2.default.team.findUnique({
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
            question = yield client_2.default.question.findFirst({
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
            question = yield client_2.default.question.findFirst({
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
            question = yield client_2.default.question.findFirst({
                where: {
                    id: {
                        in: team.extraQuestions.map(q => q.id)
                    }
                }
            });
            if (!question) {
                question = yield client_2.default.question.findFirst({
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
        yield client_2.default.team.update({
            where: { id: teamId },
            data: { currentQuestionId: question.id }
        });
    }
    return res.json(question);
});
exports.getNextQuestion = getNextQuestion;
const BUFF_DURATIONS = {
    LOCK_ONE_TEAM: 1,
    LOCK_ALL_EXCEPT_ONE: 0.5,
    EXTRA_QUESTION: 0,
    QUESTION_SKIP: 0
};
const applyBuffDebuff = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { type, targetTeamId, sourceTeamId } = req.body;
    // Validate source team and available buffs
    const sourceTeam = yield client_2.default.team.findUnique({
        where: { id: sourceTeamId },
        select: { availableBuffs: true, currentPhase: true }
    });
    if (!sourceTeam) {
        return res.status(404).json({ error: 'Source team not found' });
    }
    const availableBuffs = sourceTeam.availableBuffs;
    if (!availableBuffs.includes(type)) {
        return res.status(400).json({ error: 'Buff not available' });
    }
    let expiresAt = new Date();
    try {
        switch (type) {
            case 'LOCK_ONE_TEAM':
                expiresAt = yield (0, buffDebuffs_1.lockTeam)(targetTeamId, BUFF_DURATIONS.LOCK_ONE_TEAM);
                break;
            case 'LOCK_ALL_EXCEPT_ONE':
                expiresAt = yield (0, buffDebuffs_1.lockAllTeamsExcept)(targetTeamId, BUFF_DURATIONS.LOCK_ALL_EXCEPT_ONE);
                break;
            case 'EXTRA_QUESTION':
                yield (0, buffDebuffs_1.assignExtraQuestion)(targetTeamId);
                break;
            case 'QUESTION_SKIP':
                yield (0, buffDebuffs_1.skipCurrentQuestion)(targetTeamId);
                break;
        }
        yield client_2.default.$transaction([
            client_2.default.buffDebuff.create({
                data: {
                    type,
                    appliedById: sourceTeamId,
                    appliedToId: targetTeamId,
                    expiresAt,
                    phase: sourceTeam.currentPhase,
                    isUsed: true
                }
            }),
            client_2.default.team.update({
                where: { id: sourceTeamId },
                data: {
                    availableBuffs: availableBuffs.filter(b => b !== type)
                }
            })
        ]);
        (0, socketService_1.emitTeamsList)((0, socketInstance_1.getSocket)(), client_2.default);
        return res.json({ success: true, expiresAt });
    }
    catch (error) {
        console.error('Error applying buff/debuff:', error);
        return res.status(500).json({ error: 'Failed to apply buff/debuff' });
    }
});
exports.applyBuffDebuff = applyBuffDebuff;
const broadcastMessage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { message, senderId, type, priority } = req.body;
    const wss = (0, socketInstance_1.getSocket)();
    const broadcast = yield client_2.default.broadcast.create({
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
});
exports.broadcastMessage = broadcastMessage;
const getGameStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const [teams, zones, currentPhase] = yield Promise.all([
        client_2.default.team.findMany({
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
        client_2.default.zone.findMany({
            include: {
                capturedBy: { select: { teamName: true } }
            }
        }),
        client_2.default.phase.findFirst({
            where: { isActive: true }
        })
    ]);
    return res.json({
        teams,
        zones,
        currentPhase,
        timestamp: new Date()
    });
});
exports.getGameStatus = getGameStatus;
const answerQuestion = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { teamId, answer, zoneId } = req.body;
    const wss = (0, socketInstance_1.getSocket)();
    const team = yield client_2.default.team.findUnique({
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
    if (!(team === null || team === void 0 ? void 0 : team.currentQuestion)) {
        return res.status(400).json({ error: 'No active question' });
    }
    const question = team.currentQuestion;
    const isCorrect = answer === question.correctAnswer;
    if (isCorrect) {
        let points = question.points || 10;
        let transactions = [];
        // Base transaction for answering question
        transactions.push(client_2.default.team.update({
            where: { id: teamId },
            data: {
                score: { increment: points },
                answeredQuestions: { connect: { id: question.id } },
                currentQuestionId: null
            }
        }), client_2.default.questionProgress.create({
            data: {
                teamId,
                questionId: question.id,
                isCompleted: true,
                endTime: new Date()
            }
        }));
        switch (team.currentPhase) {
            case 'PHASE_1': {
                if (question.type === 'ZONE_SPECIFIC' && zoneId) {
                    const zoneQuestions = yield client_2.default.$transaction([
                        client_2.default.question.count({
                            where: {
                                zoneId,
                                type: 'ZONE_SPECIFIC'
                            }
                        }),
                        client_2.default.question.count({
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
                        transactions.push(client_2.default.zone.update({
                            where: { id: zoneId },
                            data: {
                                capturedById: teamId,
                                phase1Complete: true
                            }
                        }));
                        // Generate buff for zone capture
                        const buff = (0, buffDebuffs_1.generateRandomBuffDebuff)();
                        transactions.push(client_2.default.team.update({
                            where: { id: teamId },
                            data: {
                                availableBuffs: {
                                    push: buff
                                }
                            }
                        }));
                    }
                }
                break;
            }
            case 'PHASE_2': {
                if (question.type === 'ZONE_CAPTURE' && zoneId) {
                    transactions.push(client_2.default.zone.updateMany({
                        where: { capturedById: teamId },
                        data: { capturedById: null }
                    }), client_2.default.zone.update({
                        where: { id: zoneId },
                        data: { capturedById: teamId }
                    }));
                }
                break;
            }
            case 'PHASE_3': {
                if (team.extraQuestions.some(q => q.id === question.id)) {
                    points = Math.floor(points * 1.5); // 50% bonus for extra questions
                    transactions[0] = client_2.default.team.update({
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
            yield client_2.default.$transaction(transactions);
            if (zoneId) {
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ event: 'zone-update', data: { zoneId, teamId, phase: team.currentPhase } }));
                    }
                });
            }
            (0, socketService_1.emitLeaderboard)(wss, client_2.default);
            return res.json({
                success: true,
                points,
                zoneId: zoneId || undefined
            });
        }
        catch (error) {
            console.error('Transaction failed:', error);
            return res.status(500).json({ error: 'Failed to process answer' });
        }
    }
    // Handle incorrect answer
    yield client_2.default.questionProgress.upsert({
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
});
exports.answerQuestion = answerQuestion;
const addPhaseQuestion = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { phase, questionData } = req.body;
        if (!Object.values(client_1.GamePhase).includes(phase)) {
            return res.status(400).json({ error: "Invalid phase" });
        }
        // Get the phase record first
        const phaseRecord = yield client_2.default.phase.findUnique({
            where: { phase }
        });
        if (!phaseRecord) {
            return res.status(404).json({ error: "Phase not found" });
        }
        const question = yield client_2.default.question.create({
            data: Object.assign(Object.assign({}, questionData), { type: buffDebuffs_1.QUESTION_TYPES[phase], phaseId: phaseRecord.id, points: questionData.points || 10, images: questionData.images || [] })
        });
        return res.json({ success: true, question });
    }
    catch (error) {
        console.error('Error adding phase question:', error);
        return res.status(500).json({ error: 'Failed to add question' });
    }
});
exports.addPhaseQuestion = addPhaseQuestion;
const adminLockTeam = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { teamId, duration = 1 } = req.body;
    try {
        const expiresAt = yield (0, buffDebuffs_1.lockTeam)(teamId, duration);
        return res.json({ success: true, teamId, expiresAt });
    }
    catch (error) {
        console.error('Error locking team:', error);
        return res.status(500).json({ error: 'Failed to lock team' });
    }
});
exports.adminLockTeam = adminLockTeam;
const adminUnlockTeam = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { teamId } = req.body;
    try {
        yield (0, buffDebuffs_1.unlockTeam)(teamId);
        return res.json({ success: true, teamId });
    }
    catch (error) {
        console.error('Error unlocking team:', error);
        return res.status(500).json({ error: 'Failed to unlock team' });
    }
});
exports.adminUnlockTeam = adminUnlockTeam;
const adminLockAllTeams = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { duration = 1 } = req.body;
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + duration);
    try {
        yield client_2.default.team.updateMany({
            data: {
                isLocked: true,
                lockedUntil: expiresAt
            }
        });
        const io = (0, socketInstance_1.getSocket)();
        io.emit('teams-locked', { expiresAt });
        return res.json({ success: true, expiresAt });
    }
    catch (error) {
        console.error('Error locking all teams:', error);
        return res.status(500).json({ error: 'Failed to lock teams' });
    }
});
exports.adminLockAllTeams = adminLockAllTeams;
const adminUnlockAllTeams = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, buffDebuffs_1.unlockAllTeams)();
        return res.json({ success: true });
    }
    catch (error) {
        console.error('Error unlocking all teams:', error);
        return res.status(500).json({ error: 'Failed to unlock teams' });
    }
});
exports.adminUnlockAllTeams = adminUnlockAllTeams;
const getLeaderboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const leaderboard = yield client_2.default.team.findMany({
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
    }
    catch (error) {
        console.error('Error getting leaderboard:', error);
        return res.status(500).json({ error: 'Failed to get leaderboard' });
    }
});
exports.getLeaderboard = getLeaderboard;
