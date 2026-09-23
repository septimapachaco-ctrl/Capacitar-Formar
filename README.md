# Formar Capacitaciones — Sitio en HTML / CSS / JavaScript puro

Sitio de venta de cursos 100% en **HTML, CSS y JavaScript vanilla** (sin
frameworks ni build tools), con **Supabase** como base de datos/backend.
El contacto para inscribirse es directo por **WhatsApp e Instagram** (no
hay carrito de compras ni pasarela de pago integrada).

---

## 1. Estructura del proyecto

```
index.html              → Landing page
cursos.html               → Listado completo de cursos (con buscador y filtros)
curso.html                  → Detalle de curso (dinámico, vía ?slug=..., usado como
                               vista previa inmediata de un curso recién creado)
admin.html                    → Panel de administración (login + CRUD)
gracias.html                    → Página "Nuestro equipo" (perfiles del staff)

cursos/<slug>/index.html    → Una página estática por curso (generada, ver sección 8),
                               en una ruta limpia (ej: /cursos/plomeria/)

styles-common.css           → Estilos compartidos por todo el sitio (paleta de marca)
styles-inner.css            → Estilos puntuales de páginas internas

schema.sql                  → Script SQL completo para crear la base en Supabase
supabase_migration.sql      → Migraciones incrementales sobre una base ya creada

scripts/
  generate-static.mjs       → Generador de HTML estático para SEO/GEO (ver sección 8)

sitemap.xml, robots.txt, llms.txt → Archivos para buscadores tradicionales y
                                     motores de IA (GEO), regenerados automáticamente

.github/workflows/
  generate-static.yml       → Corre el generador estático cada 15 minutos
  keep-alive.yml             → Evita que Supabase pause el proyecto por inactividad
  claude.yml                   → Claude Code Action (responde en issues/PRs)
```

No hay carpetas `js/`, `css/` ni `server/`: todo el JavaScript de cada
página vive **inline**, dentro de un `<script type="module">` en el
propio `.html` (por ejemplo, la lógica de `index.html` está al final de
`index.html`, la de `admin.html` al final de `admin.html`, etc.). No hay
ningún backend propio (Node/Express): el sitio habla directo con
Supabase desde el navegador.

---

## 2. Configurar Supabase (base de datos)

1. Creá una cuenta/proyecto en [supabase.com](https://supabase.com).
2. En el menú lateral, entrá a **SQL Editor → New query**.
3. Pegá **todo** el contenido de `schema.sql` y hacé clic en **RUN**.
   Esto crea las tablas `categories`, `courses`, `orders` (en desuso,
   ver nota abajo), `site_content`, `team_members`, `admins`, los
   permisos (RLS), el bucket de imágenes (`course-media`) y carga
   cursos de ejemplo.
4. Si la base ya existía antes de tener columnas/políticas más nuevas
   (como el WhatsApp propio por curso), corré también
   `supabase_migration.sql` — es idempotente, se puede ejecutar más de
   una vez sin romper nada.
5. Andá a **Authentication → Users → Add user** y creá tu usuario
   administrador (email + contraseña).
6. Insertá ese usuario en la tabla `public.admins` (`user_id` = el
   `id` del usuario creado). Solo los usuarios cargados ahí tienen
   permisos de escritura sobre cursos, categorías y contenido del
   sitio — con ese usuario vas a entrar a `admin.html`.
7. Andá a **Project Settings → API** y copiá:
   - `Project URL`
   - la clave pública (`anon` / `publishable`)

> La tabla `orders` es un remanente de un sistema de carrito + Mercado
> Pago que ya no está activo (hoy la conversión es por WhatsApp). Se
> deja creada por compatibilidad pero **sin insert público** — no
> escribe nada el frontend actual. Si en el futuro se reactiva un
> checkout, hay que agregar antes validación de formato y algún tipo
> de verificación anti-spam (ver el comentario en `schema.sql`).

## 3. Conectar el frontend a Supabase

La URL y la clave pública de Supabase están **hardcodeadas dentro de
cada archivo `.html`** (no hay un archivo central tipo
`supabaseClient.js`). Si cambiás de proyecto de Supabase, tenés que
reemplazar `SUPABASE_URL` y `SUPABASE_ANON_KEY` en el `<script
type="module">` de cada uno de estos archivos:

- `index.html`, `cursos.html`, `curso.html`, `admin.html`, `gracias.html`
- `cursos/<slug>/index.html` (todas las páginas de curso generadas)
- `scripts/generate-static.mjs`

La clave que va acá es la **pública** (`anon`/`publishable`): es segura
de exponer en el navegador porque la seguridad real la da Supabase Row
Level Security (RLS), no el secreto de la clave.

## 4. Correr el sitio en local

Como el sitio usa JavaScript con `type="module"` y `fetch`, necesitás
servirlo con un servidor local (no funciona abriendo el `.html` directo
con doble clic, por las restricciones de CORS de los navegadores). Opciones:

**Con VS Code:** instalá la extensión "Live Server" y hacé clic derecho
sobre `index.html` → "Open with Live Server".

**Con Node:**
```bash
npx serve .
```

**Con Python:**
```bash
python3 -m http.server 5500
```

Y abrís `http://localhost:5500`.

## 5. Cómo se maneja la conversión (WhatsApp / Instagram)

No hay carrito ni pasarela de pago: cada curso, en el listado y en el
detalle, muestra botones de **"Consultar por WhatsApp"** y
**"Consultar por Instagram"**. El número de WhatsApp es configurable
por curso (columna `whatsapp_number` en `courses`); si un curso no
tiene uno propio, se usa el WhatsApp general del negocio (constante
`WHATSAPP_NUMBER`, definida en cada `.html` que la necesita). Los
precios se pueden ocultar globalmente desde el panel de admin
(`site_content.data.show_prices`), mostrando "Consultar" en su lugar.

## 6. Panel de administración (`admin.html`)

- Entrá a `admin.html` y logueate con el usuario creado en el paso 2.5
  (y agregado a `public.admins` en el paso 2.6).
- Incluye recuperación de contraseña por email con código de 6 dígitos
  (flujo nativo de Supabase Auth: `resetPasswordForEmail` +
  verificación de OTP).
- Pestaña **Cursos**: crear, editar y eliminar cursos (con subida de
  imagen directa a Supabase Storage o pegando una URL), incluido el
  WhatsApp propio de cada curso.
- Pestaña **Categorías**: crear y eliminar categorías dinámicamente.
- Pestaña **Equipo**: gestionar los perfiles que se muestran en
  `gracias.html`.
- Pestaña **Contenido**: editar textos de la landing (hero,
  estadísticas, ventajas, contacto, footer) y el toggle de mostrar/
  ocultar precios.
- La seguridad real la da **Supabase Auth + Row Level Security**: sin
  sesión de un usuario cargado en `public.admins`, cualquier intento de
  crear/editar/eliminar es rechazado por la base de datos, sin importar
  el JavaScript del cliente.

## 7. Despliegue en producción

- El sitio se publica con **GitHub Pages** sobre la rama `main`
  (dominio propio configurado en `CNAME`:
  `formarcapacitaciones.com`), sin necesidad de build.
- No hay backend propio que desplegar: todo corre en el navegador
  contra Supabase directamente.
- El workflow `.github/workflows/keep-alive.yml` hace un ping
  periódico a Supabase para que el proyecto free no se pause por
  inactividad.

## 8. Generación estática (SEO / GEO)

`cursos.html` y `curso.html` traen su contenido desde Supabase con
JavaScript en el navegador. Eso funciona para usuarios reales y para
Google (que ejecuta JS), pero no para WhatsApp, Facebook, ni para la
mayoría de los rastreadores de motores de IA (GEO), que leen el HTML
"tal cual" sin correr JavaScript.

Por eso `scripts/generate-static.mjs` genera, antes de publicar, el
HTML final con el contenido ya escrito adentro:

- **`cursos.html`**: la lista completa de cursos queda pre-renderizada
  dentro de `#courses-full-list` (el buscador y los filtros siguen
  funcionando con JavaScript, pero filtran algo que ya está en el DOM,
  no algo que va a buscar de cero).
- **`cursos/<slug>/index.html`**: una página estática por curso, en una
  ruta limpia (ej: `/cursos/plomeria/`), con el `<title>`, meta
  `description`, Open Graph, Twitter Card y JSON-LD de tipo `Course` ya
  completos —y el detalle del curso ya escrito en el HTML, no detrás
  de un `fetch`—. La versión JS de `curso.html` sigue funcionando arriba
  de eso (hidrata con datos frescos), así que `curso.html?slug=...`
  sigue sirviendo como vista previa inmediata para un curso recién
  creado desde `/admin`, incluso antes de que corra la generación
  estática.
- **`sitemap.xml`** y **`llms.txt`**: se regeneran con la lista real de
  cursos activos (el segundo, pensado específicamente para que los
  motores de IA generativa —GEO— entiendan la oferta de cursos).

### Cómo correrlo

```bash
node scripts/generate-static.mjs
# o
npm run generate
```

No requiere dependencias (usa `fetch` nativo de Node ≥ 18) y se conecta
a Supabase con la misma clave pública de lectura (`anon key`) que ya usa
el sitio en el navegador.

### Automatización

El workflow `.github/workflows/generate-static.yml` corre este script
cada 15 minutos y también se puede disparar a mano desde la pestaña
**Actions** de GitHub. Si hay cambios (por ejemplo, un curso nuevo
cargado desde `/admin`), los commitea y pushea automáticamente al
repo — lo que dispara el redeploy de GitHub Pages.
