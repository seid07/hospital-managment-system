const express = require("express");
const controller = require("../controllers/queue.controller");
const { authenticateToken } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticateToken);

router.get("/:departmentCode", controller.getDepartmentQueue);
router.post("/:departmentCode/call-next", controller.callNext);
router.patch("/entry/:id/status", controller.updateQueueStatus);

module.exports = router;
