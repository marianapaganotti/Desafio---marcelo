import bcrypt from "bcryptjs";
import { db } from "./db";

export interface User {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
}

export interface LoginEntry {
  id: number;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface NewLogin {
  userId: number;
  jti: string;
  ip: string | null;
  userAgent: string | null;
  expiresAt: string;
}

const selectByEmail = db.prepare("SELECT * FROM users WHERE email = ?");
const selectById = db.prepare("SELECT * FROM users WHERE id = ?");
const insertUser = db.prepare(
  "INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)",
);
const insertLogin = db.prepare(
  "INSERT INTO logins (user_id, jti, ip, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)",
);
const selectLoginByJti = db.prepare(
  "SELECT expires_at, revoked_at FROM logins WHERE jti = ?",
);
const updateRevoked = db.prepare(
  "UPDATE logins SET revoked_at = ? WHERE jti = ? AND revoked_at IS NULL",
);
// O created_at tem resolução de segundos; o id desempata logins no mesmo segundo.
const selectLogins = db.prepare(`
  SELECT id, ip, user_agent, created_at, expires_at, revoked_at
  FROM logins
  WHERE user_id = ?
  ORDER BY created_at DESC, id DESC
  LIMIT ?
`);

export function findUserByEmail(email: string): User | undefined {
  return selectByEmail.get(email) as User | undefined;
}

export function findUserById(id: number): User | undefined {
  return selectById.get(id) as User | undefined;
}

export async function createUser(
  name: string,
  email: string,
  password: string,
): Promise<User> {
  const passwordHash = await bcrypt.hash(password, 10);
  const { lastInsertRowid } = insertUser.run(email, name, passwordHash);
  return findUserById(Number(lastInsertRowid)) as User;
}

export function verifyPassword(user: User, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.password_hash);
}

export function recordLogin(login: NewLogin): void {
  insertLogin.run(
    login.userId,
    login.jti,
    login.ip,
    login.userAgent,
    login.expiresAt,
  );
}

export function isLoginActive(jti: string): boolean {
  const login = selectLoginByJti.get(jti) as
    | Pick<LoginEntry, "expires_at" | "revoked_at">
    | undefined;
  if (!login || login.revoked_at) return false;
  return Date.parse(login.expires_at) > Date.now();
}

export function revokeLogin(jti: string): void {
  updateRevoked.run(new Date().toISOString(), jti);
}

export function listLogins(userId: number, limit = 10): LoginEntry[] {
  return selectLogins.all(userId, limit) as unknown as LoginEntry[];
}
