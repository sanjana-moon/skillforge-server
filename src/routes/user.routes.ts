import { Router } from "express";
import * as UserController from "../controllers/user.controller.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = Router();

router.post("/", verifyToken, UserController.createUser);

export default router;