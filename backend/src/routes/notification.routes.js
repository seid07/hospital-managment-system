const express = require("express");
const { authenticateToken } = require("../middleware/auth.middleware");
const notificationController = require("../controllers/notification.controller");

const router = express.Router();

router.use(authenticateToken);

router.get("/", notificationController.getNotifications);
router.patch("/:id/read", notificationController.markAsRead);
router.post("/read-all", notificationController.markAllAsRead);

module.exports = router;
