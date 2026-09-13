import pg from 'pg';
const pool = new pg.Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'smartanalyzer',
  password: 'admin',
  port: 5432,
});
async function count() {
  const res = await pool.query("SELECT status, COUNT(*) FROM analysis_scores WHERE created_at >= CURRENT_DATE AND analysis_type='qullamaggie' GROUP BY status");
  console.log(res.rows);
  process.exit(0);
}
count();
