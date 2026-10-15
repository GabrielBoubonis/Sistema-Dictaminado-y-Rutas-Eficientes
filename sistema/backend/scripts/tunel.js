// Expone el servidor local por HTTPS con un túnel gratuito de Cloudflare (sin cuenta) para probar en un celular real.
// Uso: con el servidor andando (npm run dev, PWA compilada), en otra terminal: npm run tunel
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const qrcode = require('qrcode-terminal');

const PUERTO = process.env.PORT || 3000;
const LOCAL = `http://localhost:${PUERTO}`;

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

  console.log(`Abriendo túnel hacia ${LOCAL}…`);
  const proc = spawn(exe, ['tunnel', '--no-autoupdate', '--url', LOCAL], { stdio: ['ignore', 'pipe', 'pipe'] });
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
