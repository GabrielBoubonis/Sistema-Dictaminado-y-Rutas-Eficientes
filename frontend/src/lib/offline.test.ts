import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cifrar, descifrar } from './cifrado';
import { db } from './db';
import { guardarSesionLocal, reanudarSinConexion, codigoDispositivo, mismoDia } from './local-auth';
import { validarPaso, vacioFormulario, CORTE_VERTICAL } from './reglas';
import { puntoEnPoligono } from './geo';

afterEach(() => vi.useRealTimers());
beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });

describe('cola cifrada (RNF-16)', () => {
  it('lo guardado no es legible y se recupera con la clave del captor', async () => {
    const original = { dictamen: { observaciones: 'Árbol con riesgo de caída', fotos: [{ contenido_base64: 'AAAA' }] }, segundo_factor: { id: 'x' } };
    const c = await cifrar(original);
    expect(new TextDecoder().decode(c.datos)).not.toContain('riesgo');
    expect(await descifrar(c)).toEqual(original);
    const alterado = new Uint8Array(c.datos.slice(0)); alterado[3] ^= 1;
    await expect(descifrar({ iv: c.iv, datos: alterado.buffer })).rejects.toBeTruthy();
  });
});

describe('reanudar sin señal (RF-57)', () => {
  it('acepta la contraseña local el mismo día y rechaza otra contraseña', async () => {
    await guardarSesionLocal('mrossi0', 'Martín Rossi', 'Operador', 'Demo2026!');
    expect((await reanudarSinConexion('mrossi0', 'Demo2026!')).ok).toBe(true);
    expect(await reanudarSinConexion('mrossi0', 'Otra2026!')).toEqual({ ok: false, motivo: 'password' });
    expect(await reanudarSinConexion('nadie', 'Demo2026!')).toEqual({ ok: false, motivo: 'sin_sesion' });
  });
  it('no deja reanudar al día siguiente ni pasados 7 días', async () => {
    await guardarSesionLocal('mrossi0', 'Martín Rossi', 'Operador', 'Demo2026!');
    const s = (await db.sesiones.get('mrossi0'))!;
    const manana = s.ultimoLoginOnline + 26 * 3600 * 1000;
    expect(mismoDia(s.ultimoLoginOnline, manana)).toBe(false);
    expect(await reanudarSinConexion('mrossi0', 'Demo2026!', manana)).toEqual({ ok: false, motivo: 'otro_dia' });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() - 8 * 24 * 3600 * 1000);
    await guardarSesionLocal('lfernan0', 'Lucía Fernández', 'Operador', 'Demo2026!'); // primer ingreso hace 8 días
    vi.useRealTimers();
    expect(await reanudarSinConexion('lfernan0', 'Demo2026!')).toEqual({ ok: false, motivo: 'tope_7_dias' });
  });
  it('el código del captor tiene el formato esperado y es estable', async () => {
    const a = await codigoDispositivo('6f2b1c7e-93aa-4d1b-8f10-2a7c9e4d5b11');
    expect(a).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(await codigoDispositivo('6f2b1c7e-93aa-4d1b-8f10-2a7c9e4d5b11')).toBe(a);
  });
});

describe('reglas del formulario (RF-45, RF-46, RF-56, RF-61)', () => {
  const base = () => ({ ...vacioFormulario('2026-10-13'), latitud_ejemplar: -32.9, longitud_ejemplar: -60.6, id_especie: 1 });
  it('paso 1 exige ubicación y especie; números enteros', () => {
    expect(validarPaso(1, vacioFormulario('2026-10-13')).length).toBe(2);
    expect(validarPaso(1, { ...base(), nota_numero: '12.5' })).toHaveLength(1);
    expect(validarPaso(1, { ...base(), nota_numero: '1200' })).toHaveLength(0);
  });
  it('paso 3 exige alguna intervención o sin trabajo / extracción, y la distancia del corte vertical', () => {
    expect(validarPaso(3, base()).length).toBe(1);
    expect(validarPaso(3, { ...base(), es_sin_trabajo: true })).toHaveLength(0);
    expect(validarPaso(3, { ...base(), es_extraccion: true })).toHaveLength(0);
    expect(validarPaso(3, { ...base(), trabajos_subterraneos: [{ tipo_trabajo: CORTE_VERTICAL, distancia_borde: '' }] })).toHaveLength(1);
    expect(validarPaso(3, { ...base(), trabajos_subterraneos: [{ tipo_trabajo: CORTE_VERTICAL, distancia_borde: '0,8' }] })).toHaveLength(0);
  });
  it('paso 4 exige complejidad y al menos una foto (RF-45)', () => {
    expect(validarPaso(4, base())).toHaveLength(2);
    expect(validarPaso(4, { ...base(), complejidad: 'Baja', fotos: ['AAAA'] })).toHaveLength(0);
  });
});

describe('geometría', () => {
  it('punto en polígono', () => {
    const z: Array<[number, number]> = [[0, 0], [0, 10], [10, 10], [10, 0]];
    expect(puntoEnPoligono({ lat: 5, lng: 5 }, z)).toBe(true);
    expect(puntoEnPoligono({ lat: 11, lng: 5 }, z)).toBe(false);
  });
});
