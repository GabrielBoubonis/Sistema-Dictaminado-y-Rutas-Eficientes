// Vuelve a geocodificar todas las solicitudes (p. ej. después de mejorar el geocodificador), sin tocar dictámenes ni rutas.
// Las que no se encuentran quedan sin coordenadas y las reintenta el job horario (RF-62).
import 'dotenv/config';
import { prisma } from './db';
import { providers } from './providers';

(async () => {
  const sols = await prisma.solicitud.findMany({ orderBy: [{ anio: 'asc' }, { numero_sua: 'asc' }] });
  console.log(`Geocodificando ${sols.length} solicitudes (1 por segundo)…`);
  let ok = 0;
  for (const s of sols) {
    let c = null;
    try { c = await providers.geocoder.geocodificar(s.direccion); } catch (e) { console.log(`  ${s.direccion}: ${(e as Error).message}`); }
    await prisma.solicitud.update({
      where: { numero_sua_anio: { numero_sua: s.numero_sua, anio: s.anio } },
      data: c ? { latitud: c.lat, longitud: c.lng, geo_ultimo_intento: null } : { latitud: null, longitud: null, geo_ultimo_intento: new Date() },
    });
    console.log(`  ${c ? `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}` : 'SIN UBICAR          '}  ${s.direccion}`);
    if (c) ok++;
  }
  console.log(`Listo: ${ok} de ${sols.length} ubicadas.`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
