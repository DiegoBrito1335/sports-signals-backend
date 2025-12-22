import { Router } from 'express';
import { fetchAllLiveGames } from './services/liveScores';
import { query } from '../db';

const router = Router();

// GET /api/live/games - Buscar jogos ao vivo com placar atualizado
router.get('/games', async (req, res) => {
  try {
    const liveGames = await fetchAllLiveGames();
    
    // Atualizar no banco de dados
    for (const game of liveGames) {
      await query(
        `
        UPDATE games 
        SET 
          status = 'live',
          home_score = $1,
          away_score = $2
        WHERE 
          (home_team ILIKE $3 AND away_team ILIKE $4)
          OR external_id = $5
        `,
        [game.home_score, game.away_score, game.home_team, game.away_team, game.id]
      );
    }

    res.json({
      success: true,
      games: liveGames,
      total: liveGames.length
    });
  } catch (error: any) {
    console.error('❌ Error fetching live games:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;