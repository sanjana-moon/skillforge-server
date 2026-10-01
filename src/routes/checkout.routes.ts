import { Router } from "express";
import * as CheckoutController from "../controllers/checkout.controller";
import { verifyToken } from "../middleware/verifyToken";
import { requireRole } from "../middleware/requireRole";

const router = Router();

router.post("/", verifyToken, requireRole("student"), CheckoutController.checkout);

export default router;