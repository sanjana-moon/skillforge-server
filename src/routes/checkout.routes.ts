import { Router } from "express";
import * as CheckoutController from "../controllers/checkout.controller.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();

router.post("/", verifyToken, requireRole("student"), CheckoutController.checkout);

export default router;