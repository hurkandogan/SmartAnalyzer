import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function test() {
  const client = await pool.connect();
  try {
      const allRecentScoresRes = await client.query(`
        SELECT symbol, analysis_type, score, status, reason, price, created_at 
        FROM analysis_scores 
        WHERE created_at >= NOW() - INTERVAL '10 days'
        ORDER BY created_at DESC
      `);
      console.log(`Found ${allRecentScoresRes.rows.length} scores in last 10 days.`);
  } finally {
      client.release();
      pool.end();
  }
}
test();
