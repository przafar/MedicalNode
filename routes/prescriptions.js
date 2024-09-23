const express = require('express');
const prescriptionController = require('../controllers/prescription');
const authenticateToken = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticateToken, prescriptionController.getPrescriptions);

router.get('/:id', authenticateToken, prescriptionController.getPrescriptionById);

router.post('/', authenticateToken, prescriptionController.createPrescription);

router.put('/:id', authenticateToken, prescriptionController.updatePrescription);

router.delete('/:id', authenticateToken, prescriptionController.deletePrescription);

module.exports = router;
