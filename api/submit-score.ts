import sql from "mssql";
import { getPool } from "./db-pool";
import { getCurrentEasternMonthBounds } from "./time-utils";
import { clearHallOfFameDatesCache } from "./get-hall-of-fame-dates";
import { clearLeaderboardCache } from "./get-leaderboard";

const BAD_WORDS = [
  'fuck', 'fucking', 'fucked', 'fucker', 'fuckers', 'motherfucker', 'motherfuckers', 'mf', 'mfer', 'mofo', 'effin', 'effing', 'shit', 'shits', 'shitty', 'bullshit', 'bullshitter', 'bullshitters', 'bs', 'crap', 'crappy', 'damn', 'dammit', 'goddamn', 'goddammit', 'ass', 'asses', 'asshole', 'assholes', 'arse', 'arsehole', 'arseholes', 'arsewipe', 'jackass', 'smartass', 'dumbass', 'badass', 'hardass', 'bastard', 'bastards', 'bastardy', 'bitch', 'bitches', 'bitchy', 'biatch', 'beyotch', 'dick', 'dicks', 'dickhead', 'dickheads', 'dickish', 'dicking', 'dicktastic', 'prick', 'pricks', 'prickly', 'piss', 'pissed', 'pissing', 'pissant', 'pisshead', 'pisspoor', 'pisspot', 'pissoff', 'pissface', 'cock', 'cocks', 'cocky', 'cockhead', 'cockface', 'cocksucker', 'cocksuckers', 'cockbite', 'cockwomble', 'balls', 'ballbag', 'ballsack', 'ballbuster', 'ballbusting', 'scrotum', 'testicles', 'testes', 'wank', 'wanker', 'wankers', 'wanking', 'tosser', 'git', 'pillock', 'berk', 'bugger', 'buggered', 'buggering', 'bloody', 'bollock', 'bollocks', 'bollocking', 'sod', 'sodding', 'sodoff', 'shag', 'shagging', 'shagger', 'twat', 'twats', 'twit', 'numpty', 'prat', 'nonce', 'jerk', 'jerks', 'jerkoff', 'jerkoffs', 'douche', 'douchebag', 'douchebags', 'douchey', 'toolbag', 'tool', 'skank', 'skanks', 'slag', 'slags', 'slut', 'sluts', 'slutty', 'thot', 'hoe', 'hoes', 'whore', 'whores', 'whoring', 'wh0re', 'queef', 'boner', 'boners', 'hardon', 'hump', 'humping', 'screw', 'screwed', 'screwing', 'cum', 'cums', 'cumming', 'cumshot', 'cumshots', 'cumslut', 'cumdump', 'spunk', 'jizz', 'splooge', 'porn', 'porno', 'pornography', 'xxx', 'anus', 'anal', 'butt', 'butthead', 'butthole', 'buttface', 'butthurt', 'boob', 'boobs', 'boobies', 'tits', 'titties', 'tit', 'titty', 'rack', 'nipple', 'nipples', 'vagina', 'vajayjay', 'vag', 'pussy', 'pussies', 'punani', 'poontang', 'poon', 'cooch', 'coochie', 'cooter', 'snatch', 'beaver', 'muff', 'gash', 'penis', 'pecker', 'willy', 'wiener', 'weiner', 'dong', 'donger', 'schlong', 'fap', 'fapping', 'fapper', 'throb', 'throbbing', 'milf', 'gilf', 'dilf', 'screwup', 'screwups', 'screwball', 'screwballs', 'clusterfuck', 'shitshow', 'shitstorm', 'shithead', 'shitheads', 'shitface', 'shitfaced', 'dipshit', 'dumbshit', 'horseshit', 'apeshit', 'batshit', 'assclown', 'asshat', 'asshattery', 'assbite', 'assmunch', 'assmuncher', 'asswipe', 'asswipes', 'assface', 'asskisser', 'asslicker', 'dirtbag', 'scumbag', 'scumbags', 'sleazebag', 'trashbag', 'trainwreck', 'trashfire', 'degenerate', 'perv', 'pervy', 'pervert', 'perverts', 'retard', 'retarded', 'idiot', 'moron', 'imbecile', 'dumass', 'dumba**', 'stupid', 'loser', 'twirp', 'weirdo', 'fugly', 'frig', 'friggin', 'frick', 'fricking', 'frickin', 'feck', 'feckin', 'suck', 'sucks', 'sucking', 'sucker', 'suckers', 'sucka', 'sukka', 'gooch', 'taint', 'tainted', 'poop', 'poopy', 'turd', 'turdface', 'turdferguson', 'buttsniffer', 'sphincter', 'colon', 'rectum', 'enema', 'enemas', 'dingleberry', 'dingleberries', 'booger', 'snot', 'phlegm', 'vomit', 'puke', 'barf', 'barfed', 'barfing', 'barfy', 'f-uck', 'f.u.c.k', 'f.uck', 'f_u_c.k', 'f_uck', 'fuq', 'fux', '$h!7', '$h!t', '$h17', '$h1t', '$hi7', '$hit', '5h!7', '5h!t', '5h17', '5h1t', '5hi7', '5hit', 's-hit', 's.h.i.t', 's.hit', 's_h_i.t', 's_hit', 'sh!7', 'sh!t', 'sh17', 'sh1t', 'shi7', 'b!7ch', 'b!tch', 'b-itch', 'b.i.t.c.h', 'b.itch', 'b17ch', 'b1tch', 'b_i_t_c.h', 'b_itch', 'bi7ch', 'a$$h0l3', 'a$$h0le', 'a$$hol3', 'a$$hole', 'a$sh0l3', 'a$sh0le', 'a$shol3', 'a$shole', 'a-sshole', 'a.s.s.h.o.l.e', 'a.sshole', 'a_s_s_h.o.l.e', 'a_sshole', 'as$h0l3', 'as$h0le', 'as$hol3', 'as$hole', 'as5h0l3', 'as5h0le', 'as5hol3', 'as5hole', 'assh0l3', 'assh0le', 'asshol3', 'd!ck', 'd-ick', 'd.i.c.k', 'd.ick', 'd1ck', 'd_i.c.k', 'd_ick', 'diq', 'dix', 'p-ussy', 'p.u.s.s.y', 'p.ussy', 'p_u_s.s.y', 'p_ussy', 'pu$$y', 'pu$5y', 'pu$sy', 'pu5$y', 'pu55y', 'pu5sy', 'pus$y', 'pus5y', 'c-ock', 'c.o.c.k', 'c.ock', 'c0ck', 'c_o.c.k', 'c_ock', 'coq', 'cox', 'w-hore', 'w.h.o.r.e', 'w.hore', 'w_h.o_r.e', 'w_hore', 'wh0r3', 'whor3', '$lu7', '$lut', '5lu7', '5lut', 's-lut', 's.l.u.t', 's.lut', 's_l.u.t', 's_lut', 'slu7', 'p-rick', 'p.r.i.c.k', 'p.rick', 'p_r.i_c.k', 'p_rick', 'pr!ck', 'pr1ck', 'priq', 'prix', 'j-erkoff', 'j.e.r.k.o.f.f', 'j.erkoff', 'j3rk0ff', 'j3rk'
];

const isProfane = (text: string) => {
  const lowerText = text.toLowerCase();
  return BAD_WORDS.some((word) => lowerText.includes(word));
};

export default async function handler(req, res) {
  console.log('[api/submit-score] Function invoked.');
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

  console.log(`[api/submit-score] Checking profanity for: "${playerName}"`);
  if (isProfane(playerName)) {
    console.log(`[api/submit-score] Profanity DETECTED for: "${playerName}"`);
    return res.status(400).json({ message: 'Inappropriate name detected. Please choose another.' });
  }
  console.log(`[api/submit-score] Profanity check PASSED for: "${playerName}"`);

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
      console.log('[api/submit-score] Found current month record', existingRecord);
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
      console.log('[api/submit-score] No current month record, inserting new score');
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
        console.error('[api/submit-score] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/submit-score] Error handling request', error);
    return res.status(500).json({ message: 'DB Error', error: error.message });
  }
}