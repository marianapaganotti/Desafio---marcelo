export {};

const TOKEN_KEY = "access_token";

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface Me {
  id: number;
  email: string;
  name: string;
  created_at: string;
}

interface LoginEntry {
  id: number;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const authView = byId<HTMLElement>("auth-view");
const sessionView = byId<HTMLElement>("session-view");
const form = byId<HTMLFormElement>("auth-form");
const title = byId<HTMLElement>("auth-title");
const nameField = byId<HTMLElement>("name-field");
const nameInput = byId<HTMLInputElement>("name");
const emailInput = byId<HTMLInputElement>("email");
const passwordInput = byId<HTMLInputElement>("password");
const submitButton = byId<HTMLButtonElement>("submit");
const toggleButton = byId<HTMLButtonElement>("toggle-mode");
const errorBox = byId<HTMLElement>("error");
const greeting = byId<HTMLElement>("greeting");
const tokenBox = byId<HTMLElement>("token");
const loginList = byId<HTMLUListElement>("logins");
const logoutButton = byId<HTMLButtonElement>("logout");

let mode: "login" | "register" = "login";

async function api<T>(path: string, method: string, token?: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Não foi possível conectar ao servidor.");
  }

  if (response.status === 204) return undefined as T;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error ?? `Erro inesperado (status ${response.status}).`,
    );
  }
  return data as T;
}

function showError(message: string): void {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

function setMode(next: "login" | "register"): void {
  mode = next;
  const registering = mode === "register";
  title.textContent = registering ? "Criar conta" : "Entrar";
  submitButton.textContent = registering ? "Criar conta" : "Entrar";
  toggleButton.textContent = registering ? "Já tenho conta" : "Criar uma conta";
  nameField.hidden = !registering;
  passwordInput.autocomplete = registering ? "new-password" : "current-password";
  showError("");
}

function showAuth(message = ""): void {
  sessionView.hidden = true;
  authView.hidden = false;
  form.reset();
  setMode("login");
  showError(message);
}

// O SQLite grava created_at em UTC como "AAAA-MM-DD HH:MM:SS", sem fuso.
function parseUtc(value: string): Date {
  return new Date(`${value.replace(" ", "T")}Z`);
}

function statusOf(login: LoginEntry): { label: string; className: string } {
  if (login.revoked_at) return { label: "encerrado", className: "status-closed" };
  if (Date.parse(login.expires_at) <= Date.now()) {
    return { label: "expirado", className: "status-expired" };
  }
  return { label: "ativo", className: "status-active" };
}

function renderLogins(logins: LoginEntry[]): void {
  loginList.replaceChildren(
    ...logins.map((login) => {
      const item = document.createElement("li");

      const details = document.createElement("span");
      const date = parseUtc(login.created_at).toLocaleString("pt-BR");
      details.textContent = `${date} · IP ${login.ip ?? "desconhecido"}`;

      const status = statusOf(login);
      const badge = document.createElement("span");
      badge.className = status.className;
      badge.textContent = status.label;

      item.append(details, badge);
      return item;
    }),
  );
}

async function showSession(token: string): Promise<void> {
  const [me, logins] = await Promise.all([
    api<Me>("/api/me", "GET", token),
    api<LoginEntry[]>("/api/logins", "GET", token),
  ]);

  greeting.textContent = `Olá, ${me.name}!`;
  tokenBox.textContent = token;
  renderLogins(logins);
  authView.hidden = true;
  sessionView.hidden = false;
}

function setBusy(busy: boolean): void {
  submitButton.disabled = busy;
  toggleButton.disabled = busy;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");
  setBusy(true);

  try {
    const result =
      mode === "register"
        ? await api<TokenResponse>("/api/register", "POST", undefined, {
            name: nameInput.value,
            email: emailInput.value,
            password: passwordInput.value,
          })
        : await api<TokenResponse>("/api/login", "POST", undefined, {
            email: emailInput.value,
            password: passwordInput.value,
          });

    localStorage.setItem(TOKEN_KEY, result.access_token);
    await showSession(result.access_token);
    form.reset();
  } catch (err) {
    showError(err instanceof Error ? err.message : "Erro inesperado.");
  } finally {
    setBusy(false);
  }
});

toggleButton.addEventListener("click", () => {
  setMode(mode === "login" ? "register" : "login");
});

logoutButton.addEventListener("click", async () => {
  const token = localStorage.getItem(TOKEN_KEY);
  logoutButton.disabled = true;
  let message = "";

  try {
    if (token) await api<void>("/api/logout", "POST", token);
  } catch (err) {
    // Um 401 significa que a sessão já não vale; só avisa se ela pode continuar ativa.
    if (!(err instanceof ApiError && err.status === 401)) {
      message = "Você saiu deste navegador, mas não foi possível encerrar a sessão no servidor.";
    }
  }

  localStorage.removeItem(TOKEN_KEY);
  logoutButton.disabled = false;
  showAuth(message);
});

async function init(): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    showAuth();
    return;
  }

  try {
    await showSession(token);
  } catch (err) {
    // Só um 401 prova que o token é inválido; falha de rede não deve apagar a sessão.
    if (err instanceof ApiError && err.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      showAuth();
    } else {
      showAuth(err instanceof Error ? err.message : "Erro inesperado.");
    }
  }
}

void init();
