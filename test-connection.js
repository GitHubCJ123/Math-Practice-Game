// This script is for testing the Supabase database connection directly from Node.js
// To run it, use the command: node test-connection.js

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testConnection() {
  console.log('Attempting to connect to Supabase...');
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('\n❌ Missing environment variables!');
    console.log('Please ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
    return;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Test the connection by querying leaderboard_scores
    const { data, error } = await supabase
      .from('leaderboard_scores')
      .select('id')
      .limit(1);

    if (error) {
      throw error;
    }

    console.log('\n✅ Connection Successful!');
    console.log('Your app is ready to connect to Supabase.');
    
    // Show table counts
    const { count: scoresCount } = await supabase
      .from('leaderboard_scores')
      .select('*', { count: 'exact', head: true });
    
    const { count: hofCount } = await supabase
      .from('hall_of_fame')
      .select('*', { count: 'exact', head: true });
    
    console.log(`\n📊 Database Stats:`);
    console.log(`   - leaderboard_scores: ${scoresCount ?? 0} rows`);
    console.log(`   - hall_of_fame: ${hofCount ?? 0} rows`);
    
  } catch (err) {
    console.error('\n❌ Connection Failed:');
    console.error(err.message);
    console.log('\nTroubleshooting Tips:');
    console.log('1. Double-check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env.local file.');
    console.log('2. Make sure you ran the schema migration in Supabase SQL Editor.');
    console.log('3. Verify your Supabase project is active (not paused).');
  }
}

testConnection();
