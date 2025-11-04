// This script is for testing the database connection directly from Node.js
// To run it, use the command: node test-connection.js

require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

const config = {
  user: process.env.AZURE_DB_USER,
  password: process.env.AZURE_DB_PASSWORD,
  server: process.env.AZURE_SERVER_NAME,
  database: process.env.AZURE_DB_NAME,
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
  pool: {
    max: 1,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

async function testConnection() {
  console.log('Attempting to connect to the database...');
  let pool;
  try {
    pool = await sql.connect(config);
    console.log('\n✅ Connection Successful!');
    console.log('Your app is ready to connect to the Azure SQL database.');
  } catch (err) {
    console.error('\n❌ Connection Failed:');
    console.error(err.message);
    console.log('\nTroubleshooting Tips:');
    console.log('1. Double-check all values in your .env.local file.');
    console.log('2. Ensure your current IP address is whitelisted in the Azure portal firewall rules.');
    console.log('3. Make sure the database server is running and has not been paused.');
  } finally {
    if (pool) {
      await pool.close();
    }
    sql.close();
  }
}

testConnection();
