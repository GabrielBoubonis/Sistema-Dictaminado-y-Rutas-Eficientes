import 'dotenv/config';
// Carga los datos de prueba de ../../datos-prueba en la base. Uso: npm run seed
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { prisma } from './db';
import { canonicalJson, sha256 } from './security';
import { providers } from './providers';
import { sincronizarDesdeSua, recalcularEstado } from './services/solicitudes';
import { config } from './config';
import { contenidoFirmado } from './services/dictamenes';
import { normalizarNombre } from './catalogos';

const DIR = process.env.DATOS_DIR ?? path.resolve(__dirname, '../../../datos-prueba');
const leer = <T = any>(f: string): T => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const fecha = (s: string) => new Date(s.length === 10 ? s + 'T00:00:00Z' : s);

export async function limpiar() {
  // RF-54: registro_auditoria es inmutable (trigger); se vacía solo en desarrollo con TRUNCATE.
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE caso_revision, registro_auditoria, ruta_solicitud, ruta, fotografia,
    trabajo_aereo, trabajo_subterraneo, dictamen, especie, historial_derivacion, solicitud, sua_datos_complementarios,
    solicitudes_sua, usuarios_institucionales, webauthn_credential, refresh_token, dispositivo, usuario RESTART IDENTITY CASCADE`);
}

export async function seed(opciones: { bcryptCost?: number } = {}) {
  const cost = opciones.bcryptCost ?? Number(process.env.BCRYPT_COST ?? 12);
  await limpiar();

  // 1) Autenticación Institucional y usuarios del sistema
  const inst = leer<any[]>('usuarios-institucionales.json');
  await prisma.usuarioInstitucional.createMany({ data: inst });
  const nombres = new Map(inst.map((u) => [u.nombre_usuario, u.nombre_completo]));
  for (const u of leer<any[]>('usuarios-sistema.json')) {
    await prisma.usuario.create({
      data: {
        nombre_usuario: u.nombre_usuario, nombre_completo: nombres.get(u.nombre_usuario) ?? u.nombre_usuario,
        contrasena_hash: await bcrypt.hash(u.password_demo, cost), rol: u.rol, activo: u.activo, fecha_alta: fecha(u.fecha_alta),
      },
    });
  }

  // 2) Catálogo de especies
  for (const e of leer<any[]>('especies.json')) {
    await prisma.especie.create({
      data: { id_especie: e.id_especie, nombre_comun: e.nombre_comun, nombre_cientifico: e.nombre_cientifico,
        nombre_normalizado: normalizarNombre(e.nombre_comun), activa: e.activa, creada_por: e.creada_por },
    });
  }
  await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('especie','id_especie'), (SELECT MAX(id_especie) FROM especie))`);

  // 3) Mock del SUA → solicitudes del sistema (geocodifica una vez)
  await prisma.solicitudSua.createMany({
    data: leer<any[]>('solicitudes-sua.json').map((s) => ({ ...s, fecha_derivacion: fecha(s.fecha_derivacion) })),
  });
  await sincronizarDesdeSua({ crearHistorial: false });
  await prisma.historialDerivacion.createMany({
    data: leer<any[]>('historial-derivaciones.json').map((h) => ({ ...h, fecha_derivacion: fecha(h.fecha_derivacion) })),
  });

  // 4) Dictámenes ya firmados (ejemplo + conflicto) con su hash real
  const dicts = leer<any[]>('dictamenes-ejemplo.json');
  const conflicto = leer<any>('dictamenes-conflicto.json').dictamenes as any[];
  for (const d of [...dicts, ...conflicto]) {
    const sol = await prisma.solicitud.findUniqueOrThrow({ where: { numero_sua_anio: { numero_sua: d.numero_sua, anio: d.anio } } });
    const aereos = (d.trabajos_aereos ?? []).map((t: any) => t.tipo_trabajo);
    const subs = (d.trabajos_subterraneos ?? []).map((t: any) => ({ tipo_trabajo: t.tipo_trabajo, distancia_borde: t.distancia_borde ?? null }));
    const fotos = (d.fotografias ?? []).map((f: any) => {
      // las fotos de prueba se copian al almacenamiento de fotos del sistema (UPLOADS_DIR/seed/)
      const destino = path.join(config.uploadsDir, 'seed', path.basename(f.archivo_referencia));
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.copyFileSync(path.join(DIR, f.archivo_referencia), destino);
      return 'seed/' + path.basename(f.archivo_referencia);
    });
    const base = {
      numero_sua: d.numero_sua, anio: d.anio, nombre_usuario: d.nombre_usuario, nota_numero: d.nota_numero, expediente_numero: d.expediente_numero,
      fecha_emision: d.fecha_emision, domicilio_ejemplar: d.domicilio_ejemplar,
      latitud_ejemplar: d.latitud_ejemplar ?? sol.latitud, longitud_ejemplar: d.longitud_ejemplar ?? sol.longitud,
      referencia_ubicacion: d.referencia_ubicacion,
      id_especie: d.id_especie, distancia_medianera_referencia: d.distancia_medianera_referencia, cantidad_frente: d.cantidad_frente,
      nivel_dano_vereda: d.nivel_dano_vereda, es_extraccion: d.es_extraccion, perimetro_tronco: d.perimetro_tronco,
      motivo_extraccion: d.motivo_extraccion, es_sin_trabajo: d.es_sin_trabajo, motivo_sin_trabajo: d.motivo_sin_trabajo,
      complejidad: d.complejidad, urgente: d.urgente, arbol_frente_garage: d.arbol_frente_garage, media_tension: d.media_tension,
      de_oficio: d.de_oficio, plantar: d.plantar === 'ninguna' ? null : d.plantar, nivel_prioridad: d.nivel_prioridad, observaciones: d.observaciones,
      trabajos_aereos: aereos, trabajos_subterraneos: subs,
      fotos_sha256: fotos.map((f: string) => sha256(fs.readFileSync(path.join(config.uploadsDir, f)).toString('base64'))),
    };
    const uuid = `seed-${d.id_dictamen}`;
    const fechaFirma = fecha(d.fecha_emision.length === 10 ? d.fecha_emision + 'T12:00:00Z' : d.fecha_emision);
    const hash = sha256(canonicalJson(contenidoFirmado({ ...base, uuid_dictamen: uuid, fecha_firma: fechaFirma.toISOString() } as any)));
    const creado = await prisma.dictamen.create({
      data: {
        id_dictamen: d.id_dictamen, uuid_dictamen: uuid, numero_sua: d.numero_sua, anio: d.anio, nombre_usuario: d.nombre_usuario,
        nota_numero: d.nota_numero, expediente_numero: d.expediente_numero, fecha_emision: fecha(d.fecha_emision), fecha_firma: fechaFirma,
        domicilio_ejemplar: d.domicilio_ejemplar, latitud_ejemplar: base.latitud_ejemplar, longitud_ejemplar: base.longitud_ejemplar,
        referencia_ubicacion: d.referencia_ubicacion,
        id_especie: d.id_especie, distancia_medianera_referencia: d.distancia_medianera_referencia, cantidad_frente: d.cantidad_frente,
        nivel_dano_vereda: d.nivel_dano_vereda, es_extraccion: d.es_extraccion, perimetro_tronco: d.perimetro_tronco,
        motivo_extraccion: d.motivo_extraccion, es_sin_trabajo: d.es_sin_trabajo, motivo_sin_trabajo: d.motivo_sin_trabajo,
        complejidad: d.complejidad, urgente: d.urgente, arbol_frente_garage: d.arbol_frente_garage, media_tension: d.media_tension,
        de_oficio: d.de_oficio, plantar: base.plantar, nivel_prioridad: d.nivel_prioridad, observaciones: d.observaciones,
        vigente: d.vigente === undefined ? true : d.vigente, hash_firma: hash,
        firmado_sin_conexion: d.id_dictamen === 102,
        aereos: { create: aereos.map((t: string) => ({ tipo_trabajo: t })) },
        subterraneos: { create: subs },
        fotos: { create: fotos.map((f: string, i: number) => ({ archivo_referencia: f, orden: i + 1 })) },
      },
    });
    void creado;
  }
  await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('dictamen','id_dictamen'), (SELECT MAX(id_dictamen) FROM dictamen))`);
  const sols = await prisma.solicitud.findMany();
  for (const s of sols) await recalcularEstado(prisma, s.numero_sua, s.anio);

  // 5) Captores y casos "Para revisar" de ejemplo
  for (const d of leer<any[]>('dispositivos.json')) {
    await prisma.dispositivo.create({
      data: { ...d, fecha_bloqueo: d.fecha_bloqueo ? new Date(d.fecha_bloqueo) : null, fecha_desbloqueo: null },
    });
  }
  for (const c of leer<any[]>('casos-revision.json')) {
    await prisma.casoRevision.create({ data: { tipo: c.tipo, referencia_solicitud: c.referencia_solicitud, id_dictamen: null, motivo: c.motivo, fecha_hora: new Date(c.fecha_hora) } });
  }
  void providers;
  return { solicitudes: sols.length, dictamenes: dicts.length + conflicto.length };
}

if (require.main === module) {
  seed().then((r) => { console.log('Datos de prueba cargados:', r); return prisma.$disconnect(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
