// ==============================================================
// FORMAR CAPACITACIONES — Lógica compartida del catálogo de cursos
// ==============================================================
// Funciones puras (sin DOM) que usan tanto las páginas del sitio
// (index.html, cursos.html, curso.html, 404.html) como el generador
// estático (scripts/generate-static.mjs). Así el buscador, los filtros,
// los cursos relacionados y los datos estructurados (Schema.org) se
// comportan igual en el navegador y en el HTML pre-renderizado.

export const SITE_URL = "https://formarcapacitaciones.com";
export const ORG_ID = `${SITE_URL}/#organization`;
export const ORG_NAME = "Formar Capacitaciones";
export const ORG_LOGO = `${SITE_URL}/formarsinfondo.png`;
export const ORG_SAME_AS = ["https://instagram.com/formar.capacitaciones"];

export function normalizeSearch(str) {
  return (str ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function courseUrl(course) {
  return `${SITE_URL}/cursos/${encodeURIComponent(course.slug)}/`;
}

// --------------------------------------------------------------
// Categorías
// --------------------------------------------------------------
// Si una categoría se borra desde /admin, Supabase deja el curso con
// category_id = null ("on delete set null") y el curso desaparece de
// los filtros. Para no depender de que el administrador lo re-asigne
// a mano, cada curso sin categoría se clasifica automáticamente por
// palabras clave de su título (o de su descripción corta). Un curso
// también aparece en las categorías afines aunque tenga otra asignada
// (ej: "Auxiliar en Criminalística" está en "Seguridad y Peritaje" y
// también se encuentra filtrando por "Criminología y Criminalística").

const CATEGORY_KEYWORDS = {
  "educacion": ["precept", "pedagog", "docen", "educa", "maestr", "profesor", "ensen", "tutor"],
  "oficios-y-formacion-laboral": ["electric", "plomer", "gasist", "sanitari", "soldad", "carpinter", "albanil", "construcc", "mecanic", "refrigera", "oficio", "herreri", "pintur"],
  "veterinaria-y-cuidado-animal": ["veterinar", "animal", "mascota", "canin", "felin"],
  "criminologia-y-criminalistica": ["criminal", "criminolog", "forense"],
  "seguridad-y-peritaje": ["segurid", "perit", "vigilan", "higiene y seguridad"],
  "administracion-y-gestion": ["administra", "gestion", "contab", "secretari", "recursos humanos", "rrhh", "liquidacion"],
  "psicologia": ["psicolog", "acompanante terapeutic", "psicopedagog"],
  "salud-y-bienestar": ["salud", "enfermer", "farmac", "primeros auxilios", "geriatr", "gerontolog", "nutric", "cuidador"],
  "deporte-y-actividad-fisica": ["deport", "entrenad", "fitness", "gimnas", "actividad fisica", "personal trainer"],
  "tecnologia-y-competencias-digitales": ["informat", "programac", "digital", "computac", "excel", "marketing", "redes sociales", "software"],
  "agro-y-produccion": ["agro", "agricol", "ganad", "apicult", "huerta"],
};

function matchCategorySlugs(text) {
  const t = normalizeSearch(text);
  if (!t) return [];
  return Object.entries(CATEGORY_KEYWORDS)
    .filter(([, keywords]) => keywords.some((k) => t.includes(k)))
    .map(([slug]) => slug);
}

/**
 * Devuelve una copia de los cursos con:
 *  - category_ids: todas las categorías en las que el curso debe
 *    aparecer (la asignada + las deducidas por palabras clave).
 *  - category_id / categories: si el curso no tenía categoría, se
 *    completa con la deducida, para que se muestre la etiqueta.
 */
export function assignCategories(courses, categories) {
  const byId = new Map((categories ?? []).map((c) => [c.id, c]));
  const bySlug = new Map((categories ?? []).map((c) => [c.slug, c]));

  return (courses ?? []).map((course) => {
    const fromTitle = matchCategorySlugs(course.title);
    const inferred = (fromTitle.length ? fromTitle : matchCategorySlugs(course.short_description))
      .map((slug) => bySlug.get(slug))
      .filter(Boolean);

    const assigned = course.category_id && byId.get(course.category_id);
    const ids = [...new Set([assigned?.id, ...inferred.map((c) => c.id)].filter(Boolean))];
    const primary = assigned || inferred[0] || null;

    return {
      ...course,
      category_id: primary?.id ?? null,
      categories: course.categories || (primary ? { id: primary.id, name: primary.name, slug: primary.slug } : null),
      category_ids: ids,
      category_names: ids.map((id) => byId.get(id)?.name).filter(Boolean),
    };
  });
}

/** Solo las categorías que tienen al menos un curso (evita filtros que muestran "0 cursos"). */
export function categoriesWithCourses(categories, courses) {
  const used = new Set(courses.flatMap((c) => c.category_ids ?? (c.category_id ? [c.category_id] : [])));
  return (categories ?? []).filter((cat) => used.has(cat.id));
}

export function courseInCategory(course, categoryId) {
  return (course.category_ids ?? [course.category_id]).includes(categoryId);
}

// --------------------------------------------------------------
// Búsqueda
// --------------------------------------------------------------
// Busca palabra por palabra (no la frase exacta), ignora acentos y
// palabras vacías, y reconoce variantes de la misma raíz: "electricista"
// encuentra "Electricidad", "plomero" encuentra "Plomería", "docente"
// encuentra "Docencia".

const STOPWORDS = new Set(["de", "del", "la", "las", "el", "los", "en", "y", "e", "o", "para", "por", "con", "un", "una", "a", "al", "curso", "cursos", "capacitacion", "capacitaciones"]);

export function courseMatchesSearch(course, term) {
  const tokens = normalizeSearch(term).split(/[^a-z0-9ñ]+/).filter((w) => w && !STOPWORDS.has(w));
  if (tokens.length === 0) return true;

  const haystack = normalizeSearch(
    [
      course.title,
      course.short_description,
      course.description,
      course.categories?.name,
      ...(course.category_names ?? []),
      course.modality,
      course.location,
    ].join(" ")
  );

  return tokens.every((w) => haystack.includes(w) || (w.length >= 6 && haystack.includes(w.slice(0, 5))));
}

// --------------------------------------------------------------
// Enlazado interno: cursos relacionados
// --------------------------------------------------------------
// Primero los de la misma categoría; si no alcanzan, se completa con
// otros cursos (destacados primero). Así cada página de curso enlaza
// siempre a otros cursos, aunque su categoría tenga uno solo.

export function relatedCourses(course, allCourses, limit = 3) {
  const others = allCourses.filter((c) => c.id !== course.id && c.slug !== course.slug);
  const ids = course.category_ids ?? [course.category_id];
  const sameCat = others.filter((c) => (c.category_ids ?? [c.category_id]).some((id) => id && ids.includes(id)));
  const rest = others
    .filter((c) => !sameCat.includes(c))
    .sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
  return [...sameCat, ...rest].slice(0, limit);
}

// --------------------------------------------------------------
// Datos estructurados (Schema.org / JSON-LD)
// --------------------------------------------------------------

/** "5 meses" → "P5M", "3 semanas" → "P3W", "40 horas" → "PT40H", "1 año" → "P1Y". */
export function durationToISO(text) {
  const m = normalizeSearch(text).match(/(\d+)\s*(hora|hs|dia|semana|mes|ano)/);
  if (!m) return null;
  const n = m[1];
  switch (m[2]) {
    case "hora":
    case "hs":
      return `PT${n}H`;
    case "dia":
      return `P${n}D`;
    case "semana":
      return `P${n}W`;
    case "mes":
      return `P${n}M`;
    case "ano":
      return `P${n}Y`;
    default:
      return null;
  }
}

/** Traduce la modalidad cargada en /admin a los valores que entiende Google. */
export function courseModes(modality) {
  const t = normalizeSearch(modality);
  const online = /online|virtual|asincr|distancia/.test(t);
  const onsite = /presencial/.test(t);
  if (online && onsite) return ["Blended"];
  if (online) return ["Online"];
  if (onsite) return ["Onsite"];
  return [];
}

export function organizationRef() {
  return { "@type": "EducationalOrganization", "@id": ORG_ID, name: ORG_NAME, url: `${SITE_URL}/` };
}

export function buildCourseJsonLd(course, { showPrices = false } = {}) {
  const url = courseUrl(course);
  const duration = durationToISO(course.duration);
  const modes = courseModes(course.modality);
  const onsite = modes.includes("Onsite") || modes.includes("Blended");

  const offer = {
    "@type": "Offer",
    category: "Paid",
    url,
    availability: "https://schema.org/InStock",
  };
  if (showPrices && course.price > 0) {
    offer.price = Number(course.price);
    offer.priceCurrency = "ARS";
  }

  const instance = {
    "@type": "CourseInstance",
    ...(modes.length ? { courseMode: modes[0] } : {}),
    inLanguage: "es",
  };
  if (onsite) {
    instance.location = {
      "@type": "Place",
      name: course.location || "Sede Salta Capital",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Alberdi 615",
        addressLocality: "Salta",
        addressRegion: "Salta",
        addressCountry: "AR",
      },
    };
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    "@id": `${url}#course`,
    url,
    name: course.title,
    description: course.description || course.short_description || course.title,
    ...(course.short_description ? { abstract: course.short_description } : {}),
    ...(course.image_url ? { image: course.image_url } : {}),
    inLanguage: "es",
    provider: organizationRef(),
    publisher: { "@id": ORG_ID },
    ...(course.category_names?.length ? { about: course.category_names.map((name) => ({ "@type": "Thing", name })) } : {}),
    ...(duration ? { timeRequired: duration } : {}),
    educationalCredentialAwarded: {
      "@type": "EducationalOccupationalCredential",
      name: "Certificado con validez nacional e internacional",
      credentialCategory: "certificate",
    },
    isAccessibleForFree: false,
    offers: [offer],
    hasCourseInstance: [instance],
    audience: { "@type": "Audience", geographicArea: { "@type": "Country", name: "Argentina" } },
  };
  return jsonLd;
}

export function buildCourseBreadcrumbJsonLd(course) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Cursos", item: `${SITE_URL}/cursos.html` },
      { "@type": "ListItem", position: 3, name: course.title, item: courseUrl(course) },
    ],
  };
}

/** ItemList para la página de listado (formato "carrusel de cursos" de Google). */
export function buildCourseListJsonLd(courses) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Cursos de Formar Capacitaciones",
    numberOfItems: courses.length,
    itemListElement: courses.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: courseUrl(c),
      name: c.title,
    })),
  };
}
