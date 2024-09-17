const { faker } = require("@faker-js/faker");
const fs = require("fs");
const pool = require("../db");


const seedQuery = fs.readFileSync("./schema.sql", {
  encoding: "utf-8"
});


const seedFunc = async () => {
  try {
    for (let i = 0; i <= 10; i++) {
      await pool.query(
        "INSERT INTO patients (last_name, first_name, middle_name, identifier, phone_number, url) VALUES ($1, $2, $3, $4, $5, $6)",
        [ faker.person.lastName(), faker.person.firstName(), faker.person.middleName(), faker.number.int({ max: 14 }), faker.phone.number(), faker.internet.exampleEmail() ]
      );
    }
    console.log("Seeding completed!!!");
    return;
  } catch (e) {
    console.log(e);
  }
};

seedFunc();