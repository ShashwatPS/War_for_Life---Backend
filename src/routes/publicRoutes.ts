import { Router } from "express";
import * as publicController from "../controllers/publicController";

const router = Router();

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

export default router;