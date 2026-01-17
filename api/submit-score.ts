import { getSupabase } from "./_lib/db-pool.js";
import { getCurrentEasternMonthBounds } from "./_lib/time-utils.js";
import { clearHallOfFameDatesCache } from "./get-hall-of-fame-dates.js";
import { clearLeaderboardCache } from "./get-leaderboard.js";

const ALLOWED_OPERATIONS = new Set([
  "multiplication",
  "division",
  "squares",
  "square-roots",
  "fraction-to-decimal",
  "decimal-to-fraction",
  "fraction-to-percent",
  "percent-to-fraction",
  "negative-numbers",
]);

const BAD_WORDS = [
  'fuck', 'fucking', 'fucked', 'fucker', 'fuckers', 'motherfucker', 'motherfuckers', 'mf', 'mfer', 'mofo', 'effin', 'effing', 'shit', 'shits', 'shitty', 'bullshit', 'bullshitter', 'bullshitters', 'bs', 'crap', 'crappy', 'damn', 'dammit', 'goddamn', 'goddammit', 'ass', 'asses', 'asshole', 'assholes', 'arse', 'arsehole', 'arseholes', 'arsewipe', 'jackass', 'smartass', 'dumbass', 'badass', 'hardass', 'bastard', 'bastards', 'bastardy', 'bitch', 'bitches', 'bitchy', 'biatch', 'beyotch', 'dick', 'dicks', 'dickhead', 'dickheads', 'dickish', 'dicking', 'dicktastic', 'prick', 'pricks', 'prickly', 'piss', 'pissed', 'pissing', 'pissant', 'pisshead', 'pisspoor', 'pisspot', 'pissoff', 'pissface', 'cock', 'cocks', 'cocky', 'cockhead', 'cockface', 'cocksucker', 'cocksuckers', 'cockbite', 'cockwomble', 'balls', 'ballbag', 'ballsack', 'ballbuster', 'ballbusting', 'scrotum', 'testicles', 'testes', 'wank', 'wanker', 'wankers', 'wanking', 'tosser', 'git', 'pillock', 'berk', 'bugger', 'buggered', 'buggering', 'bloody', 'bollock', 'bollocks', 'bollocking', 'sod', 'sodding', 'sodoff', 'shag', 'shagging', 'shagger', 'twat', 'twats', 'twit', 'numpty', 'prat', 'nonce', 'jerk', 'jerks', 'jerkoff', 'jerkoffs', 'douche', 'douchebag', 'douchebags', 'douchey', 'toolbag', 'tool', 'skank', 'skanks', 'slag', 'slags', 'slut', 'sluts', 'slutty', 'thot', 'hoe', 'hoes', 'whore', 'whores', 'whoring', 'wh0re', 'queef', 'boner', 'boners', 'hardon', 'hump', 'humping', 'screw', 'screwed', 'screwing', 'cum', 'cums', 'cumming', 'cumshot', 'cumshots', 'cumslut', 'cumdump', 'spunk', 'jizz', 'splooge', 'porn', 'porno', 'pornography', 'xxx', 'anus', 'anal', 'butt', 'butthead', 'butthole', 'buttface', 'butthurt', 'boob', 'boobs', 'boobies', 'tits', 'titties', 'tit', 'titty', 'rack', 'nipple', 'nipples', 'vagina', 'vajayjay', 'vag', 'pussy', 'pussies', 'punani', 'poontang', 'poon', 'cooch', 'coochie', 'cooter', 'snatch', 'beaver', 'muff', 'gash', 'penis', 'pecker', 'willy', 'wiener', 'weiner', 'dong', 'donger', 'schlong', 'fap', 'fapping', 'fapper', 'throb', 'throbbing', 'milf', 'gilf', 'dilf', 'screwup', 'screwups', 'screwball', 'screwballs', 'clusterfuck', 'shitshow', 'shitstorm', 'shithead', 'shitheads', 'shitface', 'shitfaced', 'dipshit', 'dumbshit', 'horseshit', 'apeshit', 'batshit', 'assclown', 'asshat', 'asshattery', 'assbite', 'assmunch', 'assmuncher', 'asswipe', 'asswipes', 'assface', 'asskisser', 'asslicker', 'dirtbag', 'scumbag', 'scumbags', 'sleazebag', 'trashbag', 'trainwreck', 'trashfire', 'degenerate', 'perv', 'pervy', 'pervert', 'perverts', 'retard', 'retarded', 'idiot', 'moron', 'imbile', 'dumass', 'dumba**', 'stupid', 'loser', 'twirp', 'weirdo', 'fugly', 'frig', 'friggin', 'frick', 'fricking', 'frickin', 'feck', 'feckin', 'suck', 'sucks', 'sucking', 'sucker', 'suckers', 'sucka', 'sukka', 'gooch', 'taint', 'tainted', 'poop', 'poopy', 'turd', 'turdface', 'turdferguson', 'buttsniffer', 'sphincter', 'colon', 'rectum', 'enema', 'enemas', 'dingleberry', 'dingleberries', 'booger', 'snot', 'phlegm', 'vomit', 'puke', 'barf', 'barfed', 'barfing', 'barfy', 'f-uck', 'f.u.c.k', 'f.uck', 'f_u_c.k', 'f_uck', 'fuq', 'fux', '$h!7', '$h!t', '$h17', '$h1t', '$hi7', '$hit', '5h!7', '5h!t', '5h17', '5h1t', '5hi7', '5hit', 's-hit', 's.h.i.t', 's.hit', 's_h_i.t', 's_hit', 'sh!7', 'sh!t', 'sh17', 'sh1t', 'shi7', 'b!7ch', 'b!tch', 'b-itch', 'b.i.t.c.h', 'b.itch', 'b17ch', 'b1tch', 'b_i_t_c.h', 'b_itch', 'bi7ch', 'a$$h0l3', 'a$$h0le', 'a$$hol3', 'a$$hole', 'a$sh0l3', 'a$sh0le', 'a$shol3', 'a$shole', 'a-sshole', 'a.s.s.h.o.l.e', 'a.sshole', 'a_s_s_h.o.l.e', 'a_sshole', 'as$h0l3', 'as$h0le', 'as$hol3', 'as$hole', 'as5h0l3', 'as5h0le', 'as5hol3', 'as5hole', 'assh0l3', 'assh0le', 'asshol3', 'd!ck', 'd-ick', 'd.i.c.k', 'd.ick', 'd1ck', 'd_i.c.k', 'd_ick', 'diq', 'dix', 'p-ussy', 'p.u.s.s.y', 'p.ussy', 'p_u_s.s.y', 'p_ussy', 'pu$$y', 'pu$5y', 'pu$sy', 'pu5$y', 'pu55y', 'pu5sy', 'pus$y', 'pus5y', 'c-ock', 'c.o.c.k', 'c.ock', 'c0ck', 'c_o.c.k', 'c_ock', 'coq', 'cox', 'w-hore', 'w.h.o.r.e', 'w.hore', 'w_h.o_r.e', 'w_hore', 'wh0r3', 'whor3', '$lu7', '$lut', '5lu7', '5lut', 's-lut', 's.l.u.t', 's.lut', 's_l.u.t', 's_lut', 'slu7', 'p-rick', 'p.r.i.c.k', 'p.rick', 'p_r.i.c.k', 'p_rick', 'pr!ck', 'pr1ck', 'priq', 'prix', 'j-erkoff', 'j.e.r.k.o.f.f', 'j.erkoff', 'j3rk0ff', 'j3rk'
];

const isProfane = (text: string) => {
  const lowerText = text.toLowerCase();
  return BAD_WORDS.some((word) => lowerText.includes(word));
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const rateLimit = new Map<string, { count: number; resetAt: number }>();

function allowRequest(key: string) {
  const now = Date.now();
  const entry = rateLimit.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimit.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }
  entry.count += 1;
  return true;
}

function getClientKey(req): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function isEligible(operationType: string, questionCount: number, selectedNumbersCount: number, allNumbersSelected: boolean) {
  const requiresAllNumbers = operationType === "multiplication" || operationType === "division" || operationType === "squares" || operationType === "square-roots" || operationType === "negative-numbers";
  const expectedCount = operationType === "squares" || operationType === "square-roots" ? 20 : operationType === "negative-numbers" ? 10 : 12;

  if (questionCount !== 10) {
    return false;
  }
  if (requiresAllNumbers) {
    return allNumbersSelected && selectedNumbersCount === expectedCount;
  }
  return true;
}

export default async function handler(req, res) {
  console.log('[api/submit-score] Function invoked.');
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { playerName, score, operationType, questionCount, selectedNumbersCount, allNumbersSelected } = req.body;
  const scoreNum = parseInt(score, 10);
  const questionCountNum = parseInt(questionCount, 10);
  const selectedNumbersCountNum = parseInt(selectedNumbersCount, 10);
  const allNumbersSelectedBool = Boolean(allNumbersSelected);

  if (!playerName || typeof playerName !== 'string' || playerName.length > 50 || playerName.length < 1) {
    return res.status(400).json({ message: 'Valid playerName is required.' });
  }
  if (!operationType || typeof operationType !== 'string' || Number.isNaN(scoreNum)) {
    return res.status(400).json({ message: 'operationType and a numeric score are required.' });
  }

  if (!ALLOWED_OPERATIONS.has(operationType)) {
    return res.status(400).json({ message: 'Unsupported operationType' });
  }

  const clientKey = getClientKey(req);
  if (!allowRequest(clientKey)) {
    return res.status(429).json({ message: 'Too many requests. Please slow down.' });
  }

  const eligible = isEligible(
    operationType,
    questionCountNum,
    selectedNumbersCountNum,
    allNumbersSelectedBool
  );

  if (!eligible) {
    return res.status(400).json({ message: 'Score is not eligible for the leaderboard (quiz settings do not meet requirements).' });
  }

  console.log(`[api/submit-score] Checking profanity for: "${playerName}"`);
  if (isProfane(playerName)) {
    console.log(`[api/submit-score] Profanity DETECTED for: "${playerName}"`);
    return res.status(400).json({ message: 'Inappropriate name detected. Please choose another.' });
  }
  console.log(`[api/submit-score] Profanity check PASSED for: "${playerName}"`);

  const { startUtc, endUtc } = getCurrentEasternMonthBounds();
  let scoreChanged = false;

  try {
    const supabase = getSupabase();

    // Check for existing score this month
    const { data: existingRecords, error: checkError } = await supabase
      .from('leaderboard_scores')
      .select('id, score')
      .eq('player_name', playerName)
      .eq('operation_type', operationType)
      .gte('created_at', startUtc.toISOString())
      .lt('created_at', endUtc.toISOString())
      .order('score', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1);

    if (checkError) {
      throw checkError;
    }

    let responseStatus = 201;
    let responsePayload = { message: 'Score submitted successfully!' };

    if (existingRecords && existingRecords.length > 0) {
      const existingRecord = existingRecords[0];
      console.log('[api/submit-score] Found current month record', existingRecord);
      if (scoreNum < existingRecord.score) {
        const { error: updateError } = await supabase
          .from('leaderboard_scores')
          .update({ score: scoreNum, created_at: new Date().toISOString() })
          .eq('id', existingRecord.id);

        if (updateError) {
          throw updateError;
        }
        responseStatus = 200;
        responsePayload = { message: 'Score updated successfully!' };
        scoreChanged = true;
      } else {
        responseStatus = 200;
        responsePayload = { message: 'Existing score is better.' };
      }
    } else {
      console.log('[api/submit-score] No current month record, inserting new score');
      const { error: insertError } = await supabase
        .from('leaderboard_scores')
        .insert({
          player_name: playerName,
          score: scoreNum,
          operation_type: operationType,
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        throw insertError;
      }
      scoreChanged = true;
    }

    if (scoreChanged) {
      clearHallOfFameDatesCache();
      clearLeaderboardCache(operationType);
    }
    return res.status(responseStatus).json(responsePayload);
  } catch (error) {
    console.error('[api/submit-score] Error handling request', error);
    return res.status(500).json({ message: 'DB Error', error: error.message });
  }
}