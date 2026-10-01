import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

router.get("/health", (req: Request, res: Response) => {
  res.send({ status: "ok" });
});

router.get("/", (req: Request, res: Response) => {
  res.send("SkillForge server is running!");
});

export default router;