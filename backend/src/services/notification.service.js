const pool = require("../config/database");

async function createNotification({ userId, targetRole, title, message, type = "INFO", link }) {
  const result = await pool.query(
    `
    INSERT INTO notifications (user_id, target_role, title, message, type, link, is_read)
    VALUES ($1, $2, $3, $4, $5, $6, FALSE)
    RETURNING *
    `,
    [userId || null, targetRole || null, title, message, type, link || null]
  );

  return result.rows[0];
}

async function getUserNotifications(userId, role, limit = 20) {
  const result = await pool.query(
    `
    SELECT *
    FROM notifications
    WHERE (user_id = $1 OR target_role = $2 OR (user_id IS NULL AND target_role IS NULL))
    ORDER BY created_at DESC
    LIMIT $3
    `,
    [userId, role, limit]
  );

  const unreadCountRes = await pool.query(
    `
    SELECT COUNT(*) AS count
    FROM notifications
    WHERE (user_id = $1 OR target_role = $2 OR (user_id IS NULL AND target_role IS NULL))
      AND is_read = FALSE
    `,
    [userId, role]
  );

  return {
    notifications: result.rows,
    unreadCount: parseInt(unreadCountRes.rows[0].count, 10),
  };
}

async function markAsRead(notificationId) {
  const result = await pool.query(
    `
    UPDATE notifications
    SET is_read = TRUE
    WHERE id = $1
    RETURNING *
    `,
    [notificationId]
  );

  return result.rows[0] || null;
}

async function markAllAsRead(userId, role) {
  await pool.query(
    `
    UPDATE notifications
    SET is_read = TRUE
    WHERE (user_id = $1 OR target_role = $2 OR (user_id IS NULL AND target_role IS NULL))
      AND is_read = FALSE
    `,
    [userId, role]
  );

  return { success: true };
}

module.exports = {
  createNotification,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
};
