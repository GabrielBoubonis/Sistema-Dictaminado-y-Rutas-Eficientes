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
    const tarea = this.cola.then(async () => {
      const espera = this.ultimo + 1100 - Date.now();
      if (espera > 0) await new Promise((r) => setTimeout(r, espera));
      try { return await this.consultar(direccion); } finally { this.ultimo = Date.now(); }
    });
    this.cola = tarea.catch(() => undefined);
    return tarea;
  }
  private async consultar(direccion: string): Promise<Coord | null> {
    const sede = config.sede;
    const q = /rosario/i.test(direccion) ? direccion : `${direccion}, Rosario, Santa Fe`;
    // viewbox ≈ ±0,25° alrededor de la sede, bounded=0: prioriza la zona sin excluir el resto.
    const url = `${config.nominatimUrl}/search?format=jsonv2&limit=1&countrycodes=ar&q=${encodeURIComponent(q)}` +
      `&viewbox=${sede.lng - 0.25},${sede.lat + 0.25},${sede.lng + 0.25},${sede.lat - 0.25}`;
    const r = await fetch(url, { headers: { 'User-Agent': `arbolado-rosario/1.0 (${config.nominatimContacto})`, 'Accept-Language': 'es' } });
    if (!r.ok) throw new ProveedorNoDisponible(`Nominatim ${r.status}`);
    const j: any = await r.json();
    if (!Array.isArray(j) || !j[0]) return null;
    return { lat: Number(j[0].lat), lng: Number(j[0].lon) };
  }
}

export class OrsMatriz implements IMatriz {
  async matriz(puntos: Coord[], modo: Modo): Promise<MatrizResultado> {
    const perfil = modo === 'Caminando' ? 'foot-walking' : 'driving-car';
    const r = await fetch(`https://api.openrouteservice.org/v2/matrix/${perfil}`, {
      method: 'POST',
      headers: { Authorization: config.orsKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations: puntos.map((p) => [p.lng, p.lat]), metrics: ['distance', 'duration'] }),
    });
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
  geocoder: config.geocoder === 'ors' && config.orsKey ? new OrsGeocoder() : config.geocoder === 'mock' ? new MockGeocoder() : new NominatimGeocoder(),
  matriz: config.orsKey ? new OrsMatriz() : new MockMatriz(),
};
