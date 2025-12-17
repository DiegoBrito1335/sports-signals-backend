import { Router } from 'express';
import { query } from '../db';

const router = Router();

// GET /api/performance?period=30
router.get('/', async (req, res) => {
  try {
    const period = req.query.period || 'all';
    let dateFilter = '';

    if (period === 'today') {
      dateFilter = `AND date = CURRENT_DATE`;
    } else if (period !== 'all') {
      const days = parseInt(period as string);
      dateFilter = `AND date >= CURRENT_DATE - INTERVAL '${days} days'`;
    }

    // Pre-Live stats
    const [preLive] = await query<any>(
      `
      SELECT
        SUM(greens) as greens,
        SUM(losses) as losses,
        AVG(win_rate) as win_rate,
        AVG(roi) as roi
      FROM performance_history
      WHERE is_live = false ${dateFilter}
      `
    );

    // Live stats
    const [live] = await query<any>(
      `
      SELECT
        SUM(greens) as greens,
        SUM(losses) as losses,
        AVG(win_rate) as win_rate,
        AVG(roi) as roi
      FROM performance_history
      WHERE is_live = true ${dateFilter}
      `
    );

    // By sport
    const bySport = await query<any>(
      `
      SELECT
        sport,
        SUM(greens) as greens,
        SUM(losses) as losses,
        AVG(win_rate) as win_rate,
        AVG(roi) as roi
      FROM performance_history
      WHERE sport IS NOT NULL ${dateFilter}
      GROUP BY sport
      `
    );

    res.json({
      preLive: {
        greens: parseInt(preLive?.greens || 0),
        losses: parseInt(preLive?.losses || 0),
        winRate: parseFloat(preLive?.win_rate || 0),
        roi: parseFloat(preLive?.roi || 0)
      },
      live: {
        greens: parseInt(live?.greens || 0),
        losses: parseInt(live?.losses || 0),
        winRate: parseFloat(live?.win_rate || 0),
        roi: parseFloat(live?.roi || 0)
      },
      bySport: bySport.reduce((acc: any, row: any) => {
        acc[row.sport] = {
          greens: parseInt(row.greens),
          losses: parseInt(row.losses),
          winRate: parseFloat(row.win_rate),
          roi: parseFloat(row.roi)
        };
        return acc;
      }, {})
    });
  } catch (error) {
    console.error('Error fetching performance:', error);
    res.status(500).json({ error: 'Failed to fetch performance' });
  }
});

export default router;