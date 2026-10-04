import { Router } from "express";
import * as ProfileController from "../controllers/profile.controller.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = Router();

router.get("/", verifyToken, ProfileController.getProfile);
router.put("/", verifyToken, ProfileController.updateProfile);

export default router;