require('dotenv').config();
const express = require("express");
const cors = require("cors");
const patientRoute = require("./routes/patients");
const authRoute = require("./routes/auth");
const appointmentRoute = require("./routes/appointments");
const prescriptionRoute = require("./routes/prescriptions");
const valuesetRoute = require("./routes/valuesets");
const port = process.env.PORT || 3000;

const app = express();

const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ info: "Node.js, Express, and Postgres API" });
});
app.use("/api/patients", patientRoute);
app.use("/api/auth", authRoute);
app.use("/api/appointments", appointmentRoute);
app.use("/api/prescriptions", prescriptionRoute);
app.use("/api/valuesets", valuesetRoute);

app.listen(port, () => console.log(`Server has started on port: ${port}`));