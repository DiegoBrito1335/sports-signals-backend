import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('❌ DATABASE_URL não configurada no .env');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Helper para queries
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  try {
    const res = await pool.query(text, params);
    return res.rows;
  } catch (error) {
    console.error('❌ Database query error:', error);
    throw error;
  }
}

// Testar conexão
pool.on('connect', () => {
  console.log('✅ Database connected');
});

pool.on('error', (err) => {
  console.error('❌ Database error:', err);
});