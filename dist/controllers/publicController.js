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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkZoneLock = exports.unlockAllZones = exports.lockAllZones = exports.unlockZone = exports.lockZone = exports.getBroadcasts = exports.getZoneStatus = exports.getCurrentPhase = exports.checkLock = exports.getAvailableBuffs = exports.createPhase = exports.updateZone = exports.createZone = exports.changePhase = exports.getLeaderboard = exports.adminUnlockAllTeams = exports.adminLockAllTeams = exports.adminUnlockTeam = exports.adminLockTeam = exports.addPhaseQuestion = exports.answerQuestion = exports.getGameStatus = exports.broadcastMessage = exports.applyBuffDebuff = exports.getNextQuestion = exports.startPhase = void 0;
const socketInstance_1 = require("../services/socketInstance");
const client_1 = __importDefault(require("../db/client"));
const socketService_1 = require("../services/socketService");
const buffDebuffs_1 = require("../helpers/buffDebuffs");
const ws_1 = require("ws");
const startPhase = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { phase } = req.body;
    const wss = (0, socketInstance_1.getSocket)();
    yield client_1.default.phase.updateMany({
        data: { isActive: false },
    });
    const updatedPhase = yield client_1.default.phase.update({
        where: { phase },
        data: {
            isActive: true,
            startTime: new Date(),
        },
    });
    yield client_1.default.team.updateMany({
        data: { currentPhase: phase },
    });
    wss.clients.forEach(client => {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            client.send(JSON.stringify({ event: 'phase-change', data: { phase, startTime: updatedPhase.startTime } }));
        }
    });
    return res.json({ success: true });
});
exports.startPhase = startPhase;
const getNextQuestion = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { zoneId } = req.body;
    const teamId = req.user.userId;
    const team = yield client_1.default.team.findUnique({
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
            const zone = yield client_1.default.zone.findUnique({
                where: { id: zoneId }
            });
            if ((zone === null || zone === void 0 ? void 0 : zone.phase1Complete) && zone.capturedById !== teamId) {
                return res.status(400).json({ error: 'Zone is already captured' });
            }
            question = yield client_1.default.question.findFirst({
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
            question = yield client_1.default.question.findFirst({
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
            question = yield client_1.default.question.findFirst({
                where: {
                    id: {
                        in: team.extraQuestions.map(q => q.id)
                    }
                }
            });
            // If no extra questions, get regular question
            if (!question) {
                question = yield client_1.default.question.findFirst({
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
    yield client_1.default.team.update({
        where: { id: teamId },
        data: { currentQuestionId: question.id }
    });
    // Remove the correctAnswer field before sending the response
    const { correctAnswer } = question, filteredQuestion = __rest(question, ["correctAnswer"]);
    return res.json(filteredQuestion);
});
exports.getNextQuestion = getNextQuestion;
const BUFF_DURATIONS = {
    LOCK_ONE_TEAM: 1,
    LOCK_ALL_EXCEPT_ONE: 0.5,
    EXTRA_QUESTION: 0,
    QUESTION_SKIP: 0
};
const applyBuffDebuff = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { type, targetTeamId } = req.body;
    const sourceTeamId = req.user.userId;
    // Validate source team and available buffs
    const sourceTeam = yield client_1.default.team.findUnique({
        where: { id: sourceTeamId },
        select: { availableBuffs: true, currentPhase: true }
    });
    if (!sourceTeam) {
        return res.status(404).json({ error: 'Source team not found' });
    }
    // Validate target team is online
    const targetTeam = yield client_1.default.team.findUnique({
        where: {
            id: targetTeamId,
            socketId: { not: null }
        }
    });
    if (!targetTeam) {
        return res.status(400).json({ error: 'Target team is not online' });
    }
    const availableBuffs = sourceTeam.availableBuffs;
    if (!availableBuffs.includes(type)) {
        return res.status(400).json({ error: 'Buff not available' });
    }
    let expiresAt = new Date();
    const wss = (0, socketInstance_1.getSocket)();
    try {
        switch (type) {
            case 'LOCK_ONE_TEAM':
                expiresAt = yield (0, buffDebuffs_1.lockTeam)(targetTeamId, BUFF_DURATIONS.LOCK_ONE_TEAM);
                wss.clients.forEach(client => {
                    if (client.readyState === ws_1.WebSocket.OPEN) {
                        client.send(JSON.stringify({ event: 'team-locked', data: { teamId: targetTeamId, expiresAt } }));
                    }
                });
                break;
            case 'LOCK_ALL_EXCEPT_ONE':
                expiresAt = yield (0, buffDebuffs_1.lockAllTeamsExcept)(targetTeamId, BUFF_DURATIONS.LOCK_ALL_EXCEPT_ONE);
                wss.clients.forEach(client => {
                    if (client.readyState === ws_1.WebSocket.OPEN) {
                        client.send(JSON.stringify({ event: 'teams-locked-except-one', data: { teamId: targetTeamId, expiresAt } }));
                    }
                });
                break;
            case 'EXTRA_QUESTION':
                yield (0, buffDebuffs_1.assignExtraQuestion)(targetTeamId);
                break;
            case 'QUESTION_SKIP':
                yield (0, buffDebuffs_1.skipCurrentQuestion)(targetTeamId);
                break;
        }
        yield client_1.default.$transaction([
            client_1.default.buffDebuff.create({
                data: {
                    type,
                    appliedById: sourceTeamId,
                    appliedToId: targetTeamId,
                    expiresAt,
                    phase: sourceTeam.currentPhase,
                    isUsed: true
                }
            }),
            client_1.default.team.update({
                where: { id: sourceTeamId },
                data: {
                    availableBuffs: availableBuffs.filter(b => b !== type)
                }
            })
        ]);
        (0, socketService_1.emitTeamsList)((0, socketInstance_1.getSocket)(), client_1.default);
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
    const broadcast = yield client_1.default.broadcast.create({
        data: {
            message,
            senderId,
            type,
            priority,
            pastMessages: {}
        }
    });
    wss.clients.forEach(client => {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            client.send(JSON.stringify({ event: 'broadcast', data: broadcast }));
        }
    });
    return res.json(broadcast);
});
exports.broadcastMessage = broadcastMessage;
const getGameStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const [teams, zones, currentPhase] = yield Promise.all([
        client_1.default.team.findMany({
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
        client_1.default.zone.findMany({
            include: {
                capturedBy: { select: { teamName: true } }
            },
            orderBy: {
                name: 'asc' // Add this ordering
            }
        }),
        client_1.default.phase.findFirst({
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
    const { answer, zoneId } = req.body;
    const teamId = req.user.userId;
    const wss = (0, socketInstance_1.getSocket)();
    try {
        const team = yield client_1.default.team.findUnique({
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
        const isCorrect = answer.toLowerCase() === question.correctAnswer.toLowerCase();
        // Create or update progress regardless of previous attempts
        const questionProgress = yield client_1.default.questionProgress.upsert({
            where: {
                teamId_questionId: {
                    teamId,
                    questionId: question.id
                }
            },
            update: Object.assign({ attempts: { increment: 1 }, isCompleted: isCorrect }, (isCorrect ? { endTime: new Date() } : {})),
            create: Object.assign({ teamId, questionId: question.id, attempts: 1, isCompleted: isCorrect, startTime: new Date() }, (isCorrect ? { endTime: new Date() } : {}))
        });
        if (isCorrect) {
            let points = question.points || 10;
            let transactions = [];
            // Only process correct answer if not already answered
            if (!team.answeredQuestions.some(q => q.id === question.id)) {
                transactions.push(client_1.default.team.update({
                    where: { id: teamId },
                    data: {
                        score: { increment: points },
                        answeredQuestions: { connect: { id: question.id } },
                        currentQuestionId: null
                    }
                }));
                // Rest of phase-specific logic
                switch (team.currentPhase) {
                    case 'PHASE_1': {
                        if (question.type === 'ZONE_SPECIFIC' && zoneId) {
                            const zoneQuestions = yield client_1.default.$transaction([
                                client_1.default.question.count({
                                    where: {
                                        zoneId,
                                        type: 'ZONE_SPECIFIC'
                                    }
                                }),
                                client_1.default.question.count({
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
                                transactions.push(client_1.default.zone.update({
                                    where: { id: zoneId },
                                    data: {
                                        capturedById: teamId,
                                        phase1Complete: true
                                    }
                                }));
                                // Emit zone capture event
                                wss.clients.forEach(client => {
                                    if (client.readyState === ws_1.WebSocket.OPEN) {
                                        client.send(JSON.stringify({
                                            event: 'zone-captured',
                                            data: {
                                                zoneId,
                                                teamId,
                                                zoneName: zone.name,
                                                teamName: team.teamName,
                                                phase: 'PHASE_1',
                                                timestamp: new Date()
                                            }
                                        }));
                                    }
                                });
                                const buff = (0, buffDebuffs_1.generateRandomBuffDebuff)();
                                transactions.push(client_1.default.team.update({
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
                            transactions.push(client_1.default.zone.updateMany({
                                where: { capturedById: teamId },
                                data: {
                                    capturedById: null,
                                    phase1Complete: true
                                }
                            }));
                            // Then capture the new zone
                            transactions.push(client_1.default.zone.update({
                                where: { id: zoneId },
                                data: {
                                    capturedById: teamId,
                                    phase1Complete: true
                                }
                            }));
                            // Emit zone capture event
                            wss.clients.forEach(client => {
                                if (client.readyState === ws_1.WebSocket.OPEN) {
                                    client.send(JSON.stringify({
                                        event: 'zone-captured',
                                        data: {
                                            zoneId,
                                            teamId,
                                            teamName: team.teamName,
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
                        const hasZoneFromPhase2 = yield client_1.default.zone.findFirst({
                            where: { capturedById: teamId }
                        });
                        if (!hasZoneFromPhase2) {
                            return res.status(403).json({
                                error: 'Team must have captured a zone in Phase 2 to participate in Phase 3'
                            });
                        }
                        if (team.extraQuestions.some(q => q.id === question.id)) {
                            points = Math.floor(points * 1.5); // 50% bonus for extra questions
                            transactions[0] = client_1.default.team.update({
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
                yield client_1.default.$transaction(transactions);
                const [teamName, zoneName] = yield client_1.default.$transaction([
                    client_1.default.team.findFirst({ where: { id: teamId }, select: { teamName: true } }),
                    client_1.default.zone.findFirst({ where: { id: zoneId }, select: { name: true } })
                ]);
                if (zoneId) { // Only send zone update if zoneId exists
                    wss.clients.forEach(client => {
                        if (client.readyState === ws_1.WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                event: 'zone-update',
                                data: {
                                    zoneId, // ID of the zone being updated
                                    teamId, // ID of the team that answered correctly
                                    phase: team.currentPhase, // Current game phase
                                    teamName, // Name of the team
                                    zoneName // Name of the zone
                                }
                            }));
                        }
                    });
                }
                (0, socketService_1.emitLeaderboard)(wss, client_1.default);
                return res.json({
                    success: true,
                    points,
                    zoneId: zoneId || undefined
                });
            }
            else {
                return res.status(400).json({ error: 'Question already answered' });
            }
        }
        else {
            return res.json({
                success: false,
                error: 'Incorrect answer',
                attempts: questionProgress.attempts,
                canRetry: true
            });
        }
    }
    catch (error) {
        console.error('Error processing answer:', error);
        return res.status(500).json({ error: 'Failed to process answer' });
    }
});
exports.answerQuestion = answerQuestion;
const addPhaseQuestion = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { phase, questionData } = req.body;
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
        const phaseRecord = yield client_1.default.phase.upsert({
            where: { phase },
            create: { phase, isActive: false },
            update: {}
        });
        const question = yield client_1.default.question.create({
            data: Object.assign(Object.assign({}, questionData), { phaseId: phaseRecord.id })
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
    const { duration = 1, teamId } = req.body;
    const wss = (0, socketInstance_1.getSocket)();
    try {
        const expiresAt = yield (0, buffDebuffs_1.lockTeam)(teamId, duration);
        // Set up unlock timer
        setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
            try {
                yield (0, buffDebuffs_1.unlockTeam)(teamId);
                wss.clients.forEach(client => {
                    if (client.readyState === ws_1.WebSocket.OPEN) {
                        client.send(JSON.stringify({ event: 'team-unlocked', data: { teamId } }));
                    }
                });
            }
            catch (error) {
                console.error('Error in auto unlock:', error);
            }
        }), duration * 60 * 1000);
        wss.clients.forEach(client => {
            if (client.readyState === ws_1.WebSocket.OPEN) {
                client.send(JSON.stringify({ event: 'team-locked', data: { teamId, expiresAt } }));
            }
        });
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
    const wss = (0, socketInstance_1.getSocket)();
    try {
        if (!teamId) {
            return res.status(400).json({ error: "Team ID is required" });
        }
        const team = yield client_1.default.team.findUnique({
            where: { id: teamId },
            select: { isLocked: true }
        });
        if (!team) {
            return res.status(404).json({ error: "Team not found" });
        }
        if (!team.isLocked) {
            return res.json({ message: "Team is already unlocked" });
        }
        yield client_1.default.team.update({
            where: { id: teamId },
            data: {
                isLocked: false,
                lockedUntil: null
            }
        });
        wss.clients.forEach(client => {
            if (client.readyState === ws_1.WebSocket.OPEN) {
                client.send(JSON.stringify({ event: 'team-unlocked', data: { teamId } }));
            }
        });
        return res.json({ message: "Team unlocked successfully" });
    }
    catch (error) {
        console.error("Error unlocking team:", error);
        return res.status(500).json({ error: "Failed to unlock team" });
    }
});
exports.adminUnlockTeam = adminUnlockTeam;
const adminLockAllTeams = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { duration = 1 } = req.body;
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + duration);
    const wss = (0, socketInstance_1.getSocket)();
    try {
        yield client_1.default.team.updateMany({
            data: {
                isLocked: true,
                lockedUntil: expiresAt
            }
        });
        wss.clients.forEach(client => {
            if (client.readyState === ws_1.WebSocket.OPEN) {
                client.send(JSON.stringify({ event: 'teams-locked', data: { expiresAt } }));
            }
        });
        return res.json({ success: true, expiresAt });
    }
    catch (error) {
        console.error('Error locking all teams:', error);
        return res.status(500).json({ error: 'Failed to lock teams' });
    }
});
exports.adminLockAllTeams = adminLockAllTeams;
const adminUnlockAllTeams = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const wss = (0, socketInstance_1.getSocket)();
    try {
        yield (0, buffDebuffs_1.unlockAllTeams)();
        wss.clients.forEach(client => {
            if (client.readyState === ws_1.WebSocket.OPEN) {
                client.send(JSON.stringify({ event: 'teams-unlocked' }));
            }
        });
        return res.json({ success: true });
    }
    catch (error) {
        console.error('Error unlocking all teams:', error);
        return res.status(500).json({ error: 'Failed to unlock all teams' });
    }
});
exports.adminUnlockAllTeams = adminUnlockAllTeams;
const getLeaderboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const leaderboard = yield client_1.default.team.findMany({
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
const changePhase = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { phase } = req.body;
    const wss = (0, socketInstance_1.getSocket)();
    yield client_1.default.phase.updateMany({
        data: { isActive: false },
    });
    const updatedPhase = yield client_1.default.phase.update({
        where: { phase },
        data: {
            isActive: true,
            startTime: new Date(),
        },
    });
    yield client_1.default.team.updateMany({
        data: { currentPhase: phase },
    });
    const phaseData = {
        phase,
        startTime: updatedPhase.startTime,
        message: `Phase changed to ${phase}`
    };
    wss.clients.forEach(client => {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            client.send(JSON.stringify({ event: 'phase-change', data: phaseData }));
        }
    });
    return res.json({ success: true, data: phaseData });
});
exports.changePhase = changePhase;
const createZone = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const zoneData = req.body;
    try {
        const zone = yield client_1.default.zone.create({
            data: Object.assign(Object.assign({}, zoneData), { phase1Complete: false })
        });
        return res.json({ success: true, zone });
    }
    catch (error) {
        console.error('Error creating zone:', error);
        return res.status(500).json({ error: 'Failed to create zone' });
    }
});
exports.createZone = createZone;
const updateZone = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const _a = req.body, { id } = _a, zoneData = __rest(_a, ["id"]);
    try {
        const zone = yield client_1.default.zone.update({
            where: { id },
            data: zoneData
        });
        return res.json({ success: true, zone });
    }
    catch (error) {
        console.error('Error updating zone:', error);
        return res.status(500).json({ error: 'Failed to update zone' });
    }
});
exports.updateZone = updateZone;
const createPhase = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { phase, isActive = false } = req.body;
    try {
        const phaseRecord = yield client_1.default.phase.create({
            data: {
                phase,
                isActive,
                startTime: isActive ? new Date() : null
            }
        });
        return res.json({ success: true, phase: phaseRecord });
    }
    catch (error) {
        console.error('Error creating phase:', error);
        return res.status(500).json({ error: 'Failed to create phase' });
    }
});
exports.createPhase = createPhase;
const getAvailableBuffs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const teamId = req.user.userId;
    try {
        const sourceTeam = yield client_1.default.team.findUnique({
            where: { id: teamId },
            select: {
                availableBuffs: true,
                currentPhase: true
            }
        });
        if (!sourceTeam) {
            return res.status(404).json({ error: 'Team not found' });
        }
        const onlineTeams = yield client_1.default.team.findMany({
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
        const buffInfo = sourceTeam.availableBuffs.map(buff => ({
            type: buff,
            duration: BUFF_DURATIONS[buff],
            description: getBuffDescription(buff)
        }));
        return res.json({
            availableBuffs: buffInfo,
            targetTeams: onlineTeams
        });
    }
    catch (error) {
        console.error('Error getting available buffs:', error);
        return res.status(500).json({ error: 'Failed to get available buffs' });
    }
});
exports.getAvailableBuffs = getAvailableBuffs;
const checkLock = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const teamId = req.user.userId;
        const team = yield client_1.default.team.findUnique({
            where: { id: teamId },
            select: { isLocked: true }
        });
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }
        if (team.isLocked) {
            return res.status(400).json({ error: 'Team is locked' });
        }
        else {
            return res.status(200).json({ success: true });
        }
    }
    catch (error) {
        console.error('Error checking lock:', error);
        return res.status(500).json({ error: 'Failed to check lock' });
    }
});
exports.checkLock = checkLock;
function getBuffDescription(type) {
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
const getCurrentPhase = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const currentPhase = yield client_1.default.phase.findFirst({
            where: { isActive: true },
            select: {
                phase: true,
                startTime: true
            }
        });
        return res.json(currentPhase || { phase: null, startTime: null });
    }
    catch (error) {
        console.error('Error getting current phase:', error);
        return res.status(500).json({ error: 'Failed to get current phase' });
    }
});
exports.getCurrentPhase = getCurrentPhase;
const getZoneStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const zones = yield client_1.default.zone.findMany({
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
    }
    catch (error) {
        console.error('Error getting zone status:', error);
        return res.status(500).json({ error: 'Failed to get zone status' });
    }
});
exports.getZoneStatus = getZoneStatus;
const getBroadcasts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const broadcasts = yield client_1.default.broadcast.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                message: true,
                priority: true,
                createdAt: true,
            }
        });
        return res.json(broadcasts);
    }
    catch (error) {
        console.error('Error getting broadcasts:', error);
        return res.status(500).json({ error: 'Failed to get broadcasts' });
    }
});
exports.getBroadcasts = getBroadcasts;
const lockZone = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { zoneId } = req.body;
    const wss = (0, socketInstance_1.getSocket)();
    try {
        const zone = yield client_1.default.zone.update({
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
            if (client.readyState === ws_1.WebSocket.OPEN) {
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
    }
    catch (error) {
        console.error('Error locking zone:', error);
        return res.status(500).json({ error: 'Failed to lock zone' });
    }
});
exports.lockZone = lockZone;
const unlockZone = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { zoneId } = req.body;
    const wss = (0, socketInstance_1.getSocket)();
    try {
        const zone = yield client_1.default.zone.update({
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
            if (client.readyState === ws_1.WebSocket.OPEN) {
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
    }
    catch (error) {
        console.error('Error unlocking zone:', error);
        return res.status(500).json({ error: 'Failed to unlock zone' });
    }
});
exports.unlockZone = unlockZone;
const lockAllZones = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const wss = (0, socketInstance_1.getSocket)();
    try {
        const zones = yield client_1.default.zone.findMany({
            include: {
                capturedBy: {
                    select: {
                        id: true,
                        teamName: true
                    }
                }
            }
        });
        yield client_1.default.zone.updateMany({
            data: { isLocked: true }
        });
        wss.clients.forEach(client => {
            if (client.readyState === ws_1.WebSocket.OPEN) {
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
    }
    catch (error) {
        console.error('Error locking all zones:', error);
        return res.status(500).json({ error: 'Failed to lock all zones' });
    }
});
exports.lockAllZones = lockAllZones;
const unlockAllZones = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const wss = (0, socketInstance_1.getSocket)();
    try {
        const zones = yield client_1.default.zone.findMany({
            include: {
                capturedBy: {
                    select: {
                        id: true,
                        teamName: true
                    }
                }
            }
        });
        yield client_1.default.zone.updateMany({
            data: { isLocked: false }
        });
        wss.clients.forEach(client => {
            if (client.readyState === ws_1.WebSocket.OPEN) {
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
    }
    catch (error) {
        console.error('Error unlocking all zones:', error);
        return res.status(500).json({ error: 'Failed to unlock all zones' });
    }
});
exports.unlockAllZones = unlockAllZones;
const checkZoneLock = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { zoneId } = req.body;
    try {
        const zone = yield client_1.default.zone.findUnique({
            where: { id: zoneId },
            select: { isLocked: true }
        });
        if (!zone) {
            return res.status(404).json({ error: 'Zone not found' });
        }
        return res.json({ isLocked: zone.isLocked });
    }
    catch (error) {
        console.error('Error checking zone lock:', error);
        return res.status(500).json({ error: 'Failed to check zone lock' });
    }
});
exports.checkZoneLock = checkZoneLock;
