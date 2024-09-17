const express = require('express');
const {
  getEncounterClasses,
  getEncounterTypesByClass,
  createEncounterClass,
  createEncounterType,
  updateEncounterClass,
  updateEncounterType
} = require('../controllers/valuesets');
const authenticateToken = require('../middleware/auth');
const router = express.Router();

router.get('/encounter_classes', authenticateToken, getEncounterClasses);
router.get('/encounter_types/:code', authenticateToken, getEncounterTypesByClass);
router.post('/encounter_classes', authenticateToken, createEncounterClass);
router.post('/encounter_types', authenticateToken, createEncounterType);
router.put('/encounter_classes/:id', authenticateToken, updateEncounterClass);
router.put('/encounter_types/:id', authenticateToken, updateEncounterType);

module.exports = router;