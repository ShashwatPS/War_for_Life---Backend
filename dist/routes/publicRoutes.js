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
const typedHandler = (handler) => handler;
router.post("/start-phase", typedHandler(publicController.startPhase));
router.post("/game-status", typedHandler(publicController.getGameStatus));
router.post("/broadcast", typedHandler(publicController.broadcastMessage));
router.post("/teams/next-question", typedHandler(publicController.getNextQuestion));
router.post("/teams/answer", typedHandler(publicController.answerQuestion));
router.post("/teams/buff-debuff", typedHandler(publicController.applyBuffDebuff));
router.post("/teams/available-buffs", typedHandler(publicController.getAvailableBuffs));
router.post("/admin/lock", typedHandler(publicController.adminLockTeam));
router.post("/admin/unlock", typedHandler(publicController.adminUnlockTeam));
router.post("/admin/lock-all", typedHandler(publicController.adminLockAllTeams));
router.post("/admin/unlock-all", typedHandler(publicController.adminUnlockAllTeams));
router.post("/add-phase-question", typedHandler(publicController.addPhaseQuestion));
router.post("/leaderboard", typedHandler(publicController.getLeaderboard));
router.post("/admin/change-phase", typedHandler(publicController.changePhase));
router.post("/check-lock", typedHandler(publicController.checkLock));
router.get("/current-phase", typedHandler(publicController.getCurrentPhase));
router.post("/admin/zones/create", typedHandler(publicController.createZone));
router.post("/admin/zones/update", typedHandler(publicController.updateZone));
router.post("/admin/phases/create", typedHandler(publicController.createPhase));
exports.default = router;
