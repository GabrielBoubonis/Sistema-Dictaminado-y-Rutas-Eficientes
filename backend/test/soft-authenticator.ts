// Autenticador WebAuthn por software, solo para los tests: permite ejercitar la verificación real del servidor.
import crypto from 'crypto';

// Codificador CBOR mínimo (enteros, bytes, texto y mapas) suficiente para la clave COSE y el objeto de atestación.
function cabecera(mayor: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(mayor << 5) | n]);
  if (n < 256) return Buffer.from([(mayor << 5) | 24, n]);
  const b = Buffer.alloc(3); b[0] = (mayor << 5) | 25; b.writeUInt16BE(n, 1); return b;
}
function encode(v: any): Buffer {
  if (typeof v === 'number') return v >= 0 ? cabecera(0, v) : cabecera(1, -1 - v);
  if (typeof v === 'string') { const b = Buffer.from(v); return Buffer.concat([cabecera(3, b.length), b]); }
  if (Buffer.isBuffer(v)) return Buffer.concat([cabecera(2, v.length), v]);
  const pares: Array<[any, any]> = v instanceof Map ? [...v.entries()] : Object.entries(v);
  return Buffer.concat([cabecera(5, pares.length), ...pares.flatMap(([k, x]) => [encode(k), encode(x)])]);
}

const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');
const RP_ID = 'localhost';
const ORIGIN = 'http://localhost:5173';

export class SoftAuthenticator {
  credId = crypto.randomBytes(32);
  private keys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  private rpHash = crypto.createHash('sha256').update(RP_ID).digest();

  private coseKey(): Buffer {
    const jwk = this.keys.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    return Buffer.from(encode(new Map<number, any>([
      [1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')],
    ])));
  }

  get id() { return b64u(this.credId); }

  registrar(challenge: string) {
    const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin: ORIGIN, crossOrigin: false }));
    const idLen = Buffer.alloc(2); idLen.writeUInt16BE(this.credId.length);
    const authData = Buffer.concat([this.rpHash, Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16), idLen, this.credId, this.coseKey()]);
    const attestationObject = Buffer.from(encode({ fmt: 'none', attStmt: {}, authData }));
    return {
      id: this.id, rawId: this.id, type: 'public-key',
      response: { clientDataJSON: b64u(clientData), attestationObject: b64u(attestationObject), transports: ['internal'] },
      clientExtensionResults: {},
    };
  }

  /** Aserción cuyo desafío es el hash del dictamen (en hexadecimal). */
  firmar(hashHex: string, opciones: { desafioDistinto?: string } = {}) {
    const challenge = b64u(Buffer.from(opciones.desafioDistinto ?? hashHex, 'hex'));
    const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: ORIGIN, crossOrigin: false }));
    const authData = Buffer.concat([this.rpHash, Buffer.from([0x05]), Buffer.alloc(4)]);
    const firmado = Buffer.concat([authData, crypto.createHash('sha256').update(clientData).digest()]);
    const signature = crypto.sign('sha256', firmado, this.keys.privateKey);
    return {
      id: this.id, rawId: this.id, type: 'public-key',
      response: { clientDataJSON: b64u(clientData), authenticatorData: b64u(authData), signature: b64u(signature) },
      clientExtensionResults: {},
    };
  }
}
