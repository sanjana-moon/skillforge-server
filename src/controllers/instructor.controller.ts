import type { Request, Response } from "express";
import * as StatsService from "../services/stats.service";
import { param } from "../utils/param";

export async function getStats(req: Request, res: Response) {
  try {
    const email = param(req.params.email);                  // ← fixed
    const stats = await StatsService.getInstructorStats(email);
    res.send(stats);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .send({ message: "Failed to load instructor dashboard stats" });
  }
}