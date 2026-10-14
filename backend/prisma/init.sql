-- Esquema inicial equivalente a prisma/schema.prisma.
-- Se escribió a mano porque en el entorno de desarrollo inicial no se podían descargar los motores de Prisma
-- (npx prisma migrate dev). En una máquina con internet se puede reemplazar por una migración generada con
--   npx prisma migrate dev --name init
-- Aplicar con:  npm run db:init

CREATE TABLE IF NOT EXISTS usuario (
  nombre_usuario  TEXT PRIMARY KEY,
  nombre_completo TEXT NOT NULL,
  contrasena_hash TEXT NOT NULL,
  rol             TEXT NOT NULL,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_alta      DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS refresh_token (
  id             TEXT PRIMARY KEY,
  nombre_usuario TEXT NOT NULL,
  token_hash     TEXT NOT NULL UNIQUE,
  cadena_inicio  TIMESTAMP(3) NOT NULL,
  expira         TIMESTAMP(3) NOT NULL,
  revocado       BOOLEAN NOT NULL DEFAULT FALSE,
  dispositivo_id TEXT,
  creado         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dispositivo (
  id_dispositivo   TEXT PRIMARY KEY,
  codigo_visible   TEXT NOT NULL UNIQUE,
  nombre_usuario   TEXT,
  estado           TEXT NOT NULL DEFAULT 'Activo',
  fecha_bloqueo    TIMESTAMP(3),
  fecha_desbloqueo TIMESTAMP(3),
  desbloqueado_por TEXT
);

CREATE TABLE IF NOT EXISTS webauthn_credential (
  id             TEXT PRIMARY KEY,
  nombre_usuario TEXT NOT NULL REFERENCES usuario(nombre_usuario),
  public_key     TEXT NOT NULL,
  counter        INTEGER NOT NULL DEFAULT 0,
  transports     TEXT
);

CREATE TABLE IF NOT EXISTS solicitudes_sua (
  numero_sua          TEXT NOT NULL,
  anio                INTEGER NOT NULL,
  tipo                TEXT NOT NULL,
  subtipo             TEXT NOT NULL,
  area_derivada       TEXT NOT NULL,
  distrito            TEXT NOT NULL,
  prioridad           TEXT NOT NULL,
  direccion           TEXT NOT NULL,
  descripcion_reclamo TEXT NOT NULL,
  es_tormenta         BOOLEAN NOT NULL DEFAULT FALSE,
  es_rederivacion     BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_derivacion    DATE NOT NULL,
  PRIMARY KEY (numero_sua, anio)
);

CREATE TABLE IF NOT EXISTS usuarios_institucionales (
  nombre_usuario  TEXT PRIMARY KEY,
  vigente         BOOLEAN NOT NULL DEFAULT TRUE,
  nombre_completo TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS solicitud (
  numero_sua              TEXT NOT NULL,
  anio                    INTEGER NOT NULL,
  distrito                TEXT NOT NULL,
  prioridad               TEXT NOT NULL,
  direccion               TEXT NOT NULL,
  latitud                 DOUBLE PRECISION,
  longitud                DOUBLE PRECISION,
  geo_ultimo_intento      TIMESTAMP(3),
  descripcion_reclamo     TEXT NOT NULL,
  estado                  TEXT NOT NULL DEFAULT 'Pendiente',
  es_tormenta             BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_ultima_derivacion DATE NOT NULL,
  PRIMARY KEY (numero_sua, anio)
);

CREATE TABLE IF NOT EXISTS historial_derivacion (
  id_derivacion    SERIAL PRIMARY KEY,
  numero_sua       TEXT NOT NULL,
  anio             INTEGER NOT NULL,
  fecha_derivacion DATE NOT NULL,
  motivo           TEXT NOT NULL,
  FOREIGN KEY (numero_sua, anio) REFERENCES solicitud(numero_sua, anio)
);

CREATE TABLE IF NOT EXISTS especie (
  id_especie         SERIAL PRIMARY KEY,
  nombre_comun       TEXT NOT NULL,
  nombre_cientifico  TEXT,
  nombre_normalizado TEXT NOT NULL UNIQUE,
  activa             BOOLEAN NOT NULL DEFAULT TRUE,
  creada_por         TEXT
);

CREATE TABLE IF NOT EXISTS dictamen (
  id_dictamen                    SERIAL PRIMARY KEY,
  uuid_dictamen                  TEXT NOT NULL UNIQUE,
  numero_sua                     TEXT NOT NULL,
  anio                           INTEGER NOT NULL,
  nombre_usuario                 TEXT NOT NULL REFERENCES usuario(nombre_usuario),
  nota_numero                    INTEGER,
  expediente_numero              INTEGER,
  fecha_emision                  DATE NOT NULL,
  fecha_firma                    TIMESTAMP(3) NOT NULL,
  domicilio_ejemplar             TEXT,
  latitud_ejemplar               DOUBLE PRECISION,
  longitud_ejemplar              DOUBLE PRECISION,
  calle_esquina                  TEXT,
  numero_esquina                 TEXT,
  referencia_ubicacion           TEXT,
  id_especie                     INTEGER NOT NULL REFERENCES especie(id_especie),
  distancia_medianera_referencia DOUBLE PRECISION,
  cantidad_frente                INTEGER,
  nivel_dano_vereda              TEXT,
  es_extraccion                  BOOLEAN NOT NULL DEFAULT FALSE,
  perimetro_tronco               DOUBLE PRECISION,
  motivo_extraccion              TEXT,
  es_sin_trabajo                 BOOLEAN NOT NULL DEFAULT FALSE,
  motivo_sin_trabajo             TEXT,
  complejidad                    TEXT NOT NULL,
  urgente                        BOOLEAN NOT NULL DEFAULT FALSE,
  arbol_frente_garage            BOOLEAN NOT NULL DEFAULT FALSE,
  media_tension                  BOOLEAN NOT NULL DEFAULT FALSE,
  de_oficio                      BOOLEAN NOT NULL DEFAULT FALSE,
  plantar                        TEXT,
  nivel_prioridad                TEXT NOT NULL,
  observaciones                  TEXT,
  vigente                        BOOLEAN DEFAULT TRUE,
  hash_firma                     TEXT NOT NULL,
  estado_sincronizacion          TEXT NOT NULL DEFAULT 'sincronizado',
  firmado_sin_conexion           BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (numero_sua, anio) REFERENCES solicitud(numero_sua, anio)
);

CREATE TABLE IF NOT EXISTS fotografia (
  id_foto            SERIAL PRIMARY KEY,
  id_dictamen        INTEGER NOT NULL REFERENCES dictamen(id_dictamen) ON DELETE CASCADE,
  archivo_referencia TEXT NOT NULL,
  orden              INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trabajo_aereo (
  id_trabajo_aereo SERIAL PRIMARY KEY,
  id_dictamen      INTEGER NOT NULL REFERENCES dictamen(id_dictamen) ON DELETE CASCADE,
  tipo_trabajo     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trabajo_subterraneo (
  id_trabajo_subterraneo SERIAL PRIMARY KEY,
  id_dictamen            INTEGER NOT NULL REFERENCES dictamen(id_dictamen) ON DELETE CASCADE,
  tipo_trabajo           TEXT NOT NULL,
  distancia_borde        DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS ruta (
  id_ruta             SERIAL PRIMARY KEY,
  nombre_usuario      TEXT NOT NULL REFERENCES usuario(nombre_usuario),
  fecha               DATE NOT NULL,
  tipo                TEXT NOT NULL DEFAULT 'Normal',
  estado              TEXT NOT NULL DEFAULT 'Activa',
  modo_desplazamiento TEXT NOT NULL,
  creada              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criterios           JSONB,
  distancia_total_m   DOUBLE PRECISION,
  tiempo_total_s      DOUBLE PRECISION,
  optimizada          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS ruta_solicitud (
  id_ruta             INTEGER NOT NULL REFERENCES ruta(id_ruta) ON DELETE CASCADE,
  numero_sua          TEXT NOT NULL,
  anio                INTEGER NOT NULL,
  orden               INTEGER NOT NULL,
  fecha_incorporacion TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  liberada            BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_liberacion    TIMESTAMP(3),
  motivo_liberacion   TEXT,
  PRIMARY KEY (id_ruta, numero_sua, anio),
  FOREIGN KEY (numero_sua, anio) REFERENCES solicitud(numero_sua, anio)
);

CREATE TABLE IF NOT EXISTS registro_auditoria (
  id_auditoria     SERIAL PRIMARY KEY,
  nombre_usuario   TEXT NOT NULL REFERENCES usuario(nombre_usuario),
  accion           TEXT NOT NULL,
  entidad_afectada TEXT NOT NULL,
  valor_anterior   TEXT,
  valor_nuevo      TEXT,
  fecha_hora       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RF-54: el registro de auditoría es append-only. La base rechaza UPDATE y DELETE sobre la tabla.
CREATE OR REPLACE FUNCTION auditoria_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'registro_auditoria es inmutable: no admite % (RF-54)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auditoria_inmutable ON registro_auditoria;
CREATE TRIGGER trg_auditoria_inmutable
  BEFORE UPDATE OR DELETE ON registro_auditoria
  FOR EACH ROW EXECUTE FUNCTION auditoria_inmutable();

CREATE TABLE IF NOT EXISTS caso_revision (
  id_caso              SERIAL PRIMARY KEY,
  tipo                 TEXT NOT NULL,
  referencia_solicitud TEXT NOT NULL,
  id_dictamen          INTEGER,
  motivo               TEXT NOT NULL,
  fecha_hora           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_solicitud_estado ON solicitud(estado);
CREATE INDEX IF NOT EXISTS idx_dictamen_solicitud ON dictamen(numero_sua, anio);
CREATE INDEX IF NOT EXISTS idx_ruta_usuario ON ruta(nombre_usuario, estado);

CREATE TABLE IF NOT EXISTS sua_datos_complementarios (
  numero_sua  TEXT NOT NULL,
  anio        INTEGER NOT NULL,
  recibido_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload     JSONB NOT NULL,
  PRIMARY KEY (numero_sua, anio)
);

-- RF-16 / condición de carrera: una solicitud solo puede tener una reserva activa a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reserva_activa ON ruta_solicitud(numero_sua, anio) WHERE liberada = FALSE;

-- Reintentos de envío al SUA con espera creciente (RF-25, RNF-17).
ALTER TABLE dictamen ADD COLUMN IF NOT EXISTS sua_intentos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dictamen ADD COLUMN IF NOT EXISTS sua_proximo_intento TIMESTAMP(3);
