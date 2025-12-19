import axios from 'axios';

const ODDS_API_KEY = process.env.THE_ODDS_API_KEY;
const ODDS_API_URL = 'https://api.the-odds-api.com/v4';

interface OddsGame {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    key: string;
    title: string;
    markets: Array<{
      key: string;
      outcomes: Array<{
        name: string;
        price: number;
        point?: number;
      }>;
    }>;
  }>;
}

export async function fetchOdds(sport: 'basketball_nba' | 'americanfootball_nfl') {
  try {
    const response = await axios.get<OddsGame[]>(
      `${ODDS_API_URL}/sports/${sport}/odds/`,
      {
        params: {
          apiKey: ODDS_API_KEY,
          regions: 'us',
          markets: 'h2h,spreads,totals',
          oddsFormat: 'decimal',
          bookmakers: 'draftkings,fanduel,betmgm'
        }
      }
    );

    console.log(`✅ Fetched ${response.data.length} games from The Odds API`);
    return response.data;
  } catch (error: any) {
    console.error('❌ Error fetching odds:', error.message);
    throw error;
  }
}