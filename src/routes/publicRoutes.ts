import { Router } from "express";
import { RequestHandler } from "express";
import * as publicController from "../controllers/publicController";

const router = Router();

const typedHandler = (handler: RequestHandler): RequestHandler<any, Promise<any>> => handler;

// Routes with return type Promise<any>
router.get("/game-status", typedHandler(publicController.getGameStatus));
router.get("/broadcast", typedHandler(publicController.broadcastMessage));
router.get("/teams/:teamId/next-question", typedHandler(publicController.getNextQuestion));
router.post("/teams/:teamId/answer", typedHandler(publicController.answerQuestion));
router.post("/teams/:teamId/buff-debuff", typedHandler(publicController.applyBuffDebuff));
router.post("/admin/teams/:teamId/lock", typedHandler(publicController.adminLockTeam));
router.post("/admin/teams/:teamId/unlock", typedHandler(publicController.adminUnlockTeam));
router.post("/admin/teams/lock-all", typedHandler(publicController.adminLockAllTeams));
router.post("/admin/teams/unlock-all", typedHandler(publicController.adminUnlockAllTeams));

export default router;