// ==============================================================
// FORMAR CAPACITACIONES — Datos legales y lógica de las páginas
// legales (terminos.html, privacidad.html, arrepentimiento.html)
// ==============================================================

/**
 * ⚠️ COMPLETAR CON LOS DATOS REALES DEL TITULAR DEL SITIO.
 * Mientras un valor empiece con "[COMPLETAR", se muestra resaltado
 * en amarillo en las páginas legales para que sea fácil detectarlo.
 */
const DATOS_LEGALES = {
  razonSocial: "[COMPLETAR: razón social o nombre y apellido del titular]",
  cuit: "[COMPLETAR: CUIT]",
  domicilio: "Alberdi 615, Salta Capital, Provincia de Salta, Argentina",
  email: "[COMPLETAR: email de contacto]",
  whatsappVisible: "+54 9 387 623-6285",
  whatsapp: "5493876236285", // solo dígitos, con código de país
  // Plazo de acceso al contenido online una vez terminado el curso
  plazoAcceso: "[COMPLETAR: por ejemplo, 12 meses desde la inscripción]",
  ultimaActualizacion: "14 de octubre de 2026",
};

function isPlaceholder(value) {
  return typeof value === "string" && value.startsWith("[COMPLETAR");
}

/** Rellena todos los <span data-legal="clave"> con DATOS_LEGALES[clave]. */
function fillLegalData() {
  document.querySelectorAll("[data-legal]").forEach((el) => {
    const value = DATOS_LEGALES[el.dataset.legal];
    if (value === undefined) return;
    el.textContent = value;
    el.classList.toggle("legal-placeholder", isPlaceholder(value));
  });
  document.querySelectorAll("[data-legal-mailto]").forEach((el) => {
    if (isPlaceholder(DATOS_LEGALES.email)) return;
    el.setAttribute("href", `mailto:${DATOS_LEGALES.email}`);
  });
  const year = document.getElementById("footer-year");
  if (year) year.textContent = new Date().getFullYear();
}

/** Menú mobile (mismo comportamiento que el resto del sitio). */
function initNavToggle() {
  const toggle = document.getElementById("nav-toggle");
  const nav = document.getElementById("main-nav");
  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("mobile-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
    nav.style.display = isOpen ? "flex" : "";
    nav.style.flexDirection = isOpen ? "column" : "";
    nav.style.position = isOpen ? "absolute" : "";
    nav.style.top = isOpen ? "100%" : "";
    nav.style.left = "0";
    nav.style.right = "0";
    nav.style.background = isOpen ? "#ffffff" : "";
    nav.style.padding = isOpen ? "1.25rem 1.5rem" : "";
    nav.style.boxShadow = isOpen ? "0 16px 30px -16px rgba(16,46,58,0.3)" : "";
    nav.style.gap = isOpen ? "1rem" : "";
  });
}

/**
 * Formulario de arrepentimiento / baja: arma un mensaje con los datos
 * cargados y lo envía por WhatsApp o por email (no se guarda nada en
 * el sitio). FORMAR debe responder con un código de identificación de
 * la solicitud dentro de las 24 horas (Res. 424/2020).
 */
function initArrepentimientoForm() {
  const form = document.getElementById("arrepentimiento-form");
  if (!form) return;

  const errorEl = document.getElementById("arrepentimiento-error");
  const emailBtn = document.getElementById("arrepentimiento-email");
  if (isPlaceholder(DATOS_LEGALES.email)) emailBtn.classList.add("hidden");

  function buildMessage() {
    if (!form.reportValidity()) return null;
    const data = new FormData(form);
    const tipo = data.get("tipo") === "baja" ? "BAJA DEL SERVICIO" : "ARREPENTIMIENTO (revocación de la compra)";
    return [
      `Solicitud de ${tipo} — Formar Capacitaciones`,
      "",
      `Nombre y apellido: ${data.get("nombre")}`,
      `DNI: ${data.get("dni")}`,
      `Email: ${data.get("email")}`,
      `Teléfono: ${data.get("telefono") || "-"}`,
      `Curso: ${data.get("curso")}`,
      `Fecha de inscripción / pago: ${data.get("fecha")}`,
      `Medio de pago: ${data.get("medio") || "-"}`,
      `Comentarios: ${data.get("comentario") || "-"}`,
      "",
      "Solicito el código de identificación de esta solicitud.",
    ].join("\n");
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const message = buildMessage();
    if (!message) return;
    errorEl.textContent = "";
    window.open(`https://wa.me/${DATOS_LEGALES.whatsapp}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  });

  emailBtn.addEventListener("click", () => {
    const message = buildMessage();
    if (!message) return;
    const subject = encodeURIComponent("Solicitud de arrepentimiento / baja");
    window.location.href = `mailto:${DATOS_LEGALES.email}?subject=${subject}&body=${encodeURIComponent(message)}`;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  fillLegalData();
  initNavToggle();
  initArrepentimientoForm();
});
