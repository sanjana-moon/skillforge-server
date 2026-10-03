import type { Request, Response } from "express";
import * as MentorService from "../services/aiMentor.service";
import { param } from "../utils/param";

export async function getSessions(req: Request, res: Response) {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).send({ message: "Unauthorized" });

    const sessions = await MentorService.listSessions(email);
    res.send(sessions);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to fetch sessions" });
  }
}

export async function createSession(req: Request, res: Response) {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).send({ message: "Unauthorized" });

    const result = await MentorService.createSession(email);
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to create session" });
  }
}

export async function getSession(req: Request, res: Response) {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).send({ message: "Unauthorized" });

    const sessionId = param(req.params.sessionId);        // ← fixed
    const session = await MentorService.getSession(sessionId, email);
    if (!session) return res.status(404).send({ message: "Session not found" });

    res.send(session);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to fetch session" });
  }
}

export async function deleteSession(req: Request, res: Response) {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).send({ message: "Unauthorized" });

    const sessionId = param(req.params.sessionId);        // ← fixed
    const result = await MentorService.deleteSession(sessionId, email);
    if (!result) return res.status(400).send({ message: "Invalid session ID" });

    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to delete session" });
  }
}

export async function sendMessage(req: Request, res: Response) {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).send({ message: "Unauthorized" });

    const { message } = req.body as { message: string };
    if (!message) return res.status(400).send({ message: "Message is required" });

    const sessionId = param(req.params.sessionId);        // ← fixed

    const out = await MentorService.appendMessage(sessionId, email, message);

    if (out.status === "INVALID_ID")
      return res.status(400).send({ message: "Invalid session ID" });
    if (out.status === "NOT_FOUND")
      return res.status(404).send({ message: "Session not found" });

    res.send({ reply: out.reply });
  } catch (err: any) {
    console.error(err);
    if (err.message === "QUOTA_EXCEEDED") {
      return res.status(429).send({
        message: "Daily AI mentor limit reached. Please try again tomorrow.",
      });
    }
    res.status(500).send({ message: "Failed to get mentor reply" });
  }
}