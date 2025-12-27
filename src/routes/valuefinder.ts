// src/routes/liveValuefinder.ts
import { Router } from 'express';
import { query } from '../db';
import { SignalRow } from '../types';

const router = Router();

// GET /api/live/valuefinder?min_ev=0.03&sport=NBA
// Retorna a melhor aposta do dia (maior EV) para cada jogo do dia corrente.
router.get('/', async (req, res) => {
  try {
    const minEv = Number(req.query.min_ev ?? 0.03);
    const sport = req.query.sport as string | undefined;

    const params: any[] = [minEv];
    let sportFilter = '';

    if (sport) {
      params.push(sport);
      sportFilter = 'AND g.league = $2';
    }

    const sql = `
      WITH ranked_signals AS (
        SELECT
          s.*,
          g.starts_at,
          g.league,
          g.home_team,
          g.away_team,
          g.home_score,
          g.away_score,
          g.status,
          ROW_NUMBER() OVER (
            PARTITION BY s.game_id
            ORDER BY s.ev DESC
          ) AS rn
        FROM signals s
        JOIN games g ON g.id = s.game_id
        WHERE
          s.ev >= $1
          ${sportFilter}
          AND g.starts_at::date = CURRENT_DATE
      )
      SELECT *
      FROM ranked_signals
      WHERE rn = 1
      ORDER BY starts_at ASC, ev DESC
      LIMIT 200
    `;

    const rows = await query<SignalRow & {
      starts_at: string;
      league: string;
      home_team: string;
      away_team: string;
      home_score: number | null;
      away_score: number | null;
      status: string;
      rn: number;
    }>(sql, params);

    res.json({
      success: true,
      opportunities: rows,
      stats: {
        total_games: rows.length,
        min_ev: minEv,
      },
    });
  } catch (error: any) {
    console.error('Error fetching daily best bets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch daily best bets',
      message: error.message,
    });
  }
});

export default router;
