const pool = require("../db");

const getEncounterClasses = async (req, res) => {
  try {
    const data = await pool.query("SELECT * FROM encounter_classes");
    res.status(200).send({ data: data.rows });
  } catch (e) {
    console.log(e);
    res.status(500).send({ error: e.message });
  }
};

const getEncounterTypesByClass = async (req, res) => {
  const { code } = req.params;
  try {
    const classResult = await pool.query("SELECT id FROM encounter_classes WHERE code = $1", [code]);
    if (classResult.rows.length === 0) {
      return res.status(404).send({ message: "Encounter class not found" });
    }

    const classId = classResult.rows[0].id;
    const typeResult = await pool.query("SELECT * FROM encounter_types WHERE class_id = $1", [classId]);
    res.status(200).send({ data: typeResult.rows });
  } catch (e) {
    console.log(e);
    res.status(500).send({ error: e.message });
  }
};

const createEncounterClass = async (req, res) => {
  const { code, display } = req.body;

  if (!code || !display) {
    return res.status(400).send({ error: "Code and display are required fields" });
  }

  try {
    const result = await pool.query("INSERT INTO encounter_classes (code, display) VALUES ($1, $2) RETURNING *", [code, display]);
    res.status(201).send({ message: "Successfully created encounter class", data: result.rows[0] });
  } catch (err) {
    console.error(err, "ERROR");
    res.status(500).send({ error: err.message });
  }
};

const createEncounterType = async (req, res) => {
  const { class_code, code, display, price } = req.body;

  if (!class_code || !code || !display || !price) {
    return res.status(400).send({ error: "Class code, code, display, and price are required fields" });
  }

  try {
    console.log(`Searching for encounter class with code: ${class_code}`);
    const classResult = await pool.query("SELECT id FROM encounter_classes WHERE id = $1", [class_code]);
    if (classResult.rows.length === 0) {
      return res.status(404).send({ message: "Encounter class not found" });
    }

    const classId = classResult.rows[0].id;
    const result = await pool.query(
      "INSERT INTO encounter_types (class_id, code, display, price) VALUES ($1, $2, $3, $4) RETURNING *",
      [classId, code, display, price]
    );
    res.status(201).send({ message: "Successfully created encounter type", data: result.rows[0] });
  } catch (err) {
    console.error(err, "ERROR");
    res.status(500).send({ error: err.message });
  }
};

const updateEncounterClass = async (req, res) => {
  const { id } = req.params;
  const { code, display } = req.body;

  if (!code || !display) {
    return res.status(400).send({ error: "Code and display are required fields" });
  }

  try {
    const result = await pool.query(
      "UPDATE encounter_classes SET code = $1, display = $2 WHERE id = $3 RETURNING *",
      [code, display, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).send({ message: "Encounter class not found" });
    }
    res.status(200).send({ message: "Successfully updated encounter class", data: result.rows[0] });
  } catch (err) {
    console.error(err, "ERROR");
    res.status(500).send({ error: err.message });
  }
};

const updateEncounterType = async (req, res) => {
  const { id } = req.params;
  const { code, display, price, class_id } = req.body;

  if (!code || !display || !price || !class_id) {
    return res.status(400).send({ error: "Code, display, price, and class_id are required fields" });
  }

  try {
    const result = await pool.query(
      "UPDATE encounter_types SET code = $1, display = $2, price = $3, class_id = $4 WHERE id = $5 RETURNING *",
      [code, display, price, class_id, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).send({ message: "Encounter type not found" });
    }
    res.status(200).send({ message: "Successfully updated encounter type", data: result.rows[0] });
  } catch (err) {
    console.error(err, "ERROR");
    res.status(500).send({ error: err.message });
  }
};

module.exports = {
  getEncounterClasses,
  getEncounterTypesByClass,
  createEncounterClass,
  createEncounterType,
  updateEncounterClass,
  updateEncounterType
};
