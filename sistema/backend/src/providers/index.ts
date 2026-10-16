import { prisma } from '../db';
import { config } from '../config';

// ---------- Autenticación Institucional (IAuthProvider) ----------
export class ProveedorNoDisponible extends Error {
  constructor(msg = 'servicio no disponible') { super(msg); }
}

export interface IAuthProvider {
  /** true si el usuario sigue vigente en la institución. Lanza ProveedorNoDisponible si el servicio no responde. */
  estaVigente(nombreUsuario: string): Promise<boolean>;
}

/** Mock: consulta la tabla usuarios_institucionales. `caido` simula la caída del servicio (CU-01, E1). */
export class MockAuthProvider implements IAuthProvider {
  caido = process.env.SIMULAR_CAIDA_AUTH === '1';
  async estaVigente(nombreUsuario: string): Promise<boolean> {
    if (this.caido) throw new ProveedorNoDisponible('Autenticación Institucional no responde');
    const u = await prisma.usuarioInstitucional.findUnique({ where: { nombre_usuario: nombreUsuario } });
    return !!u && u.vigente;
  }
}

// ---------- SUA (IReclamoProvider) ----------
export interface SolicitudSuaDto {
  numero_sua: string; anio: number; distrito: string; prioridad: string; direccion: string;
  descripcion_reclamo: string; es_tormenta: boolean; es_rederivacion: boolean; fecha_derivacion: Date;
}

export interface IReclamoProvider {
  listarDerivadas(): Promise<SolicitudSuaDto[]>;
  /** Envía los datos complementarios del dictamen (RF-24). Lanza si el SUA no los acepta. */
  enviarDatosComplementarios(numeroSua: string, anio: number, payload: unknown): Promise<void>;
}

export class MockReclamoProvider implements IReclamoProvider {
  caido = process.env.SIMULAR_CAIDA_SUA === '1';
  async listarDerivadas() {
    if (this.caido) throw new ProveedorNoDisponible('SUA no responde');
    return prisma.solicitudSua.findMany({
      where: { tipo: 'reclamo', subtipo: 'problema con el arbolado público', area_derivada: 'Parques y Paseos - Dirección Técnica' },
    });
  }
  async enviarDatosComplementarios(numeroSua: string, anio: number, payload: unknown) {
    if (this.caido) throw new ProveedorNoDisponible('SUA no responde');
    await prisma.suaDatosComplementarios.upsert({
      where: { numero_sua_anio: { numero_sua: numeroSua, anio } },
      create: { numero_sua: numeroSua, anio, payload: payload as object },
      update: { payload: payload as object, recibido_en: new Date() },
    });
  }
}

// ---------- Geocodificación y matriz de distancias (OpenRouteService o simulador) ----------
export type Modo = 'Caminando' | 'Vehículo';
export interface Coord { lat: number; lng: number }
export interface MatrizResultado { distancias: number[][]; duraciones: number[][] }

export interface IGeocoder { geocodificar(direccion: string): Promise<Coord | null> }
export interface IMatriz { matriz(puntos: Coord[], modo: Modo): Promise<MatrizResultado> }

const R = 6371000;
export function haversine(a: Coord, b: Coord): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function hashNum(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

/** Simulador: coordenadas deterministas alrededor de Rosario. Falla con direcciones "sin nombre" (para probar RF-62). */
export class MockGeocoder implements IGeocoder {
  falla = false;
  async geocodificar(direccion: string): Promise<Coord | null> {
    if (this.falla || /sin nombre/i.test(direccion)) return null;
    const m = direccion.match(/^(.*?)(\d+)/);
    const calle = (m ? m[1] : direccion).trim().toLowerCase();
    const num = m ? Number(m[2]) : 0;
    return {
      lat: -32.9468 + (hashNum(calle + 'a') - 0.5) * 0.09 + (num % 1000) * 0.000004,
      lng: -60.6393 + (hashNum(calle + 'b') - 0.5) * 0.09 + (num % 1000) * 0.000004,
    };
  }
}

export class MockMatriz implements IMatriz {
  caido = false;
  async matriz(puntos: Coord[], modo: Modo): Promise<MatrizResultado> {
    if (this.caido) throw new ProveedorNoDisponible('OpenRouteService no responde');
    const v = modo === 'Caminando' ? 1.3 : 6.9; // m/s
    const d = puntos.map((a) => puntos.map((b) => haversine(a, b) * 1.3));
    return { distancias: d, duraciones: d.map((f) => f.map((x) => x / v)) };
  }
}

/** OpenRouteService real (requiere ORS_API_KEY). Free tier ≈ 2000 requests/día. */
export class OrsGeocoder implements IGeocoder {
  async geocodificar(direccion: string): Promise<Coord | null> {
    const sede = config.sede;
    const url = `https://api.openrouteservice.org/geocode/search?api_key=${encodeURIComponent(config.orsKey)}` +
      `&text=${encodeURIComponent(direccion)}&boundary.country=AR&focus.point.lat=${sede.lat}&focus.point.lon=${sede.lng}&size=1`;
    const r = await fetch(url);
    if (!r.ok) throw new ProveedorNoDisponible(`ORS geocode ${r.status}`);
    const j: any = await r.json();
    const f = j.features?.[0];
    if (!f) return null;
    return { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
  }
}

/**
 * Nominatim (OpenStreetMap): gratis y sin clave. Política de uso: máximo 1 pedido por segundo y User-Agent
 * identificable; por eso se serializan los pedidos con una espera mínima de 1,1 s entre uno y otro.
 */
export class NominatimGeocoder implements IGeocoder {
  private ultimo = 0;
  private cola: Promise<unknown> = Promise.resolve();
  async geocodificar(direccion: string): Promise<Coord | null> {
    const { calle, numero } = separarDireccion(direccion);
    const sede = config.sede;
    // Solo dentro de Rosario (bounded=1): en texto libre "Entre Ríos 1030" o "Santa Fe 1957" caían en otra provincia.
    const zona = `&countrycodes=ar&bounded=1&viewbox=${sede.lng - 0.15},${sede.lat + 0.15},${sede.lng + 0.15},${sede.lat - 0.15}`;
    const estructurada = `street=${encodeURIComponent(numero ? `${numero} ${calle}` : calle)}&city=Rosario&state=${encodeURIComponent('Santa Fe')}`;
    const libre = `q=${encodeURIComponent(`${numero ? `${calle} ${numero}` : calle}, Rosario`)}`;
    return (await this.buscar(estructurada + zona)) ?? (await this.buscar(libre + zona));
  }
  /** Un pedido a Nominatim, respetando 1 por segundo (política de uso de OpenStreetMap). */
  private buscar(parametros: string): Promise<Coord | null> {
    const tarea = this.cola.then(async () => {
      const espera = this.ultimo + 1100 - Date.now();
      if (espera > 0) await new Promise((r) => setTimeout(r, espera));
      try {
        const r = await fetch(`${config.nominatimUrl}/search?format=jsonv2&limit=1&${parametros}`,
          { headers: { 'User-Agent': `arbolado-rosario/1.0 (${config.nominatimContacto})`, 'Accept-Language': 'es' } });
        if (!r.ok) throw new ProveedorNoDisponible(`Nominatim ${r.status}`);
        const j: any = await r.json();
        if (!Array.isArray(j) || !j[0]) return null;
        return { lat: Number(j[0].lat), lng: Number(j[0].lon) };
      } finally { this.ultimo = Date.now(); }
    });
    this.cola = tarea.catch(() => undefined);
    return tarea;
  }
}

/**
 * Georef (API del Estado nacional, datos de calles del INDEC con rangos de altura): ubica por altura interpolando
 * la cuadra, que es lo que falta en OpenStreetMap para muchas avenidas de Rosario. Sin altura (s/n) o sin resultado
 * se usa el geocodificador de respaldo (Nominatim).
 */
export class GeorefGeocoder implements IGeocoder {
  constructor(private respaldo: IGeocoder = new NominatimGeocoder()) {}
  async geocodificar(direccion: string): Promise<Coord | null> {
    const { calle, numero } = separarDireccion(direccion);
    if (numero) {
      // Georef no siempre registra el tipo de calle ("GENOVA", no "AV GENOVA"): si no encuentra, se prueba sin él.
      const sinTipo = calle.replace(/^(Avenida|Bulevar|Pasaje)\s+/i, '');
      for (const nombre of sinTipo === calle ? [calle] : [calle, sinTipo]) {
        const c = await this.buscar(`${nombre} ${numero}`);
        if (c) return c;
      }
    }
    return this.respaldo.geocodificar(direccion);
  }
  private async buscar(direccion: string): Promise<Coord | null> {
    const url = `${config.georefUrl}/direcciones?direccion=${encodeURIComponent(direccion)}` +
      `&localidad_censal=Rosario&provincia=${encodeURIComponent('Santa Fe')}&max=1`;
    let r: Response;
    try { r = await fetch(url, { headers: { 'User-Agent': `arbolado-rosario/1.0 (${config.nominatimContacto})` } }); }
    catch { return null; } // Georef caído: decide el respaldo
    if (!r.ok) return null;
    const u = ((await r.json()) as any).direcciones?.[0]?.ubicacion;
    return u && u.lat != null && u.lon != null ? { lat: Number(u.lat), lng: Number(u.lon) } : null;
  }
}

const ABREVIATURAS: [RegExp, string][] = [
  [/^(av|avda)\.?\s+/i, 'Avenida '], [/^(bv|bvar|blvd)\.?\s+/i, 'Bulevar '], [/^(pje|psje)\.?\s+/i, 'Pasaje '],
];
/** "Av. Alberdi 2364, Rosario, Santa Fe" → { calle: "Avenida Alberdi", numero: "2364" }. Sin número (s/n) → numero null. */
export function separarDireccion(direccion: string): { calle: string; numero: string | null } {
  let primera = direccion.split(',')[0].trim();
  for (const [re, txt] of ABREVIATURAS) primera = primera.replace(re, txt);
  const m = primera.match(/^(.*?)\s+(\d+)\s*$/);
  if (m) return { calle: m[1], numero: m[2] };
  return { calle: primera.replace(/\s+s\/n\s*$/i, ''), numero: null };
}

export class OrsMatriz implements IMatriz {
  async matriz(puntos: Coord[], modo: Modo): Promise<MatrizResultado> {
    const perfil = modo === 'Caminando' ? 'foot-walking' : 'driving-car';
    const r = await fetch(`https://api.openrouteservice.org/v2/matrix/${perfil}`, {
      method: 'POST',
      headers: { Authorization: config.orsKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations: puntos.map((p) => [p.lng, p.lat]), metrics: ['distance', 'duration'] }),
      // Generar la ruta tiene que responder antes de los 10 s del cliente (RNF-04): si ORS tarda, se ordena por antigüedad.
      signal: AbortSignal.timeout(6000),
    }).catch((e) => { throw new ProveedorNoDisponible(`ORS matrix sin respuesta (${(e as Error).name})`); });
    if (!r.ok) throw new ProveedorNoDisponible(`ORS matrix ${r.status}`);
    const j: any = await r.json();
    return { distancias: j.distances, duraciones: j.durations };
  }
}

// ---------- Registro de proveedores (reemplazables, p. ej. en los tests) ----------
export const providers: {
  auth: IAuthProvider; reclamo: IReclamoProvider; geocoder: IGeocoder; matriz: IMatriz;
} = {
  auth: new MockAuthProvider(),
  reclamo: new MockReclamoProvider(),
  geocoder: config.geocoder === 'ors' && config.orsKey ? new OrsGeocoder() : config.geocoder === 'mock' ? new MockGeocoder()
    : config.geocoder === 'nominatim' ? new NominatimGeocoder() : new GeorefGeocoder(),
  matriz: config.orsKey ? new OrsMatriz() : new MockMatriz(),
};
