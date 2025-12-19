import { Router } from 'express';
import { fetchOdds } from './services/oddsApi';
import { fetchNBAGames } from './services/nbaApi';
import { fetchNFLGames } from './services/nflApi';
import { query } from '../db';

const router = Router();

// POST /api/sync/games - Buscar e salvar jogos reais
router.post('/games', async (req, res) => {
  try {
    console.log('🔄 Starting sync...');

    // Buscar odds da NBA
    const nbaOdds = await fetchOdds('basketball_nba');
    
    // Buscar odds da NFL
    const nflOdds = await fetchOdds('americanfootball_nfl');

    // Salvar no banco
    let saved = 0;
    
    for (const game of [...nbaOdds, ...nflOdds]) {
      await query(
        `
        INSERT INTO games (external_id, league, home_team, away_team, starts_at, status)
        VALUES ($1, $2, $3, $4, $5, 'scheduled')
        ON CONFLICT (external_id) DO UPDATE SET
          starts_at = EXCLUDED.starts_at,
          status = EXCLUDED.status
        `,
        [
          game.id,
          game.sport_key.includes('nba') ? 'NBA' : 'NFL',
          game.home_team,
          game.away_team,
          game.commence_time
        ]
      );
      saved++;
    }

    console.log(`✅ Saved ${saved} games to database`);

    res.json({
      success: true,
      message: `Synced ${saved} games`,
      nba: nbaOdds.length,
      nfl: nflOdds.length
    });
  } catch (error: any) {
    console.error('❌ Sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;