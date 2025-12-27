// src/routes/services/playerPropsApi.ts
import { query } from '../../db';

const ODDS_API_KEY = process.env.ODDS_API_KEY;

type Game = {
  id: string;
  league: string;
  status: string;
  external_id?: string | null;  // ✅ Removido odds_api_id
};

type NewSignal = {
  id_do_jogo: string;        // game_id em português
  mercado: 'PROP';           // market em português
  prop_type: string;         // tipo de prop (mantém inglês)
  lado: string;              // side em português
  linha: number;             // line em português
  chances: number;           // odds em português
  ev: number;                // mantém ev
  casa_de_apostas: string;   // bookmaker em português
  player_name: string | null;
};

// ✅ Mapeia market da The Odds API -> prop_type interno
function mapPropType(marketKey: string): string {
  if (marketKey.includes('passing_yards')) return 'qb_passing_yards';
  if (marketKey.includes('receiving_yards')) return 'wr_receiving_yards';
  if (marketKey.includes('rushing_yards')) return 'rb_rushing_yards';
  if (marketKey.includes('points')) return 'player_points';
  return 'other';
}

// ✅ Calcula EV com probabilidades ajustadas por tipo de prop
function calcEv(chances: number, propType: string): number {
  // Probabilidades mais realistas por tipo de prop
  let modelProb = 0.52; // Default (50-50 com margem)
  
  // QB/WR/RB top tier geralmente têm linhas mais previsíveis
  if (propType.includes('qb') || propType.includes('wr')) {
    modelProb = 0.58;
  } else if (propType.includes('rb')) {
    modelProb = 0.56;
  }
  
  return modelProb * chances - 1;
}

// ✅ Extrai nome do jogador do campo description ou name
function extractPlayerName(outcome: any): string | null {
  // The Odds API geralmente retorna: "Patrick Mahomes Over 275.5"
  const description = outcome.description || outcome.name || '';
  
  // Remove "Over X.X" ou "Under X.X" do final
  const cleaned = description
    .replace(/\s+(Over|Under)\s+[\d.]+$/i, '')
    .trim();
  
  return cleaned || null;
}

export async function syncPlayerPropsForGame(game: Game, sportKey: string) {
  if (!ODDS_API_KEY) throw new Error('ODDS_API_KEY not configured');

  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=player_passing_yards,player_rushing_yards,player_receiving_yards,player_points&oddsFormat=decimal`;

  console.log('🎯 Fetching props for game:', game.id);
  console.log('📡 Sport key:', sportKey);
  
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`The Odds API error: ${resp.status}`);
  
  const events = await resp.json();
  console.log('📦 API returned', events.length, 'events');

  // ✅ CORREÇÃO PRINCIPAL: Usar apenas external_id
  const event = events.find((e: any) => e.id === game.external_id);
  
  if (!event) {
    console.log('⚠️  Game not found in Odds API response');
    console.log('   Looking for external_id:', game.external_id);
    console.log('   Available event IDs:', events.map((e: any) => e.id).slice(0, 5));
    return;
  }

  console.log('✅ Found event for game:', event.home_team, 'vs', event.away_team);

  const inserts: NewSignal[] = [];

  for (const bookmaker of event.bookmakers ?? []) {
    for (const market of bookmaker.markets ?? []) {
      if (!market.key.startsWith('player_')) continue;

      const propType = mapPropType(market.key);
      
      for (const outcome of market.outcomes ?? []) {
        const linha = outcome.point ?? null;
        const chances = Number(outcome.price);
        
        if (!chances || !linha) continue;

        const ev = calcEv(chances, propType);
        if (ev <= 0.03) continue; // Apenas EV > 3%

        // ✅ Extrai nome do jogador corretamente
        const playerName = extractPlayerName(outcome);

        inserts.push({
          id_do_jogo: game.id,
          mercado: 'PROP',
          prop_type: propType,
          lado: outcome.name?.toLowerCase().includes('over') ? 'over' : 'under',
          linha: linha,
          chances,
          ev,
          casa_de_apostas: bookmaker.key,
          player_name: playerName,
        });
      }
    }
  }

  if (inserts.length === 0) {
    console.log('⚠️  No props with EV > 3% found for this game');
    return;
  }

  console.log(`💾 Inserting ${inserts.length} props into database`);

  // ✅ Colunas em PORTUGUÊS (conforme tabela signals)
  const cols = [
    'id_do_jogo',
    'mercado',
    'prop_type',
    'lado',
    'linha',
    'chances',
    'ev',
    '"casa de apostas"',  // ✅ Nome com espaço precisa de aspas
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
      row.id_do_jogo,
      row.mercado,
      row.prop_type,
      row.lado,
      row.linha,
      row.chances,
      row.ev,
      row.casa_de_apostas,
      row.player_name,
    );
  });

  const sql = `
    INSERT INTO signals (${cols.join(',')})
    VALUES ${placeholders.join(',')}
    ON CONFLICT DO NOTHING
  `;

  try {
    await query(sql, values);
    console.log('✅ Props inserted successfully');
  } catch (error) {
    console.error('❌ Error inserting props:', error);
    throw error;
  }
}

export async function syncPlayerPropsForGames(games: Game[], sportKey: string) {
  console.log(`🔄 Starting sync for ${games.length} games`);
  
  for (const game of games) {
    try {
      await syncPlayerPropsForGame(game, sportKey);
    } catch (e) {
      console.error('❌ Error syncing props for game', game.id, e);
    }
  }
  
  console.log('✅ Sync completed');
}