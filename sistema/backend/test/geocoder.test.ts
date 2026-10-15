import http from 'http';
import { NominatimGeocoder, GeorefGeocoder, separarDireccion } from '../src/providers';

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

  it('devuelve las coordenadas reales con consulta estructurada limitada a Rosario y se identifica con User-Agent', async () => {
    const g = new NominatimGeocoder();
    expect(await g.geocodificar('Entre Ríos 1030, Rosario, Santa Fe')).toEqual({ lat: -32.9301, lng: -60.6702 });
    const url = decodeURIComponent(pedidos[0].url);
    expect(url).toContain('street=1030 Entre Ríos');
    expect(url).toContain('city=Rosario');
    expect(url).toContain('bounded=1');
    expect(pedidos[0].ua).toMatch(/arbolado-rosario/);
  });
  it('separa calle y número y expande abreviaturas', () => {
    expect(separarDireccion('Av. Alberdi 2364, Rosario, Santa Fe')).toEqual({ calle: 'Avenida Alberdi', numero: '2364' });
    expect(separarDireccion('Bv. 27 de Febrero 1637')).toEqual({ calle: 'Bulevar 27 de Febrero', numero: '1637' });
    expect(separarDireccion('Pasaje sin nombre s/n, Rosario')).toEqual({ calle: 'Pasaje sin nombre', numero: null });
  });
  it('respeta 1 pedido por segundo, null si no existe y error si el servicio cae', async () => {
    const g = new NominatimGeocoder();
    pedidos.length = 0;
    await Promise.all([g.geocodificar('A 1'), g.geocodificar('B 2'), g.geocodificar('Inexistente 3')]);
    expect(pedidos[1].t - pedidos[0].t).toBeGreaterThanOrEqual(1000);
    expect(pedidos[2].t - pedidos[1].t).toBeGreaterThanOrEqual(1000);
    pedidos.length = 0;
    expect(await g.geocodificar('Inexistente 9')).toBeNull();
    expect(pedidos).toHaveLength(2); // estructurada y, si no hay resultado, texto libre
    expect(pedidos[1].t - pedidos[0].t).toBeGreaterThanOrEqual(1000);
    await expect(g.geocodificar('Caido 1')).rejects.toThrow(/Nominatim 503/);
  });
});

describe('Geocodificador Georef (altura exacta, datos del INDEC)', () => {
  let srv: http.Server; const pedidos: string[] = [];
  const respaldo = { pedidas: [] as string[], async geocodificar(d: string) { this.pedidas.push(d); return { lat: 1, lng: 1 }; } };
  beforeAll(async () => {
    srv = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url ?? ''); pedidos.push(url);
      res.setHeader('Content-Type', 'application/json');
      // Como el Georef real: "GENOVA" está registrada sin el tipo de calle.
      const hay = /direccion=(Entre Ríos 1030|Génova 2100)&/.test(url);
      res.end(JSON.stringify({ direcciones: hay ? [{ ubicacion: { lat: -32.9489, lon: -60.6417 } }] : [] }));
    });
    await new Promise<void>((r) => srv.listen(0, r));
    process.env.GEOREF_URL = `http://localhost:${(srv.address() as any).port}`;
  });
  afterAll(async () => { delete process.env.GEOREF_URL; await new Promise((r) => srv.close(r)); });
  beforeEach(() => { pedidos.length = 0; respaldo.pedidas.length = 0; });

  it('ubica por altura dentro de la localidad de Rosario', async () => {
    const g = new GeorefGeocoder(respaldo);
    expect(await g.geocodificar('Entre Ríos 1030, Rosario, Santa Fe')).toEqual({ lat: -32.9489, lng: -60.6417 });
    expect(pedidos[0]).toContain('localidad_censal=Rosario');
    expect(respaldo.pedidas).toHaveLength(0);
  });
  it('si no encuentra con el tipo de calle, prueba sin él', async () => {
    expect(await new GeorefGeocoder(respaldo).geocodificar('Av. Génova 2100')).toEqual({ lat: -32.9489, lng: -60.6417 });
    expect(pedidos).toHaveLength(2);
  });
  it('sin altura o sin resultado usa el respaldo (Nominatim)', async () => {
    const g = new GeorefGeocoder(respaldo);
    await g.geocodificar('Pasaje sin nombre s/n, Rosario');
    expect(pedidos).toHaveLength(0);
    await g.geocodificar('Inexistente 123');
    expect(respaldo.pedidas).toEqual(['Pasaje sin nombre s/n, Rosario', 'Inexistente 123']);
  });
});
