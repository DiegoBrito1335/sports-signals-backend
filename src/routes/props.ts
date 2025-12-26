// src/routes/props.ts
import { Router } from 'express';
import { query } from '../db';
import { SignalRow } from '../types';

const router = Router();

type PropType =
  | 'qb_passing_yards'
  | 'wr_receiving_yards'
  | 'rb_rushing_yards';

interface PlayerPropMarket {
  side: 'over' | 'under';
  bookmaker: string;
  odds: number;
  model_prob: number;
  implied_prob: number;
  ev: number;
  roi_expected: number;
  is_best: boolean;
}

interface PlayerProp {
  player_id: string;
  player_name: string;
  team: string;
  opponent: string;
  prop_type: PropType;
  prop_line: number;
  markets: PlayerPropMarket[];
  model_projection: number;
  confidence: number;
}

interface PropsResponse {
  game_id: string;
  league: string;
  home_team: string;
  away_team: string;
  qb_passing_yards: PlayerProp[];
  wr_receiving_yards: PlayerProp[];
  rb_rushing_yards: PlayerProp[];
}

// GET /api/props/:gameId
router.get('/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;

    const [game] = await query<{
      id: string;
      league: string;
      home_team: string;
      away_team: string;
    }>(
      `
      SELECT id, league, home_team, away_team
      FROM games
      WHERE id = $1
      `,
      [gameId],
    );

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const signals = await query<
      SignalRow & {
        player_id: string | null;
        player_name: string | null;
        opponent: string | null;
        prop_type: string | null;
        prop_line: number | null;
      }
    >(
      `
      SELECT
        s.*,
        s.player_id,
        s.player_name,
        s.prop_type,
        s.prop_line,
        CASE
          WHEN s.side IN ('over','under') AND s.market = 'PROP'
          THEN
            CASE
              WHEN s.league = 'NFL' AND s.side IN ('over','under')
              THEN
                CASE
                  WHEN s.player_team = g.home_team THEN g.away_team
                  ELSE g.home_team
                END
              ELSE g.away_team
            END
          ELSE g.away_team
        END AS opponent
      FROM signals s
      JOIN games g ON g.id = s.game_id
      WHERE s.game_id = $1
        AND s.market = 'PROP'
        AND s.prop_type IN (
          'qb_passing_yards',
          'wr_receiving_yards',
          'rb_rushing_yards'
        )
      `,
      [gameId],
    );

    // agrupar por player + prop_line + prop_type
    const byKey = new Map<string, PlayerProp>();

    for (const s of signals) {
      if (!s.player_id || !s.player_name || !s.prop_type || s.prop_line == null) {
        continue;
      }

      const key = `${s.prop_type}:${s.player_id}:${s.prop_line}`;

      if (!byKey.has(key)) {
        byKey.set(key, {
          player_id: s.player_id,
          player_name: s.player_name,
          team: game.home_team === s.side ? game.home_team : game.away_team,
          opponent: (s as any).opponent ?? '',
          prop_type: s.prop_type as PropType,
          prop_line: s.prop_line,
          markets: [],
          model_projection: s.line ?? s.prop_line ?? 0,
          confidence: Math.min(1, Math.max(0, s.model_prob ?? 0.5)),
        });
      }

      const group = byKey.get(key)!;

      const market: PlayerPropMarket = {
        side: s.side as 'over' | 'under',
        bookmaker: s.bookmaker,
        odds: s.odds,
        model_prob: s.model_prob,
        implied_prob: s.implied_prob,
        ev: s.ev,
        roi_expected: s.roi_expected,
        is_best: false,
      };

      group.markets.push(market);
    }

    // marcar melhor mercado por grupo (maior EV)
    for (const prop of byKey.values()) {
      let best: PlayerPropMarket | undefined;
      for (const m of prop.markets) {
        if (!best || m.ev > best.ev) best = m;
      }
      if (best) best.is_best = true;
    }

    const qbProps = Array.from(byKey.values()).filter(
      p => p.prop_type === 'qb_passing_yards',
    );
    const wrProps = Array.from(byKey.values()).filter(
      p => p.prop_type === 'wr_receiving_yards',
    );
    const rbProps = Array.from(byKey.values()).filter(
      p => p.prop_type === 'rb_rushing_yards',
    );

    const response: PropsResponse = {
      game_id: gameId,
      league: game.league,
      home_team: game.home_team,
      away_team: game.away_team,
      qb_passing_yards: qbProps,
      wr_receiving_yards: wrProps,
      rb_rushing_yards: rbProps,
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error fetching props:', error);
    res.status(500).json({ error: 'Failed to fetch props' });
  }
});

export default router;
