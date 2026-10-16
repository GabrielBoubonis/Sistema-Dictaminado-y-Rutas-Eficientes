import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorRed, TIEMPO_LIMITE_MS, api } from './api';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

/** fetch que nunca responde, salvo que lo corten (como un servidor colgado con señal intermitente). */
const fetchColgado = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_res, rej) => {
  init?.signal?.addEventListener('abort', () => rej(new DOMException('Cortado', 'AbortError')));
}));

describe('tiempo límite de 10 s por pedido (RNF-04)', () => {
  it('corta a los 10 s y lo trata como falta de conexión', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetchColgado);
    const pedido = api('/solicitudes');
    const resultado = expect(pedido).rejects.toBeInstanceOf(ErrorRed);
    await vi.advanceTimersByTimeAsync(TIEMPO_LIMITE_MS - 1);
    expect(fetchColgado.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await resultado;
    expect(TIEMPO_LIMITE_MS).toBe(10_000);
  });

  it('una respuesta a tiempo no se corta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    expect(await api('/health')).toEqual({ ok: true });
  });
});
