const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const registerUser = async (req, res) => {
  const { fullname, username, password, role } = req.body;

  // Check if all required fields are provided
  if (!fullname || !username || !password || !role) {
    return res.status(400).json({ message: 'All fields (fullname, username, password, role) are required.' });
  }

  // Allowed static roles
  const fixedRoles = ['super_admin', 'owner', 'reception'];

  try {
    let roleToInsert = role;

    // Check if the role is one of the fixed roles
    if (fixedRoles.includes(role)) {
      roleToInsert = role;
    } else {
      // Check if the role exists in the encounter_classes table (for dynamic roles)
      const result = await pool.query('SELECT code FROM encounter_classes WHERE code = $1', [role]);

      if (result.rows.length === 0) {
        return res.status(400).json({ message: 'Invalid role. Role not found in encounter_classes.' });
      }

      // If role exists in encounter_classes, use it
      roleToInsert = result.rows[0].code;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new user into the database
    const userResult = await pool.query(
      'INSERT INTO users (fullname, username, password, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [fullname, username, hashedPassword, roleToInsert]
    );

    // Respond with success message and user data
    res.status(201).json({ message: 'User registered successfully', user: userResult.rows[0] });
  } catch (err) {
    // Log the specific error and send a more detailed response
    console.error('Error registering user:', err);

    // Send a specific error message for database or bcrypt errors
    res.status(500).json({
      message: 'Error registering user',
      error: err.message
    });
  }
};

const loginUser = async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'User not found' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(400).json({ message: 'Invalid password' });
    }

    const accessToken = jwt.sign(
      { id: user.id, role: user.role, fullname: user.fullname },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: '10h' }
    );

    res.status(200).json({ accessToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error logging in' });
  }
};

module.exports = {
  registerUser,
  loginUser
};
