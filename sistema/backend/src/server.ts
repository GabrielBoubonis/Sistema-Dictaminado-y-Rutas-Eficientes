import 'dotenv/config';
import { createApp } from './app';
import { config } from './config';
import { iniciarJobs } from './jobs';
import { sincronizarCatalogoEspecies } from './especies-catalogo';

if (config.isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24)) {
  console.error('En producción hay que definir JWT_SECRET (largo y aleatorio).');
  process.exit(1);
}

createApp().listen(config.port, () => {
  console.log(`API escuchando en http://localhost:${config.port}/api`);
  iniciarJobs();
  sincronizarCatalogoEspecies()
    .then((r) => { if (r.agregadas || r.desactivadas) console.log(`Especies: ${r.agregadas} agregadas, ${r.desactivadas} desactivadas.`); })
    .catch((e) => console.error('No se pudo actualizar el catálogo de especies:', e));
});
