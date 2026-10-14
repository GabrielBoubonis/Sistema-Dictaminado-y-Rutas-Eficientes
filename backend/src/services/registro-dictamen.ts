import fs from 'fs';
import path from 'path';
import type { AuthenticationResponseJSON } from '@simplewebauthn/types';
import { prisma, type Tx } from '../db';
import { config } from '../config';
import { AppError, validar } from '../errors';
import { canonicalJson, sha256 } from '../security';
import { providers } from '../providers';
import { auditar } from './audit';
import { contenidoFirmado, dictamenSchema, validarReglas, type DictamenPayload } from './dictamenes';
import { liberarPorDictamen } from './rutas';
import { recalcularEstado } from './solicitudes';
import { verificarFirma } from './webauthn';

export type Origen = 'online' | 'sync';
export type SegundoFactor = AuthenticationResponseJSON | { simulado: true } | undefined;
const MAX_FOTO_BYTES = 8 * 1024 * 1024;

function extensionDeImagen(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 4 && b.readUInt32BE(0) === 0x89504e47) return 'png';
  return null;
}

/** Hash de firma recalculado en el servidor sobre lo recibido (RF-22, RF-53). */
export function calcularHash(p: DictamenPayload, usuario: string): { hash: string; fotosSha: string[] } {
  const fotosSha = p.fotos.map((f) => sha256(f.contenido_base64));
  const contenido = contenidoFirmado({ ...p, nombre_usuario: usuario, fotos_sha256: fotosSha });
  return { hash: sha256(canonicalJson(contenido)), fotosSha };
}

const dir = (...partes: string[]) => path.join(config.uploadsDir, ...partes);

export async function registrarDictamen(usuario: string, raw: unknown, segundoFactor: SegundoFactor, origen: Origen) {
  const p = validar(dictamenSchema, raw);
  validarReglas(p);
  if (!p.hash_firma) throw new AppError(422, 'datos_invalidos', 'Falta hash_firma', { detalles: [{ campo: 'hash_firma', mensaje: 'Obligatorio' }] });

  // Idempotencia por UUID (RF-33): reenviar el mismo dictamen no duplica nada.
  const previo = await prisma.dictamen.findUnique({ where: { uuid_dictamen: p.uuid_dictamen } });
  if (previo) {
    if (previo.nombre_usuario !== usuario) throw new AppError(409, 'uuid_en_uso', 'Ese identificador ya fue usado por otro usuario');
    if (previo.estado_sincronizacion === 'integridad_no_verificada') {
      throw new AppError(422, 'integridad_no_verificada', 'El dictamen fue rechazado: no se pudo verificar su integridad');
    }
    const sol = await prisma.solicitud.findUniqueOrThrow({ where: { numero_sua_anio: { numero_sua: previo.numero_sua, anio: previo.anio } } });
    return { duplicado: true, id_dictamen: previo.id_dictamen, uuid_dictamen: previo.uuid_dictamen, estado_solicitud: sol.estado, vigente: previo.vigente, hash_firma: previo.hash_firma };
  }

  const solicitud = await prisma.solicitud.findUnique({ where: { numero_sua_anio: { numero_sua: p.numero_sua, anio: p.anio } } });
  if (!solicitud) throw new AppError(404, 'solicitud_no_encontrada', 'La solicitud no existe');
  if (!(await prisma.especie.findUnique({ where: { id_especie: p.id_especie } }))) {
    throw new AppError(422, 'dictamen_invalido', 'Especie inexistente', { detalles: [{ campo: 'id_especie', mensaje: 'La especie no figura en el catálogo' }] });
  }

  // Fotografías: solo imágenes reales (JPEG/PNG) y de tamaño razonable.
  const imagenes = p.fotos.map((f, i) => {
    const buf = Buffer.from(f.contenido_base64, 'base64');
    const ext = buf.length <= MAX_FOTO_BYTES ? extensionDeImagen(buf) : null;
    if (!ext) throw new AppError(422, 'foto_invalida', `La fotografía ${i + 1} no es una imagen JPEG/PNG válida o supera 8 MB`);
    return { buf, ext };
  });

  const { hash, fotosSha } = calcularHash(p, usuario);
  p.fotos.forEach((f, i) => {
    if (f.sha256 && f.sha256 !== fotosSha[i]) throw new AppError(422, 'foto_invalida', `La fotografía ${i + 1} llegó alterada`);
  });

  // Integridad (RF-53) y segundo factor (RF-51).
  let falla: { codigo: string; mensaje: string } | null = null;
  if (hash !== p.hash_firma) falla = { codigo: 'hash_no_coincide', mensaje: 'El hash recalculado no coincide con el generado al firmar' };
  else {
    const f = await verificarFirma(usuario, p.hash_firma, segundoFactor);
    if (!f.ok) falla = { codigo: f.codigo, mensaje: f.mensaje };
  }
  if (falla && origen === 'online') {
    throw new AppError(falla.codigo === 'hash_no_coincide' ? 422 : 403, falla.codigo, falla.mensaje);
  }

  const carpeta = p.uuid_dictamen.replace(/[^a-zA-Z0-9_-]/g, '_');
  const archivos = imagenes.map((im, i) => `dictamenes/${carpeta}/${i + 1}.${im.ext}`);
  fs.mkdirSync(dir('dictamenes', carpeta), { recursive: true });
  imagenes.forEach((im, i) => fs.writeFileSync(dir(archivos[i]), im.buf));

  let idNuevo = 0;
  try {
    const resultado = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM solicitud WHERE numero_sua = ${p.numero_sua} AND anio = ${p.anio} FOR UPDATE`;
      const sol = await tx.solicitud.findUniqueOrThrow({ where: { numero_sua_anio: { numero_sua: p.numero_sua, anio: p.anio } } });
      const previos = await tx.dictamen.findMany({ where: { numero_sua: p.numero_sua, anio: p.anio } });
      const activos = previos.filter((d) => d.vigente === true && d.fecha_emision >= sol.fecha_ultima_derivacion);
      const enConflicto = previos.filter((d) => d.vigente === null);

      let vigente: boolean | null = true;
      let hayConflicto = false;
      if (falla) {
        vigente = false; // nunca cuenta para el estado de la solicitud
      } else if (activos.length || enConflicto.length) {
        // RF-21: en línea se acepta el primero y se rechaza el segundo.
        if (origen === 'online') {
          throw new AppError(409, 'solicitud_ya_dictaminada', 'La solicitud ya fue dictaminada por otro ingeniero. Actualizá el listado.');
        }
        // RF-59: dos dictámenes firmados → un Jefe elige cuál queda vigente.
        vigente = null; hayConflicto = true;
        await tx.dictamen.updateMany({ where: { id_dictamen: { in: activos.map((d) => d.id_dictamen) } }, data: { vigente: null } });
      } else {
        await tx.dictamen.updateMany({ where: { numero_sua: p.numero_sua, anio: p.anio, vigente: true }, data: { vigente: false } });
      }

      const creado = await tx.dictamen.create({
        data: {
          uuid_dictamen: p.uuid_dictamen, numero_sua: p.numero_sua, anio: p.anio, nombre_usuario: usuario,
          nota_numero: p.nota_numero ?? null, expediente_numero: p.expediente_numero ?? null,
          fecha_emision: new Date(p.fecha_emision + 'T00:00:00Z'), fecha_firma: new Date(p.fecha_firma),
          domicilio_ejemplar: p.domicilio_ejemplar ?? null, latitud_ejemplar: p.latitud_ejemplar ?? null, longitud_ejemplar: p.longitud_ejemplar ?? null,
          calle_esquina: p.calle_esquina ?? null, numero_esquina: p.numero_esquina ?? null, referencia_ubicacion: p.referencia_ubicacion ?? null,
          id_especie: p.id_especie, distancia_medianera_referencia: p.distancia_medianera_referencia ?? null, cantidad_frente: p.cantidad_frente ?? null,
          nivel_dano_vereda: p.nivel_dano_vereda ?? null, es_extraccion: p.es_extraccion, perimetro_tronco: p.perimetro_tronco ?? null,
          motivo_extraccion: p.motivo_extraccion ?? null, es_sin_trabajo: p.es_sin_trabajo, motivo_sin_trabajo: p.motivo_sin_trabajo ?? null,
          complejidad: p.complejidad, urgente: p.urgente, arbol_frente_garage: p.arbol_frente_garage, media_tension: p.media_tension,
          de_oficio: p.de_oficio, plantar: p.plantar ?? null, nivel_prioridad: p.nivel_prioridad, observaciones: p.observaciones ?? null,
          vigente, hash_firma: p.hash_firma!, firmado_sin_conexion: origen === 'sync' || p.firmado_sin_conexion,
          estado_sincronizacion: falla ? 'integridad_no_verificada' : 'pendiente_sua', sua_proximo_intento: new Date(),
          aereos: { create: p.trabajos_aereos.map((t) => ({ tipo_trabajo: t })) },
          subterraneos: { create: p.trabajos_subterraneos.map((t) => ({ tipo_trabajo: t.tipo_trabajo, distancia_borde: t.distancia_borde ?? null })) },
          fotos: { create: archivos.map((a, i) => ({ archivo_referencia: a, orden: i + 1 })) },
        },
      });
      idNuevo = creado.id_dictamen;

      if (falla) {
        await tx.casoRevision.create({
          data: { tipo: 'Integridad no verificada', referencia_solicitud: `${p.numero_sua}-${p.anio}`, id_dictamen: creado.id_dictamen, motivo: falla.mensaje },
        });
        return { creado, estado: sol.estado, hayConflicto: false };
      }
      await liberarPorDictamen(tx, p.numero_sua, p.anio); // RF-17
      const estado = await recalcularEstado(tx, p.numero_sua, p.anio);
      return { creado, estado, hayConflicto };
    });

    if (falla) throw new AppError(422, 'integridad_no_verificada', 'El dictamen fue rechazado: no se pudo verificar su integridad. Queda en revisión del Administrador.');
    const enviado = resultado.creado.vigente === true ? await intentarEnvioSua(resultado.creado.id_dictamen) : false;
    return {
      duplicado: false, id_dictamen: resultado.creado.id_dictamen, uuid_dictamen: p.uuid_dictamen, estado_solicitud: resultado.estado,
      vigente: resultado.creado.vigente, conflicto: resultado.hayConflicto, hash_firma: p.hash_firma, enviado_sua: enviado,
    };
  } catch (e) {
    if (!idNuevo) fs.rmSync(dir('dictamenes', carpeta), { recursive: true, force: true });
    if ((e as any)?.code === 'P2002') return registrarDictamen(usuario, raw, segundoFactor, origen); // carrera por UUID → devuelve el existente
    throw e;
  }
}

// ---------- Envío al SUA (RF-24, RF-25, RNF-17) ----------
export async function armarPayloadSua(idDictamen: number) {
  const d = await prisma.dictamen.findUniqueOrThrow({
    where: { id_dictamen: idDictamen },
    include: { aereos: true, subterraneos: true, fotos: { orderBy: { orden: 'asc' } }, especie: true },
  });
  // Todo lo que cargó el ingeniero (campos, fotos, autor y fecha). No se envían hash de firma ni estados internos.
  return {
    numero_sua: d.numero_sua, anio: d.anio, autor: d.nombre_usuario, fecha_emision: d.fecha_emision.toISOString().slice(0, 10),
    nota_numero: d.nota_numero, expediente_numero: d.expediente_numero,
    ubicacion: { domicilio_ejemplar: d.domicilio_ejemplar, latitud: d.latitud_ejemplar, longitud: d.longitud_ejemplar, calle_esquina: d.calle_esquina, numero_esquina: d.numero_esquina, referencia: d.referencia_ubicacion },
    especie: { nombre_comun: d.especie.nombre_comun, nombre_cientifico: d.especie.nombre_cientifico },
    distancia_medianera_referencia: d.distancia_medianera_referencia, cantidad_frente: d.cantidad_frente, nivel_dano_vereda: d.nivel_dano_vereda,
    extraccion: d.es_extraccion ? { perimetro_tronco: d.perimetro_tronco, motivo: d.motivo_extraccion } : null,
    sin_trabajo: d.es_sin_trabajo ? { motivo: d.motivo_sin_trabajo } : null,
    trabajos_aereos: d.aereos.map((t) => t.tipo_trabajo),
    trabajos_subterraneos: d.subterraneos.map((t) => ({ tipo_trabajo: t.tipo_trabajo, distancia_borde: t.distancia_borde })),
    complejidad: d.complejidad, urgente: d.urgente, arbol_frente_garage: d.arbol_frente_garage, media_tension: d.media_tension,
    de_oficio: d.de_oficio, plantar: d.plantar, nivel_prioridad: d.nivel_prioridad, observaciones: d.observaciones,
    fotografias: d.fotos.map((f) => {
      const ruta = dir(f.archivo_referencia);
      return { orden: f.orden, contenido_base64: fs.existsSync(ruta) ? fs.readFileSync(ruta).toString('base64') : null };
    }),
  };
}

/** Intenta enviar al SUA; si falla queda pendiente con espera creciente (1, 2, 4… hasta 60 min). */
export async function intentarEnvioSua(idDictamen: number): Promise<boolean> {
  const d = await prisma.dictamen.findUnique({ where: { id_dictamen: idDictamen } });
  if (!d || d.vigente !== true || d.estado_sincronizacion === 'enviado_sua') return d?.estado_sincronizacion === 'enviado_sua';
  try {
    await providers.reclamo.enviarDatosComplementarios(d.numero_sua, d.anio, await armarPayloadSua(idDictamen));
    await prisma.dictamen.update({ where: { id_dictamen: idDictamen }, data: { estado_sincronizacion: 'enviado_sua', sua_proximo_intento: null } });
    return true;
  } catch {
    const intentos = d.sua_intentos + 1;
    const espera = Math.min(2 ** (intentos - 1), 60) * 60 * 1000;
    await prisma.dictamen.update({
      where: { id_dictamen: idDictamen },
      data: { estado_sincronizacion: 'pendiente_sua', sua_intentos: intentos, sua_proximo_intento: new Date(Date.now() + espera) },
    });
    return false;
  }
}

export async function reintentarEnviosSua(ahora = new Date()): Promise<number> {
  const pend = await prisma.dictamen.findMany({
    where: { estado_sincronizacion: 'pendiente_sua', vigente: true, sua_proximo_intento: { lte: ahora } }, orderBy: { id_dictamen: 'asc' },
  });
  let ok = 0;
  for (const d of pend) if (await intentarEnvioSua(d.id_dictamen)) ok++;
  return ok;
}

// ---------- Elección del dictamen vigente (RF-59) ----------
export async function elegirVigente(idDictamen: number, jefe: string) {
  const d = await prisma.dictamen.findUnique({ where: { id_dictamen: idDictamen } });
  if (!d) throw new AppError(404, 'dictamen_no_encontrado');
  if (d.vigente !== null) throw new AppError(409, 'sin_conflicto', 'Este dictamen no está pendiente de elección');
  const estado = await prisma.$transaction(async (tx: Tx) => {
    await tx.dictamen.update({ where: { id_dictamen: idDictamen }, data: { vigente: true } });
    await tx.dictamen.updateMany({ where: { numero_sua: d.numero_sua, anio: d.anio, vigente: null }, data: { vigente: false } });
    await auditar(tx, jefe, 'Elección de dictamen vigente', `solicitud ${d.numero_sua}-${d.anio}`, null, `dictamen ${idDictamen}`);
    return recalcularEstado(tx, d.numero_sua, d.anio);
  });
  await intentarEnvioSua(idDictamen);
  return { estado_solicitud: estado };
}
