// src/types.ts

export type MarketType = 'ML' | 'SPREAD' | 'TOTAL' | 'PROP';

export type PropType =
  | 'qb_passing_yards'
  | 'wr_receiving_yards'
  | 'rb_rushing_yards'
  | null;

export interface SignalRow {
  id: string;
  game_id: string;
  league: 'NBA' | 'NFL';
  market: MarketType;
  prop_type: PropType;
  side: 'home' | 'away' | 'over' | 'under' | null;
  over_under: 'over' | 'under' | null; // para TOTAL/PROP se quiser separar
  line: number | null;                 // spread ou total principal
  prop_line: number | null;            // linha de prop (se aplicável)
  bookmaker: string;
  odds: number;
  model_prob: number;                  // prob do modelo (0–1)
  implied_prob: number;                // prob implícita da odd (0–1)
  ev: number;                          // EV relativo (ex.: 0.053 = +5.3%)
  roi_expected: number;                // em %, se quiser (ex.: 5.3)
  created_at: string;                  // ISO
}
