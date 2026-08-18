const pool = require("../config/database");

async function recordAuditLog(clientOrPool, { userId, action, entity, entityId, details, ipAddress }) {
  const db = clientOrPool || pool;
  try {
    const query = `
      INSERT INTO audit_logs (
        user_id,
        action,
        entity,
        entity_id,
        details,
        ip_address
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id;
    `;

    const result = await db.query(query, [
      userId || null,
      action,
      entity || null,
      entityId || null,
      details ? JSON.stringify(details) : null,
      ipAddress || null,
    ]);

    return result.rows[0];
  } catch (error) {
    console.error("Failed to record audit log:", error);
    // Never fail the main business transaction just because audit logging errored, unless desired
    return null;
  }
}

module.exports = {
  recordAuditLog,
};
