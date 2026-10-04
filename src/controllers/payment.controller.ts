import type { Request, Response } from "express";
import * as PaymentService from "../services/payment.service.js";
import { param } from "../utils/param.js";

export async function getStudentPayments(req: Request, res: Response) {
  try {
    const email = param(req.params.email);
    const payments = await PaymentService.getPaymentsByStudent(email);
    res.send(payments);
  } catch (err) {
    console.error("Error fetching student payments:", err);
    res.status(500).send({ message: "Failed to fetch payments" });
  }
}