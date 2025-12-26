// src/routes/predictions.ts
import { Router } from 'express';
import { query } from '../db';
import { SignalRow } from '../types';

const router = Router();

interface PredictionRow {
  game_id: string;
  home_win_prob: number;
  away_win_prob: number;
  home_pts_proj: number;
  away_pts_proj: number;
  total_pts_proj: number;
  spread_proj: number;
  confidence: number;
  score_total: number;
  score_offensive: number;
  score_defensive: number;
  score_injuries: number;
  score_form: number;
  ai_comment: string;
  home_team: string;
  away_team: string;
  starts_at: string;
  league: string;
}

// GET /api/predictions/:gameId
router.get('/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;

    const [prediction] = await query<PredictionRow>(
      `
      SELECT
        p.*,
        g.home_team,
        g.away_team,
        g.starts_at,
        g.league
      FROM predictions p
      JOIN games g ON g.id = p.game_id
      WHERE p.game_id = $1
      `,
      [gameId],
    );

    if (!prediction) {
      return res.status(404).json({ error: 'Prediction not found' });
    }

    const evOpportunities = await query<SignalRow>(
      `SELECT * FROM signals WHERE game_id = $1 AND ev > 0.05 ORDER BY ev DESC`,
      [gameId],
    );

    const bestSignal = evOpportunities[0] ?? null;

    const response = {
      game_id: gameId,
      home_team: prediction.home_team,
      away_team: prediction.away_team,
      league: prediction.league,
      starts_at: prediction.starts_at,
      predictions: {
        pre_game: {
          home_win_prob: prediction.home_win_prob,
          away_win_prob: prediction.away_win_prob,
          home_pts_proj: prediction.home_pts_proj,
          away_pts_proj: prediction.away_pts_proj,
          total_pts_proj: prediction.total_pts_proj,
          spread_proj: prediction.spread_proj,
          confidence: prediction.confidence,
        },
      },
      algorithm_breakdown: {
        total_score: prediction.score_total,
        offensive: { score: prediction.score_offensive, weight: 0.3 },
        defensive: { score: prediction.score_defensive, weight: 0.3 },
        injuries: { score: prediction.score_injuries, weight: 0.2 },
        form: { score: prediction.score_form, weight: 0.2 },
      },
      ia_comment: prediction.ai_comment,
      ev_opportunities: evOpportunities,
      best_signal: bestSignal,
      distribution: {
        total_mean: prediction.total_pts_proj,
        total_std: 12.5,
        percentiles: {
          p10: prediction.total_pts_proj - 16,
          p50: prediction.total_pts_proj,
          p90: prediction.total_pts_proj + 16,
        },
      },
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching prediction:', error);
    res.status(500).json({ error: 'Failed to fetch prediction' });
  }
});

export default router;
