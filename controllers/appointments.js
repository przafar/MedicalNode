const pool = require("../db");
const jwt = require('jsonwebtoken');

// Middleware for token authentication
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1]; // Assuming Bearer token

  if (!token) {
    return res.status(401).send({ message: "Token is required" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).send({ message: "Invalid token" });
    }
    req.user = user;
    next();
  });
};

// Get all appointments with pagination
const getAppointments = async (req, res) => {
  const { page = 1, per_page = 10, patient_id } = req.query;
  const { role } = req.user;

  const pageInt = parseInt(page, 10);
  const perPageInt = parseInt(per_page, 10);
  const offset = (pageInt - 1) * perPageInt;

  const fixedRoles = ['super_admin', 'owner', 'reception'];

  try {
    let whereClause = '';
    let queryParams = [];
    let countParams = [];

    // Filter by patient_id if provided
    if (patient_id) {
      whereClause = 'WHERE appointments.patient_id = $1';
      queryParams = [patient_id];
      countParams = [patient_id];
    }

    // If the role is not a fixed role, filter by encounter_class
    if (!fixedRoles.includes(role)) {
      const encounterClassResult = await pool.query('SELECT code FROM encounter_classes WHERE code = $1', [role]);

      if (encounterClassResult.rows.length === 0) {
        return res.status(400).json({ message: "Invalid role or encounter class not found." });
      }

      const encounterClass = encounterClassResult.rows[0].code;

      if (whereClause) {
        whereClause += ` AND appointments.encounter_class = $${queryParams.length + 1}`;
        queryParams.push(encounterClass);
        countParams.push(encounterClass);
      } else {
        whereClause = 'WHERE appointments.encounter_class = $1';
        queryParams = [encounterClass];
        countParams = [encounterClass];
      }
    }

    // Add pagination parameters (limit and offset)
    queryParams.push(perPageInt, offset);

    // Log final query parameters for debugging
    console.log('Final Query Params:', queryParams);

    // Query for the total count of records
    const totalResult = await pool.query(`SELECT COUNT(*) FROM appointments ${whereClause}`, countParams);
    const total = parseInt(totalResult.rows[0].count, 10);
    const totalPages = Math.ceil(total / perPageInt);

    if (pageInt > totalPages || pageInt < 1) {
      return res.status(400).send({ error: "Invalid page number.", total_pages: totalPages });
    }

    // Main query to fetch appointments with patient and encounter details
    const query = `
      SELECT 
        appointments.*, 
        json_build_object(
          'id', patients.id, 
          'full_name', CONCAT(patients.last_name, ' ', patients.first_name, ' ', patients.middle_name),
          'identifier', patients.identifier, 
          'phone_number', patients.phone_number, 
          'url', patients.url
        ) AS patient,
        json_build_object(
          'id', encounter_classes.id, 
          'code', encounter_classes.code, 
          'display', encounter_classes.display
        ) AS encounter_class,
        json_build_object(
          'id', encounter_types.id, 
          'code', encounter_types.code, 
          'display', encounter_types.display
        ) AS encounter_type
      FROM 
        appointments 
      JOIN 
        patients ON appointments.patient_id = patients.id
      LEFT JOIN 
        encounter_classes ON appointments.encounter_class = encounter_classes.code
      LEFT JOIN 
        encounter_types ON appointments.encounter_type = encounter_types.code
      ${whereClause}
      ORDER BY appointments.id DESC 
      LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`;

    const data = await pool.query(query, queryParams);

    // Return the appointments with pagination info
    res.status(200).send({
      pagination: {
        total,
        count: data.rowCount,
        per_page: perPageInt,
        current_page: pageInt,
        total_pages: totalPages,
        links: {
          next: pageInt < totalPages ? `/appointments?page=${pageInt + 1}&per_page=${perPageInt}` : null,
          previous: pageInt > 1 ? `/appointments?page=${pageInt - 1}&per_page=${perPageInt}` : null,
        },
      },
      data: data.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
};


// Get appointment by ID
// Get appointment by ID (updated to include prescriptions)
const getAppointmentById = async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    const appointmentResult = await pool.query(`
      SELECT 
        appointments.*, 
        json_build_object(
          'id', patients.id, 
          'last_name', patients.last_name, 
          'first_name', patients.first_name, 
          'middle_name', patients.middle_name, 
          'identifier', patients.identifier, 
          'phone_number', patients.phone_number, 
          'url', patients.url
        ) AS patient,
        json_build_object(
          'id', encounter_classes.id,
          'code', encounter_classes.code,
          'display', encounter_classes.display
        ) AS encounter_class,
        (
          SELECT json_agg(
            json_build_object(
              'id', encounter_types.id, 
              'code', encounter_types.code, 
              'display', encounter_types.display
            )
          )
          FROM encounter_types_patient 
          JOIN encounter_types ON encounter_types_patient.encounter_type_id = encounter_types.id
          WHERE encounter_types_patient.appointment_id = appointments.id
        ) AS encounter_types
      FROM 
        appointments 
      JOIN 
        patients ON appointments.patient_id = patients.id
      LEFT JOIN 
        encounter_classes ON appointments.encounter_class = encounter_classes.code
      WHERE 
        appointments.id = $1
    `, [id]);

    if (appointmentResult.rows.length === 0) {
      return res.status(404).send({ message: "Appointment not found" });
    }

    // Fetch related prescriptions
    const prescriptionResult = await pool.query(`
      SELECT * FROM prescriptions WHERE appointment_id = $1
    `, [id]);

    const appointmentData = {
      ...appointmentResult.rows[0],
      prescriptions: prescriptionResult.rows,
    };

    res.status(200).json(appointmentData);
  } catch (error) {
    console.error("Error retrieving appointment:", error);
    res.status(500).send({ message: "Error retrieving appointment" });
  }
};

// Create a new appointment
const createAppointment = async (req, res) => {
  const { encounter_class, encounter_types = [], reason_text, patient_id, status = 'draft' } = req.body;
  const createdBy = req.user.id; // Assuming `req.user.id` contains the user id from the token

  try {
    const appointmentResult = await pool.query(
      `INSERT INTO appointments 
      (encounter_class, reason_text, patient_id, status, created_at, created_by, updated_at, history) 
      VALUES ($1, $2, $3, $4, NOW(), $5, NOW(), $6) RETURNING id`,
      [encounter_class, reason_text, patient_id, status, createdBy, JSON.stringify([{
        action: 'created',
        user: createdBy,
        timestamp: new Date().toISOString()
      }])]
    );

    const appointmentId = appointmentResult.rows[0].id;

    if (encounter_types.length > 0) {
      const values = encounter_types.map((encounterTypeId, index) => `($1, $${index + 2})`).join(', ');
      const encounterTypeValues = [appointmentId, ...encounter_types];

      await pool.query(
        `INSERT INTO encounter_types_patient (appointment_id, encounter_type_id) VALUES ${values}`,
        encounterTypeValues
      );
    }

    res.status(201).send({ message: "Successfully created appointment" });
  } catch (err) {
    console.error(err, "ERROR");
    res.status(500).send({ error: err.message });
  }
};






const updateAppointment = async (req, res) => {
  const id = parseInt(req.params.id);
  const { encounter_types, reason_text, status } = req.body;

  if (!status) {
    return res.status(400).send({ error: "Status is required" });
  }

  try {
    // Fetch current appointment and history
    const currentAppointment = await pool.query('SELECT history FROM appointments WHERE id = $1', [id]);
    if (currentAppointment.rowCount === 0) {
      return res.status(404).send({ message: "Appointment not found" });
    }

    let currentHistory = currentAppointment.rows[0].history;
    if (typeof currentHistory === 'string') {
      currentHistory = JSON.parse(currentHistory);
    }

    // Add status update to history
    const newHistory = [...currentHistory, {
      action: 'status_updated',
      user: req.user.id,
      timestamp: new Date().toISOString(),
      status: status,
    }];

    // Update the appointment in the database
    await pool.query(
      `UPDATE appointments 
      SET status = $1, reason_text = $2, updated_at = NOW(), updated_by = $3, history = $4 
      WHERE id = $5`,
      [status, reason_text, req.user.id, JSON.stringify(newHistory), id]
    );

    // If encounter_types are provided, update them
    if (encounter_types && encounter_types.length > 0) {
      // First, fetch encounter type IDs based on the provided codes
      const encounterTypesResult = await pool.query(
        'SELECT id, code FROM encounter_types WHERE code = ANY($1::text[])',
        [encounter_types]
      );

      // Check if all provided codes were found
      if (encounterTypesResult.rows.length !== encounter_types.length) {
        return res.status(400).send({ error: "Some encounter types not found" });
      }

      const encounterTypeIds = encounterTypesResult.rows.map(row => row.id);

      // Delete existing encounter_types for the appointment
      await pool.query('DELETE FROM encounter_types_patient WHERE appointment_id = $1', [id]);

      // Insert the new encounter_types using their IDs
      const values = encounterTypeIds.map((encounterTypeId, index) => `($1, $${index + 2})`).join(', ');
      const encounterTypeValues = [id, ...encounterTypeIds];

      await pool.query(
        `INSERT INTO encounter_types_patient (appointment_id, encounter_type_id) VALUES ${values}`,
        encounterTypeValues
      );
    }

    res.status(200).send({ message: `Appointment updated successfully` });
  } catch (err) {
    console.error("Error updating appointment:", err);
    res.status(500).send({ error: err.message });
  }
};


// Change appointment status
const updateAppointmentStatus = async (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;

  // Ensure the status is present in the request body
  if (!status) {
    return res.status(400).send({ error: "Status is required" });
  }

  try {
    // Fetch current appointment and history
    const currentAppointment = await pool.query('SELECT history FROM appointments WHERE id = $1', [id]);
    if (currentAppointment.rowCount === 0) {
      return res.status(404).send({ message: "Appointment not found" });
    }

    let currentHistory = currentAppointment.rows[0].history;

    // If the history is stored as a string, ensure we parse it; otherwise, it's already an object
    if (typeof currentHistory === 'string') {
      currentHistory = JSON.parse(currentHistory);
    }

    // Add status update to history
    const newHistory = [...currentHistory, {
      action: 'status_updated',
      user: req.user.id,
      timestamp: new Date().toISOString(),
      status: status,
    }];

    // Update only the status in the database
    await pool.query(
      `UPDATE appointments 
      SET status = $1, updated_at = NOW(), updated_by = $2, history = $3 
      WHERE id = $4`,
      [status, req.user.id, JSON.stringify(newHistory), id]
    );

    res.status(200).send({ message: `Appointment status updated to ${status}` });
  } catch (err) {
    console.error("Error updating appointment status:", err);
    res.status(500).send({ error: err.message });
  }
};



// Delete an appointment
const deleteAppointment = async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    const result = await pool.query('DELETE FROM appointments WHERE id = $1 RETURNING *', [id]);

    if (result.rowCount === 0) {
      return res.status(404).send({ message: `Appointment with id: ${id} not found` });
    }

    res.status(200).send(`Appointment with id: ${id} deleted`);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Error deleting appointment" });
  }
};

module.exports = {
  getAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  authenticateToken,
  updateAppointmentStatus
};
