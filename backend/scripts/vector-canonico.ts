// Genera el vector de prueba compartido entre backend y frontend (hash de firma de un dictamen fijo).
import { calcularHash } from '../src/services/registro-dictamen';
import { dictamenSchema } from '../src/services/dictamenes';
const p = dictamenSchema.parse({
  uuid_dictamen: 'vector-0001', fecha_firma: '2026-10-13T15:30:00.000Z', numero_sua: '48070', anio: 2026, nota_numero: 1200, expediente_numero: null,
  fecha_emision: '2026-10-13', domicilio_ejemplar: 'Av. Alberdi 2364', latitud_ejemplar: -32.95, longitud_ejemplar: -60.65, id_especie: 3,
  distancia_medianera_referencia: 1.4, cantidad_frente: 2, nivel_dano_vereda: 'Alto', es_extraccion: false, es_sin_trabajo: false,
  trabajos_aereos: ['Liberación de conductores eléctricos', 'Despeje de luminaria'].filter((x) => require('../src/catalogos').catalogos.trabajos_aereos.includes(x)),
  trabajos_trabajo: undefined,
  trabajos_subterraneos: [{ tipo_trabajo: 'Corte vertical de raíces', distancia_borde: 0.8 }],
  complejidad: 'Baja', plantar: 'Cazuela', nivel_prioridad: 'Media', observaciones: 'Ñandú: acentos y "comillas"',
  fotos: [{ contenido_base64: Buffer.from('/9j/AAAAAAAAAA==').toString('base64') }, { contenido_base64: 'QUJDREVGR0g=' }],
});
console.log(JSON.stringify({ entrada: { ...p, fotos: p.fotos.map((f) => f.contenido_base64) }, usuario: 'mrossi0', hash: calcularHash(p, 'mrossi0').hash }, null, 1));
