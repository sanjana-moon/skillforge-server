import { Router } from "express";
import * as UserController from "../controllers/user.controller";
import { verifyToken } from "../middleware/verifyToken";

const router = Router();

router.post("/", verifyToken, UserController.createUser);

export default router;