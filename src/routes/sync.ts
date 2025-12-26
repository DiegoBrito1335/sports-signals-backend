import { Router } from 'express';
import { fetchOdds } from './services/oddsApi';
import { query } from '../db';
import {
  buildQbPassingSignals,
  QbStats,
  DefenseVsPassStats,
  QbPropOdds,
  QbPropSignal,
} from './services/qbPassingYards';

const router = Router();

// ==============================================
// HELPERS PARA PROPS DE QB
// ==============================================
async function saveQbPropSignal(signal: QbPropSignal) {
  await query(
    `
    INSERT INTO signals (
      game_id,
      market,
      prop_type,
      player_id,
      player_name,
      prop_line,
      side,
      bookmaker,
      odds,
      model_prob,
      implied_prob,
      ev,
      roi_expected,
      league
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
    )
    ON CONFLICT (game_id, market, prop_type, player_id, prop_line, side, bookmaker)
    DO UPDATE SET
      odds = EXCLUDED.odds,
      model_prob = EXCLUDED.model_prob,
      implied_prob = EXCLUDED.implied_prob,
      ev = EXCLUDED.ev,
      roi_expected = EXCLUDED.roi_expected
    `,
    [
      signal.game_id,
      signal.market,
      signal.prop_type,
      signal.player_id,
      signal.player_name,
      signal.prop_line,
      signal.side,
      signal.bookmaker,
      signal.odds,
      signal.model_prob,
      signal.implied_prob,
      signal.ev,
      signal.roi_expected,
      signal.league,
    ],
  );
}

// Chamar quando tiver odds + stats do QB e defesa
async function processQbPropsForGame(
  qbStats: QbStats,
  defStats: DefenseVsPassStats,
  odds: QbPropOdds,
) {
  const { overSignal, underSignal } = buildQbPassingSignals({
    qbStats,
    defenseStats: defStats,
    odds,
  });

  if (overSignal.ev >= 0.03) {
    await saveQbPropSignal(overSignal);
  }
  if (underSignal.ev >= 0.03) {
    await saveQbPropSignal(underSignal);
  }
}

// ==============================================
// POST /api/sync/games - Buscar e salvar apenas jogos futuros
// ==============================================
router.post('/games', async (_req, res) => {
  try {
    console.log('🔄 Starting sync...');

    const now = new Date();
    let saved = 0;
    let skipped = 0;

    console.log('📡 Fetching NBA odds...');
    const nbaOdds = await fetchOdds('basketball_nba');

    console.log('📡 Fetching NFL odds...');
    const nflOdds = await fetchOdds('americanfootball_nfl');

    const allGames = [...nbaOdds, ...nflOdds];
    console.log(`📊 Found ${allGames.length} total games`);

    for (const game of allGames) {
      const gameDate = new Date(game.commence_time);

      // Pular jogos que já passaram
      if (gameDate < now) {
        skipped++;
        continue;
      }

      // Salvar jogo
      const [savedGame] = await query<any>(
        `
        INSERT INTO games (external_id, league, home_team, away_team, starts_at, status)
        VALUES ($1, $2, $3, $4, $5, 'scheduled')
        ON CONFLICT (external_id) DO UPDATE SET
          starts_at = EXCLUDED.starts_at,
          status = EXCLUDED.status
        RETURNING id
        `,
        [
          game.id,
          game.sport_key.includes('nba') ? 'NBA' : 'NFL',
          game.home_team,
          game.away_team,
          game.commence_time,
        ],
      );

      // Salvar odds padrão (ML / SPREAD / TOTAL)
      if (game.bookmakers && game.bookmakers.length > 0) {
        for (const bookmaker of game.bookmakers) {
          for (const market of bookmaker.markets) {
            for (const outcome of market.outcomes) {
              let marketType = 'ML';
              let side: string | null = null;
              let overUnder: string | null = null;
              let line: number | null = null;

              if (market.key === 'h2h') {
                marketType = 'ML';
                side = outcome.name === game.home_team ? 'home' : 'away';
              } else if (market.key === 'spreads') {
                marketType = 'SPREAD';
                side = outcome.name === game.home_team ? 'home' : 'away';
                line = outcome.point;
              } else if (market.key === 'totals') {
                marketType = 'TOTAL';
                overUnder = outcome.name.toLowerCase();
                line = outcome.point;
              }

              await query(
                `
                INSERT INTO odds (game_id, market, side, over_under, line, odds, bookmaker)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT DO NOTHING
                `,
                [
                  savedGame.id,
                  marketType,
                  side,
                  overUnder,
                  line,
                  outcome.price,
                  bookmaker.key,
                ],
              );
            }
          }
        }
      }

      // Aqui você vai encaixar props quando tiver dados:
      // const qbStats: QbStats = ...;
      // const defStats: DefenseVsPassStats = ...;
      // const qbPropOdds: QbPropOdds = ...;
      // await processQbPropsForGame(qbStats, defStats, qbPropOdds);

      saved++;
    }

    console.log(
      `✅ Sync complete: ${saved} saved, ${skipped} skipped (past games)`,
    );

    res.json({
      success: true,
      message: `Synced ${saved} future games`,
      saved,
      skipped,
      total: allGames.length,
    });
  } catch (error: any) {
    console.error('❌ Sync error:', error);
    res.status(500).json({
      error: error.message,
      details: error.response?.data || error.stack,
    });
  }
});

// ==============================================
// POST /api/sync/predictions - Gerar predictions e signals ML
// ==============================================
router.post('/predictions', async (_req, res) => {
  try {
    console.log('🤖 Generating predictions...');

    const gamesWithoutPrediction = await query<any>(
      `
      SELECT g.id, g.home_team, g.away_team, g.league
      FROM games g
      LEFT JOIN predictions p ON p.game_id = g.id
      WHERE p.id IS NULL
        AND g.starts_at > NOW()
      LIMIT 100
      `,
    );

    console.log(
      `📊 Found ${gamesWithoutPrediction.length} games without predictions`,
    );

    let created = 0;

    for (const game of gamesWithoutPrediction) {
      const odds = await query<any>(
        `SELECT * FROM odds WHERE game_id = $1 AND market = 'ML' ORDER BY odds ASC`,
        [game.id],
      );

      if (odds.length < 2) continue;

      const homeOdds = odds.find((o: any) => o.side === 'home')?.odds || 2.0;
      const awayOdds = odds.find((o: any) => o.side === 'away')?.odds || 2.0;

      const homeImpliedProb = 1 / homeOdds;
      const awayImpliedProb = 1 / awayOdds;
      const total = homeImpliedProb + awayImpliedProb;

      const homeWinProb = homeImpliedProb / total;
      const awayWinProb = awayImpliedProb / total;

      const baseScore = Math.round(homeWinProb * 100);
      const scoreOffensive = Math.min(30, Math.round(baseScore * 0.3));
      const scoreDefensive = Math.min(30, Math.round(baseScore * 0.3));
      const scoreForm = Math.min(20, Math.round(baseScore * 0.2));
      const scoreInjuries = Math.min(20, Math.round(baseScore * 0.2));
      const scoreTotal =
        scoreOffensive + scoreDefensive + scoreForm + scoreInjuries;

      const confidence = Math.abs(homeWinProb - awayWinProb);

      const favorite =
        homeWinProb > awayWinProb ? game.home_team : game.away_team;
      const favoriteProb = Math.max(homeWinProb, awayWinProb);
      const advantageType =
        scoreOffensive > scoreDefensive ? 'ofensiva' : 'defensiva';

      const aiComment = `${favorite} aparece como favorito com ${(favoriteProb * 100).toFixed(
        1,
      )}% de probabilidade. ${
        confidence > 0.15
          ? `Vantagem ${advantageType} significativa sugere domínio esperado.`
          : 'Jogo equilibrado com resultado incerto.'
      } ${
        scoreInjuries < 15
          ? 'Desfalques podem impactar o desempenho.'
          : 'Elenco praticamente completo.'
      }`;

      await query(
        `
        INSERT INTO predictions (
          game_id, home_win_prob, away_win_prob,
          total_pts_proj, confidence,
          score_offensive, score_defensive, score_injuries, score_form, score_total,
          ai_comment, model_version
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
        )
        ON CONFLICT (game_id) DO NOTHING
        `,
        [
          game.id,
          homeWinProb,
          awayWinProb,
          game.league === 'NBA' ? 220 : 45,
          confidence,
          scoreOffensive,
          scoreDefensive,
          scoreInjuries,
          scoreForm,
          scoreTotal,
          aiComment,
          'v1.0-odds-based',
        ],
      );

      for (const odd of odds) {
        const modelProb = odd.side === 'home' ? homeWinProb : awayWinProb;
        const impliedProb = 1 / odd.odds;
        const ev = modelProb * odd.odds - 1;

        if (ev > 0.03) {
          await query(
            `
            INSERT INTO signals (
              game_id, market, side, odds, model_prob, implied_prob, ev, bookmaker
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT DO NOTHING
            `,
            [
              game.id,
              'ML',
              odd.side,
              odd.odds,
              modelProb,
              impliedProb,
              ev,
              odd.bookmaker,
            ],
          );
        }
      }

      created++;
    }

    console.log(`✅ Created ${created} predictions`);

    res.json({
      success: true,
      message: `Generated ${created} predictions`,
      total: gamesWithoutPrediction.length,
    });
  } catch (error: any) {
    console.error('❌ Error generating predictions:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
