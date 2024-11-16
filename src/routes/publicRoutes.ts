import { Router } from "express";
import { RequestHandler } from "express";
import * as publicController from "../controllers/publicController";

const router = Router();

const typedHandler = (handler: RequestHandler): RequestHandler<any, Promise<any>> => handler;

// Routes with return type Promise<any>
router.post("/start-phase", typedHandler(publicController.startPhase));
router.post("/game-status", typedHandler(publicController.getGameStatus));
router.post("/broadcast", typedHandler(publicController.broadcastMessage));
router.post("/teams/:teamId/next-question", typedHandler(publicController.getNextQuestion));
router.post("/teams/:teamId/answer", typedHandler(publicController.answerQuestion));
router.post("/teams/:teamId/buff-debuff", typedHandler(publicController.applyBuffDebuff));
router.post("/admin/teams/:teamId/lock", typedHandler(publicController.adminLockTeam));
router.post("/admin/teams/:teamId/unlock", typedHandler(publicController.adminUnlockTeam));
router.post("/admin/teams/lock-all", typedHandler(publicController.adminLockAllTeams));
router.post("/admin/teams/unlock-all", typedHandler(publicController.adminUnlockAllTeams));
router.post("/add-phase-question", typedHandler(publicController.addPhaseQuestion));
router.post("/leaderboard", typedHandler(publicController.getLeaderboard));
router.post("/admin/change-phase", typedHandler(publicController.changePhase));

router.post("/admin/zones/create", typedHandler(publicController.createZone));
router.post("/admin/zones/update", typedHandler(publicController.updateZone));
router.post("/admin/phases/create", typedHandler(publicController.createPhase));

export default router;