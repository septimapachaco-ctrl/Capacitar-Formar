# Formar Capacitaciones — Sitio en HTML / CSS / JavaScript puro

Sitio de venta de cursos 100% en **HTML, CSS y JavaScript vanilla** (sin
frameworks ni build tools), con **Supabase** como base de datos/backend y
**Mercado Pago** para los pagos.

---

## 1. Estructura del proyecto

```
index.html            → Landing page
curso.html             → Detalle de curso (dinámico, vía ?slug=...)
admin.html              → Panel de administración (login + CRUD)
gracias.html            → Página post-pago
schema.sql               → Script SQL para Supabase

css/
  styles.css              → Todos los estilos del sitio (paleta de marca incluida)

js/
  supabaseClient.js        → Conexión a Supabase (ACÁ van tus credenciales)
  utils.js                  → Formateo de precios, slugify, etc.
  layout.js                  → Header y footer reutilizables
  cart.js                     → Carrito de compras (localStorage) + checkout
  main.js                      → Lógica de la landing (buscador, filtros, listado)
  curso.js                      → Lógica del detalle de curso (SEO + render)
  admin.js                       → Lógica del panel de administración

server/                → Backend mínimo (Node/Express) para Mercado Pago
  server.js
  package.json
  .env.example
```

---

## 2. Configurar Supabase (base de datos)

1. Creá una cuenta/proyecto en [supabase.com](https://supabase.com).
2. En el menú lateral, entrá a **SQL Editor → New query**.
3. Pegá **todo** el contenido de `schema.sql` y hacé clic en **RUN**.
   Esto crea las tablas `categories`, `courses`, `orders`, los permisos
   (RLS), el bucket de imágenes y carga los 8 cursos de ejemplo.
4. Andá a **Authentication → Users → Add user** y creá tu usuario
   administrador (email + contraseña). Con ese usuario vas a entrar a
   `admin.html`.
5. Andá a **Project Settings → API** y copiá:
   - `Project URL`
   - `anon public` key

## 3. Conectar el frontend a Supabase

Abrí `js/supabaseClient.js` y reemplazá:

```js
const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
const SUPABASE_ANON_KEY = "TU_ANON_KEY_PUBLICA";
```

por los datos reales de tu proyecto. Es lo único que necesitás tocar para
que la landing, el detalle de curso y el login del admin funcionen.

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

## 5. Configurar el checkout con Mercado Pago (backend)

El **Access Token** de Mercado Pago es secreto: nunca puede vivir en el
HTML/JS del navegador, porque cualquiera podría verlo y usarlo. Por eso el
checkout necesita un pequeño servidor intermediario (`/server`) que:

1. Recibe el carrito desde el sitio.
2. Registra la orden en Supabase.
3. Crea la preferencia de pago en Mercado Pago usando el Access Token
   (que solo vive en el servidor).
4. Devuelve al sitio el link de pago (`init_point`) para redirigir al
   comprador al Checkout Pro de Mercado Pago.

### Pasos:

```bash
cd server
npm install
cp .env.example .env
```

Completá `.env` con:
- `SITE_URL` → la URL donde corre tu sitio (ej: `http://localhost:5500`)
- `SUPABASE_URL` → la misma URL del paso 2
- `SUPABASE_SERVICE_ROLE_KEY` → en Supabase: **Project Settings → API →
  service_role** (⚠️ es secreta, nunca la pongas en el frontend)
- `MERCADOPAGO_ACCESS_TOKEN` → en [Mercado Pago
  Developers](https://www.mercadopago.com.ar/developers/panel) → Tus
  integraciones → Credenciales de producción o de prueba

Corré el servidor:
```bash
npm start
```

Por último, en `js/supabaseClient.js`, verificá que `CHECKOUT_API_URL`
apunte a donde corre este servidor (por defecto `http://localhost:4000/api/checkout`).

> Si no configurás el backend, el sitio sigue funcionando en **modo
> demo**: el carrito y el resto del sitio andan normalmente, pero al
> pagar no habrá cobro real (mostrará un error de conexión al backend).

## 6. Panel de administración (`admin.html`)

- Entrá a `admin.html` y logueate con el usuario creado en el paso 2.4.
- Pestaña **Cursos**: crear, editar y eliminar cursos (con subida de
  imagen directa a Supabase Storage o pegando una URL).
- Pestaña **Categorías**: crear y eliminar categorías dinámicamente.
- La seguridad real la da **Supabase Auth + Row Level Security**: sin
  sesión iniciada, cualquier intento de crear/editar/eliminar es
  rechazado por la base de datos, sin importar el JavaScript del cliente.

## 7. Despliegue en producción

- **Frontend (HTML/CSS/JS):** se puede alojar gratis en Netlify, Vercel,
  GitHub Pages o Cloudflare Pages — simplemente subís la carpeta raíz
  (no necesita build).
- **Backend del checkout (`/server`):** se despliega en cualquier
  hosting de Node (Render, Railway, Fly.io, un VPS, etc.). Actualizá
  `CHECKOUT_API_URL` en `js/supabaseClient.js` con la URL final del
  backend en producción, y `SITE_URL` en el `.env` del servidor con el
  dominio final del sitio.
- En Mercado Pago, no hace falta configurar nada extra: la
  `notification_url` del webhook se arma sola a partir del dominio del
  backend.

## 8. Nota sobre SEO en `curso.html`

Como es un sitio sin servidor de renderizado, `curso.html` carga los
datos del curso con JavaScript después de leer el `slug` de la URL
(`?slug=nombre-del-curso`) y ahí completa el `<title>`, la meta
`description`, Open Graph y el JSON-LD de tipo `Course`. Los buscadores
modernos (Google) ejecutan JavaScript y lo indexan correctamente, pero si
en el futuro necesitás SEO server-side "puro" (por ejemplo, para que
WhatsApp o Facebook muestren la imagen correcta al compartir, ya que
esas plataformas no ejecutan JS), la solución sería pasar esta página
a un framework con renderizado en servidor (como Next.js) o generar un
`.html` estático por curso en el momento de crear/editar desde el admin.
