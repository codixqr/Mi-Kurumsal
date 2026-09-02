const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && 
       !process.env.DATABASE_URL.includes("localhost") && 
       !process.env.DATABASE_URL.includes("127.0.0.1")
    ? { rejectUnauthorized: false } 
    : false,
});

module.exports = pool;
