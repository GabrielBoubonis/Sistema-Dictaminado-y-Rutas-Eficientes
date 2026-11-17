# Sistema de Dictaminado y Rutas Eficientes

Aplicación web progresiva (PWA) para que los ingenieros agrónomos de la **Dirección General
de Parques y Paseos (Municipalidad de Rosario)** armen su ruta diaria de reclamos de
arbolado, completen y firmen con su huella el dictamen técnico en la vereda (también sin
señal) y lo envíen al SUA sin papel ni transcripción. Incluye un tablero para la Dirección.

> Trabajo práctico · Diseño de Sistemas Web · Comisión 32 · Docente: Pablo Pedernera ·
> Terciario Urquiza · Grupo N.° 1

**Demo en línea:** <https://proyecto-dictaminadoyrutaseficientes.duckdns.org/>
(usuarios de prueba en [sistema/README.md](sistema/README.md); la clave de todos es `Demo2026!`).

---

## Qué resuelve

| Problema | Respuesta del sistema |
|---|---|
| Dictámenes en papel que después se transcriben en la PC | El dictamen nace digital en el celular y llega solo al SUA: una sola carga. |
| Recorridos armados a mano en Google Maps | La ruta del día se arma sola, por antigüedad y cercanía, siguiendo las calles. |
| Datos cargados de mil maneras distintas | Listas cerradas con los códigos oficiales y medidas numéricas con rango. |
| No se puede probar quién firmó | Firma con la huella del celular (WebAuthn) sobre un hash SHA-256 del contenido. |
| Números armados a mano para la Dirección | Tablero integrado, por distrito, prioridad y mes. |

---

## Cómo está organizado

| Carpeta o archivo | Qué hay |
|---|---|
| [documentacion-final/](documentacion-final/) | Documentación del trabajo: requisitos, historias de usuario, casos de uso, modelo ER, diseño de interfaz, arquitectura, decisiones técnicas y diagramas. Empezar por su [README](documentacion-final/README.md). |
| [sistema/](sistema/) | Código: servidor (Node.js + PostgreSQL), aplicación (React, PWA), prueba de punta a punta y despliegue con Docker. Cómo correrlo: [sistema/README.md](sistema/README.md). |
| [datos-prueba/](datos-prueba/) | Datos ficticios con los que se carga la demo. |
| [registro-de-cambios.md](registro-de-cambios.md) | Qué se cambió y por qué, del más nuevo al más viejo. |
| [CLAUDE.md](CLAUDE.md) | Contexto técnico para asistentes de código. |

Lecturas recomendadas para evaluar el trabajo:

1. [Requisitos](documentacion-final/docs/requisitos.md) y [casos de uso](documentacion-final/docs/casos-de-uso.md).
2. [Decisiones técnicas](documentacion-final/docs/decisiones-tecnicas.md): por qué elegimos cada tecnología.
3. [Resumen tecnológico](documentacion-final/docs/resumen-tecnologico.md): con qué está hecho y dónde corre la demo.

---

## Tecnologías en una línea

React + Vite + TypeScript (PWA con Workbox, IndexedDB y Web Crypto) · Node.js + Express +
Prisma · PostgreSQL 16 · WebAuthn · Leaflet + OpenStreetMap · OpenRouteService · Georef ·
Docker + Caddy en Oracle Cloud Always Free. **Todo gratuito y de código abierto.**
