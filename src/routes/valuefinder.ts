import { Router } from 'express';
import { query } from '../db';
import { SignalRow } from '../types';

const router = Router();

// GET /api/valuefinder?min_ev=0.05&sport=NBA
router.get('/', async (req, res) => {
  try {
    const minEv = Number(req.query.min_ev ?? 0.05);
    const sport = req.query.sport as string | undefined;

    let sqlQuery = `
      SELECT
        s.*,
        g.starts_at,
        g.league,
        g.home_team,
        g.away_team
      FROM signals s
      JOIN games g ON g.id = s.game_id
      WHERE s.ev >= $1
        AND g.status = 'scheduled'
        AND g.starts_at > NOW()
    `;

    const params: any[] = [minEv];

    if (sport) {
      sqlQuery += ` AND g.league = $2`;
      params.push(sport);
    }

    sqlQuery += ` ORDER BY s.ev DESC LIMIT 100`;

    const rows = await query<SignalRow & {
      starts_at: string;
      league: string;
      home_team: string;
      away_team: string;
    }>(sqlQuery, params);

    const stats = {
      total_opportunities: rows.length,
      avg_ev:
        rows.length > 0
          ? rows.reduce((sum, r) => sum + r.ev, 0) / rows.length
          : 0,
      max_ev: rows.length > 0 ? Math.max(...rows.map(r => r.ev)) : 0,
    };

    res.json({
      opportunities: rows,
      stats,
    });
  } catch (error) {
    console.error('Error fetching value finder:', error);
    res.status(500).json({ error: 'Failed to fetch value bets' });
  }
});

export default router;