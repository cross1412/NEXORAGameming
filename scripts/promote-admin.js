import mysql from 'mysql2/promise';

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: npm run admin:promote -- registered-email@example.com');
  process.exit(1);
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'nexora_gaming',
  ssl: process.env.DB_SSL === 'true' ? {} : undefined,
  waitForConnections: true,
  connectionLimit: 1
});

try {
  const [result] = await pool.execute(
    "UPDATE users SET role = 'super_admin' WHERE email = ? AND role != 'super_admin'",
    [email]
  );
  if (result.affectedRows !== 1) {
    throw new Error('No matching non-admin account was updated.');
  }
  console.log(`Promoted ${email} to super_admin.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
