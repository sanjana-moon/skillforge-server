import type { Request, Response } from "express";
import * as PaymentService from "../services/payment.service";

export async function checkout(req: Request, res: Response) {
  try {
    const { courseId, transactionId, paymentStatus } = req.body as {
      courseId: string;
      transactionId: string;
      paymentStatus: string;
    };

    const out = await PaymentService.processCheckout(
      req.user!.email as string,
      courseId,
      transactionId,
      paymentStatus
    );

    if (out.status === "USER_NOT_FOUND")
      return res
        .status(404)
        .send({ success: false, message: "User not found" });

    if (out.status === "COURSE_NOT_FOUND")
      return res.status(404).send({
        success: false,
        message: "Course not found or not available",
      });

    if (out.status === "ALREADY_ENROLLED")
      return res
        .status(200)
        .send({ success: true, message: "Already enrolled" });

    if (out.status === "PAYMENT_EXISTS")
      return res
        .status(200)
        .send({ success: true, message: "Payment already processed" });

    res.send({
      success: true,
      enrollment: out.enrollment,
      message: "Enrollment created successfully",
    });
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).send({ success: false, message: "Checkout failed" });
  }
}