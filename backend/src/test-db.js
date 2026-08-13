const pool = require("./config/database");

async function testDatabaseConnection() {
  try {
    const result = await pool.query(
      "SELECT current_database(), current_user, NOW() AS current_time"
    );

    console.log("Database connection successful.");
    console.table(result.rows);
  } catch (error) {
    console.error("Database connection failed:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

testDatabaseConnection();
