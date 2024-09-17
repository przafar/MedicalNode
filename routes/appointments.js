
const express = require('express');
const appointmentController = require('../controllers/appointments');
const authenticateToken = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticateToken, appointmentController.getAppointments);
router.get('/:id', authenticateToken, appointmentController.getAppointmentById);
router.post('/', authenticateToken, appointmentController.createAppointment);
router.put('/:id', authenticateToken, appointmentController.updateAppointment);
router.put('/:id/status', authenticateToken, appointmentController.updateAppointmentStatus);

router.delete('/:id', authenticateToken, appointmentController.deleteAppointment);

module.exports = router;