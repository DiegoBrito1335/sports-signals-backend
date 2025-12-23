import { Router } from 'express';
import { fetchAllLiveGames } from './services/liveScores';
import { query } from '../db';

const router = Router();

// GET /api/live/games - Buscar jogos ao vivo com placar atualizado
router.get('/games', async (req, res) => {
  try {
    console.log('🔄 Fetching live games from ESPN...');
    
    const liveGames = await fetchAllLiveGames();
    
    // Atualizar no banco de dados
    for (const game of liveGames) {
      const statusDb = game.is_live ? 'live' : 'finished';
      
      await query(
        `
        UPDATE games 
        SET 
          status = $1,
          home_score = $2,
          away_score = $3,
          updated_at = NOW()
        WHERE 
          (home_team ILIKE $4 AND away_team ILIKE $5)
          OR external_id = $6
        `,
        [statusDb, game.home_score, game.away_score, `%${game.home_team}%`, `%${game.away_team}%`, game.id]
      );
    }

    console.log(`✅ Updated ${liveGames.length} games in database`);

    res.json({
      success: true,
      games: liveGames,
      total: liveGames.length,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('❌ Error fetching live games:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// GET /api/live/refresh - Forçar atualização dos jogos ao vivo
router.post('/refresh', async (req, res) => {
  try {
    const liveGames = await fetchAllLiveGames();
    
    res.json({
      success: true,
      message: 'Live games refreshed',
      total: liveGames.length
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

export default router;