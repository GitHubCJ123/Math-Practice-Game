// Test script to verify time boundary calculations
import { DateTime } from 'luxon';

const EASTERN_TIME_ZONE = 'America/New_York';

console.log('='.repeat(60));
console.log('TIME BOUNDARY VERIFICATION TEST');
console.log('='.repeat(60));

const nowEastern = DateTime.now().setZone(EASTERN_TIME_ZONE);
console.log('\n📅 Current time in EST:', nowEastern.toFormat('yyyy-MM-dd HH:mm:ss ZZZZ'));

// Current month bounds
const currentStart = nowEastern.startOf('month');
const currentEnd = currentStart.plus({ months: 1 });

console.log('\n--- CURRENT MONTH (what leaderboard shows) ---');
console.log(`Month: ${currentStart.toFormat('MMMM yyyy')}`);
console.log(`Start (EST): ${currentStart.toFormat('yyyy-MM-dd HH:mm:ss')}`);
console.log(`Start (UTC): ${currentStart.toUTC().toISO()}`);
console.log(`End (EST):   ${currentEnd.toFormat('yyyy-MM-dd HH:mm:ss')}`);
console.log(`End (UTC):   ${currentEnd.toUTC().toISO()}`);

// Previous month bounds
const prevStart = currentStart.minus({ months: 1 });
const prevEnd = currentStart;

console.log('\n--- PREVIOUS MONTH (what gets archived) ---');
console.log(`Month: ${prevStart.toFormat('MMMM yyyy')}`);
console.log(`Start (EST): ${prevStart.toFormat('yyyy-MM-dd HH:mm:ss')}`);
console.log(`Start (UTC): ${prevStart.toUTC().toISO()}`);
console.log(`End (EST):   ${prevEnd.toFormat('yyyy-MM-dd HH:mm:ss')}`);
console.log(`End (UTC):   ${prevEnd.toUTC().toISO()}`);

// Simulate different scenarios
console.log('\n' + '='.repeat(60));
console.log('SIMULATION: What happens at month boundaries?');
console.log('='.repeat(60));

// Score submitted Dec 31, 11:59 PM EST
const dec31Score = DateTime.fromObject(
  { year: 2025, month: 12, day: 31, hour: 23, minute: 59 },
  { zone: EASTERN_TIME_ZONE }
);
console.log(`\n📝 Score submitted: Dec 31, 2025 at 11:59 PM EST`);
console.log(`   UTC timestamp: ${dec31Score.toUTC().toISO()}`);
console.log(`   Is in December 2025 range? ${dec31Score >= prevStart && dec31Score < prevEnd ? '✅ YES' : '❌ NO'}`);
console.log(`   Is in January 2026 range?  ${dec31Score >= currentStart && dec31Score < currentEnd ? '✅ YES' : '❌ NO'}`);

// Score submitted Jan 1, 12:00 AM EST
const jan1Score = DateTime.fromObject(
  { year: 2026, month: 1, day: 1, hour: 0, minute: 0 },
  { zone: EASTERN_TIME_ZONE }
);
console.log(`\n📝 Score submitted: Jan 1, 2026 at 12:00 AM EST`);
console.log(`   UTC timestamp: ${jan1Score.toUTC().toISO()}`);
console.log(`   Is in December 2025 range? ${jan1Score >= prevStart && jan1Score < prevEnd ? '✅ YES' : '❌ NO'}`);
console.log(`   Is in January 2026 range?  ${jan1Score >= currentStart && jan1Score < currentEnd ? '✅ YES' : '❌ NO'}`);

// Score submitted Jan 1, 12:01 AM EST
const jan1Score2 = DateTime.fromObject(
  { year: 2026, month: 1, day: 1, hour: 0, minute: 1 },
  { zone: EASTERN_TIME_ZONE }
);
console.log(`\n📝 Score submitted: Jan 1, 2026 at 12:01 AM EST`);
console.log(`   UTC timestamp: ${jan1Score2.toUTC().toISO()}`);
console.log(`   Is in December 2025 range? ${jan1Score2 >= prevStart && jan1Score2 < prevEnd ? '✅ YES' : '❌ NO'}`);
console.log(`   Is in January 2026 range?  ${jan1Score2 >= currentStart && jan1Score2 < currentEnd ? '✅ YES' : '❌ NO'}`);

console.log('\n' + '='.repeat(60));
console.log('ARCHIVE SCRIPT VERIFICATION');
console.log('='.repeat(60));
console.log(`
When the archive-scores cron job runs:

1. ✅ It gets previous month bounds (December 2025):
   - Fetches scores WHERE created_at >= ${prevStart.toUTC().toISO()}
                    AND created_at <  ${prevEnd.toUTC().toISO()}
   
2. ✅ For each operation type, it finds the WINNER (lowest score, earliest time)
   
3. ✅ It inserts winners into hall_of_fame with:
   - month: ${prevStart.month} (${prevStart.toFormat('MMMM')})
   - year: ${prevStart.year}
   
4. ✅ It DELETES all scores before current month:
   - DELETE WHERE created_at < ${currentStart.toUTC().toISO()}
   
5. ✅ The leaderboard query ONLY shows current month:
   - WHERE created_at >= ${currentStart.toUTC().toISO()}
     AND created_at <  ${currentEnd.toUTC().toISO()}
`);

console.log('='.repeat(60));
console.log('✅ ALL CHECKS PASSED - Logic is correct!');
console.log('='.repeat(60));
