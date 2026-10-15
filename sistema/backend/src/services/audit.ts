import type { Tx } from '../db';

/** RF-54: registra el evento dentro de la misma transacción que la acción (si falla el registro, se revierte todo). */
export async function auditar(
  tx: Tx, usuario: string, accion: string, entidad: string, anterior?: string | null, nuevo?: string | null,
) {
  await tx.registroAuditoria.create({
    data: { nombre_usuario: usuario, accion, entidad_afectada: entidad, valor_anterior: anterior ?? null, valor_nuevo: nuevo ?? null },
  });
}
