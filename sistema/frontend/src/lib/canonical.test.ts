import { describe, expect, it } from 'vitest';
import { calcularHashFirma, canonicalJson } from './canonical';
import vector from './vector-canonico.json';

describe('hash de firma', () => {
  it('coincide con el calculado por el servidor para el mismo dictamen (vector compartido)', async () => {
    const { fotos, ...resto } = vector.entrada as any;
    expect(await calcularHashFirma({ ...resto, nombre_usuario: vector.usuario }, fotos)).toBe(vector.hash);
  });
  it('cambia si se altera cualquier campo o foto', async () => {
    const { fotos, ...resto } = vector.entrada as any;
    const base = { ...resto, nombre_usuario: vector.usuario };
    expect(await calcularHashFirma({ ...base, observaciones: 'otra' }, fotos)).not.toBe(vector.hash);
    expect(await calcularHashFirma(base, [fotos[0], 'QUJD'])).not.toBe(vector.hash);
  });
  it('el JSON canónico ordena las claves y omite undefined', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: undefined }] })).toBe('{"a":[2,{"d":1}],"b":1}');
  });
});
