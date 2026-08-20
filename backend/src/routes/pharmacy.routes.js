const express = require("express");
const { authenticateToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/rbac.middleware");
const pharmacyController = require("../controllers/pharmacy.controller");

const router = express.Router();

router.use(authenticateToken);

router.post(
  "/prescriptions",
  authorizeRoles("ADMIN", "DOCTOR"),
  pharmacyController.createPrescription
);

router.get(
  "/prescriptions",
  authorizeRoles("ADMIN", "PHARMACIST", "DOCTOR"),
  pharmacyController.getPrescriptionsQueue
);

router.post(
  "/payments",
  authorizeRoles("ADMIN", "PHARMACIST"),
  pharmacyController.recordPharmacyPayment
);

router.post(
  "/prescriptions/:id/dispense",
  authorizeRoles("ADMIN", "PHARMACIST"),
  pharmacyController.dispensePrescription
);

router.get(
  "/medications",
  pharmacyController.getMedications
);

router.post(
  "/medications",
  authorizeRoles("ADMIN", "PHARMACIST"),
  pharmacyController.addMedication
);

router.patch(
  "/medications/:id/stock",
  authorizeRoles("ADMIN", "PHARMACIST"),
  pharmacyController.updateStock
);

module.exports = router;
