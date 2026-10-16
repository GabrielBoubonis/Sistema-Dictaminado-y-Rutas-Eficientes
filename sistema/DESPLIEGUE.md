# Despliegue de la demo en un servidor (Oracle Cloud Always Free)

Deja la demo andando las 24 horas, con HTTPS real y sin depender de la PC: una máquina virtual gratuita de Oracle Cloud
corre `docker-compose.prod.yml`, que levanta PostgreSQL, la app, Caddy (certificado HTTPS automático de Let's Encrypt)
y una copia de seguridad diaria. El SUA y la Autenticación Institucional siguen simulados.

Todo es gratuito. Oracle pide una tarjeta solo para verificar la identidad; no cobra mientras se use lo "Always Free".

Probado en la PC del equipo (Docker Desktop, 16/10/2026): imagen, arranque, carga de datos, HTTPS con Caddy, login,
encabezados de seguridad, permisos de fotos y backup. **Falta probarlo en la VM real de Oracle.**

## 1. Crear la cuenta y la máquina virtual

1. Crear la cuenta en <https://www.oracle.com/cloud/free/>. La **región de origen no se puede cambiar** después: elegir
   una cercana (Santiago, Valparaíso, São Paulo o Vinhedo).
2. En la PC, generar una llave SSH (PowerShell; la primera línea crea la carpeta `.ssh` si no existe):

   ```powershell
   New-Item -ItemType Directory -Force "$HOME\.ssh"
   ssh-keygen -t ed25519 -f "$HOME\.ssh\oracle-arbolado"
   ```

   Pide una frase de contraseña (se puede dejar vacía con Enter). Crea `oracle-arbolado` (privada, no se comparte) y
   `oracle-arbolado.pub` (pública, la que se sube a Oracle).
3. Consola de Oracle → **Compute → Instances → Create instance**:
   - Imagen: **Ubuntu 24.04**.
   - Forma (shape): **VM.Standard.A1.Flex** (Ampere, ARM) con **2 OCPU y 12 GB** (es el máximo gratuito desde junio de 2026; con 1 OCPU y 6 GB también alcanza).
   - Red: dejar que cree la VCN y marcar **Assign a public IPv4 address**.
   - SSH: subir `oracle-arbolado.pub`.
   - Si dice *Out of capacity*, reintentar más tarde o probar otro "availability domain".
4. Para que la IP no cambie: **Networking → IP Management → Reserved public IPs** → reservar una y asignársela a la VM
   (es gratis mientras esté asignada).

## 2. Abrir los puertos 80 y 443

Hace falta en **dos lugares**:

1. Consola → la VCN de la VM → **Security Lists → Default** → *Add Ingress Rules*: origen `0.0.0.0/0`, TCP, puertos
   `80` y `443` (dos reglas).
2. Dentro de la VM (las imágenes de Ubuntu de Oracle traen el firewall cerrado):

   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```

## 3. Dominio gratuito

WebAuthn (la huella) y la instalación de la PWA exigen HTTPS con un dominio. Opción gratuita: **DuckDNS**.

1. Entrar a <https://www.duckdns.org> (con GitHub o Google), crear un subdominio, por ejemplo `arbolado-rosario`.
2. En "current ip" poner la **IP pública reservada** de la VM y guardar.
3. Comprobar desde la PC: `nslookup arbolado-rosario.duckdns.org` debe devolver esa IP.

## 4. Instalar Docker y levantar el sistema

Conectarse desde la PC: `ssh -i $HOME\.ssh\oracle-arbolado ubuntu@IP_PUBLICA`

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && exit        # salir y volver a entrar para que tome el grupo

git clone https://github.com/GabrielBoubonis/Sistema-Dictaminado-y-Rutas-Eficientes.git arbolado
cd arbolado/sistema
cp .env.prod.example .env.prod
echo "JWT_SECRET=$(openssl rand -base64 48)"      # copiar el valor en .env.prod
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"  # copiar el valor en .env.prod
nano .env.prod                                     # DOMINIO=arbolado-rosario.duckdns.org y los dos valores de arriba

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f app caddy   # Ctrl+C para salir
```

La primera vez tarda unos minutos (compila la imagen para ARM y carga los datos de demostración). Cuando Caddy muestre
`certificate obtained successfully`, la demo queda en `https://arbolado-rosario.duckdns.org`.

## 5. Uso diario

| Tarea | Comando (en `~/arbolado/sistema`) |
|---|---|
| Actualizar a la última versión del repo | `git pull && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build` |
| Ver logs | `docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f app` |
| Reiniciar | `docker compose -f docker-compose.prod.yml --env-file .env.prod restart app` |
| Bajar una copia de seguridad a la PC | `scp -i $HOME\.ssh\oracle-arbolado ubuntu@IP_PUBLICA:arbolado/sistema/backups/* .` (desde la PC) |

Si la VM se reinicia, todo vuelve a levantar solo (`restart: unless-stopped`).

**Copias de seguridad (RNF-11):** el servicio `backup` guarda todos los días en `sistema/backups/` la base
(`base-AAAA-MM-DD.dump`, 14 días) y las fotos (`fotos-AAAA-MM-DD.tar.gz`, 7 días). Están en el mismo servidor:
conviene bajarlas a la PC de vez en cuando. Para restaurar la base:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
  pg_restore -U postgres -d arbolado --clean --if-exists < backups/base-AAAA-MM-DD.dump
```

## 6. Cuidados

- **Recuperación por inactividad:** Oracle puede recuperar una VM gratuita si durante 7 días la CPU, la red y la
  memoria quedan por debajo del 20 % (esta demo usa unos 200 MB de 12 GB, así que califica como inactiva). Se evita
  pasando la cuenta a **Pay As You Go**: sigue sin costo dentro de los límites Always Free, pero conviene crear un
  presupuesto con alerta (Billing → Budgets) por las dudas. Verificar las condiciones vigentes en la página de Oracle.
- **Usuarios de demostración:** la clave `Demo2026!` es pública (está en el repo). Cualquiera con la URL puede entrar
  como Administrador. Para mostrar la demo alcanza; si se deja abierta mucho tiempo, cambiar las claves desde la
  pantalla de usuarios.
- **Datos de demostración:** se cargan solo si la base está vacía (`SEED=1`). Para empezar de cero hay que borrar el
  volumen de la base (`docker compose ... down -v`, **borra todo**).
