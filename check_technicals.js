import pg from 'pg';
const pool = new pg.Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'smartanalyzer',
  password: 'admin',
  port: 5432,
});
async function count() {
  const res = await pool.query("SELECT rs FROM technicals LIMIT 5");
  console.log(res.rows);
  process.exit(0);
}
count();
