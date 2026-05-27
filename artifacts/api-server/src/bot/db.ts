import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { usersTable, generationsTable } from "@workspace/db/schema";

const schema = { usersTable, generationsTable };

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must be set");
    }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    _db = drizzle(pool, { schema });
  }
  return _db;
}

export { schema };
