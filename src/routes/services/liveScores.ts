import axios from 'axios';

const API_KEY = process.env.API_SPORTS_KEY;
const NBA_API = 'https://v1.basketball.api-sports.io';
const NFL_API = 'https://v1.american-football.api-sports.io';

const headers = {
  'x-rapidapi-key': API_KEY,
  'x-rapidapi-host': 'v1.basketball.api-sports.io'
};

interface LiveGame {
  id: string;
  league: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  status: string;
  quarter: string;
  time_remaining: string;
}

// Buscar jogos ao vivo da NBA
export async function fetchNBALiveGames(): Promise<LiveGame[]> {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const response = await axios.get(`${NBA_API}/games`, {
      params: {
        league: 1, // NBA = 1
        season: '2024-2025',
        date: today
      },
      headers: {
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': 'v1.basketball.api-sports.io'
      }
    });

    const games = response.data.response || [];
    
    return games
      .filter((g: any) => g.status.short === 'LIVE' || g.status.short === 'Q1' || g.status.short === 'Q2' || g.status.short === 'Q3' || g.status.short === 'Q4')
      .map((g: any) => ({
        id: g.id.toString(),
        league: 'NBA',
        home_team: g.teams.home.name,
        away_team: g.teams.away.name,
        home_score: g.scores.home.total || 0,
        away_score: g.scores.away.total || 0,
        status: g.status.short,
        quarter: g.status.short,
        time_remaining: g.status.timer || '0:00'
      }));
  } catch (error: any) {
    console.error('❌ Error fetching NBA live scores:', error.message);
    return [];
  }
}

// Buscar jogos ao vivo da NFL
export async function fetchNFLLiveGames(): Promise<LiveGame[]> {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const response = await axios.get(`${NFL_API}/games`, {
      params: {
        league: 1, // NFL = 1
        season: '2024',
        date: today
      },
      headers: {
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': 'v1.american-football.api-sports.io'
      }
    });

    const games = response.data.response || [];
    
    return games
      .filter((g: any) => g.game.status.short === 'LIVE' || g.game.status.short.includes('Q'))
      .map((g: any) => ({
        id: g.game.id.toString(),
        league: 'NFL',
        home_team: g.teams.home.name,
        away_team: g.teams.away.name,
        home_score: g.scores.home.total || 0,
        away_score: g.scores.away.total || 0,
        status: g.game.status.short,
        quarter: g.game.status.short,
        time_remaining: g.game.status.timer || '0:00'
      }));
  } catch (error: any) {
    console.error('❌ Error fetching NFL live scores:', error.message);
    return [];
  }
}

// Buscar TODOS os jogos ao vivo
export async function fetchAllLiveGames(): Promise<LiveGame[]> {
  const [nba, nfl] = await Promise.all([
    fetchNBALiveGames(),
    fetchNFLLiveGames()
  ]);
  
  return [...nba, ...nfl];
}