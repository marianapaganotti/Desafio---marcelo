# login-api

API de autenticação em Node.js, TypeScript e Express. Emite `access_token` (JWT), guarda os usuários e cada login em SQLite e inclui uma página de login que consome a API.

O banco usa o módulo nativo `node:sqlite`, sem dependências nativas.

## Como rodar

É preciso ter o Node.js 22.13 ou mais novo.

```bash
cd login-api
npm install
cp .env.example .env    # depois, troque o JWT_SECRET
npm run dev             # desenvolvimento, reinicia ao salvar
```

Para rodar a versão compilada:

```bash
npm run build
npm start
```

Acesse <http://localhost:3000>. Na primeira execução, com o banco vazio, é criado este usuário:

- **E-mail:** `admin@exemplo.com`
- **Senha:** `senha123`

Rode os comandos a partir da pasta `login-api`: a pasta `public` e o `DB_PATH` padrão são relativos a ela.

### Variáveis de ambiente

| Variável         | Padrão          | Descrição                                                            |
| ---------------- | --------------- | -------------------------------------------------------------------- |
| `PORT`           | `3000`          | Porta HTTP                                                           |
| `JWT_SECRET`     | segredo de dev  | Segredo que assina os tokens; se faltar, o servidor avisa no console |
| `JWT_EXPIRES_IN` | `3600`          | Validade do token, em segundos                                       |
| `DB_PATH`        | `./data/app.db` | Caminho do arquivo SQLite                                            |

## Estrutura

O código fica na pasta `login-api`:

```text
src/config.ts        leitura das variáveis de ambiente
src/db.ts            conexão, criação das tabelas e usuário inicial
src/users.ts         consultas de usuários e logins
src/auth.ts          geração do JWT e middleware requireAuth
src/server.ts        rotas Express e arquivos estáticos
src/client/login.ts  script da página, compilado para public/js/login.js
public/index.html    página de login
```

## Tabelas

### `users`

| Coluna          | Tipo    | Observações                       |
| --------------- | ------- | --------------------------------- |
| `id`            | INTEGER | Chave primária, autoincremento    |
| `email`         | TEXT    | Único, sem diferenciar maiúsculas |
| `name`          | TEXT    |                                   |
| `password_hash` | TEXT    | Hash bcrypt                       |
| `created_at`    | TEXT    | Padrão `datetime('now')`, em UTC  |

### `logins`

Recebe uma linha a cada login ou cadastro bem-sucedido. Há um índice em `user_id`.

| Coluna       | Tipo    | Observações                                      |
| ------------ | ------- | ------------------------------------------------ |
| `id`         | INTEGER | Chave primária                                   |
| `user_id`    | INTEGER | Referencia `users(id)`, com `ON DELETE CASCADE`  |
| `jti`        | TEXT    | Único, identificador do token                    |
| `ip`         | TEXT    | IP de origem                                     |
| `user_agent` | TEXT    | Navegador ou cliente                             |
| `created_at` | TEXT    | Padrão `datetime('now')`, em UTC                 |
| `expires_at` | TEXT    | Expiração, em ISO 8601                           |
| `revoked_at` | TEXT    | Preenchido no logout; `NULL` enquanto não houver |

O `requireAuth` verifica o JWT e só aceita o token se a linha do `jti` existir, não tiver `revoked_at` e não estiver expirada. Por isso o logout invalida o token de verdade.

## Endpoints

| Método | Rota            | Autenticação | Corpo                       | Respostas                                                                 |
| ------ | --------------- | ------------ | --------------------------- | ------------------------------------------------------------------------- |
| POST   | `/api/register` | Não          | `{ name, email, password }` | `201` com o token, `400` dados inválidos, `409` e-mail já cadastrado      |
| POST   | `/api/login`    | Não          | `{ email, password }`       | `200` com o token, `400` campo faltando, `401` credenciais inválidas      |
| GET    | `/api/me`       | Sim          |                             | `200 { id, email, name, created_at }`, `401`                              |
| GET    | `/api/logins`   | Sim          |                             | `200` com os últimos 10 logins, do mais recente para o mais antigo, `401` |
| POST   | `/api/logout`   | Sim          |                             | `204`, `401`                                                              |

Nas rotas autenticadas, envie o cabeçalho `Authorization: Bearer <token>`. Os erros têm o formato `{ "error": "mensagem" }`.

## Exemplos com curl

**Login**

```bash
curl -i -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@exemplo.com","password":"senha123"}'
```

A resposta traz o token:

```json
{ "access_token": "eyJhbGciOi...", "token_type": "Bearer", "expires_in": 3600 }
```

Guarde o token em uma variável para os próximos comandos:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@exemplo.com","password":"senha123"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token')
```

**Cadastro**

```bash
curl -i -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Maria Silva","email":"maria@exemplo.com","password":"segredo1"}'
```

**Usuário atual**

```bash
curl -i http://localhost:3000/api/me -H "Authorization: Bearer $TOKEN"
```

**Últimos logins**

```bash
curl -i http://localhost:3000/api/logins -H "Authorization: Bearer $TOKEN"
```

**Logout**

```bash
curl -i -X POST http://localhost:3000/api/logout -H "Authorization: Bearer $TOKEN"
```

## Notas para produção

- **`JWT_SECRET` forte:** defina um valor longo e aleatório. Sem ele, o servidor usa um segredo de desenvolvimento público, e qualquer pessoa consegue assinar tokens. Para gerar um valor:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- **Usuário inicial:** troque a senha do `admin@exemplo.com` ou não o crie em produção, porque ela está publicada neste README.
- **HTTPS:** sirva a aplicação somente por HTTPS, para que senhas e tokens não trafeguem em texto puro.
- **Cookie HttpOnly:** a página guarda o token no `localStorage`, onde qualquer script injetado consegue lê-lo. Prefira um cookie `HttpOnly`, `Secure` e `SameSite`, com proteção contra CSRF.
- **Rate limit no login:** limite as tentativas em `/api/login` e `/api/register` para dificultar ataques de força bruta.
- **Proxy confiável:** com `trust proxy` em `true`, o IP gravado vem do cabeçalho `X-Forwarded-For`, que o cliente pode falsificar. Em produção, restrinja essa opção aos endereços do seu proxy.
