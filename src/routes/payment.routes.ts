import { Router } from "express";
import * as PaymentController from "../controllers/payment.controller";
import { verifyToken } from "../middleware/verifyToken";
import { requireRole } from "../middleware/requireRole";
import { requireSelf } from "../middleware/requireSelf";

const router = Router();

router.get(
  "/student/:email",
  verifyToken,
  requireRole("student"),
  requireSelf("email"),
  PaymentController.getStudentPayments
);

export default router;