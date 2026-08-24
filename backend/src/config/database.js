const { Pool } = require("pg");
require("dotenv").config();

// Fail fast with a clear, actionable message instead of letting `pg` silently
// fall back to libpq defaults (OS username + local socket). That fallback is
// what produces the confusing `role "<os-user>" does not exist` error when
// backend/.env is missing or DATABASE_URL isn't set in it.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Create backend/.env from backend/.env.example " +
      "and set DATABASE_URL to a valid PostgreSQL connection string, e.g.\n" +
      "  DATABASE_URL=postgresql://hospital_app:YOURPASSWORD@localhost:5432/hospital_management_db\n" +
      "Then create that role/database in Postgres and run `npm run migrate` " +
      "(and `npm run seed` if needed) before starting the server or tests."
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});

module.exports = pool;
