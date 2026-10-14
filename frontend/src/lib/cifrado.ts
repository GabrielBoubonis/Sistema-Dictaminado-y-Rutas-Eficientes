import { db, type ItemCola } from './db';

/**
 * RNF-16: la cola offline se guarda cifrada con AES-GCM. La clave es no exportable y vive en IndexedDB del navegador;
 * protege contra la lectura casual de los datos y contra volcados del almacenamiento, pero no reemplaza el
 * cifrado de disco ni el bloqueo de pantalla del captor (RNF-22).
 */
async function obtenerClave(): Promise<CryptoKey> {
  const existente = await db.claves.get('cola');
  if (existente) return existente.key;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await db.claves.put({ id: 'cola', key });
  return key;
}

export async function cifrar(valor: unknown): Promise<{ iv: Uint8Array; datos: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const datos = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, await obtenerClave(), new TextEncoder().encode(JSON.stringify(valor)));
  return { iv, datos };
}

export async function descifrar<T>(item: Pick<ItemCola, 'iv' | 'datos'>): Promise<T> {
  const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: item.iv as BufferSource }, await obtenerClave(), item.datos);
  return JSON.parse(new TextDecoder().decode(claro)) as T;
}
