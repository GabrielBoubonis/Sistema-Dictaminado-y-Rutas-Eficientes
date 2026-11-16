import fs from 'fs';
import path from 'path';
import { prisma } from './db';
import { normalizarNombre } from './catalogos';

const DIR = process.env.DATOS_DIR ?? path.resolve(__dirname, '../../../datos-prueba');

/**
 * Deja la tabla de especies igual al catálogo de `datos-prueba/especies.json` (nombres del reporte real de la Dirección)
 * sin borrar nada: agrega las que faltan, actualiza nombre y nombre científico de las que ya están y desactiva las del
 * catálogo anterior que ya no figuran. Las agregadas por un ingeniero (`creada_por`) no se tocan. Idempotente: corre al
 * iniciar el servidor, así la base de producción (que no se vuelve a sembrar) queda al día.
 */
export async function sincronizarCatalogoEspecies(): Promise<{ agregadas: number; desactivadas: number }> {
  const lista = JSON.parse(fs.readFileSync(path.join(DIR, 'especies.json'), 'utf8')) as Array<{ nombre_comun: string; nombre_cientifico: string | null }>;
  const normalizados = new Set<string>();
  let agregadas = 0;
  for (const e of lista) {
    const nombre_normalizado = normalizarNombre(e.nombre_comun);
    normalizados.add(nombre_normalizado);
    const existente = await prisma.especie.findUnique({ where: { nombre_normalizado } });
    if (existente) {
      await prisma.especie.update({ where: { id_especie: existente.id_especie }, data: { nombre_comun: e.nombre_comun, nombre_cientifico: e.nombre_cientifico, activa: true } });
    } else {
      await prisma.especie.create({ data: { nombre_comun: e.nombre_comun, nombre_cientifico: e.nombre_cientifico, nombre_normalizado } });
      agregadas++;
    }
  }
  const r = await prisma.especie.updateMany({
    where: { creada_por: null, activa: true, nombre_normalizado: { notIn: [...normalizados] } },
    data: { activa: false },
  });
  return { agregadas, desactivadas: r.count };
}
