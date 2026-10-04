import { Router } from "express";
import * as PaymentController from "../controllers/payment.controller.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireSelf } from "../middleware/requireSelf.js";

const router = Router();

router.get(
  "/student/:email",
  verifyToken,
  requireRole("student"),
  requireSelf("email"),
  PaymentController.getStudentPayments
);

export default router;