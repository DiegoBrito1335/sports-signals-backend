// src/routes/services/rbRushingYards.ts

export interface RbStats {
  player_id: string;
  player_name: string;
  team: string;
  games_played: number;
  rushing_yards_per_game: number;
  rushing_yards_std_dev: number;
  last5_rushing_yards_avg: number;
  attempts_per_game: number;
}

export interface DefenseVsRunStats {
  opponent_team: string;
  rush_yards_allowed_per_game: number;
  rush_yards_allowed_rank: number; // 1 = melhor vs corrida, 32 = pior
}

export interface RbPropOdds {
  game_id: string;
  league: 'NFL';
  player_id: string;
  player_name: string;
  team: string;
  opponent_team: string;
  prop_line: number;      // ex: 69.5
  bookmaker: string;
  odds_over: number;
  odds_under: number;
}

// ===== distribuição de jardas de corrida do RB =====
export function estimateRbRushingDistribution(
  rb: RbStats,
  def: DefenseVsRunStats,
) {
  const wRecent = 0.5;
  const meanBase =
    (1 - wRecent) * rb.rushing_yards_per_game +
    wRecent * rb.last5_rushing_yards_avg;

  // Defesa vs corrida: ajusta média em torno de +-15%
  const defFactor = 1 + (def.rush_yards_allowed_rank - 16) * 0.012;
  const mu = meanBase * defFactor;

  // se não tiver desvio, estima com base na variabilidade típica de RB
  const sigma =
    rb.rushing_yards_std_dev && rb.rushing_yards_std_dev > 0
      ? rb.rushing_yards_std_dev
      : Math.max(15, rb.rushing_yards_per_game * 0.7);

  return { mu, sigma };
}

// ===== normal CDF (mesma aproximação do QB) =====
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1 / (1 + p * Math.abs(x));
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
      t *
      Math.exp(-x * x));
  return sign * y;
}

function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

export function rbRushingOverUnderProbs(
  line: number,
  mu: number,
  sigma: number,
) {
  const pLessEq = normalCdf((line - mu) / sigma);
  const pUnder = pLessEq;
  const pOver = 1 - pLessEq;
  return { pOver, pUnder };
}

// ===== montar signals de props de RB =====
export interface RbPropSignalInput {
  rbStats: RbStats;
  defenseStats: DefenseVsRunStats;
  odds: RbPropOdds;
}

export interface RbPropSignal {
  game_id: string;
  league: 'NFL';
  market: 'PROP';
  prop_type: 'rb_rushing_yards';
  player_id: string;
  player_name: string;
  prop_line: number;
  side: 'over' | 'under';
  bookmaker: string;
  odds: number;
  model_prob: number;
  implied_prob: number;
  ev: number;
  roi_expected: number;
}

export function buildRbRushingSignals(
  input: RbPropSignalInput,
): { overSignal: RbPropSignal; underSignal: RbPropSignal } {
  const { rbStats, defenseStats, odds } = input;

  const { mu, sigma } = estimateRbRushingDistribution(rbStats, defenseStats);
  const { pOver, pUnder } = rbRushingOverUnderProbs(
    odds.prop_line,
    mu,
    sigma,
  );

  const impliedOver = 1 / odds.odds_over;
  const impliedUnder = 1 / odds.odds_under;

  const evOver = pOver * odds.odds_over - 1;
  const evUnder = pUnder * odds.odds_under - 1;

  const base: Omit<
    RbPropSignal,
    'side' | 'odds' | 'model_prob' | 'implied_prob' | 'ev' | 'roi_expected'
  > = {
    game_id: odds.game_id,
    league: odds.league,
    market: 'PROP',
    prop_type: 'rb_rushing_yards',
    player_id: odds.player_id,
    player_name: odds.player_name,
    prop_line: odds.prop_line,
    bookmaker: odds.bookmaker,
  };

  const overSignal: RbPropSignal = {
    ...base,
    side: 'over',
    odds: odds.odds_over,
    model_prob: pOver,
    implied_prob: impliedOver,
    ev: evOver,
    roi_expected: evOver * 100,
  };

  const underSignal: RbPropSignal = {
    ...base,
    side: 'under',
    odds: odds.odds_under,
    model_prob: pUnder,
    implied_prob: impliedUnder,
    ev: evUnder,
    roi_expected: evUnder * 100,
  };

  return { overSignal, underSignal };
}
