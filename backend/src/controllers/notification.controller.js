const notificationService = require("../services/notification.service");
const { isValidUUID } = require("../validators");

async function getNotifications(req, res) {
  try {
    const userId = req.user?.userId;
    const role = req.user?.role;
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const result = await notificationService.getUserNotifications(userId, role, limit);

    return res.status(200).json({
      success: true,
      data: result.notifications,
      unreadCount: result.unreadCount,
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve notifications.",
    });
  }
}

async function markAsRead(req, res) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID format.",
      });
    }

    const notification = await notificationService.markAsRead(id);

    return res.status(200).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    console.error("Mark notification error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update notification.",
    });
  }
}

async function markAllAsRead(req, res) {
  try {
    const userId = req.user?.userId;
    const role = req.user?.role;

    await notificationService.markAllAsRead(userId, role);

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read.",
    });
  } catch (error) {
    console.error("Mark all notifications error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to mark all notifications as read.",
    });
  }
}

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
};
