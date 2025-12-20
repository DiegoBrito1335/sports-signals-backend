import { Router } from 'express';
import { query } from '../db';

const router = Router();

// GET /api/games?status=scheduled&league=NBA
router.get('/', async (req, res) => {
  try {
    const { status = 'scheduled', league } = req.query;

    let sqlQuery = `
      SELECT
        g.*,
        p.confidence,
        p.home_win_prob,
        p.away_win_prob
      FROM games g
      LEFT JOIN predictions p ON p.game_id = g.id
      WHERE g.status = $1
        AND g.starts_at > NOW()  -- Apenas jogos futuros
    `;

    const params: any[] = [status];

    if (league) {
      sqlQuery += ` AND g.league = $2`;
      params.push(league);
    }

    sqlQuery += ` ORDER BY g.starts_at ASC LIMIT 50`;

    const games = await query<any>(sqlQuery, params);

    res.json(games);
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

export default router;