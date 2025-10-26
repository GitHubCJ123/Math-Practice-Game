// This is our simple, local-only API server for testing
require('dotenv').config({ path: '.env.local' });
const express = require('express');
const cors = require('cors');
const { Connection, Request, TYPES } = require('tedious');

const app = express();
const port = 3001;

app.use(cors()); // Allow requests from our frontend dev server
app.use(express.json()); // Allow our server to read JSON

const dbConfig = {
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
    rowCollectionOnRequestCompletion: true,
    connectTimeout: 30000 // 30 seconds
  },
};

// --- Simple Profanity Filter ---
const badWords = ['fuck', 'fucking', 'fucked', 'fucker', 'fuckers', 'motherfucker', 'motherfuckers', 'mf', 'mfer', 'mofo', 'effin', 'effing', 'shit', 'shits', 'shitty', 'bullshit', 'bullshitter', 'bullshitters', 'bs', 'crap', 'crappy', 'damn', 'dammit', 'goddamn', 'goddammit', 'ass', 'asses', 'asshole', 'assholes', 'arse', 'arsehole', 'arseholes', 'arsewipe', 'jackass', 'smartass', 'dumbass', 'badass', 'hardass', 'bastard', 'bastards', 'bastardy', 'bitch', 'bitches', 'bitchy', 'biatch', 'beyotch', 'dick', 'dicks', 'dickhead', 'dickheads', 'dickish', 'dicking', 'dicktastic', 'prick', 'pricks', 'prickly', 'piss', 'pissed', 'pissing', 'pissant', 'pisshead', 'pisspoor', 'pisspot', 'pissoff', 'pissface', 'cock', 'cocks', 'cocky', 'cockhead', 'cockface', 'cocksucker', 'cocksuckers', 'cockbite', 'cockwomble', 'balls', 'ballbag', 'ballsack', 'ballbuster', 'ballbusting', 'scrotum', 'testicles', 'testes', 'wank', 'wanker', 'wankers', 'wanking', 'tosser', 'git', 'pillock', 'berk', 'bugger', 'buggered', 'buggering', 'bloody', 'bollock', 'bollocks', 'bollocking', 'sod', 'sodding', 'sodoff', 'shag', 'shagging', 'shagger', 'twat', 'twats', 'twit', 'numpty', 'prat', 'nonce', 'jerk', 'jerks', 'jerkoff', 'jerkoffs', 'douche', 'douchebag', 'douchebags', 'douchey', 'toolbag', 'tool', 'skank', 'skanks', 'slag', 'slags', 'slut', 'sluts', 'slutty', 'thot', 'hoe', 'hoes', 'whore', 'whores', 'whoring', 'wh0re', 'queef', 'boner', 'boners', 'hardon', 'hump', 'humping', 'screw', 'screwed', 'screwing', 'cum', 'cums', 'cumming', 'cumshot', 'cumshots', 'cumslut', 'cumdump', 'spunk', 'jizz', 'splooge', 'porn', 'porno', 'pornography', 'xxx', 'anus', 'anal', 'butt', 'butthead', 'butthole', 'buttface', 'butthurt', 'boob', 'boobs', 'boobies', 'tits', 'titties', 'tit', 'titty', 'rack', 'nipple', 'nipples', 'vagina', 'vajayjay', 'vag', 'pussy', 'pussies', 'punani', 'poontang', 'poon', 'cooch', 'coochie', 'cooter', 'snatch', 'beaver', 'muff', 'gash', 'penis', 'pecker', 'willy', 'wiener', 'weiner', 'dong', 'donger', 'schlong', 'fap', 'fapping', 'fapper', 'throb', 'throbbing', 'milf', 'gilf', 'dilf', 'screwup', 'screwups', 'screwball', 'screwballs', 'clusterfuck', 'shitshow', 'shitstorm', 'shithead', 'shitheads', 'shitface', 'shitfaced', 'dipshit', 'dumbshit', 'horseshit', 'apeshit', 'batshit', 'assclown', 'asshat', 'asshattery', 'assbite', 'assmunch', 'assmuncher', 'asswipe', 'asswipes', 'assface', 'asskisser', 'asslicker', 'dirtbag', 'scumbag', 'scumbags', 'sleazebag', 'trashbag', 'trainwreck', 'trashfire', 'degenerate', 'perv', 'pervy', 'pervert', 'perverts', 'retard', 'retarded', 'idiot', 'moron', 'imbecile', 'dumass', 'dumba**', 'stupid', 'loser', 'twirp', 'weirdo', 'fugly', 'frig', 'friggin', 'frick', 'fricking', 'frickin', 'feck', 'feckin', 'suck', 'sucks', 'sucking', 'sucker', 'suckers', 'sucka', 'sukka', 'gooch', 'taint', 'tainted', 'poop', 'poopy', 'turd', 'turdface', 'turdferguson', 'buttsniffer', 'sphincter', 'colon', 'rectum', 'enema', 'enemas', 'dingleberry', 'dingleberries', 'booger', 'snot', 'phlegm', 'vomit', 'puke', 'barf', 'barfed', 'barfing', 'barfy', 'f-uck', 'f.u.c.k', 'f.uck', 'f_u_c_k', 'f_uck', 'fuq', 'fux', '$h!7', '$h!t', '$h17', '$h1t', '$hi7', '$hit', '5h!7', '5h!t', '5h17', '5h1t', '5hi7', '5hit', 's-hit', 's.h.i.t', 's.hit', 's_h_i_t', 's_hit', 'sh!7', 'sh!t', 'sh17', 'sh1t', 'shi7', 'b!7ch', 'b!tch', 'b-itch', 'b.i.t.c.h', 'b.itch', 'b17ch', 'b1tch', 'b_i_t_c_h', 'b_itch', 'bi7ch', 'a$$h0l3', 'a$$h0le', 'a$$hol3', 'a$$hole', 'a$sh0l3', 'a$sh0le', 'a$shol3', 'a$shole', 'a-sshole', 'a.s.s.h.o.l.e', 'a.sshole', 'a_s_s_h_o_l_e', 'a_sshole', 'as$h0l3', 'as$h0le', 'as$hol3', 'as$hole', 'as5h0l3', 'as5h0le', 'as5hol3', 'as5hole', 'assh0l3', 'assh0le', 'asshol3', 'd!ck', 'd-ick', 'd.i.c.k', 'd.ick', 'd1ck', 'd_i_c_k', 'd_ick', 'diq', 'dix', 'p-ussy', 'p.u.s.s.y', 'p.ussy', 'p_u_s_s_y', 'p_ussy', 'pu$$y', 'pu$5y', 'pu$sy', 'pu5$y', 'pu55y', 'pu5sy', 'pus$y', 'pus5y', 'c-ock', 'c.o.c.k', 'c.ock', 'c0ck', 'c_o_c_k', 'c_ock', 'coq', 'cox', 'w-hore', 'w.h.o.r.e', 'w.hore', 'w_h_o_r_e', 'w_hore', 'wh0r3', 'whor3', '$lu7', '$lut', '5lu7', '5lut', 's-lut', 's.l.u.t', 's.lut', 's_l_u_t', 's_lut', 'slu7', 'p-rick', 'p.r.i.c.k', 'p.rick', 'p_r_i_c_k', 'p_rick', 'pr!ck', 'pr1ck', 'priq', 'prix', 'j-erkoff', 'j.e.r.k.o.f.f', 'j.erkoff', 'j3rk0ff', 'j3rkoff', 'j_e_r_k_o_f_f', 'j_erkoff', 'jerk0ff', 'b-alls', 'b.a.l.l.s', 'b.alls', 'b4ll$', 'b4ll5', 'b4lls', 'b@ll$', 'b@ll5', 'b@lls', 'b_a_l_l_s', 'b_alls', 'ball$', 'ball5', 'w-anker', 'w.a.n.k.e.r', 'w.anker', 'w4nk3r', 'w4nker', 'w@nk3r', 'w@nker', 'w_a_n_k_e_r', 'w_anker', 'wank3r', 'f*ck', 'f**k', 'f***', 'f_ck', 'f-ck', 'phuck', 'fuk', 'fvck', 'fuxk', 'sh*t', 'sh**', 's**t', 'shiit', 'b*tch', 'b**ch', 'bi*ch', 'a**', 'a*s', '@ss', '4ss', 'azz', 'a.z.z', 'd*ck', 'd**k', 'p*ssy', 'p**sy', 'p***y', 'p!ssy', 'p0ssy', 'c*ck', 'c**k', 'wh*re', 'wh**e', 'sl*t', 'sl**', 's1ut', 'pr*ck', 'pr**k', 'jerk*ff', 'jerk.off', 'jerk_off', 'b*lls', 'b.lls', 'w*nk', 'w4nk', 'w.ank', 'fucks', 'fucky', 'fuckly', 'fuckings', 'fuckinged', 'fuckinger', 'fuckingers', 'fuckingy', 'fuckingly', 'fuckeds']; // Add more words as needed
const isProfane = (text) => {
  const words = text.toLowerCase().split(/\s+/);
  return words.some(word => badWords.includes(word));
};


// --- API Endpoints ---

app.get('/api/get-leaderboard', (req, res) => {
  const { operationType } = req.query;

  if (!operationType || typeof operationType !== 'string') {
    return res.status(400).json({ message: 'operationType query parameter is required' });
  }

  const connection = new Connection(dbConfig);

  connection.on('connect', (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Error connecting to database", error: err.message });
    }

    const sql = `
      SELECT TOP 10 PlayerName, Score
      FROM LeaderboardScores
      WHERE OperationType = @operationType
      ORDER BY Score ASC;
    `;

    const request = new Request(sql, (err, rowCount, rows) => {
      if (err) {
        return res.status(500).json({ message: "Error executing query", error: err.message });
      }

      const leaderboard = rows.map(row => ({
        playerName: row[0].value,
        score: row[1].value,
      }));

      res.status(200).json(leaderboard);
      connection.close();
    });

    request.addParameter('operationType', TYPES.NVarChar, operationType);
    connection.execSql(request);
  });

  connection.connect();
});

app.get('/api/check-score', (req, res) => {
  const { operationType, score } = req.query;
  const scoreNum = parseInt(score, 10);

  if (!operationType || typeof operationType !== 'string' || isNaN(scoreNum)) {
    return res.status(400).json({ message: 'operationType and a numeric score are required' });
  }

  const connection = new Connection(dbConfig);

  connection.on('connect', (err) => {
    if (err) {
      return res.status(500).json({ message: "Error connecting to database", error: err.message });
    }

    const sql = `
      SELECT 
        (SELECT COUNT(*) FROM LeaderboardScores WHERE OperationType = @operationType) as totalScores,
        (SELECT COUNT(*) FROM LeaderboardScores WHERE OperationType = @operationType AND Score < @score) as betterScores;
    `;

    const request = new Request(sql, (err, rowCount, rows) => {
      if (err) {
        return res.status(500).json({ message: "Error executing query", error: err.message });
      }

      const totalScores = rows[0][0].value;
      const betterScores = rows[0][1].value;

      const isTopScore = totalScores < 10 || betterScores < 10;

      res.status(200).json({ isTopScore });
      connection.close();
    });

    request.addParameter('operationType', TYPES.NVarChar, operationType);
    request.addParameter('score', TYPES.Int, scoreNum);
    connection.execSql(request);
  });

  connection.connect();
});

app.post('/api/submit-score', (req, res) => {
  const { playerName, score, operationType } = req.body;
  const scoreNum = parseInt(score, 10);

  // --- Input Validation ---
  if (!playerName || typeof playerName !== 'string' || playerName.length > 50 || playerName.length < 1) {
    return res.status(400).json({ message: 'Valid playerName is required.' });
  }
  if (!operationType || typeof operationType !== 'string' || isNaN(scoreNum)) {
    return res.status(400).json({ message: 'operationType and a numeric score are required.' });
  }

  // --- Profanity Filter ---
  if (isProfane(playerName)) {
    return res.status(400).json({ message: 'Inappropriate name detected. Please choose another.' });
  }

  const connection = new Connection(dbConfig);

  connection.on('connect', (err) => {
    if (err) return res.status(500).json({ message: "DB Connection Error", error: err.message });

    connection.beginTransaction(err => {
      if (err) return res.status(500).json({ message: "Transaction Error", error: err.message });

      const checkExistingSql = `
        SELECT Score FROM LeaderboardScores 
        WHERE PlayerName = @playerName COLLATE SQL_Latin1_General_CP1_CI_AS 
        AND OperationType = @operationType;
      `;

      const request = new Request(checkExistingSql, (err, rowCount, rows) => {
        if (err) {
          connection.rollbackTransaction(() => res.status(500).json({ message: "DB Error", error: err.message }));
          return;
        }

        const existingScore = rowCount > 0 ? rows[0][0].value : null;

        if (existingScore !== null) { // Player exists
          if (scoreNum < existingScore) { // New score is better
            const updateSql = `
              UPDATE LeaderboardScores SET Score = @score 
              WHERE PlayerName = @playerName COLLATE SQL_Latin1_General_CP1_CI_AS 
              AND OperationType = @operationType;
            `;
            const updateRequest = new Request(updateSql, (err) => {
              if (err) return connection.rollbackTransaction(() => res.status(500).json({ message: "DB Error", error: err.message }));
              connection.commitTransaction(err => {
                if (err) return connection.rollbackTransaction(() => res.status(500).json({ message: "DB Error", error: err.message }));
                res.status(200).json({ message: 'Score updated successfully!' });
                connection.close();
              });
            });
            updateRequest.addParameter('score', TYPES.Int, scoreNum);
            updateRequest.addParameter('playerName', TYPES.NVarChar, playerName);
            updateRequest.addParameter('operationType', TYPES.NVarChar, operationType);
            connection.execSql(updateRequest);
          } else { // New score is not better
            connection.commitTransaction(err => { // Commit to end transaction
                if (err) return connection.rollbackTransaction(() => res.status(500).json({ message: "DB Error", error: err.message }));
                res.status(200).json({ message: 'Existing score is better.' });
                connection.close();
            });
          }
        } else { // New player
          const insertSql = `
            INSERT INTO LeaderboardScores (PlayerName, Score, OperationType) 
            VALUES (@playerName, @score, @operationType);
          `;
          const insertRequest = new Request(insertSql, (err) => {
            if (err) return connection.rollbackTransaction(() => res.status(500).json({ message: "DB Error", error: err.message }));
            
            // After inserting, trim the leaderboard to the top 10
            const trimSql = `
              WITH CTE AS (
                SELECT Id, ROW_NUMBER() OVER (ORDER BY Score ASC) as rn 
                FROM LeaderboardScores WHERE OperationType = @operationType
              )
              DELETE FROM LeaderboardScores WHERE Id IN (SELECT Id FROM CTE WHERE rn > 10);
            `;
            const trimRequest = new Request(trimSql, (err) => {
               if (err) return connection.rollbackTransaction(() => res.status(500).json({ message: "DB Error", error: err.message }));
               connection.commitTransaction(err => {
                  if (err) return connection.rollbackTransaction(() => res.status(500).json({ message: "DB Error", error: err.message }));
                  res.status(201).json({ message: 'Score submitted successfully!' });
                  connection.close();
               });
            });
            trimRequest.addParameter('operationType', TYPES.NVarChar, operationType);
            connection.execSql(trimRequest);
          });
          insertRequest.addParameter('playerName', TYPES.NVarChar, playerName);
          insertRequest.addParameter('score', TYPES.Int, scoreNum);
          insertRequest.addParameter('operationType', TYPES.NVarChar, operationType);
          connection.execSql(insertRequest);
        }
      });
      request.addParameter('playerName', TYPES.NVarChar, playerName);
      request.addParameter('operationType', TYPES.NVarChar, operationType);
      connection.execSql(request);
    });
  });

  connection.connect();
});


// --- Server Start ---
app.listen(port, () => {
  console.log(`✅ Simple API server listening on http://localhost:${port}`);
});
