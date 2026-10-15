import 'dotenv/config';
import { createApp } from './app';
import { config } from './config';
import { iniciarJobs } from './jobs';

if (config.isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24)) {
  console.error('En producción hay que definir JWT_SECRET (largo y aleatorio).');
  process.exit(1);
}

createApp().listen(config.port, () => {
  console.log(`API escuchando en http://localhost:${config.port}/api`);
  iniciarJobs();
});
