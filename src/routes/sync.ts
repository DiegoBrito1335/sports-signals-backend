import { Router } from 'express';
import { fetchOdds } from './services/oddsApi';
import { query } from '../db';

const router = Router();

// POST /api/sync/games - Buscar e salvar apenas jogos futuros
router.post('/games', async (req, res) => {
  try {
    console.log('🔄 Starting sync...');

    const now = new Date();
    let saved = 0;
    let skipped = 0;

    // Buscar odds da NBA
    console.log('📡 Fetching NBA odds...');
    const nbaOdds = await fetchOdds('basketball_nba');
    
    // Buscar odds da NFL
    console.log('📡 Fetching NFL odds...');
    const nflOdds = await fetchOdds('americanfootball_nfl');

    const allGames = [...nbaOdds, ...nflOdds];
    console.log(`📊 Found ${allGames.length} total games`);

    // Salvar no banco (apenas jogos futuros)
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
          game.commence_time
        ]
      );

      // Salvar odds
      if (game.bookmakers && game.bookmakers.length > 0) {
        for (const bookmaker of game.bookmakers) {
          for (const market of bookmaker.markets) {
            for (const outcome of market.outcomes) {
              let marketType = 'ML';
              let side = null;
              let overUnder = null;
              let line = null;

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
                [savedGame.id, marketType, side, overUnder, line, outcome.price, bookmaker.key]
              );
            }
          }
        }
      }

      saved++;
    }

    console.log(`✅ Sync complete: ${saved} saved, ${skipped} skipped (past games)`);

    res.json({
      success: true,
      message: `Synced ${saved} future games`,
      saved,
      skipped,
      total: allGames.length
    });
  } catch (error: any) {
    console.error('❌ Sync error:', error);
    res.status(500).json({ 
      error: error.message,
      details: error.response?.data || error.stack
    });
  }
});

export default router;