/** Reduce la foto (lado mayor 1600 px, JPEG) para que entre cómoda en la cola offline y en el envío; devuelve base64 sin prefijo. */
export async function comprimirFoto(archivo: File, ladoMax = 1600, calidad = 0.8): Promise<string> {
  const bmp = await createImageBitmap(archivo);
  const k = Math.min(1, ladoMax / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo procesar la foto'))), 'image/jpeg', calidad));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
