import axios from 'axios';

const ESPN_NBA_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const ESPN_NFL_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

interface LiveGame {
  id: string;
  league: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  status: string;
  period: string;
  time_remaining: string;
  is_live: boolean;
}

// Buscar jogos ao vivo da NBA
export async function fetchNBALiveGames(): Promise<LiveGame[]> {
  try {
    const response = await axios.get(ESPN_NBA_URL);
    const events = response.data.events || [];
    
    const games: LiveGame[] = [];
    
    for (const event of events) {
      const competition = event.competitions[0];
      const status = competition.status;
      
      // Apenas jogos ao vivo ou finalizados recentemente
      if (!['in', 'post'].includes(status.type.state)) continue;
      
      const homeTeam = competition.competitors.find((t: any) => t.homeAway === 'home');
      const awayTeam = competition.competitors.find((t: any) => t.homeAway === 'away');
      
      games.push({
        id: event.id,
        league: 'NBA',
        home_team: homeTeam?.team?.displayName || 'Unknown',
        away_team: awayTeam?.team?.displayName || 'Unknown',
        home_score: parseInt(homeTeam?.score || '0'),
        away_score: parseInt(awayTeam?.score || '0'),
        status: status.type.description,
        period: status.period ? `Q${status.period}` : 'Final',
        time_remaining: status.displayClock || '0:00',
        is_live: status.type.state === 'in'
      });
    }
    
    console.log(`✅ Fetched ${games.length} NBA games from ESPN`);
    return games;
  } catch (error: any) {
    console.error('❌ Error fetching NBA games from ESPN:', error.message);
    return [];
  }
}

// Buscar jogos ao vivo da NFL
export async function fetchNFLLiveGames(): Promise<LiveGame[]> {
  try {
    const response = await axios.get(ESPN_NFL_URL);
    const events = response.data.events || [];
    
    const games: LiveGame[] = [];
    
    for (const event of events) {
      const competition = event.competitions[0];
      const status = competition.status;
      
      // Apenas jogos ao vivo ou finalizados recentemente
      if (!['in', 'post'].includes(status.type.state)) continue;
      
      const homeTeam = competition.competitors.find((t: any) => t.homeAway === 'home');
      const awayTeam = competition.competitors.find((t: any) => t.homeAway === 'away');
      
      games.push({
        id: event.id,
        league: 'NFL',
        home_team: homeTeam?.team?.displayName || 'Unknown',
        away_team: awayTeam?.team?.displayName || 'Unknown',
        home_score: parseInt(homeTeam?.score || '0'),
        away_score: parseInt(awayTeam?.score || '0'),
        status: status.type.description,
        period: status.period ? `${status.period}Q` : 'Final',
        time_remaining: status.displayClock || '0:00',
        is_live: status.type.state === 'in'
      });
    }
    
    console.log(`✅ Fetched ${games.length} NFL games from ESPN`);
    return games;
  } catch (error: any) {
    console.error('❌ Error fetching NFL games from ESPN:', error.message);
    return [];
  }
}

// Buscar TODOS os jogos ao vivo
export async function fetchAllLiveGames(): Promise<LiveGame[]> {
  const [nba, nfl] = await Promise.all([
    fetchNBALiveGames(),
    fetchNFLLiveGames()
  ]);
  
  const allGames = [...nba, ...nfl];
  console.log(`📊 Total live games: ${allGames.length} (NBA: ${nba.length}, NFL: ${nfl.length})`);
  
  return allGames;
}