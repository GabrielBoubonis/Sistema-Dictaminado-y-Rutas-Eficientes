import Dexie, { type Table } from 'dexie';

export interface ItemCola {
  uuid: string; usuario: string; numero_sua: string; anio: number; creada: number;
  iv: Uint8Array; datos: ArrayBuffer; // dictamen + fotos + aserción WebAuthn, cifrados con AES-GCM (RNF-16)
}
export interface Rechazado { uuid: string; usuario: string; numero_sua: string; anio: number; motivo: string; fecha: number }
export interface Borrador { clave: string; datos: unknown; actualizado: number } // sin fotos grandes: solo campos
export interface SesionLocal {
  usuario: string; nombre_completo: string; rol: string; salt: Uint8Array; verificador: ArrayBuffer;
  ultimoLoginOnline: number; inicioCadena: number;
}

class BaseLocal extends Dexie {
  cola!: Table<ItemCola, string>;
  rechazados!: Table<Rechazado, string>;
  borradores!: Table<Borrador, string>;
  cache!: Table<{ clave: string; valor: unknown }, string>;
  sesiones!: Table<SesionLocal, string>;
  claves!: Table<{ id: string; key: CryptoKey }, string>;

  constructor() {
    super('dictaminado');
    this.version(1).stores({
      cola: 'uuid, usuario, creada', rechazados: 'uuid, usuario', borradores: 'clave', cache: 'clave', sesiones: 'usuario', claves: 'id',
    });
  }
}
export const db = new BaseLocal();

export async function cacheGet<T>(clave: string): Promise<T | undefined> { return (await db.cache.get(clave))?.valor as T | undefined; }
export const cacheSet = (clave: string, valor: unknown) => db.cache.put({ clave, valor });

/** RF-52: al revocarse el captor se borran los datos locales (cola, borradores, caché y sesiones). */
export async function borrarDatosLocales() {
  await Promise.all([db.cola.clear(), db.rechazados.clear(), db.borradores.clear(), db.cache.clear(), db.sesiones.clear()]);
}
