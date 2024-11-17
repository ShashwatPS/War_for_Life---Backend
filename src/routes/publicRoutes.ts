import { Router } from "express";
import { RequestHandler } from "express";
import * as publicController from "../controllers/publicController";

const router = Router();

const typedHandler = (handler: RequestHandler): RequestHandler<any, Promise<any>> => handler;

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
router.get("/phase-1-zones", typedHandler(publicController.getPhase1ZoneStatus));

router.post("/admin/zones/create", typedHandler(publicController.createZone));
router.post("/admin/zones/update", typedHandler(publicController.updateZone));
router.post("/admin/phases/create", typedHandler(publicController.createPhase));

export default router;