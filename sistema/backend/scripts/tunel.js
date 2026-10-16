// Expone el servidor local por HTTPS con un túnel gratuito de Cloudflare (sin cuenta) para probar en un celular real.
// Uso: con el servidor andando (npm run dev, PWA compilada), en otra terminal: npm run tunel
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const dns = require('dns');
const { spawn, spawnSync } = require('child_process');
const qrcode = require('qrcode-terminal');

const PUERTO = process.env.PORT || 3000;
const LOCAL = `http://localhost:${PUERTO}`;
const API_TUNEL = 'api.trycloudflare.com';

/** IPv4 de un nombre según el DNS público de Cloudflare, consultado por HTTPS (no depende del DNS del router). */
async function resolverPorHttps(nombre) {
  const r = await fetch(`https://1.1.1.1/dns-query?name=${nombre}&type=A`, { headers: { accept: 'application/dns-json' } });
  const ip = ((await r.json()).Answer || []).map((a) => a.data).find((d) => /^\d+\.\d+\.\d+\.\d+$/.test(d));
  if (!ip) throw new Error(`sin respuesta para ${nombre}`);
  return ip;
}

/**
 * Algunos routers y proveedores bloquean el dominio trycloudflare.com en su DNS. cloudflared solo lo necesita para
 * pedir el túnel (el tráfico va por argotunnel.com): se levanta un intermediario local que hace ese único pedido
 * conectándose a la IP obtenida por DNS sobre HTTPS, y se le indica a cloudflared con --quick-service.
 */
async function intermediarioSiHaceFalta() {
  try { await dns.promises.lookup(API_TUNEL); return null; } catch { /* bloqueado: sigue abajo */ }
  const ip = await resolverPorHttps(API_TUNEL);
  const srv = http.createServer((req, res) => {
    const salida = https.request({ host: ip, servername: API_TUNEL, port: 443, method: req.method, path: req.url,
      headers: { ...req.headers, host: API_TUNEL } }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    salida.on('error', (e) => { res.writeHead(502); res.end(String(e)); });
    req.pipe(salida);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${srv.address().port}`;
}

function buscarCloudflared() {
  if (process.env.CLOUDFLARED) return process.env.CLOUDFLARED;
  if (!spawnSync('cloudflared', ['--version']).error) return 'cloudflared';
  // En Windows, recién instalado con winget no está en el PATH de las terminales ya abiertas.
  const candidatos = ['C:\\Program Files (x86)\\cloudflared\\cloudflared.exe', 'C:\\Program Files\\cloudflared\\cloudflared.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe')];
  return candidatos.find((c) => fs.existsSync(c)) || null;
}

(async () => {
  // WebAuthn: con RP_ID/ORIGIN fijos en localhost, la huella falla desde la URL del túnel.
  const fijos = ['WEBAUTHN_RP_ID', 'WEBAUTHN_ORIGIN'].filter((v) => process.env[v]);
  if (fijos.length) {
    console.error(`✗ El .env fija ${fijos.join(' y ')}: comentalos (con "#") y reiniciá el servidor.`);
    console.error('  Sin esas variables el servidor toma el sitio del navegador y la huella funciona con la URL del túnel.');
    process.exit(1);
  }
  try {
    const r = await fetch(`${LOCAL}/api/health`);
    if (!r.ok) throw new Error(String(r.status));
  } catch {
    console.error(`✗ No responde ${LOCAL}. Levantá primero el servidor (npm run dev) en otra terminal.`);
    process.exit(1);
  }
  const exe = buscarCloudflared();
  if (!exe) {
    console.error('✗ Falta cloudflared. En Windows: winget install --id Cloudflare.cloudflared   (Linux/Mac: ver developers.cloudflare.com)');
    process.exit(1);
  }
  if (!process.env.TRUST_PROXY) {
    console.log('ℹ Sugerencia: TRUST_PROXY=1 en el .env, así el límite de intentos de login distingue a cada usuario detrás del túnel.');
  }

  let intermediario = null;
  try { intermediario = await intermediarioSiHaceFalta(); } catch (e) {
    console.error(`✗ El DNS de esta red no resuelve ${API_TUNEL} y tampoco se pudo consultar 1.1.1.1 (${e.message}).`);
    process.exit(1);
  }
  const args = ['tunnel', '--no-autoupdate', '--url', LOCAL];
  if (intermediario) {
    args.push('--quick-service', intermediario);
    console.log('ℹ El DNS de esta red bloquea trycloudflare.com: el túnel se pide a través de 1.1.1.1.');
  }

  console.log(`Abriendo túnel hacia ${LOCAL}…`);
  const proc = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let mostrada = false;
  const registro = [];
  const leer = (buf) => {
    registro.push(...String(buf).split(/\r?\n/).filter(Boolean));
    // cloudflared también menciona su propia API (api.trycloudflare.com): esa no es la URL del túnel.
    const m = String(buf).match(/https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/);
    if (!m || mostrada) return;
    mostrada = true;
    console.log(`\n  Abrí en el celular:  ${m[0]}\n`);
    qrcode.generate(m[0], { small: true });
    console.log('\n  La URL cambia cada vez. Ctrl+C cierra el túnel.\n');
    if (intermediario) {
      console.log('  ⚠ Esta red bloquea trycloudflare.com: un celular conectado a este mismo Wi-Fi no va a abrir la URL.');
      console.log('    Usá los datos móviles, o en Android: Ajustes → Redes → DNS privado → 1dot1dot1dot1.cloudflare-dns.com\n');
    }
  };
  proc.stdout.on('data', leer);
  proc.stderr.on('data', leer);
  proc.on('exit', (c) => {
    if (!mostrada) {
      console.error(`✗ cloudflared terminó (código ${c}) sin dar una URL. Últimos mensajes:`);
      for (const l of registro.slice(-5)) console.error('   ' + l);
    }
    process.exit(c ?? 0);
  });
  process.on('SIGINT', () => proc.kill());
})();
