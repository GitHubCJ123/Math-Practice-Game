// This script is for testing the database connection directly from Node.js
// To run it, use the command: node test-connection.js

require('dotenv').config({ path: '.env.local' });
const { Connection } = require('tedious');

const config = {
  server: process.env.AZURE_SERVER_NAME,
  authentication: {
    type: 'default',
    options: {
      userName: process.env.AZURE_DB_USER,
      password: process.env.AZURE_DB_PASSWORD,
    },
  },
  options: {
    encrypt: true,
    database: process.env.AZURE_DB_NAME,
  },
};

const connection = new Connection(config);

connection.on('connect', (err) => {
  if (err) {
    console.error('\n❌ Connection Failed:');
    console.error(err.message);
    console.log('\nTroubleshooting Tips:');
    console.log('1. Double-check all values in your .env.local file.');
    console.log('2. Ensure your current IP address is whitelisted in the Azure portal firewall rules.');
    console.log('3. Make sure the database server is running and has not been paused.');
  } else {
    console.log('\n✅ Connection Successful!');
    console.log('Your app is ready to connect to the Azure SQL database.');
  }
  connection.close();
});

console.log('Attempting to connect to the database...');
connection.connect();
