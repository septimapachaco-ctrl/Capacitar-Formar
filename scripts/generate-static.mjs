#!/usr/bin/env node
// ==============================================================
// FORMAR CAPACITACIONES — Generador de HTML estático
// ==============================================================
// Se conecta a Supabase (misma clave pública de lectura que usa el
// sitio en el navegador) y escribe, ANTES de publicar, el HTML final
// con el contenido real ya adentro:
//
//   - cursos.html: la lista completa de cursos queda escrita en el
//     HTML (el buscador/filtro de esa página sigue funcionando con
//     JavaScript, pero filtra algo que ya está en el DOM).
//   - cursos/<slug>/index.html: una página estática por curso, con
//     título, descripción, precio, modalidad y JSON-LD ya en el HTML
//     (no detrás de un fetch), en una ruta limpia.
//   - sitemap.xml y llms.txt: se regeneran con la lista real de
//     cursos activos, para buscadores tradicionales y motores de IA
//     (GEO).
//
// Se ejecuta con: node scripts/generate-static.mjs
// No requiere dependencias externas (usa fetch nativo de Node 18+).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SUPABASE_URL = "https://vwgwjhbkchzcawfohimu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_okikSztE3beBxMI6rpTgXg_s3h5tmh_";
const SITE_URL = "https://formarcapacitaciones.com";
const WHATSAPP_NUMBER = "5493876236285";

// --------------------------------------------------------------
// Utilidades (equivalentes a las del navegador, sin DOM)
// --------------------------------------------------------------

function escapeHtml(str) {
  return (str ?? "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatARS(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function whatsappLink(number, message) {
  const cleanNumber = (number || "").replace(/\D/g, "");
  const text = encodeURIComponent(message || "Hola, quiero más información");
  return `https://wa.me/${cleanNumber}?text=${text}`;
}

function priceDisplay(course, showPrices) {
  if (!showPrices) return `<span class="price-placeholder">$0000</span>`;
  return course.price > 0 ? formatARS(course.price) : "Consultar";
}

const WHATSAPP_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2Zm5.8 14.07c-.24.68-1.4 1.32-1.93 1.4-.5.08-1.12.11-1.81-.11-.42-.13-.95-.3-1.64-.6-2.88-1.24-4.76-4.15-4.9-4.34-.14-.19-1.17-1.56-1.17-2.98 0-1.42.74-2.11 1.01-2.4.26-.29.57-.36.76-.36.19 0 .38 0 .55.01.18.01.41-.07.64.49.24.58.81 2 .88 2.15.07.15.12.32.02.51-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.28.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.22 1.37.28.14.44.12.61-.07.16-.19.7-.81.88-1.09.19-.28.37-.23.62-.14.26.09 1.63.77 1.91.91.28.14.47.21.53.33.07.12.07.68-.17 1.36Z"/></svg>`;
const CHECK_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>`;

async function supabaseSelect(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase ${table} respondió ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function fetchData() {
  const [categories, courses, siteContentRows] = await Promise.all([
    supabaseSelect("categories", "select=*&order=name.asc"),
    supabaseSelect(
      "courses",
      "select=*,categories(id,name,slug)&active=eq.true&order=featured.desc,created_at.desc"
    ),
    supabaseSelect("site_content", "select=data&id=eq.1"),
  ]);
  const showPrices = !!siteContentRows?.[0]?.data?.show_prices;
  return { categories, courses, showPrices };
}

// --------------------------------------------------------------
// Fragmentos HTML (misma estructura que renderiza el JS del navegador)
// --------------------------------------------------------------

function renderCategoryFilters(categories) {
  const chips = [
    `<button class="filter-chip active" data-cat="todas">Todas</button>`,
    ...categories.map(
      (cat) => `<button class="filter-chip" data-cat="${escapeHtml(cat.id)}">${escapeHtml(cat.name)}</button>`
    ),
  ];
  return chips.join("");
}

function renderCourseCardWide(course, i, showPrices) {
  const message = `Hola, quiero más información sobre el curso "${course.title}"`;
  return `
      <article class="course-card-wide reveal reveal-delay-${(i % 4) + 1}">
        <div class="course-card-wide-media">
          ${course.image_url ? `<img src="${escapeHtml(course.image_url)}" alt="${escapeHtml(course.title)}" loading="lazy" />` : ""}
          ${course.featured ? `<span class="badge-featured"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.8L5.7 21l1.7-7-5.4-4.7 7.1-.6L12 2z"/></svg>Destacado</span>` : ""}
        </div>
        <div class="course-card-wide-body">
          <span class="course-category">${escapeHtml(course.categories?.name || "Curso")}</span>
          <h3 style="font-size:1.3rem;">${escapeHtml(course.title)}</h3>
          <p class="desc-full">${escapeHtml(course.description || course.short_description || "")}</p>
          <div class="course-card-wide-tags">
            <span class="pill">${escapeHtml(course.modality)}</span>
            ${course.duration ? `<span class="pill">⏱ ${escapeHtml(course.duration)}</span>` : ""}
            ${course.location ? `<span class="pill">📍 ${escapeHtml(course.location)}</span>` : ""}
          </div>
          <div class="course-card-wide-footer">
            <span class="price">${priceDisplay(course, showPrices)}</span>
            <div class="course-card-wide-actions">
              <a href="/cursos/${encodeURIComponent(course.slug)}/" class="btn btn-outline btn-sm">Ver detalle completo</a>
              <a href="${whatsappLink(course.whatsapp_number || WHATSAPP_NUMBER, message)}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp btn-sm">${WHATSAPP_ICON} Consultar</a>
            </div>
          </div>
        </div>
      </article>`;
}

function renderCourseDetail(course, related, showPrices) {
  const message = `Hola, quiero más información sobre el curso "${course.title}"`;
  return `
    <article class="container course-detail">
      <div>
        <div class="course-hero-media">
          ${course.image_url ? `<img src="${escapeHtml(course.image_url)}" alt="${escapeHtml(course.title)}" />` : ""}
        </div>

        <div class="tag-row">
          ${course.categories?.name ? `<span class="tag tag-category">${escapeHtml(course.categories.name)}</span>` : ""}
          <span class="tag tag-modality">${escapeHtml(course.modality)}</span>
          ${course.duration ? `<span class="tag tag-duration">Duración: ${escapeHtml(course.duration)}</span>` : ""}
        </div>

        <h1>${escapeHtml(course.title)}</h1>
        ${course.location ? `<p class="course-location">📍 ${escapeHtml(course.location)}</p>` : ""}

        <p class="course-description">${escapeHtml(course.description)}</p>

        ${
          /asincr/i.test(course.modality || "")
            ? `<div class="video-wrap">
                <h2>¿Cómo se cursa?</h2>
                <p class="course-description">Este curso es <strong>online asincrónico</strong>: accedés al contenido y avanzás según tus tiempos, sin depender de un horario fijo de conexión. Podés estudiar desde donde estés, en el momento que puedas.</p>
              </div>`
            : ""
        }

        ${
          course.video_url
            ? `<div class="video-wrap">
                <h2>Video explicativo</h2>
                <div class="video-frame">
                  <iframe src="${escapeHtml(course.video_url)}" title="Video explicativo de ${escapeHtml(course.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                </div>
              </div>`
            : ""
        }

        ${
          related.length > 0
            ? `<div class="related-courses">
                <h2>Otros cursos que te pueden interesar</h2>
                <div class="related-grid">
                  ${related
                    .map(
                      (r) => `
                    <a href="/cursos/${encodeURIComponent(r.slug)}/" class="related-card">
                      <h4>${escapeHtml(r.title)}</h4>
                      <p>${escapeHtml(r.modality)}</p>
                    </a>`
                    )
                    .join("")}
                </div>
              </div>`
            : ""
        }
      </div>

      <aside class="sidebar-card">
        <span class="label">Inversión</span>
        <p class="price">${priceDisplay(course, showPrices)}</p>
        <p class="modality-line">Modalidad: <strong>${escapeHtml(course.modality)}</strong></p>

        <a href="${whatsappLink(course.whatsapp_number || WHATSAPP_NUMBER, message)}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp btn-block">
          ${WHATSAPP_ICON} Consultar por WhatsApp
        </a>
        <a href="https://instagram.com/formar.capacitaciones" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-block">
          Consultar por Instagram
        </a>

        <ul class="checklist">
          <li>${CHECK_ICON}<span>Certificado con validez nacional e internacional</span></li>
          <li>${CHECK_ICON}<span>Acompañamiento docente durante todo el cursado</span></li>
          <li>${CHECK_ICON}<span>Inscripción 100% online</span></li>
        </ul>
      </aside>
    </article>
  `;
}

// --------------------------------------------------------------
// Helpers de reemplazo en archivos HTML/texto existentes
// --------------------------------------------------------------

function replaceBetweenMarkers(html, marker, content) {
  const start = `<!-- STATIC:${marker} -->`;
  const end = `<!-- /STATIC:${marker} -->`;
  const re = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`);
  if (!re.test(html)) {
    throw new Error(`No se encontraron los marcadores STATIC:${marker} en el HTML`);
  }
  return html.replace(re, `${start}${content}${end}`);
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function setAttr(html, id, attr, value) {
  const re = new RegExp(`(id="${id}"[^>]*\\s${attr}=")[^"]*(")`);
  if (!re.test(html)) throw new Error(`No se encontró id="${id}" con atributo ${attr}`);
  return html.replace(re, `$1${value.replace(/\$/g, "$$$$")}$2`);
}

function setText(html, id, text) {
  const re = new RegExp(`(id="${id}"[^>]*>)[^<]*(</[a-zA-Z0-9]+>)`);
  if (!re.test(html)) throw new Error(`No se encontró id="${id}" para reemplazar texto`);
  return html.replace(re, `$1${text.replace(/\$/g, "$$$$")}$2`);
}

function setScriptJson(html, id, obj) {
  const re = new RegExp(`(<script[^>]*id="${id}"[^>]*>)[\\s\\S]*?(</script>)`);
  if (!re.test(html)) throw new Error(`No se encontró script#${id}`);
  return html.replace(re, `$1${JSON.stringify(obj).replace(/\$/g, "$$$$")}$2`);
}

/**
 * Reescribe las rutas relativas de una plantilla que vivía en la raíz
 * del sitio (curso.html) para que sigan funcionando dos niveles más
 * abajo, en cursos/<slug>/index.html.
 */
function fixRelativePathsForNestedPage(html) {
  return html
    .replace(/href="formarsinfondo\.png"/g, 'href="/formarsinfondo.png"')
    .replace(/href="styles-common\.css"/g, 'href="/styles-common.css"')
    .replace(/href="styles-inner\.css"/g, 'href="/styles-inner.css"')
    .replace(/href="index\.html/g, 'href="/index.html')
    .replace(/href="cursos\.html"/g, 'href="/cursos.html"')
    .replace(/href="admin\.html"/g, 'href="/admin.html"')
    .replace(/src="https:\/\/i\.ibb\.co/g, 'src="https://i.ibb.co'); // no-op, deja absolutas intactas
}

// --------------------------------------------------------------
// Generadores por página
// --------------------------------------------------------------

async function generateCursosListado(courses, categories, showPrices) {
  const filePath = path.join(ROOT, "cursos.html");
  let html = await readFile(filePath, "utf8");

  html = replaceBetweenMarkers(html, "FILTERS", renderCategoryFilters(categories));
  html = replaceBetweenMarkers(
    html,
    "COURSES",
    courses.map((c, i) => renderCourseCardWide(c, i, showPrices)).join("")
  );

  await writeFile(filePath, html, "utf8");
  console.log(`✔ cursos.html regenerado con ${courses.length} cursos`);
}

async function generateCourseDetailPage(templateHtml, course, related, showPrices) {
  const slug = course.slug;
  const isAsync = /asincr/i.test(course.modality || "");
  const title = isAsync
    ? `${course.title} | Curso online asincrónico con certificación`
    : `${course.title} | Curso con validez nacional`;
  const description =
    course.short_description ||
    (isAsync
      ? `Formate en ${course.title} de forma online asincrónica: estudiá desde donde quieras, en el momento que puedas. Certificación con validez nacional e internacional.`
      : `Formate en ${course.title} con Formar Capacitaciones. Modalidad ${course.modality}. Certificación con validez nacional e internacional.`);
  const url = `${SITE_URL}/cursos/${encodeURIComponent(slug)}/`;
  const image = course.image_url || "https://i.ibb.co/sv8S8Gmr/logo-poster.jpg";

  let html = templateHtml;
  html = html.replace(/<title id="page-title">[^<]*<\/title>/, `<title id="page-title">${escapeHtml(title)}</title>`);
  html = setAttr(html, "meta-description", "content", description);
  html = setAttr(html, "canonical-link", "href", url);
  html = setAttr(html, "og-title", "content", title);
  html = setAttr(html, "og-description", "content", description);
  html = setAttr(html, "og-image", "content", image);
  html = setAttr(html, "twitter-title", "content", title);
  html = setAttr(html, "twitter-description", "content", description);
  html = setAttr(html, "twitter-image", "content", image);
  html = setText(html, "breadcrumb-current", escapeHtml(course.title));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    description: course.description,
    provider: {
      "@type": "Organization",
      name: "Formar Capacitaciones",
      sameAs: "https://instagram.com/formar.capacitaciones",
      url: SITE_URL,
    },
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: course.modality,
      location: course.location || "Argentina",
    },
    educationalCredentialAwarded: "Certificado con validez nacional e internacional",
    inLanguage: "es-AR",
    areaServed: ["Salta", "Córdoba", "Argentina"],
  };
  html = setScriptJson(html, "course-jsonld", jsonLd);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Cursos", item: `${SITE_URL}/cursos.html` },
      { "@type": "ListItem", position: 3, name: course.title, item: url },
    ],
  };
  html = setScriptJson(html, "breadcrumb-jsonld", breadcrumbJsonLd);

  const detailHtml = renderCourseDetail(course, related, showPrices);
  html = html.replace(
    /<div id="course-content">[\s\S]*?<\/div>\s*\n\s*<!-- Contenido mínimo/,
    `<div id="course-content">${detailHtml}</div>\n\n  <!-- Contenido mínimo`
  );

  html = fixRelativePathsForNestedPage(html);

  const outDir = path.join(ROOT, "cursos", slug);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "index.html"), html, "utf8");
}

async function generateAllCourseDetailPages(courses, showPrices) {
  const templateHtml = await readFile(path.join(ROOT, "curso.html"), "utf8");
  for (const course of courses) {
    const related = courses
      .filter((c) => c.category_id && c.category_id === course.category_id && c.id !== course.id)
      .slice(0, 3);
    await generateCourseDetailPage(templateHtml, course, related, showPrices);
  }
  console.log(`✔ ${courses.length} páginas estáticas generadas en cursos/<slug>/index.html`);
}

async function generateSitemap(courses) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${SITE_URL}/`, changefreq: "weekly", priority: "1.0" },
    { loc: `${SITE_URL}/cursos.html`, changefreq: "weekly", priority: "0.9" },
    ...courses.map((c) => ({
      loc: `${SITE_URL}/cursos/${encodeURIComponent(c.slug)}/`,
      lastmod: (c.updated_at || c.created_at || today).slice(0, 10),
      changefreq: "monthly",
      priority: "0.8",
    })),
    { loc: `${SITE_URL}/gracias.html`, changefreq: "monthly", priority: "0.5" },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
${u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : ""}    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;
  await writeFile(path.join(ROOT, "sitemap.xml"), xml, "utf8");
  console.log("✔ sitemap.xml regenerado");
}

async function generateLlmsTxt(courses) {
  const filePath = path.join(ROOT, "llms.txt");
  let txt = await readFile(filePath, "utf8");

  const listBlock = courses
    .map((c) => {
      const desc = c.short_description || c.description || "";
      const extra = c.duration ? ` Duración ${c.duration}.` : "";
      return `- [${c.title}](${SITE_URL}/cursos/${encodeURIComponent(c.slug)}/): ${desc}${extra}`;
    })
    .join("\n");

  txt = txt.replace(/## Cursos disponibles\n\n[\s\S]*?\n\n(La oferta)/, `## Cursos disponibles\n\n${listBlock}\n\n$1`);

  await writeFile(filePath, txt, "utf8");
  console.log("✔ llms.txt actualizado con los cursos activos (GEO)");
}

async function main() {
  console.log("Conectando a Supabase para generar el sitio estático...");
  const { categories, courses, showPrices } = await fetchData();
  console.log(`Encontrados ${courses.length} cursos activos y ${categories.length} categorías.`);

  await generateCursosListado(courses, categories, showPrices);
  await generateAllCourseDetailPages(courses, showPrices);
  await generateSitemap(courses);
  await generateLlmsTxt(courses);

  console.log("Listo. Revisá los cambios con `git status` antes de publicar.");
}

main().catch((err) => {
  console.error("✖ Error generando el sitio estático:", err);
  process.exit(1);
});
