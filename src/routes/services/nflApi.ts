import axios from 'axios';

const ESPN_NFL_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

interface ESPNGame {
  id: string;
  date: string;
  name: string;
  shortName: string;
  competitions: Array<{
    id: string;
    date: string;
    competitors: Array<{
      id: string;
      homeAway: 'home' | 'away';
      team: {
        id: string;
        displayName: string;
        abbreviation: string;
      };
      score: string;
    }>;
    status: {
      type: {
        state: string;
        completed: boolean;
      };
    };
  }>;
}

export async function fetchNFLGames() {
  try {
    const response = await axios.get(`${ESPN_NFL_URL}/scoreboard`);
    
    const games = response.data.events || [];
    console.log(`✅ Fetched ${games.length} NFL games`);
    return games as ESPNGame[];
  } catch (error: any) {
    console.error('❌ Error fetching NFL games:', error.message);
    throw error;
  }
}