import type { Request, Response } from "express";
import * as StatsService from "../services/stats.service";

export async function getStats(req: Request, res: Response) {
  try {
    const stats = await StatsService.getInstructorStats(req.params.email as string);
    res.send(stats);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .send({ message: "Failed to load instructor dashboard stats" });
  }
}