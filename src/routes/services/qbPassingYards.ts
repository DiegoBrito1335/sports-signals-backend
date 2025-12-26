// src/routes/services/qbPassingYards.ts
export interface QbStats {
  player_id: string;
  player_name: string;
  team: string;
  games_played: number;
  passing_yards_per_game: number;
  passing_yards_std_dev: number;      // se não tiver, podemos estimar
  last5_passing_yards_avg: number;
}

export interface DefenseVsPassStats {
  opponent_team: string;
  pass_yards_allowed_per_game: number;
  pass_yards_allowed_rank: number;    // 1 = melhor, 32 = pior vs passe
}

export interface QbPropOdds {
  game_id: string;
  league: 'NFL';
  player_id: string;
  player_name: string;
  team: string;
  opponent_team: string;
  prop_line: number;                  // ex: 249.5
  bookmaker: string;
  odds_over: number;
  odds_under: number;
}

// ===== distribuição de jardas do QB =====
export function estimateQbPassingDistribution(
  qb: QbStats,
  def: DefenseVsPassStats,
) {
  const wRecent = 0.4;
  const meanBase =
    (1 - wRecent) * qb.passing_yards_per_game +
    wRecent * qb.last5_passing_yards_avg;

  const defFactor = 1 + (def.pass_yards_allowed_rank - 16) * 0.01;
  const mu = meanBase * defFactor;

  const sigma =
    qb.passing_yards_std_dev && qb.passing_yards_std_dev > 0
      ? qb.passing_yards_std_dev
      : Math.max(25, qb.passing_yards_per_game * 0.6);

  return { mu, sigma };
}

// ===== normal CDF (aproximação) =====
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

export function qbPassingOverUnderProbs(
  line: number,
  mu: number,
  sigma: number,
) {
  const pLessEq = normalCdf((line - mu) / sigma);
  const pUnder = pLessEq;
  const pOver = 1 - pLessEq;
  return { pOver, pUnder };
}

// ===== montar signals de props de QB =====
export interface QbPropSignalInput {
  qbStats: QbStats;
  defenseStats: DefenseVsPassStats;
  odds: QbPropOdds;
}

export interface QbPropSignal {
  game_id: string;
  league: 'NFL';
  market: 'PROP';
  prop_type: 'qb_passing_yards';
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

export function buildQbPassingSignals(
  input: QbPropSignalInput,
): { overSignal: QbPropSignal; underSignal: QbPropSignal } {
  const { qbStats, defenseStats, odds } = input;

  const { mu, sigma } = estimateQbPassingDistribution(qbStats, defenseStats);
  const { pOver, pUnder } = qbPassingOverUnderProbs(
    odds.prop_line,
    mu,
    sigma,
  );

  const impliedOver = 1 / odds.odds_over;
  const impliedUnder = 1 / odds.odds_under;

  const evOver = pOver * odds.odds_over - 1;
  const evUnder = pUnder * odds.odds_under - 1;

  const base: Omit<
    QbPropSignal,
    'side' | 'odds' | 'model_prob' | 'implied_prob' | 'ev' | 'roi_expected'
  > = {
    game_id: odds.game_id,
    league: odds.league,
    market: 'PROP',
    prop_type: 'qb_passing_yards',
    player_id: odds.player_id,
    player_name: odds.player_name,
    prop_line: odds.prop_line,
    bookmaker: odds.bookmaker,
  };

  const overSignal: QbPropSignal = {
    ...base,
    side: 'over',
    odds: odds.odds_over,
    model_prob: pOver,
    implied_prob: impliedOver,
    ev: evOver,
    roi_expected: evOver * 100,
  };

  const underSignal: QbPropSignal = {
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
