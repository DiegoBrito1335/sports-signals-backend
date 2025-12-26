// src/routes/syncProps.ts
import { Router } from 'express';
import { query } from '../db';
import { syncPlayerPropsForGames } from './services/playerPropsApi';

const router = Router();

// GET /api/sync/props?sport=NFL&status=scheduled
router.get('/props', async (req, res) => {
  try {
    const sport = (req.query.sport as string) || 'NFL';
    const status = (req.query.status as string) || 'scheduled';

    const games = await query<{
      id: string;
      league: string;
      status: string;
      odds_api_id: string | null;
      external_id: string | null;
    }>(
      `
      SELECT id, league, status, odds_api_id, external_id
      FROM games
      WHERE status = $1
      AND league = $2
      `,
      [status, sport],
    );

    if (!games || games.length === 0) {
      return res.json({ success: true, games: 0, message: 'No games to sync props' });
    }

    const sportKey =
      sport === 'NFL' ? 'americanfootball_nfl' :
      sport === 'NBA' ? 'basketball_nba' :
      sport.toLowerCase();

    await syncPlayerPropsForGames(games as any, sportKey);

    res.json({ success: true, games: games.length });
  } catch (e: any) {
    console.error('Error syncing player props:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
