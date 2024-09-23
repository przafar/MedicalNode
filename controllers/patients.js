const pool = require("../db");
const moment = require('moment');


const convertDateToISO = (date) => {
  const [day, month, year] = date.split('-');
  return `${year}-${month}-${day}`;
};

const getPatients = async (req, res) => {
  const { page = 1, per_page = 10, firstname, lastname, middlename, gender } = req.query;

  const pageInt = parseInt(page, 10);
  const perPageInt = parseInt(per_page, 10);
  const offset = (pageInt - 1) * perPageInt;

  try {
    let whereClause = [];
    let queryParams = [];

    // Add filter for firstname
    if (firstname) {
      whereClause.push(`first_name ILIKE $${queryParams.length + 1}`);
      queryParams.push(`%${firstname}%`);
    }

    // Add filter for lastname
    if (lastname) {
      whereClause.push(`last_name ILIKE $${queryParams.length + 1}`);
      queryParams.push(`%${lastname}%`);
    }

    // Add filter for middlename
    if (middlename) {
      whereClause.push(`middle_name ILIKE $${queryParams.length + 1}`);
      queryParams.push(`%${middlename}%`);
    }

    // Add filter for gender
    if (gender) {
      whereClause.push(`gender = $${queryParams.length + 1}`);
      queryParams.push(gender);
    }

    const whereSQL = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';

    const totalResult = await pool.query(`SELECT COUNT(*) FROM patients ${whereSQL}`, queryParams);
    const total = parseInt(totalResult.rows[0].count, 10);
    const totalPages = Math.ceil(total / perPageInt);

    if (pageInt > totalPages || pageInt < 1) {
      return res.status(400).send({
        error: "Invalid page number.",
        total_pages: totalPages,
      });
    }

    queryParams.push(perPageInt, offset);

    const data = await pool.query(
      `SELECT 
        id, 
        last_name, 
        first_name, 
        middle_name, 
        identifier, 
        phone_number, 
        TO_CHAR(birth_date, 'DD-MM-YYYY') AS birth_date, 
        url, 
        CONCAT(last_name, ' ', first_name, ' ', middle_name) AS full_name 
      FROM patients 
      ${whereSQL} 
      ORDER BY id DESC 
      LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
      queryParams
    );

    const nextPage = pageInt < totalPages ? `/patients?page=${pageInt + 1}&per_page=${perPageInt}` : null;
    const prevPage = pageInt > 1 ? `/patients?page=${pageInt - 1}&per_page=${perPageInt}` : null;

    res.status(200).send({
      pagination: {
        total,
        count: data.rowCount,
        per_page: perPageInt,
        current_page: pageInt,
        total_pages: totalPages,
        links: {
          next: nextPage,
          previous: prevPage,
        },
      },
      data: data.rows,
    });
  } catch (e) {
    console.log(e);
    res.status(500).send({ error: e.message });
  }
};


const createPatient = async (req, res) => {
  const { lastName, firstName, middleName, identifier, phoneNumber, url, birthDate, gender } = req.body;

  // Ensure birthDate is in the correct ISO format
  const formattedBirthDate = moment(birthDate).format('YYYY-MM-DD');

  const genderId = gender.toLowerCase() === 'male' ? 1 : 2;

  try {
    const result = await pool.query(
      "INSERT INTO patients (last_name, first_name, middle_name, identifier, phone_number, url, birth_date, gender) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
      [lastName, firstName, middleName, JSON.stringify(identifier), phoneNumber, url, formattedBirthDate, genderId]
    );

    const newPatientId = result.rows[0].id;

    res.status(201).send({
      message: "Successfully created patient",
      id: newPatientId,
    });
  } catch (err) {
    console.error(err, "ERROR");
    res.status(500).send({ error: err.message });
  }
};
const updatePatient = async (req, res) => {
  const id = parseInt(req.params.id);
  const { lastName, firstName, middleName, identifier, phoneNumber, url, birthDate, gender } = req.body;

  const formattedBirthDate = birthDate ? moment(birthDate).format('YYYY-MM-DD') : null;

  // Map gender to ID if provided
  const genderId = gender ? (gender.toLowerCase() === 'male' ? 1 : 2) : null;

  try {
    // Initialize dynamic query components
    const fields = [];
    const values = [];

    // Dynamically build the query components
    if (lastName) {
      fields.push("last_name = $" + (fields.length + 1));
      values.push(lastName);
    }
    if (firstName) {
      fields.push("first_name = $" + (fields.length + 1));
      values.push(firstName);
    }
    if (middleName) {
      fields.push("middle_name = $" + (fields.length + 1));
      values.push(middleName);
    }
    if (identifier) {
      fields.push("identifier = $" + (fields.length + 1));
      values.push(JSON.stringify(identifier));
    }
    if (phoneNumber) {
      fields.push("phone_number = $" + (fields.length + 1));
      values.push(phoneNumber);
    }
    if (url) {
      fields.push("url = $" + (fields.length + 1));
      values.push(url);
    }
    if (formattedBirthDate) {
      fields.push("birth_date = $" + (fields.length + 1));
      values.push(formattedBirthDate);
    }
    if (genderId !== null) {
      fields.push("gender = $" + (fields.length + 1));
      values.push(genderId);
    }

    // Ensure there are fields to update
    if (fields.length > 0) {
      // Construct the dynamic SQL query
      const setClause = fields.join(', ');
      values.push(id); // Append the ID at the end of the values array

      await pool.query(
        `UPDATE patients SET ${setClause} WHERE id = $${fields.length + 1}`,
        values
      );
    }

    res.status(200).send(`Patient modified with ID: ${id}`);
  } catch (err) {
    console.error(err, "ERROR");
    res.status(500).send({ error: err.message });
  }
};


const getPatientById = async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    const result = await pool.query('SELECT * FROM patients WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).send({ message: "Patient not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Error retrieving patient" });
  }
};

const deletePatient = async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    const result = await pool.query('DELETE FROM patients WHERE id = $1 RETURNING *', [id]);

    if (result.rowCount === 0) {
      return res.status(404).send({ message: `Patient with id: ${id} not found` });
    }

    res.status(200).send(`Patient with id: ${id} deleted`);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Error deleting patient" });
  }
};

module.exports = {
  getPatients,
  createPatient,
  updatePatient,
  getPatientById,
  deletePatient
};
