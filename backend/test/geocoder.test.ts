import http from 'http';
import { NominatimGeocoder } from '../src/providers';

describe('Geocodificador Nominatim (OpenStreetMap)', () => {
  let srv: http.Server; const pedidos: { url: string; ua: string; t: number }[] = [];
  beforeAll(async () => {
    srv = http.createServer((req, res) => {
      pedidos.push({ url: req.url ?? '', ua: String(req.headers['user-agent']), t: Date.now() });
      res.setHeader('Content-Type', 'application/json');
      if ((req.url ?? '').includes('Inexistente')) return void res.end('[]');
      if ((req.url ?? '').includes('Caido')) { res.statusCode = 503; return void res.end('x'); }
      res.end(JSON.stringify([{ lat: '-32.9301', lon: '-60.6702' }]));
    });
    await new Promise<void>((r) => srv.listen(0, r));
    process.env.NOMINATIM_URL = `http://localhost:${(srv.address() as any).port}`;
  });
  afterAll(async () => { delete process.env.NOMINATIM_URL; await new Promise((r) => srv.close(r)); });

  it('devuelve las coordenadas reales, agrega la ciudad y se identifica con User-Agent', async () => {
    const g = new NominatimGeocoder();
    expect(await g.geocodificar('Av. Alberdi 2364')).toEqual({ lat: -32.9301, lng: -60.6702 });
    expect(decodeURIComponent(pedidos[0].url)).toContain('Av. Alberdi 2364, Rosario, Santa Fe');
    expect(pedidos[0].ua).toMatch(/arbolado-rosario/);
  });
  it('respeta 1 pedido por segundo, null si no existe y error si el servicio cae', async () => {
    const g = new NominatimGeocoder();
    pedidos.length = 0;
    await Promise.all([g.geocodificar('A 1'), g.geocodificar('B 2'), g.geocodificar('Inexistente 3')]);
    expect(pedidos[1].t - pedidos[0].t).toBeGreaterThanOrEqual(1000);
    expect(pedidos[2].t - pedidos[1].t).toBeGreaterThanOrEqual(1000);
    expect(await g.geocodificar('Inexistente 9')).toBeNull();
    await expect(g.geocodificar('Caido 1')).rejects.toThrow(/Nominatim 503/);
  });
});
