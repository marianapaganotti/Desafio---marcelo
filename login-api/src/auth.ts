import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config";
import { isLoginActive } from "./users";

const ALGORITHM = "HS256";

export interface AuthContext {
  userId: number;
  email: string;
  jti: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function signAccessToken(userId: number, email: string) {
  const jti = randomUUID();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = issuedAt + config.jwtExpiresIn;

  const token = jwt.sign(
    { sub: String(userId), email, jti, iat: issuedAt, exp: expiresAtSeconds },
    config.jwtSecret,
    { algorithm: ALGORITHM },
  );

  return {
    token,
    jti,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get("authorization") ?? "");
  if (!match) {
    res.status(401).json({ error: "Token de acesso não informado." });
    return;
  }

  try {
    const payload = jwt.verify(match[1], config.jwtSecret, {
      algorithms: [ALGORITHM],
    }) as jwt.JwtPayload;

    if (payload.jti && payload.sub && isLoginActive(payload.jti)) {
      req.auth = {
        userId: Number(payload.sub),
        email: payload.email,
        jti: payload.jti,
      };
      next();
      return;
    }
  } catch (err) {
    if (!(err instanceof jwt.JsonWebTokenError)) throw err;
  }

  res.status(401).json({ error: "Token inválido ou expirado." });
}
