
-- ============================================================
-- FORMAR CAPACITACIONES - Esquema de Base de Datos (Supabase/PostgreSQL)
-- ============================================================
-- Ejecutar este script completo en el SQL Editor de Supabase.
-- Refleja fielmente la estructura del proyecto en producción
-- (vwgwjhbkchzcawfohimu / formar-capacitaciones) al día de hoy.

-- Extensión necesaria para generar UUIDs
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. TABLA: categories
-- ------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. TABLA: courses
-- ------------------------------------------------------------
create table if not exists public.courses (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  slug          text not null unique,
  description   text not null default '',
  short_description text not null default '',
  price         numeric(12, 2) not null default 0,
  modality      text not null default 'Consultar', -- 'Online asincrónica' | 'Online / virtual (en vivo)' | 'Híbrida (online + presencial)' | 'Presencial' | 'Presencial / Virtual' | 'Consultar'
  image_url     text,
  video_url     text,
  duration      text, -- ej: "6 meses"
  location      text, -- ej: "Salta y Córdoba"
  whatsapp_number text, -- solo dígitos, con código de país. Si es NULL, se usa el WhatsApp general del negocio.
  featured      boolean not null default false,
  active        boolean not null default true,
  category_id   uuid references public.categories(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column public.courses.whatsapp_number is
  'Número de WhatsApp de contacto para este curso (solo dígitos, con código de país). Si es NULL, el sitio usa el WhatsApp general del negocio.';

create index if not exists courses_category_id_idx on public.courses (category_id);
create index if not exists courses_slug_idx on public.courses (slug);
create index if not exists courses_active_idx on public.courses (active);
create index if not exists courses_featured_idx on public.courses (featured);

-- ------------------------------------------------------------
-- 3. FUNCIONES Y TRIGGERS compartidos
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Valida el formato del WhatsApp del curso: solo dígitos, entre 10 y 15
-- caracteres (código de país + número, sin "+" ni espacios).
create or replace function public.validate_course_whatsapp_number()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if new.whatsapp_number is not null and new.whatsapp_number <> '' then
    if new.whatsapp_number !~ '^[0-9]{10,15}$' then
      raise exception 'whatsapp_number inválido: debe contener solo dígitos (10 a 15), con código de país. Valor recibido: %', new.whatsapp_number;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists courses_set_updated_at on public.courses;
create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

drop trigger if exists trg_courses_validate_whatsapp on public.courses;
create trigger trg_courses_validate_whatsapp
  before insert or update on public.courses
  for each row execute function public.validate_course_whatsapp_number();

-- ------------------------------------------------------------
-- 4. TABLA: orders (cabecera de pedido)
-- ------------------------------------------------------------
-- Nota: la tabla "orders"/"order_items" queda del sistema de carrito +
-- Mercado Pago anterior (ya desactivado, ahora el sitio deriva todo a
-- WhatsApp). Se dejan creadas por compatibilidad pero no se usan desde
-- el frontend actual.
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  student_email   text not null,
  student_name    text,
  student_phone   text,
  total           numeric(12, 2) not null default 0,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  mp_payment_id   text,
  mp_preference_id text,
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 5. TABLA: order_items (líneas de pedido)
-- ------------------------------------------------------------
create table if not exists public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  course_id   uuid references public.courses(id) on delete set null,
  title       text not null,
  price       numeric(12, 2) not null default 0,
  quantity    integer not null default 1,
  created_at  timestamptz not null default now()
);

create index if not exists order_items_order_id_idx on public.order_items (order_id);

-- ------------------------------------------------------------
-- 6. TABLA: team_members (equipo / profesionales)
-- ------------------------------------------------------------
create table if not exists public.team_members (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  profession        text not null default '',
  photo_url         text,
  whatsapp          text,   -- solo dígitos, con código de país. Ej: 5493876543210
  whatsapp_message  text,
  bio               text,
  display_order     integer not null default 0,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists team_members_order_idx on public.team_members (display_order);
create index if not exists team_members_active_idx on public.team_members (active);

drop trigger if exists trg_team_members_updated_at on public.team_members;
create trigger trg_team_members_updated_at
  before update on public.team_members
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 7. TABLA: site_settings (config general, tabla de una sola fila)
-- ------------------------------------------------------------
-- Nota: tabla legacy; el contenido editable de la landing que
-- realmente usa el frontend hoy vive en "site_content" (más abajo).
create table if not exists public.site_settings (
  id                smallint primary key default 1 check (id = 1),
  logo_url          text,
  whatsapp_number   text default '',
  hero_title        text not null default 'FORMAR',
  hero_subtitle     text not null default 'Cursos · Capacitaciones',
  show_prices       boolean not null default true,
  price_placeholder text not null default '$0000',
  splash_enabled    boolean not null default true,
  updated_at        timestamptz not null default now()
);

drop trigger if exists trg_site_settings_updated_at on public.site_settings;
create trigger trg_site_settings_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 8. TABLA: site_content (textos editables de la web)
-- ------------------------------------------------------------
-- Guarda en una sola fila (id = 1) todos los textos de la landing que
-- el admin puede editar desde /admin: hero, estadísticas, ventajas,
-- contacto y footer. El frontend lee esta fila al cargar la página.
create table if not exists public.site_content (
  id          smallint primary key default 1 check (id = 1),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_site_content_updated_at on public.site_content;
create trigger trg_site_content_updated_at
  before update on public.site_content
  for each row execute function public.set_updated_at();

-- ============================================================
-- 9. ROW LEVEL SECURITY (RLS)
-- ============================================================
alter table public.categories enable row level security;
alter table public.courses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.team_members enable row level security;
alter table public.site_settings enable row level security;
alter table public.site_content enable row level security;

-- Lectura pública de categorías y cursos activos (para la web pública)
drop policy if exists "categories_public_read" on public.categories;
create policy "categories_public_read"
  on public.categories for select
  using (true);

drop policy if exists "categories_admin_write" on public.categories;
create policy "categories_admin_write"
  on public.categories for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "courses_public_read" on public.courses;
create policy "courses_public_read"
  on public.courses for select
  using (active = true);

drop policy if exists "courses_admin_write" on public.courses;
create policy "courses_admin_write"
  on public.courses for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Cualquiera puede crear una orden y sus items (checkout público),
-- solo admins pueden leer/gestionar.
drop policy if exists "orders_public_insert" on public.orders;
create policy "orders_public_insert"
  on public.orders for insert
  with check (true);

drop policy if exists "orders_admin_read" on public.orders;
create policy "orders_admin_read"
  on public.orders for select
  using (auth.role() = 'authenticated');

drop policy if exists "orders_admin_update" on public.orders;
create policy "orders_admin_update"
  on public.orders for update
  using (auth.role() = 'authenticated');

drop policy if exists "order_items_public_insert" on public.order_items;
create policy "order_items_public_insert"
  on public.order_items for insert
  with check (true);

drop policy if exists "order_items_admin_read" on public.order_items;
create policy "order_items_admin_read"
  on public.order_items for select
  using (auth.role() = 'authenticated');

-- team_members: lectura pública solo de activos, gestión para admins
drop policy if exists "public_read_team_members" on public.team_members;
create policy "public_read_team_members"
  on public.team_members for select
  using (active = true);

drop policy if exists "admin_all_team_members" on public.team_members;
create policy "admin_all_team_members"
  on public.team_members for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- site_settings: lectura pública, alta y edición solo para admins
drop policy if exists "public_read_site_settings" on public.site_settings;
create policy "public_read_site_settings"
  on public.site_settings for select
  using (true);

drop policy if exists "admin_insert_site_settings" on public.site_settings;
create policy "admin_insert_site_settings"
  on public.site_settings for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "admin_update_site_settings" on public.site_settings;
create policy "admin_update_site_settings"
  on public.site_settings for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- site_content: lectura pública (la landing la necesita sin login),
-- edición solo para administradores autenticados.
drop policy if exists "public_read_site_content" on public.site_content;
create policy "public_read_site_content"
  on public.site_content for select
  using (true);

drop policy if exists "admin_write_site_content" on public.site_content;
create policy "admin_write_site_content"
  on public.site_content for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- 10. STORAGE: bucket para imágenes de cursos
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('course-media', 'course-media', true)
on conflict (id) do nothing;

drop policy if exists "course_media_public_read" on storage.objects;
create policy "course_media_public_read"
  on storage.objects for select
  using (bucket_id = 'course-media');

drop policy if exists "course_media_admin_write" on storage.objects;
create policy "course_media_admin_write"
  on storage.objects for insert
  with check (bucket_id = 'course-media' and auth.role() = 'authenticated');

drop policy if exists "course_media_admin_update" on storage.objects;
create policy "course_media_admin_update"
  on storage.objects for update
  using (bucket_id = 'course-media' and auth.role() = 'authenticated');

drop policy if exists "course_media_admin_delete" on storage.objects;
create policy "course_media_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'course-media' and auth.role() = 'authenticated');

-- ============================================================
-- 11. SEMILLA DE DATOS (CATEGORÍAS)
-- ============================================================
insert into public.categories (name, slug) values
  ('Docencia y Educación', 'educacion'),
  ('Salud y Bienestar', 'salud-y-bienestar'),
  ('Veterinaria y Cuidado Animal', 'veterinaria-y-cuidado-animal'),
  ('Seguridad y Peritaje', 'seguridad-y-peritaje'),
  ('Criminología y Criminalística', 'criminologia-y-criminalistica'),
  ('Administración y Gestión', 'administracion-y-gestion'),
  ('Oficios y Formación Laboral', 'oficios-y-formacion-laboral'),
  ('Tecnología y Competencias Digitales', 'tecnologia-y-competencias-digitales'),
  ('Deporte y Actividad Física', 'deporte-y-actividad-fisica'),
  ('Psicología', 'psicologia'),
  ('Agro y Producción', 'agro-y-produccion')
on conflict (slug) do nothing;

-- ============================================================
-- 12. SEMILLA DE DATOS (CURSOS)
-- ============================================================
insert into public.courses
  (title, slug, description, short_description, price, modality, image_url, video_url, duration, location, featured, active, category_id)
values
(
  'Preceptores',
  'preceptores',
  'Formate como Preceptor/a y sumate a uno de los roles más demandados dentro de las instituciones educativas. Aprenderás normativa escolar, convivencia institucional, acompañamiento a estudiantes, documentación y gestión administrativa del aula. Curso con salida laboral inmediata en escuelas públicas y privadas de todo el país.',
  'Formación integral para desempeñarte como preceptor en instituciones educativas públicas y privadas.',
  45000,
  'Presencial / Virtual',
  'https://images.unsplash.com/photo-1580582932707-520aed937b7b?q=80&w=1200',
  null,
  '4 meses',
  'Salta, Córdoba y modalidad virtual para todo el país',
  true,
  true,
  null
),
(
  'Auxiliar Veterinario',
  'auxiliar-veterinario',
  'Capacitate en el cuidado, manejo y asistencia de animales de compañía y de granja. El curso incluye nociones de anatomía animal, primeros auxilios veterinarios, asistencia en consultorio y quirófano, higiene y bioseguridad. Ideal para quienes buscan trabajar en clínicas veterinarias, petshops o criaderos.',
  'Asistencia clínica y cuidado animal para insertarte en el ámbito veterinario.',
  50000,
  'Consultar',
  'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?q=80&w=1200',
  null,
  '6 meses',
  'Consultar sede y modalidad',
  false,
  true,
  null
),
(
  'Auxiliar en Criminalística',
  'auxiliar-en-criminalistica',
  'Aprendé las técnicas fundamentales de investigación de la escena del crimen: recolección y preservación de indicios, cadena de custodia, fotografía forense y elaboración de informes periciales. Un curso pensado para quienes se interesan por el ámbito forense y la investigación científica del delito.',
  'Técnicas de investigación forense, preservación de indicios y cadena de custodia.',
  48000,
  'Presencial / Virtual',
  'https://images.unsplash.com/photo-1589994965851-a8f479c573a4?q=80&w=1200',
  null,
  '5 meses',
  'Salta, Córdoba y modalidad virtual para todo el país',
  true,
  true,
  (select id from public.categories where slug = 'seguridad-y-peritaje')
),
(
  'Auxiliar en Criminología',
  'auxiliar-en-criminologia',
  'Estudiá las causas del comportamiento delictivo desde una mirada científica e interdisciplinaria. El curso aborda criminogénesis, victimología, prevención del delito y análisis social del crimen, brindando herramientas para trabajar junto a equipos de seguridad, justicia y organismos públicos.',
  'Análisis científico del delito, victimología y prevención desde una mirada interdisciplinaria.',
  48000,
  'Presencial / Virtual',
  'https://images.unsplash.com/photo-1453873531674-2151bcd01707?q=80&w=1200',
  null,
  '5 meses',
  'Salta, Córdoba y modalidad virtual para todo el país',
  false,
  true,
  (select id from public.categories where slug = 'seguridad-y-peritaje')
),
(
  'Administración',
  'administracion',
  'Formación integral en gestión administrativa: manejo de documentación, atención al público, herramientas ofimáticas, liquidación de sueldos y nociones contables básicas. Un curso versátil que te prepara para desempeñarte en oficinas públicas, privadas, pymes y emprendimientos propios.',
  'Gestión administrativa, atención al público y herramientas de oficina para el mundo laboral actual.',
  40000,
  'Consultar',
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?q=80&w=1200',
  null,
  '4 meses',
  'Consultar sede y modalidad',
  false,
  true,
  (select id from public.categories where slug = 'administracion-y-gestion')
),
(
  'Electricidad',
  'electricidad',
  'Aprendé instalaciones eléctricas domiciliarias e industriales de forma segura y práctica. El curso cubre normativa vigente, lectura de planos, tableros, protecciones y mantenimiento eléctrico, con fuerte enfoque en la práctica en taller para que salgas preparado para trabajar desde el primer día.',
  'Instalaciones eléctricas domiciliarias e industriales con práctica intensiva en taller.',
  52000,
  'Presencial',
  'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=1200',
  null,
  '5 meses',
  'Salta',
  true,
  true,
  null
),
(
  'Plomería',
  'plomeria',
  'Capacitate en instalaciones sanitarias, agua, gas y desagües. Un oficio con altísima demanda laboral en todo el país. Trabajarás con herramientas reales en taller, aprendiendo desde lo básico hasta reparaciones e instalaciones completas en obra nueva y remodelaciones.',
  'Instalaciones sanitarias, de agua y gas con práctica real en taller.',
  52000,
  'Presencial',
  'https://images.unsplash.com/photo-1607472829760-6f0e4a4f1f1e?q=80&w=1200',
  null,
  '5 meses',
  'Salta',
  false,
  true,
  null
),
(
  'Capacitación Pedagógica para Técnicos Profesionales',
  'capacitacion-pedagogica-para-tecnicos-profesionales',
  'Programa especialmente diseñado para técnicos y profesionales que quieren dar el salto a la docencia. Trabajarás didáctica, planificación de clases, evaluación y herramientas pedagógicas aplicadas a la enseñanza técnica, cumpliendo con los requisitos exigidos para ejercer en instituciones educativas.',
  'Herramientas pedagógicas y didácticas para que técnicos y profesionales puedan enseñar su oficio.',
  46000,
  'Presencial en Salta y Córdoba / Online',
  'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=1200',
  null,
  '3 meses',
  'Salta, Córdoba y modalidad online',
  true,
  true,
  null
)
on conflict (slug) do nothing;

-- ============================================================
-- 13. SEMILLA DE DATOS (CONTENIDO EDITABLE DE LA WEB)
-- ============================================================
insert into public.site_content (id, data) values (
  1,
  '{
    "logo_url": "formarsinfondo.png",
    "show_prices": false,
    "hero_badge": "Cursos online asincrónicos · Todo el país",
    "hero_title": "Capacitate desde donde quieras, en el momento que puedas",
    "hero_lead": "Cursos y capacitaciones online asincrónicas con certificación de validez nacional e internacional, pensadas para estudiantes, trabajadores y profesionales que quieren avanzar sin depender de horarios fijos. También contamos con propuestas presenciales en Salta Capital.",
    "stat_1_value": 8, "stat_1_suffix": "+", "stat_1_label": "Cursos activos",
    "stat_2_value": 100, "stat_2_suffix": "%", "stat_2_label": "Validez nacional",
    "stat_3_value": 2, "stat_3_suffix": "", "stat_3_label": "Modalidades",
    "advantage_1_title": "Certificación con validez nacional",
    "advantage_1_text": "Nuestros certificados tienen reconocimiento nacional e internacional, avalando tu formación ante cualquier empleador.",
    "advantage_2_title": "Online asincrónica: estudiá cuando puedas",
    "advantage_2_text": "Accedé al contenido y avanzá a tu ritmo, sin depender de un horario fijo de conexión. Ideal si trabajás, estudiás o vivís lejos. También tenemos propuestas presenciales en Salta Capital.",
    "advantage_3_title": "Formación orientada al mundo laboral",
    "advantage_3_text": "Diseñamos cada curso pensando en las demandas actuales del mercado laboral argentino, con contenido 100% práctico.",
    "advantage_4_title": "Acompañamiento personalizado",
    "advantage_4_text": "Docentes y tutores disponibles durante todo el cursado para resolver tus dudas y acompañar tu proceso de aprendizaje.",
    "contact_title": "¿Tenés dudas? Hablemos",
    "contact_text": "Nuestro equipo te asesora sin costo sobre el curso que mejor se adapta a tu perfil, tus tiempos y tus objetivos.",
    "instagram_handle": "@formar.capacitaciones",
    "instagram_url": "https://instagram.com/formar.capacitaciones",
    "footer_text": "Cursos y capacitaciones online asincrónicas con validez nacional e internacional. También en Salta Capital, de forma presencial."
  }'::jsonb
)
on conflict (id) do nothing;

-- ============================================================
-- 14. SEMILLA DE DATOS (CONFIGURACIÓN GENERAL - legacy)
-- ============================================================
insert into public.site_settings (id, logo_url, whatsapp_number, hero_title, hero_subtitle, show_prices, price_placeholder, splash_enabled)
values (1, 'https://i.ibb.co/LDXsp8FF/Formar-posts.png', '', 'FORMAR', 'Cursos · Capacitaciones', true, '$0000', true)
on conflict (id) do nothing;

-- ============================================================
-- 15. SEMILLA DE DATOS (EQUIPO / PROFESIONALES)
-- ============================================================
insert into public.team_members (name, profession, photo_url, whatsapp, whatsapp_message, display_order) values
(
  'Lic. Tania Simkin',
  'Directora',
  'https://i.ibb.co/DHVQFYWR/Lic-Tania-Simkin-Directora.jpg',
  '5493491530328',
  null,
  1
),
(
  'Cra. Sol Camila Montenegro Trogliero',
  'Vicedirectora',
  'https://i.ibb.co/gLMMKntm/Contadora-Sol-Camila-Montenegro-Trogliero-Vivedirectora.jpg',
  '5493876236285',
  null,
  2
),
(
  'Lic. Dalia Korman',
  'Coordinadora Pedagógica',
  'https://i.ibb.co/k29Dpdhb/Lic-Dalia-Korman-Coordinadora.jpg',
  '5493876054669',
  null,
  3
),
(
  'Lic. Damián Simkin',
  'RRHH',
  'https://i.ibb.co/kgzZZQ04/Lic-Dami-n-Simkin-RRHH.jpg',
  '5493874537157',
  null,
  4
)
on conflict do nothing;
