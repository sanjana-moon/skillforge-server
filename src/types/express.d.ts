import type { JWTPayload } from "jose";

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload & {
        email?: string;
        name?: string;
        image?: string;
      };
    }
  }
}

export {};