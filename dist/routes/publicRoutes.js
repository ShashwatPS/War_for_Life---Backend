"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const publicController = __importStar(require("../controllers/publicController"));
const router = (0, express_1.Router)();
// Routes without explicit type casting
router.post("/start-phase", publicController.startPhase);
router.post("/add-question", publicController.addQuestion);
router.post("/game-status", publicController.getGameStatus);
router.post("/broadcast", publicController.broadcastMessage);
router.post("/teams/:teamId/next-question", publicController.getNextQuestion);
router.post("/teams/:teamId/answer", publicController.answerQuestion);
router.post("/teams/:teamId/buff-debuff", publicController.applyBuffDebuff);
router.post("/admin/teams/:teamId/lock", publicController.adminLockTeam);
router.post("/admin/teams/:teamId/unlock", publicController.adminUnlockTeam);
router.post("/admin/teams/lock-all", publicController.adminLockAllTeams);
router.post("/admin/teams/unlock-all", publicController.adminUnlockAllTeams);
router.post("/add-phase-question", publicController.addPhaseQuestion);
exports.default = router;
