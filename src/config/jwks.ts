import { createRemoteJWKSet } from "jose";
import { env } from "./env";

export const JWKS = createRemoteJWKSet(
  new URL(`${env.CLIENT_URL}/api/auth/jwks`),
  {
    timeoutDuration: 10000,
    cooldownDuration: 30000,
  }
);