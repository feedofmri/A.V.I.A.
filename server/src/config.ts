export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgres://avia_app:avia_app_dev@localhost:5432/avia',
  /** Owner/superuser connection, used only by `db:migrate` and `db:seed`. */
  adminDatabaseUrl:
    process.env.ADMIN_DATABASE_URL ?? 'postgres://avia_admin:avia_admin_dev@localhost:5432/avia',
  appDbUser: process.env.APP_DB_USER ?? 'avia_app',
  appDbPassword: process.env.APP_DB_PASSWORD ?? 'avia_app_dev',
  /** A.V.I.A. inference service (agent/). */
  mlUrl: process.env.ML_URL ?? 'http://localhost:8000',
  mlTimeoutMs: Number(process.env.ML_TIMEOUT_MS ?? 10_000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
};
