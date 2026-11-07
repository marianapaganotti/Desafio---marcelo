import express, { type NextFunction, type Request, type Response } from "express";
import { requireAuth, signAccessToken } from "./auth";
import { config } from "./config";
import {
  createUser,
  findUserByEmail,
  findUserById,
  listLogins,
  recordLogin,
  revokeLogin,
  verifyPassword,
  type User,
} from "./users";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

const app = express();
app.set("trust proxy", true);
app.use(express.json());
app.use(express.static("public"));

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// NOCASE só ignora maiúsculas em ASCII; o minúsculo cobre "JOÃO@..." e "joão@...".
function normalizeEmail(value: unknown): string {
  return text(value).trim().toLowerCase();
}

function issueToken(req: Request, user: User) {
  const { token, jti, expiresAt } = signAccessToken(user.id, user.email);
  recordLogin({
    userId: user.id,
    jti,
    ip: req.ip?.replace(/^::ffff:/, "") ?? null,
    userAgent: req.get("user-agent") ?? null,
    expiresAt,
  });
  return {
    access_token: token,
    token_type: "Bearer",
    expires_in: config.jwtExpiresIn,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && err.message.includes("UNIQUE constraint failed");
}

app.post("/api/register", async (req, res) => {
  const name = text(req.body?.name).trim();
  const email = normalizeEmail(req.body?.email);
  const password = text(req.body?.password);

  if (!name) {
    res.status(400).json({ error: "Informe o nome." });
    return;
  }
  if (!EMAIL_REGEX.test(email)) {
    res.status(400).json({ error: "Informe um e-mail válido." });
    return;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    res
      .status(400)
      .json({ error: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
    return;
  }

  const duplicate = { error: "Este e-mail já está cadastrado." };
  if (findUserByEmail(email)) {
    res.status(409).json(duplicate);
    return;
  }

  let user: User;
  try {
    user = await createUser(name, email, password);
  } catch (err) {
    // Dois cadastros simultâneos podem passar pela consulta acima.
    if (isUniqueViolation(err)) {
      res.status(409).json(duplicate);
      return;
    }
    throw err;
  }

  res.status(201).json(issueToken(req, user));
});

app.post("/api/login", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = text(req.body?.password);

  if (!email || !password) {
    res.status(400).json({ error: "Informe o e-mail e a senha." });
    return;
  }

  const user = findUserByEmail(email);
  if (!user || !(await verifyPassword(user, password))) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  res.json(issueToken(req, user));
});

app.get("/api/me", requireAuth, (req, res) => {
  const user = findUserById(req.auth!.userId);
  if (!user) {
    res.status(401).json({ error: "Token inválido ou expirado." });
    return;
  }
  const { id, email, name, created_at } = user;
  res.json({ id, email, name, created_at });
});

app.get("/api/logins", requireAuth, (req, res) => {
  res.json(listLogins(req.auth!.userId));
});

app.post("/api/logout", requireAuth, (req, res) => {
  revokeLogin(req.auth!.jti);
  res.status(204).end();
});

app.use((_req, res) => {
  res.status(404).json({ error: "Rota não encontrada." });
});

app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const { status, type } = err as { status?: number; type?: string };
  if (type === "entity.parse.failed") {
    res.status(400).json({ error: "O corpo da requisição não é um JSON válido." });
    return;
  }
  if (status && status >= 400 && status < 500) {
    res.status(status).json({ error: "Requisição inválida." });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Erro interno do servidor." });
});

app.listen(config.port, (err?: Error) => {
  if (err) {
    console.error(`Não foi possível iniciar o servidor: ${err.message}`);
    process.exit(1);
  }
  console.log(`Servidor rodando em http://localhost:${config.port}`);
});
