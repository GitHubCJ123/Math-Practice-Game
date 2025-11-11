import sql, { ConnectionPool, config as SqlConfig } from "mssql";

type AzureSqlConfig = SqlConfig & {
  options: NonNullable<SqlConfig["options"]> & {
    encrypt: true;
    trustServerCertificate?: boolean;
  };
  pool: NonNullable<SqlConfig["pool"]>;
};

const poolSize = Number(process.env.AZURE_DB_POOL_MAX ?? "10");

const config: AzureSqlConfig = {
  user: process.env.AZURE_DB_USER,
  password: process.env.AZURE_DB_PASSWORD,
  server: process.env.AZURE_SERVER_NAME as string,
  database: process.env.AZURE_DB_NAME,
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
  pool: {
    max: Number.isFinite(poolSize) ? poolSize : 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

if (!config.user || !config.password || !config.server || !config.database) {
  throw new Error("Database configuration environment variables are missing");
}

type GlobalWithPool = typeof global & {
  __mssqlPool?: Promise<ConnectionPool>;
};

const globalWithPool = global as GlobalWithPool;

export function getPool(): Promise<ConnectionPool> {
  if (!globalWithPool.__mssqlPool) {
    globalWithPool.__mssqlPool = sql.connect(config);
    globalWithPool.__mssqlPool.catch((err) => {
      globalWithPool.__mssqlPool = undefined;
      console.error("[db-pool] Failed to establish SQL pool", err);
      throw err;
    });
  }

  return globalWithPool.__mssqlPool;
}

export async function closePool() {
  if (globalWithPool.__mssqlPool) {
    const pool = await globalWithPool.__mssqlPool;
    await pool.close();
    globalWithPool.__mssqlPool = undefined;
  }
}


