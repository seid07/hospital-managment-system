const pool = require("../config/database");
const { parsePagination } = require("../validators");

async function getAuditLogs(query = {}) {
  const { page, limit, offset } = parsePagination(query);
  const { action, entity, search, startDate, endDate } = query;

  const conditions = [];
  const params = [];

  if (action) {
    params.push(action);
    conditions.push(`a.action = $${params.length}`);
  }

  if (entity) {
    params.push(entity);
    conditions.push(`a.entity = $${params.length}`);
  }

  if (startDate) {
    params.push(startDate);
    conditions.push(`DATE(a.created_at) >= $${params.length}`);
  }

  if (endDate) {
    params.push(endDate);
    conditions.push(`DATE(a.created_at) <= $${params.length}`);
  }

  if (search) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(
      a.action ILIKE $${params.length}
      OR a.entity ILIKE $${params.length}
      OR u.username ILIKE $${params.length}
      OR a.details::text ILIKE $${params.length}
    )`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query(
    `
    SELECT COUNT(*) AS total
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    ${whereClause}
    `,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  params.push(limit);
  params.push(offset);

  const listQuery = `
    SELECT
      a.*,
      u.username,
      s.first_name AS staff_first_name,
      s.last_name AS staff_last_name,
      r.name AS user_role
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    LEFT JOIN staff s ON u.staff_id = s.id
    LEFT JOIN roles r ON s.role_id = r.id
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const result = await pool.query(listQuery, params);

  return {
    logs: result.rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

module.exports = {
  getAuditLogs,
};
