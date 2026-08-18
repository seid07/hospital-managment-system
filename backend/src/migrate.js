require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("./config/database");

async function runMigrations() {
  const client = await pool.connect();

  try {
    console.log("Checking database schema migrations...");

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const appliedResult = await client.query(`
      SELECT migration_name FROM schema_migrations;
    `);
    const appliedSet = new Set(appliedResult.rows.map((r) => r.migration_name));

    const migrationsDir = path.join(__dirname, "../migrations");
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    let count = 0;

    for (const file of migrationFiles) {
      if (!appliedSet.has(file)) {
        console.log(`Applying migration: ${file}...`);
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, "utf8");

        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (migration_name) VALUES ($1)",
          [file]
        );
        await client.query("COMMIT");

        console.log(`Successfully applied: ${file}`);
        count++;
      }
    }

    if (count === 0) {
      console.log("Database schema is already up to date.");
    } else {
      console.log(`Successfully executed ${count} migration(s).`);
    }
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration error:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };
