/**
 * Usuarios de demostración que se muestran en la pantalla de ingreso, para que quien evalúe la demo pueda entrar con
 * un toque. Son los mismos que carga `datos-prueba/usuarios-sistema.json`. Para una instalación real se ocultan
 * compilando con VITE_MOSTRAR_DEMO=0.
 */
export const MOSTRAR_DEMO = import.meta.env.VITE_MOSTRAR_DEMO !== '0';
export const CLAVE_DEMO = 'Demo2026!';

export const USUARIOS_DEMO: Array<{ usuario: string; rol: string; para: string }> = [
  { usuario: 'mrossi0', rol: 'Operador', para: 'Armar la ruta, dictaminar y firmar' },
  { usuario: 'cbenite0', rol: 'Operador', para: 'Un segundo ingeniero, para probar dos a la vez' },
  { usuario: 'pgimene0', rol: 'Jefe', para: 'Lo mismo que el Operador, más el tablero' },
  { usuario: 'asuarez0', rol: 'Administrador', para: 'Usuarios, captores y auditoría' },
  { usuario: 'tmolina0', rol: 'Lector', para: 'Tablero, tormenta y PDF de los dictámenes' },
];
