const pool = require("../db");
const jwt = require('jsonwebtoken');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

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

const replaceTemplateVariables = (template, data, appointment_info) => {
  return template
    .replace('{{doctorName}}', data.prescribing_doctor)
    .replace('{{doctorSpecialty}}', appointment_info.encounter_class_display || 'Стоматолог')
    .replace('{{patientName}}', appointment_info.patient_name)
    .replace('{{date}}', new Date(data.created_at).toLocaleDateString())
    .replace('{{birthDate}}', new Date(appointment_info.patient_birth_date).toLocaleDateString() || '_________________________')
    .replace('{{notes}}', data.notes || '_________________________')
    .replace('{{dischargeDate}}', new Date(appointment_info.updated_at).toLocaleString() || '_________________________')
    .replace('{{medications}}', data.medications.map(med => `
      <tr>
        <td>${med.name}</td>
        <td>${med.dosage}</td>
        <td>${med.duration}</td>
        <td>${med.frequency}</td>
      </tr>
    `).join(''));
};

const generatePrescriptionPDF = async (req, res) => {
  const { id } = req.params;

  try {
    const prescriptionResult = await pool.query('SELECT * FROM prescriptions WHERE id = $1', [id]);
    if (prescriptionResult.rows.length === 0) {
      return res.status(404).send({ message: "Prescription not found" });
    }

    const prescription = prescriptionResult.rows[0];
    if (typeof prescription.medications === 'string') {
      prescription.medications = JSON.parse(prescription.medications);
    }

    const appointmentResult = await pool.query(`
      SELECT 
        appointments.*, 
        CONCAT(patients.last_name, ' ', patients.first_name, ' ', patients.middle_name) AS patient_name,
        patients.birth_date AS patient_birth_date,
        encounter_classes.display AS encounter_class_display,
        encounter_types.display AS encounter_type_display
      FROM appointments 
      JOIN patients ON appointments.patient_id = patients.id
      LEFT JOIN encounter_classes ON appointments.encounter_class = encounter_classes.code
      LEFT JOIN encounter_types ON appointments.encounter_type = encounter_types.code
      WHERE appointments.id = $1`, [prescription.appointment_id]);

    if (appointmentResult.rows.length === 0) {
      return res.status(404).send({ message: "Appointment not found" });
    }

    const appointment_info = appointmentResult.rows[0];

    const templatePath = path.join(__dirname, '../templates/prescriptionTemplate.html');
    console.log('Template Path:', templatePath);
    let htmlTemplate = fs.readFileSync(templatePath, 'utf8');

    htmlTemplate = replaceTemplateVariables(htmlTemplate, prescription, appointment_info);
    console.log('Generated HTML:', htmlTemplate);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setContent(htmlTemplate, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
    });

    await browser.close();

    console.log('PDF successfully generated');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=prescription-${prescription.id}.pdf`);
    res.end(pdf);
  } catch (error) {
    console.error("Error generating prescription PDF:", error);
    res.status(500).send({ error: error.message });
  }
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
    const result = await pool.query('SELECT * FROM prescriptions WHERE id = $1', [id]);
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
    const result = await pool.query('DELETE FROM prescriptions WHERE id = $1 RETURNING *', [id]);

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
  authenticateToken,
  generatePrescriptionPDF
};
