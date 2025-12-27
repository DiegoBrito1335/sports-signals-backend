import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool } from './db';
import syncRouter from './routes/sync';
import liveRouter from './routes/live';
import propsRouter from './routes/props';
import syncPropsRouter from './routes/syncProps';
import liveValuefinderRouter from './routes/liveValuefinder';



dotenv.config();

const app = express();

// Middlewares
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Log requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// ==========================================
// HEALTH CHECK
// ==========================================
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      error: error.message
    });
  }
});

// ==========================================
// IMPORT ROUTES
// ==========================================
import valueFinderRouter from './routes/valuefinder';
import predictionsRouter from './routes/predictions';
import performanceRouter from './routes/performance';
import gamesRouter from './routes/games';

app.use('/api/valuefinder', valueFinderRouter);
app.use('/api/predictions', predictionsRouter);
app.use('/api/performance', performanceRouter);
app.use('/api/games', gamesRouter);
app.use('/api/props', propsRouter);
app.use('/api/sync', syncRouter);
app.use('/api/live', liveRouter);
app.use('/api/sync', syncPropsRouter);  // novo, rota /api/sync/props
app.use('/api/live/valuefinder', liveValuefinderRouter);


// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('❌ Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`
🚀 Server running on port ${PORT}
📡 http://localhost:${PORT}
🏥 Health: http://localhost:${PORT}/health
`);
});