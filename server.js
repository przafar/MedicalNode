require('dotenv').config();
const express = require("express");
const cors = require("cors");
const morgan = require('morgan');  // Logging middleware
const { Pool } = require('pg');    // PostgreSQL connection pooling

const patientRoute = require("./routes/patients");
const authRoute = require("./routes/auth");
const appointmentRoute = require("./routes/appointments");
const prescriptionRoute = require("./routes/prescriptions");
const valuesetRoute = require("./routes/valuesets");

const port = process.env.PORT || 3000;

const app = express();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Middleware

const corsOptions = {
  origin: process.env.CORS_ALLOWED_ORIGINS || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

app.use(morgan('combined'));

app.use(express.json());

// Routes
app.get("/", (req, res) => {
  res.json({ info: "Node.js, Express, and Postgres API" });
});

app.use("/api/patients", patientRoute);
app.use("/api/auth", authRoute);
app.use("/api/appointments", appointmentRoute);
app.use("/api/prescriptions", prescriptionRoute);
app.use("/api/valuesets", valuesetRoute);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(port, () => console.log(`Server is running on port: ${port}`));

module.exports = pool;
