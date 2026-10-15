import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { prisma } from '../db';
import { config } from '../config';
import { AppError } from '../errors';

const si = (b: boolean) => (b ? 'Sí' : 'No');
const v = (x: unknown) => (x === null || x === undefined || x === '' ? '—' : String(x));

/** RF-26: dictamen firmado en PDF imprimible (documento legal, Ordenanza N.° 5.118/91). */
export async function generarPdf(idDictamen: number): Promise<PDFKit.PDFDocument> {
  const d = await prisma.dictamen.findUnique({
    where: { id_dictamen: idDictamen },
    include: { aereos: true, subterraneos: true, fotos: { orderBy: { orden: 'asc' } }, especie: true, solicitud: true },
  });
  if (!d) throw new AppError(404, 'dictamen_no_encontrado');
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Dictamen técnico de arbolado ${d.numero_sua}-${d.anio}`, Author: d.nombre_usuario } });

  doc.fontSize(9).fillColor('#555').text('Municipalidad de Rosario — Dirección General de Parques y Paseos', { align: 'center' });
  doc.moveDown(0.3).fontSize(16).fillColor('#000').text('DICTAMEN TÉCNICO DE ARBOLADO', { align: 'center' });
  doc.moveDown(0.3).fontSize(10).text(`Solicitud SUA N.° ${d.numero_sua}-${d.anio}`, { align: 'center' });
  if (d.vigente !== true) {
    doc.moveDown(0.3).fillColor('#b00020').fontSize(10)
      .text(d.vigente === null ? 'PENDIENTE DE ELECCIÓN (conflicto entre dictámenes)' : d.estado_sincronizacion === 'integridad_no_verificada' ? 'INTEGRIDAD NO VERIFICADA' : 'NO VIGENTE (reemplazado)', { align: 'center' })
      .fillColor('#000');
  }
  doc.moveDown();

  const fila = (k: string, val: unknown) => { doc.font('Helvetica-Bold').fontSize(10).text(`${k}: `, { continued: true }).font('Helvetica').text(v(val)); };
  const titulo = (t: string) => { doc.moveDown(0.6).font('Helvetica-Bold').fontSize(11).fillColor('#1a4d2e').text(t.toUpperCase()).fillColor('#000'); doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#bbb').stroke(); doc.moveDown(0.3); };

  titulo('Datos del caso');
  fila('Fecha de emisión', d.fecha_emision.toISOString().slice(0, 10));
  fila('Nota N.°', d.nota_numero); fila('Expediente N.°', d.expediente_numero);
  fila('Domicilio del reclamo', d.solicitud.direccion); fila('Distrito', d.solicitud.distrito);
  titulo('Ejemplar');
  fila('Domicilio del ejemplar', d.domicilio_ejemplar);
  fila('Referencia', d.referencia_ubicacion);
  if (d.latitud_ejemplar !== null) fila('Coordenadas', `${d.latitud_ejemplar?.toFixed(6)}, ${d.longitud_ejemplar?.toFixed(6)}`);
  fila('Especie', `${d.especie.nombre_comun}${d.especie.nombre_cientifico ? ` (${d.especie.nombre_cientifico})` : ''}`);
  fila('Distancia a medianera / referencia (m)', d.distancia_medianera_referencia);
  fila('Cantidad de ejemplares al frente', d.cantidad_frente);
  fila('Daño en vereda', d.nivel_dano_vereda);
  titulo('Intervención');
  if (d.es_extraccion) { fila('Extracción', `Sí — ${v(d.motivo_extraccion)}`); fila('Perímetro del tronco (m)', d.perimetro_tronco); }
  else if (d.es_sin_trabajo) fila('Sin trabajo', d.motivo_sin_trabajo);
  else {
    fila('Trabajos aéreos', d.aereos.map((t) => t.tipo_trabajo).join('; ') || 'Ninguno');
    fila('Trabajos subterráneos', d.subterraneos.map((t) => t.tipo_trabajo + (t.distancia_borde ? ` (${t.distancia_borde} m)` : '')).join('; ') || 'Ninguno');
  }
  fila('Complejidad', d.complejidad); fila('Nivel de prioridad', d.nivel_prioridad);
  fila('Urgente', si(d.urgente)); fila('Árbol frente a garage', si(d.arbol_frente_garage)); fila('Media tensión', si(d.media_tension)); fila('De oficio', si(d.de_oficio));
  fila('Plantar', d.plantar);
  titulo('Observaciones'); doc.font('Helvetica').fontSize(10).text(v(d.observaciones));

  if (d.fotos.length) {
    doc.addPage(); titulo('Fotografías del ejemplar');
    for (const f of d.fotos) {
      const ruta = path.join(config.uploadsDir, f.archivo_referencia);
      if (!fs.existsSync(ruta)) continue;
      if (doc.y > 560) doc.addPage();
      try { doc.image(ruta, { fit: [380, 250] }); } catch { doc.text('(imagen no disponible)'); }
      doc.moveDown(0.5);
    }
  }
  doc.addPage(); titulo('Firma digital');
  fila('Firmado por', d.nombre_usuario);
  fila('Fecha y hora de firma', d.fecha_firma.toISOString());
  fila('Firmado sin conexión', si(d.firmado_sin_conexion));
  doc.font('Helvetica-Bold').text('Hash SHA-256: ', { continued: true }).font('Courier').fontSize(8).text(d.hash_firma);
  doc.font('Helvetica').fontSize(8).fillColor('#555').moveDown().text('La firma se verificó con un segundo factor biométrico del dispositivo (WebAuthn). El hash se calcula sobre el contenido completo del dictamen, el autor, la fecha de firma y el SHA-256 de cada fotografía.');
  doc.end();
  return doc;
}
