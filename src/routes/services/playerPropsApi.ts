// src/routes/services/playerPropsApi.ts
import { query } from '../../db';

const ODDS_API_KEY = process.env.ODDS_API_KEY;

type Game = {
  id: string;
  league: string;
  status: string;
  odds_api_id?: string | null;
  external_id?: string | null;
};

type NewSignal = {
  game_id: string;
  market: 'PROP';
  prop_type: string;
  side: 'over' | 'under';
  prop_line: number;
  odds: number;
  ev: number;
  bookmaker: string;
  player_name: string | null;
};

// Mapeia market da The Odds API -> prop_type interno (compatível com props.ts)
function mapPropType(marketKey: string): string {
  if (marketKey.includes('passing_yards')) return 'qb_passing_yards';
  if (marketKey.includes('receiving_yards')) return 'wr_receiving_yards';
  if (marketKey.includes('rushing_yards')) return 'rb_rushing_yards';
  if (marketKey.includes('points')) return 'player_points';
  return 'other';
}

function calcEv(odds: number, modelProb: number = 0.58): number {
  return modelProb * odds - 1;
}

export async function syncPlayerPropsForGame(game: Game, sportKey: string) {
  if (!ODDS_API_KEY) throw new Error('ODDS_API_KEY not configured');

  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=player_passing_yards,player_rushing_yards,player_receiving_yards,player_points&oddsFormat=decimal`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`The Odds API error: ${resp.status}`);
  const events = await resp.json();

  const event = events.find(
    (e: any) =>
      e.id === (game as any).odds_api_id ||
      e.id === (game as any).external_id,
  );
  if (!event) return;

  const inserts: NewSignal[] = [];

  for (const bookmaker of event.bookmakers ?? []) {
    for (const market of bookmaker.markets ?? []) {
      if (!market.key.startsWith('player_')) continue;

      const propType = mapPropType(market.key);
      for (const outcome of market.outcomes ?? []) {
        const line = outcome.point ?? null;
        const odds = Number(outcome.price);
        if (!odds || !line) continue;

        const ev = calcEv(odds);
        if (ev <= 0.03) continue;

        inserts.push({
          game_id: game.id,
          market: 'PROP',
          prop_type: propType,
          side: outcome.name?.toLowerCase().includes('over') ? 'over' : 'under',
          prop_line: line,
          odds,
          ev,
          bookmaker: bookmaker.key,
          player_name: outcome.description ?? outcome.name ?? null,
        });
      }
    }
  }

  if (inserts.length === 0) return;

  const cols = [
    'game_id',
    'market',
    'prop_type',
    'side',
    'prop_line',
    'odds',
    'ev',
    'bookmaker',
    'player_name',
  ];

  const values: any[] = [];
  const placeholders: string[] = [];

  inserts.forEach((row, idx) => {
    const baseIndex = idx * cols.length;
    placeholders.push(
      `(${cols.map((_, i) => `$${baseIndex + i + 1}`).join(', ')})`,
    );
    values.push(
      row.game_id,
      row.market,
      row.prop_type,
      row.side,
      row.prop_line,
      row.odds,
      row.ev,
      row.bookmaker,
      row.player_name,
    );
  });

  const sql = `
    INSERT INTO signals (${cols.join(',')})
    VALUES ${placeholders.join(',')}
    ON CONFLICT DO NOTHING
  `;

  await query(sql, values);
}

export async function syncPlayerPropsForGames(games: Game[], sportKey: string) {
  for (const game of games) {
    try {
      await syncPlayerPropsForGame(game, sportKey);
    } catch (e) {
      console.error('Error syncing props for game', game.id, e);
    }
  }
}
