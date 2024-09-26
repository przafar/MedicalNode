const pool = require("../db");
const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];

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

const getPrescriptions = async (req, res) => {
  const { page = 1, per_page = 10, appointment_id } = req.query;

  const pageInt = parseInt(page, 10);
  const perPageInt = parseInt(per_page, 10);
  const offset = (pageInt - 1) * perPageInt;

  try {
    let whereClause = '';
    let queryParams = [];

    if (appointment_id) {
      whereClause = 'WHERE prescriptions.appointment_id = $1';
      queryParams.push(appointment_id);
    }

    const countQuery = `SELECT COUNT(*) FROM prescriptions ${whereClause}`;
    const countParams = appointment_id ? [appointment_id] : [];
    const totalResult = await pool.query(countQuery, countParams);
    const total = parseInt(totalResult.rows[0].count, 10);
    const totalPages = Math.ceil(total / perPageInt);

    if (pageInt > totalPages || pageInt < 1) {
      return res.status(400).send({ error: "Invalid page number.", total_pages: totalPages });
    }

    const dataQuery = `
      SELECT prescriptions.*, appointments.id AS appointment_id
      FROM prescriptions
      LEFT JOIN appointments ON prescriptions.appointment_id = appointments.id
      ${whereClause}
      ORDER BY prescriptions.id DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;

    queryParams.push(perPageInt, offset);

    const data = await pool.query(dataQuery, queryParams);

    res.status(200).send({
      pagination: {
        total,
        count: data.rowCount,
        per_page: perPageInt,
        current_page: pageInt,
        total_pages: totalPages,
        links: {
          next: pageInt < totalPages ? `/prescriptions?page=${pageInt + 1}&per_page=${perPageInt}` : null,
          previous: pageInt > 1 ? `/prescriptions?page=${pageInt - 1}&per_page=${perPageInt}` : null,
        },
      },
      data: data.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: error.message });
  }
};

const getPrescriptionById = async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    const result = await pool.query(
      `SELECT * FROM prescriptions WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).send({ message: "Prescription not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error retrieving prescription:", error);
    res.status(500).send({ error: error.message });
  }
};

const createPrescription = async (req, res) => {
  const { appointment_id, prescribing_doctor, medications, notes } = req.body;
  const { id: createdBy } = req.user;

  try {
    const result = await pool.query(
      `INSERT INTO prescriptions 
      (appointment_id, prescribing_doctor, medications, notes, created_at, updated_at) 
      VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *`,
      [appointment_id, prescribing_doctor, JSON.stringify(medications), notes]
    );

    res.status(201).send({ message: "Prescription created successfully", prescription: result.rows[0] });
  } catch (error) {
    console.error("Error creating prescription:", error);
    res.status(500).send({ error: error.message });
  }
};

const updatePrescription = async (req, res) => {
  const id = parseInt(req.params.id);
  const { medications, notes, printed_status } = req.body;

  try {
    const result = await pool.query(
      `UPDATE prescriptions 
      SET medications = $1, notes = $2, printed_status = $3, updated_at = NOW() 
      WHERE id = $4 RETURNING *`,
      [JSON.stringify(medications), notes, printed_status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).send({ message: "Prescription not found" });
    }

    res.status(200).send({ message: "Prescription updated successfully", prescription: result.rows[0] });
  } catch (error) {
    console.error("Error updating prescription:", error);
    res.status(500).send({ error: error.message });
  }
};

const deletePrescription = async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    const result = await pool.query(`DELETE FROM prescriptions WHERE id = $1 RETURNING *`, [id]);

    if (result.rowCount === 0) {
      return res.status(404).send({ message: "Prescription not found" });
    }

    res.status(200).send({ message: "Prescription deleted successfully" });
  } catch (error) {
    console.error("Error deleting prescription:", error);
    res.status(500).send({ error: error.message });
  }
};

module.exports = {
  getPrescriptions,
  getPrescriptionById,
  createPrescription,
  updatePrescription,
  deletePrescription,
  authenticateToken
};
