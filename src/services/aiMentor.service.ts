import { ObjectId } from "mongodb";
import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { mentorSessionCollection, getDB } from "../config/db.js";
import type { MentorMessage, MentorSession } from "../types/models.js";

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

function toGeminiContents(messages: MentorMessage[]) {
  return messages
    .filter((m) => m.content && m.content.trim().length > 0)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
}

export async function getMentorReply(
  conversation: MentorMessage[]
): Promise<string> {
  const contents = toGeminiContents(conversation);

  if (contents.length === 0) {
    throw new Error("Empty conversation - nothing to send to Gemini.");
  }

  const models = ["gemini-3.1-flash-lite", "gemini-3.5-flash"];
  let allQuotaExceeded = true;

  for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`Using ${model} (Attempt ${attempt})`);

        const response = await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: `
You are SkillForge AI Mentor.

Your role is to help students learn programming, web development, AI, and technology.

Rules:
- Be friendly and encouraging.
- Give concise but complete answers.
- Explain difficult concepts simply.
- Recommend learning resources when appropriate.
- If asked about careers, provide practical guidance.
- If you don't know something, say so instead of making it up.
`,
          },
        });

        return response.text ?? "Sorry, I couldn't generate a response.";
      } catch (error: any) {
        console.error(`${model} failed (Attempt ${attempt})`, error);

        if (error.status !== 429) allQuotaExceeded = false;

        if ((error.status === 503 || error.status === 429) && attempt < 3) {
          const delay = error.status === 429 ? 40000 : attempt * 2000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (error.status === 503 || error.status === 429) break;

        throw error;
      }
    }
  }

  if (allQuotaExceeded) throw new Error("QUOTA_EXCEEDED");

  throw new Error(
    "AI service is temporarily unavailable. Please try again later."
  );
}

export async function listSessions(email: string) {
  const col = (await getDB()).collection<MentorSession>("mentorSessions");
  return col
    .find({ userEmail: email })
    .sort({ updatedAt: -1 })
    .toArray();
}

export async function createSession(email: string) {
  const now = new Date();
  return mentorSessionCollection.insertOne({
    userEmail: email,
    title: "New conversation",
    messages: [],
    createdAt: now,
    updatedAt: now,
  });
}

export async function getSession(sessionId: string, email: string) {
  if (!ObjectId.isValid(sessionId)) return null;
  return mentorSessionCollection.findOne({
    _id: new ObjectId(sessionId),
    userEmail: email,
  });
}

export async function deleteSession(sessionId: string, email: string) {
  if (!ObjectId.isValid(sessionId)) return null;
  return mentorSessionCollection.deleteOne({
    _id: new ObjectId(sessionId),
    userEmail: email,
  });
}

export async function appendMessage(
  sessionId: string,
  email: string,
  message: string
) {
  if (!ObjectId.isValid(sessionId)) return { status: "INVALID_ID" as const };

  const session = await mentorSessionCollection.findOne({
    _id: new ObjectId(sessionId),
    userEmail: email,
  });
  if (!session) return { status: "NOT_FOUND" as const };

  const userMessage: MentorMessage = {
    role: "user",
    content: message,
    createdAt: new Date(),
  };

  const updatedHistory = [...session.messages, userMessage];
  const reply = await getMentorReply(updatedHistory);

  const assistantMessage: MentorMessage = {
    role: "assistant",
    content: reply,
    createdAt: new Date(),
  };

  const finalHistory = [...updatedHistory, assistantMessage];

  await mentorSessionCollection.updateOne(
    { _id: new ObjectId(sessionId) },
    {
      $set: {
        messages: finalHistory,
        updatedAt: new Date(),
        ...(session.messages.length === 0
          ? { title: message.slice(0, 50) }
          : {}),
      },
    }
  );

  return { status: "OK" as const, reply: assistantMessage };
}