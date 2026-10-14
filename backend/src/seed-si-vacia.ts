// Carga los datos de demostración solo si la base está vacía (para arrancar en contenedores sin borrar datos).
import 'dotenv/config';
import { prisma } from './db';
import { seed } from './seed';

(async () => {
  if ((await prisma.usuario.count()) === 0) { console.log('Base vacía: cargando datos de demostración…'); await seed(); }
  else console.log('La base ya tiene datos: no se vuelve a sembrar.');
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
