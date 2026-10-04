import { Router } from "express";
import * as MentorController from "../controllers/aiMentor.controller.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = Router();

router.use(verifyToken);

router.get("/sessions", MentorController.getSessions);
router.post("/sessions", MentorController.createSession);
router.get("/sessions/:sessionId", MentorController.getSession);
router.delete("/sessions/:sessionId", MentorController.deleteSession);
router.post("/sessions/:sessionId/messages", MentorController.sendMessage);

export default router;