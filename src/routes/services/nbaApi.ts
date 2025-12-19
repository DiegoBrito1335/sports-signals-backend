import axios from 'axios';

const NBA_API_URL = 'https://www.balldontlie.io/api/v1';

interface NBAGame {
  id: number;
  date: string;
  home_team: {
    id: number;
    abbreviation: string;
    city: string;
    name: string;
    full_name: string;
  };
  visitor_team: {
    id: number;
    abbreviation: string;
    city: string;
    name: string;
    full_name: string;
  };
  home_team_score: number;
  visitor_team_score: number;
  status: string;
}

export async function fetchNBAGames(date?: string) {
  try {
    const params: any = {
      per_page: 100,
      seasons: [2024] // Temporada 2024-2025
    };

    if (date) {
      params.dates = [date]; // Formato: YYYY-MM-DD
    }

    const response = await axios.get<{ data: NBAGame[] }>(
      `${NBA_API_URL}/games`,
      { params }
    );

    console.log(`✅ Fetched ${response.data.data.length} NBA games`);
    return response.data.data;
  } catch (error: any) {
    console.error('❌ Error fetching NBA games:', error.message);
    throw error;
  }
}

export async function fetchTeamStats(teamId: number, season: number = 2024) {
  try {
    const response = await axios.get(
      `${NBA_API_URL}/season_averages`,
      {
        params: {
          season,
          team_ids: [teamId]
        }
      }
    );

    return response.data.data;
  } catch (error: any) {
    console.error('❌ Error fetching team stats:', error.message);
    throw error;
  }
}