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

    const isValidUuid = typeof userId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    let validUserId = null;
    if (isValidUuid) {
      try {
        const uRes = await db.query("SELECT id FROM users WHERE id = $1 LIMIT 1", [userId]);
        if (uRes.rows.length > 0) {
          validUserId = userId;
        }
      } catch {
        validUserId = null;
      }
    }

    const result = await db.query(query, [
      validUserId,
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
