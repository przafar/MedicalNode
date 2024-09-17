const express = require("express");
const router = express.Router();
const patientController = require("../controllers/patients");
const authenticateToken = require("../middleware/auth");

router.get("/", authenticateToken, patientController.getPatients);
router.get("/:id", authenticateToken, patientController.getPatientById);
router.post("/", authenticateToken, patientController.createPatient);
router.put("/:id", authenticateToken, patientController.updatePatient);
router.delete("/:id", authenticateToken, patientController.deletePatient);

module.exports = router;