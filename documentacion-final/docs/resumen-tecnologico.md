# Resumen tecnológico y alojamiento de la demo

_Este documento no forma parte de las plantillas de la cátedra. Es la foto completa de
con qué está hecho el sistema y dónde corre la demo. Por qué se eligió cada pieza:
`decisiones-tecnicas.md`. Cómo está construida: `arquitectura-tecnica.md`._

---

## De un vistazo

Una aplicación web progresiva (PWA) que el ingeniero instala en el celular y que funciona
sin señal. Habla con un servidor Node.js que guarda todo en PostgreSQL, calcula rutas con
OpenRouteService y le envía los dictámenes al SUA. Todo es **gratuito y de código
abierto**, y la demo está publicada en una máquina virtual gratuita con HTTPS.

```
Celular del ingeniero (PWA)  --HTTPS-->  Caddy  -->  Servidor Node.js  -->  PostgreSQL
  datos sin señal cifrados                (HTTPS)        |
  huella (WebAuthn)                                      +--> OpenRouteService (rutas)
                                                         +--> Georef / Nominatim (direcciones)
                                                         +--> SUA (simulado)
```

---

## Tecnologías por capa

| Capa | Tecnología | Versión | Para qué |
|---|---|---|---|
| App (celular y escritorio) | React | 18.3 | Pantallas de la aplicación. |
| | Vite | 5.4 | Compilación y servidor de desarrollo. |
| | TypeScript | 7.0 | Tipos para detectar errores antes de ejecutar. |
| | vite-plugin-pwa (Workbox) | 0.20 (Workbox 7) | Service worker: instalación y uso sin señal. |
| | React Router | 6.30 | Navegación entre pantallas. |
| | Dexie (IndexedDB) | 4.4 | Cola de dictámenes, fotos y borradores en el celular. |
| | Web Crypto API | del navegador | SHA-256, AES-GCM y PBKDF2, sin bibliotecas extra. |
| | SimpleWebAuthn (navegador) | 10 | Firma con la huella del celular. |
| | Leaflet | 1.9 | Mapa interactivo. |
| | Lucide | 1.73 | Íconos. |
| | Atkinson Hyperlegible (Fontsource) | 5.3 | Tipografía, incluida en la app. |
| Servidor | Node.js | 22 (en la imagen de Docker) | Entorno de ejecución. |
| | Express | 4.21 | API REST bajo `/api`. |
| | TypeScript | 5.7 | Tipos en el servidor. |
| | Prisma | 7.10 | Acceso a la base con tipos generados. |
| | SimpleWebAuthn (servidor) | 10 | Verificación de la firma con huella. |
| | jsonwebtoken | 9 | Sesión con JWT de 30 minutos. |
| | bcryptjs | 2.4 | Hash de contraseñas (costo 12). |
| | zod | 3.24 | Validación de cada dato que llega. |
| | helmet y express-rate-limit | 8 y 7.5 | Cabeceras de seguridad y límite de intentos. |
| | PDFKit | 0.15 | PDF imprimible del dictamen. |
| Base de datos | PostgreSQL | 16 | Datos, auditoría inmutable, reservas sin choques. |
| Pruebas | Jest + supertest | 29 y 7 | 86 pruebas del servidor contra una base real. |
| | Vitest + fake-indexeddb | 2.1 | 15 pruebas de la app. |
| | Playwright (Python) | — | Prueba de punta a punta en Chromium. |
| Alojamiento | Docker Compose | — | Empaqueta base, servidor, HTTPS y copias de seguridad. |
| | Caddy | 2 | HTTPS automático con Let's Encrypt. |

---

## Servicios externos

| Servicio | Para qué | Costo | Si no responde |
|---|---|---|---|
| OpenRouteService | Distancias reales y recorrido por calles, a pie y en vehículo. | Gratis con clave (2.000 pedidos por día). | La ruta se arma por antigüedad y el mapa avisa que el trazado es aproximado. |
| Georef (Estado nacional) | Ubicar cada dirección por su altura. | Gratis, sin clave. | Se usa Nominatim. |
| Nominatim (OpenStreetMap) | Respaldo para ubicar direcciones. | Gratis, 1 pedido por segundo. | La solicitud queda sin ubicar y se reintenta cada hora (RF-62). |
| Teselas de OpenStreetMap | Fondo del mapa. | Gratis. | Se usan las que quedaron en la caché del celular. |
| Let's Encrypt | Certificado HTTPS. | Gratis, se renueva solo. | — |
| DuckDNS | Nombre de dominio de la demo. | Gratis. | — |
| SUA y Autenticación Institucional | Recibir los dictámenes y validar usuarios. | — | **Simulados** en esta etapa: no hay acceso a los servicios reales de la Municipalidad. |

---

## Cómo está alojada la demo

| Pieza | Detalle |
|---|---|
| Dirección | `https://proyecto-dictaminadoyrutaseficientes.duckdns.org/` |
| Proveedor | Oracle Cloud, plan Always Free (sin costo; pide tarjeta solo para verificar identidad). |
| Máquina | VM ARM (Ampere A1) con Ubuntu 24.04 e IP pública reservada. |
| Contenedor `db` | PostgreSQL 16, sin puertos abiertos hacia afuera: solo lo ve el servidor. |
| Contenedor `app` | Node.js 22 con la app compilada, corriendo con un usuario sin privilegios. |
| Contenedor `caddy` | Recibe por los puertos 80 y 443, obtiene el certificado y redirige de HTTP a HTTPS. |
| Contenedor `backup` | Copia completa de la base todos los días en `sistema/backups/`. |
| Al arrancar | Aplica `init.sql` (cambios de esquema y de datos) y alinea el catálogo de especies; con `SEED=1`, si la base está vacía, carga los datos de prueba. |
| Actualizar | `git pull` y `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`. La guía completa está en `sistema/DESPLIEGUE.md`. |
| Claves | La clave de OpenRouteService y los secretos viven en `.env.prod` del servidor, nunca en el repositorio. |

**Costo mensual total de la demo: $0.**

---

## Qué está verificado y qué no

| Verificado | Pendiente |
|---|---|
| 101 pruebas automáticas, incluida la carga con 7 ingenieros a la vez. | Auditoría de accesibilidad con herramienta (axe). |
| Instalación de la PWA y firma con huella en un Android real. | Cámara y modo sin señal en el celular real. |
| Servidor en producción con HTTPS, cabeceras de seguridad y copia diaria. | Integración con el SUA y la autenticación reales. |
| OpenRouteService real: matriz en alrededor de 1 segundo. | Revisión en distintos modelos de celular. |
