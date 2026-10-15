// Aplica prisma/init.sql sobre DATABASE_URL (idempotente). Uso: npm run db:init
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('Falta DATABASE_URL'); process.exit(1); }
  const client = new Client({ connectionString: url });
  await client.connect();
  const sql = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'init.sql'), 'utf8');
  await client.query(sql);
  await client.end();
  console.log('Esquema aplicado.');
})().catch((e) => { console.error(e); process.exit(1); });
