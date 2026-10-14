// Prepara la base de pruebas: la crea si no existe y aplica el esquema (prisma/init.sql). Idempotente.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

module.exports = async () => {
  const url = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/arbolado_test';
  const u = new URL(url);
  const nombre = u.pathname.slice(1);
  const admin = new URL(url); admin.pathname = '/postgres';
  const a = new Client({ connectionString: admin.toString() });
  await a.connect();
  const { rowCount } = await a.query('SELECT 1 FROM pg_database WHERE datname = $1', [nombre]);
  if (!rowCount) await a.query(`CREATE DATABASE "${nombre.replace(/"/g, '')}"`);
  await a.end();
  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query(fs.readFileSync(path.join(__dirname, '..', 'prisma', 'init.sql'), 'utf8'));
  await c.end();
};
