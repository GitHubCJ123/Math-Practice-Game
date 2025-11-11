import sql from "mssql";
import { getPool } from "./db-pool.js";
import { getCurrentEasternMonthBounds } from "./time-utils.js";

const BAD_WORDS = [
  'fuck', 'fucking', 'fucked', 'fucker', 'fuckers', 'motherfucker', 'motherfuckers', 'mf', 'mfer', 'mofo', 'effin', 'effing', 'shit', 'shits', 'shitty', 'bullshit', 'bullshitter', 'bullshitters', 'bs', 'crap', 'crappy', 'damn', 'dammit', 'goddamn', 'goddammit', 'ass', 'asses', 'asshole', 'assholes', 'arse', 'arsehole', 'arseholes', 'arsewipe', 'jackass', 'smartass', 'dumbass', 'badass', 'hardass', 'bastard', 'bastards', 'bastardy', 'bitch', 'bitches', 'bitchy', 'biatch', 'beyotch', 'dick', 'dicks', 'dickhead', 'dickheads', 'dickish', 'dicking', 'dicktastic', 'prick', 'pricks', 'prickly', 'piss', 'pissed', 'pissing', 'pissant', 'pisshead', 'pisspoor', 'pisspot', 'pissoff', 'pissface', 'cock', 'cocks', 'cocky', 'cockhead', 'cockface', 'cocksucker', 'cocksuckers', 'cockbite', 'cockwomble', 'balls', 'ballbag', 'ballsack', 'ballbuster', 'ballbusting', 'scrotum', 'testicles', 'testes', 'wank', 'wanker', 'wankers', 'wanking', 'tosser', 'git', 'pillock', 'berk', 'bugger', 'buggered', 'buggering', 'bloody', 'bollock', 'bollocks', 'bollocking', 'sod', 'sodding', 'sodoff', 'shag', 'shagging', 'shagger', 'twat', 'twats', 'twit', 'numpty', 'prat', 'nonce', 'jerk', 'jerks', 'jerkoff', 'jerkoffs', 'douche', 'douchebag', 'douchebags', 'douchey', 'toolbag', 'tool', 'skank', 'skanks', 'slag', 'slags', 'slut', 'sluts', 'slutty', 'thot', 'hoe', 'hoes', 'whore', 'whores', 'whoring', 'wh0re', 'queef', 'boner', 'boners', 'hardon', 'hump', 'humping', 'screw', 'screwed', 'screwing', 'cum', 'cums', 'cumming', 'cumshot', 'cumshots', 'cumslut', 'cumdump', 'spunk', 'jizz', 'splooge', 'porn', 'porno', 'pornography', 'xxx', 'anus', 'anal', 'butt', 'butthead', 'butthole', 'buttface', 'butthurt', 'boob', 'boobs', 'boobies', 'tits', 'titties', 'tit', 'titty', 'rack', 'nipple', 'nipples', 'vagina', 'vajayjay', 'vag', 'pussy', 'pussies', 'punani', 'poontang', 'poon', 'cooch', 'coochie', 'cooter', 'snatch', 'beaver', 'muff', 'gash', 'penis', 'pecker', 'willy', 'wiener', 'weiner', 'dong', 'donger', 'schlong', 'fap', 'fapping', 'fapper', 'throb', 'throbbing', 'milf', 'gilf', 'dilf', 'screwup', 'screwups', 'screwball', 'screwballs', 'clusterfuck', 'shitshow', 'shitstorm', 'shithead', 'shitheads', 'shitface', 'shitfaced', 'dipshit', 'dumbshit', 'horseshit', 'apeshit', 'batshit', 'assclown', 'asshat', 'asshattery', 'assbite', 'assmunch', 'assmuncher', 'asswipe', 'asswipes', 'assface', 'asskisser', 'asslicker', 'dirtbag', 'scumbag', 'scumbags', 'sleazebag', 'trashbag', 'trainwreck', 'trashfire', 'degenerate', 'perv', 'pervy', 'pervert', 'perverts', 'retard', 'retarded', 'idiot', 'moron', 'imbile', 'dumass', 'dumba**', 'stupid', 'loser', 'twirp', 'weirdo', 'fugly', 'frig', 'friggin', 'frick', 'fricking', 'frickin', 'feck', 'feckin', 'suck', 'sucks', 'sucking', 'sucker', 'suckers', 'sucka', 'sukka', 'gooch', 'taint', 'tainted', 'poop', 'poopy', 'turd', 'turdface', 'turdferguson', 'buttsniffer', 'sphincter', 'colon', 'rectum', 'enema', 'enemas', 'dingleberry', 'dingleberries', 'booger', 'snot', 'phlegm', 'vomit', 'puke', 'barf', 'barfed', 'barfing', 'barfy', 'f-uck', 'f.u.c.k', 'f.uck', 'f_u_c.k', 'f_uck', 'fuq', 'fux', '$h!7', '$h!t', '$h17', '$h1t', '$hi7', '$hit', '5h!7', '5h!t', '5h17', '5h1t', '5hi7', '5hit', 's-hit', 's.h.i.t', 's.hit', 's_h_i.t', 's_hit', 'sh!7', 'sh!t', 'sh17', 'sh1t', 'shi7', 'b!7ch', 'b!tch', 'b-itch', 'b.i.t.c.h', 'b.itch', 'b17ch', 'b1tch', 'b_i_t_c.h', 'b_itch', 'bi7ch', 'a$$h0l3', 'a$$h0le', 'a$$hol3', 'a$$hole', 'a$sh0l3', 'a$sh0le', 'a$shol3', 'a$shole', 'a-sshole', 'a.s.s.h.o.l.e', 'a.sshole', 'a_s_s_h.o.l.e', 'a_sshole', 'as$h0l3', 'as$h0le', 'as$hol3', 'as$hole', 'as5h0l3', 'as5h0le', 'as5hol3', 'as5hole', 'assh0l3', 'assh0le', 'asshol3', 'd!ck', 'd-ick', 'd.i.c.k', 'd.ick', 'd1ck', 'd_i.c.k', 'd_ick', 'diq', 'dix', 'p-ussy', 'p.u.s.s.y', 'p.ussy', 'p_u_s.s.y', 'p_ussy', 'pu$$y', 'pu$5y', 'pu$sy', 'pu5$y', 'pu55y', 'pu5sy', 'pus$y', 'pus5y', 'c-ock', 'c.o.c.k', 'c.ock', 'c0ck', 'c_o.c.k', 'c_ock', 'coq', 'cox', 'w-hore', 'w.h.o.r.e', 'w.hore', 'w_h.o_r.e', 'w_hore', 'wh0r3', 'whor3', '$lu7', '$lut', '5lu7', '5lut', 's-lut', 's.l.u.t', 's.lut', 's_l.u.t', 's_lut', 'slu7', 'p-rick', 'p.r.i.c.k', 'p.rick', 'p_r.i.c.k', 'p_rick', 'pr!ck', 'pr1ck', 'priq', 'prix', 'j-erkoff', 'j.e.r.k.o.f.f', 'j.erkoff', 'j3rk0ff', 'j3rk'
];

const isProfane = (text: string) => {
  const lowerText = text.toLowerCase();
  return BAD_WORDS.some((word) => lowerText.includes(word));
};

// Leaderboard cache
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let leaderboardCache: Record<string, { expiresAt: number; payload: any[] }> = {};

export function clearLeaderboardCache(operationType?: string) {
  if (operationType) {
    console.log(`[Cache] Invalidating leaderboard cache for: ${operationType}`);
    delete leaderboardCache[operationType];
  } else {
    console.log('[Cache] Invalidating all leaderboard caches.');
    leaderboardCache = {};
  }
}

// Hall of Fame dates cache
const HOF_CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_CONTROL_HEADER = "public, max-age=300";
let hofDatesCache: { expiresAt: number; payload: Record<number, number[]> } | null = null;

export function clearHallOfFameDatesCache() {
  hofDatesCache = null;
}

export default async function handler(req: any, res: any) {
  // Get action from query or body
  const action = req.query.action || req.body.action;

  if (!action) {
    return res.status(400).json({ message: 'action parameter is required' });
  }

  console.log(`[api/scores] Function invoked with action: ${action}`);

  // Route to appropriate handler based on action
  switch (action) {
    case 'submit':
      return handleSubmitScore(req, res);
    case 'check':
      return handleCheckScore(req, res);
    case 'leaderboard':
      return handleGetLeaderboard(req, res);
    case 'hall-of-fame':
      return handleGetHallOfFame(req, res);
    case 'hall-of-fame-dates':
      return handleGetHallOfFameDates(req, res);
    default:
      return res.status(400).json({ message: `Unknown action: ${action}` });
  }
}

async function handleSubmitScore(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { playerName, score, operationType } = req.body;
  const scoreNum = parseInt(score, 10);

  if (!playerName || typeof playerName !== 'string' || playerName.length > 50 || playerName.length < 1) {
    return res.status(400).json({ message: 'Valid playerName is required.' });
  }
  if (!operationType || typeof operationType !== 'string' || Number.isNaN(scoreNum)) {
    return res.status(400).json({ message: 'operationType and a numeric score are required.' });
  }

  console.log(`[api/scores] Checking profanity for: "${playerName}"`);
  if (isProfane(playerName)) {
    console.log(`[api/scores] Profanity DETECTED for: "${playerName}"`);
    return res.status(400).json({ message: 'Inappropriate name detected. Please choose another.' });
  }
  console.log(`[api/scores] Profanity check PASSED for: "${playerName}"`);

  const { startUtc, endUtc } = getCurrentEasternMonthBounds();
  let scoreChanged = false;

  let transaction: sql.Transaction | null = null;
  try {
    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const checkRequest = new sql.Request(transaction);
    checkRequest.input('playerName', sql.NVarChar, playerName);
    checkRequest.input('operationType', sql.NVarChar, operationType);
    checkRequest.input('monthStartUtc', sql.DateTime2, startUtc);
    checkRequest.input('nextMonthStartUtc', sql.DateTime2, endUtc);

    const existingResult = await checkRequest.query(`
      SELECT TOP 1 Id, Score
      FROM LeaderboardScores
      WHERE PlayerName = @playerName
        AND OperationType = @operationType
        AND CreatedAt >= @monthStartUtc
        AND CreatedAt < @nextMonthStartUtc
      ORDER BY Score ASC, CreatedAt ASC;
    `);

    let responseStatus = 201;
    let responsePayload = { message: 'Score submitted successfully!' };

    if (existingResult.recordset.length > 0) {
      const existingRecord = existingResult.recordset[0];
      console.log('[api/scores] Found current month record', existingRecord);
      if (scoreNum < existingRecord.Score) {
        const updateRequest = new sql.Request(transaction);
        updateRequest.input('score', sql.Int, scoreNum);
        updateRequest.input('existingId', sql.Int, existingRecord.Id);
        await updateRequest.query(`
          UPDATE LeaderboardScores
          SET Score = @score, CreatedAt = SYSUTCDATETIME()
          WHERE Id = @existingId;
        `);
        responseStatus = 200;
        responsePayload = { message: 'Score updated successfully!' };
        scoreChanged = true;
      } else {
        responseStatus = 200;
        responsePayload = { message: 'Existing score is better.' };
      }
    } else {
      console.log('[api/scores] No current month record, inserting new score');
      const insertRequest = new sql.Request(transaction);
      insertRequest.input('playerName', sql.NVarChar, playerName);
      insertRequest.input('score', sql.Int, scoreNum);
      insertRequest.input('operationType', sql.NVarChar, operationType);
      await insertRequest.query(`
        INSERT INTO LeaderboardScores (PlayerName, Score, OperationType, CreatedAt)
        VALUES (@playerName, @score, @operationType, SYSUTCDATETIME());
      `);
      scoreChanged = true;
    }

    await transaction.commit();
    if (scoreChanged) {
      clearHallOfFameDatesCache();
      clearLeaderboardCache(operationType);
    }
    return res.status(responseStatus).json(responsePayload);
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('[api/scores] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/scores] Error handling request', error);
    return res.status(500).json({ message: 'DB Error', error: error.message });
  }
}

async function handleCheckScore(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { operationType, score } = req.query;
  const scoreNum = parseInt(score as string, 10);

  if (!operationType || typeof operationType !== 'string' || Number.isNaN(scoreNum)) {
    return res.status(400).json({ message: 'operationType and a numeric score are required' });
  }

  try {
    const { startUtc, endUtc } = getCurrentEasternMonthBounds();
    const pool = await getPool();
    const request = pool.request();
    request.input('operationType', sql.NVarChar, operationType);
    request.input('score', sql.Int, scoreNum);
    request.input('monthStartUtc', sql.DateTime2, startUtc);
    request.input('nextMonthStartUtc', sql.DateTime2, endUtc);

    const result = await request.query(`
      SELECT
        SUM(CASE WHEN Score < @score THEN 1 ELSE 0 END) AS BetterScores,
        COUNT(*) AS TotalScores
      FROM LeaderboardScores
      WHERE OperationType = @operationType
        AND CreatedAt >= @monthStartUtc
        AND CreatedAt < @nextMonthStartUtc;
    `);

    const row = result.recordset[0] ?? { BetterScores: 0, TotalScores: 0 };
    const totalScores = row.TotalScores ?? 0;
    const betterScores = row.BetterScores ?? 0;

    const isTopScore = totalScores < 5 || betterScores < 5;

    return res.status(200).json({ isTopScore });
  } catch (error) {
    console.error('[api/scores] Error handling request', error);
    return res.status(500).json({ message: 'Error executing query', error: error.message });
  }
}

async function handleGetLeaderboard(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { operationType } = req.query;

  if (!operationType || typeof operationType !== 'string') {
    return res.status(400).json({ message: 'operationType query parameter is required' });
  }

  try {
    const now = Date.now();
    const cached = leaderboardCache[operationType];
    if (cached && cached.expiresAt > now) {
      console.log(`[api/scores] Serving from cache for ${operationType}.`);
      return res.status(200).json(cached.payload);
    }
    
    console.log(`[api/scores] Fetching from database for ${operationType}...`);
    const { startUtc, endUtc } = getCurrentEasternMonthBounds();
    const pool = await getPool();
    const request = pool.request();
    request.input("operationType", sql.NVarChar, operationType);
    request.input("monthStartUtc", sql.DateTime2, startUtc);
    request.input("nextMonthStartUtc", sql.DateTime2, endUtc);

    const query = `
      SELECT TOP 5 PlayerName, Score
      FROM LeaderboardScores
      WHERE OperationType = @operationType
        AND CreatedAt >= @monthStartUtc
        AND CreatedAt < @nextMonthStartUtc
      ORDER BY Score ASC, CreatedAt ASC;
    `;

    const result = await request.query(query);
    const leaderboard = result.recordset.map((row) => ({
      playerName: row.PlayerName,
      score: row.Score,
    }));

    leaderboardCache[operationType] = {
      expiresAt: now + CACHE_TTL_MS,
      payload: leaderboard,
    };

    return res.status(200).json(leaderboard);
  } catch (error) {
    console.error("[api/scores] Error handling request", error);
    return res.status(500).json({ message: "Error retrieving leaderboard", error: error.message });
  }
}

async function handleGetHallOfFame(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { operationType, year, month } = req.query;

  if (!operationType || typeof operationType !== 'string' || !year || !month) {
    return res.status(400).json({ message: 'operationType, year, and month query parameters are required' });
  }

  const yearNum = parseInt(year as string, 10);
  const monthNum = parseInt(month as string, 10);

  if (Number.isNaN(yearNum) || Number.isNaN(monthNum)) {
    return res.status(400).json({ message: 'year and month must be valid numbers' });
  }

  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('operationType', sql.NVarChar, operationType);
    request.input('year', sql.Int, yearNum);
    request.input('month', sql.Int, monthNum);

    const result = await request.query(`
      SELECT PlayerName, Score
      FROM HallOfFame
      WHERE OperationType = @operationType AND Year = @year AND Month = @month
      ORDER BY Score ASC;
    `);

    const hallOfFame = result.recordset.map((row) => ({
      playerName: row.PlayerName,
      score: row.Score,
    }));

    return res.status(200).json(hallOfFame);
  } catch (error) {
    console.error('[api/scores] Error handling request', error);
    return res.status(500).json({ message: 'Error executing query', error: error.message });
  }
}

async function handleGetHallOfFameDates(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const now = Date.now();
  if (hofDatesCache && hofDatesCache.expiresAt > now) {
    console.log('[api/scores] Serving from cache.');
    res.setHeader('Cache-Control', CACHE_CONTROL_HEADER);
    return res.status(200).json(hofDatesCache.payload);
  }

  try {
    console.log('[api/scores] Fetching from database...');
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT DISTINCT Year, Month
      FROM HallOfFame
      ORDER BY Year DESC, Month DESC;
    `);

    const grouped = result.recordset.reduce<Record<number, number[]>>((acc, row) => {
      const year = row.Year as number;
      const month = row.Month as number;
      if (!acc[year]) {
        acc[year] = [];
      }
      acc[year].push(month);
      return acc;
    }, {});

    hofDatesCache = {
      expiresAt: now + HOF_CACHE_TTL_MS,
      payload: grouped,
    };

    res.setHeader('Cache-Control', CACHE_CONTROL_HEADER);
    return res.status(200).json(grouped);
  } catch (error) {
    console.error('[api/scores] Error handling request', error);
    return res.status(500).json({ message: 'Error executing query', error: error.message });
  }
}

