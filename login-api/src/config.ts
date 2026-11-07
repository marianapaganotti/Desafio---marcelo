import dotenv from "dotenv";

dotenv.config({ quiet: true });

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const DEV_SECRET = "segredo-de-desenvolvimento-nao-use-em-producao";

if (!process.env.JWT_SECRET) {
  console.warn(
    "Aviso: JWT_SECRET não definido. Usando um segredo de desenvolvimento; não use assim em produção.",
  );
}

export const config = {
  port: positiveInt(process.env.PORT, 3000),
  jwtSecret: process.env.JWT_SECRET || DEV_SECRET,
  jwtExpiresIn: positiveInt(process.env.JWT_EXPIRES_IN, 3600),
  dbPath: process.env.DB_PATH || "./data/app.db",
};
