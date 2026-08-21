-- ============================================================
-- FORMAR CAPACITACIONES - Esquema de Base de Datos (Supabase/PostgreSQL)
-- ============================================================
-- Ejecutar este script completo en el SQL Editor de Supabase.

-- Extensión necesaria para generar UUIDs
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. TABLA: categories
-- ------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
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
  modality      text not null default 'Consultar', -- 'Presencial' | 'Virtual' | 'Presencial / Virtual' | 'Online' | 'Consultar'
  image_url     text,
  video_url     text,
  duration      text, -- ej: "6 meses"
  location      text, -- ej: "Salta y Córdoba"
  featured      boolean not null default false,
  active        boolean not null default true,
  category_id   uuid references public.categories(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists courses_category_id_idx on public.courses (category_id);
create index if not exists courses_slug_idx on public.courses (slug);
create index if not exists courses_active_idx on public.courses (active);

-- ------------------------------------------------------------
-- 3. TABLA: orders
-- ------------------------------------------------------------
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  student_email   text not null,
  student_name    text,
  student_phone   text,
  items           jsonb not null default '[]'::jsonb, -- [{course_id, title, price, quantity}]
  total           numeric(12, 2) not null default 0,
  status          text not null default 'pending', -- 'pending' | 'approved' | 'rejected' | 'cancelled'
  mp_payment_id   text,
  mp_preference_id text,
  created_at      timestamptz not null default now()
);

create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_email_idx on public.orders (student_email);

-- ------------------------------------------------------------
-- 4. TRIGGER: actualizar updated_at en courses
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_courses_updated_at on public.courses;
create trigger trg_courses_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.courses enable row level security;
alter table public.orders enable row level security;

-- Lectura pública de categorías y cursos activos (para la web pública)
drop policy if exists "public_read_categories" on public.categories;
create policy "public_read_categories"
  on public.categories for select
  using (true);

drop policy if exists "public_read_courses" on public.courses;
create policy "public_read_courses"
  on public.courses for select
  using (active = true);

-- Los usuarios autenticados (administradores) pueden hacer todo
drop policy if exists "admin_all_categories" on public.categories;
create policy "admin_all_categories"
  on public.categories for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "admin_all_courses" on public.courses;
create policy "admin_all_courses"
  on public.courses for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Cualquiera puede crear una orden (checkout público), solo admins pueden leer/gestionar
drop policy if exists "public_insert_orders" on public.orders;
create policy "public_insert_orders"
  on public.orders for insert
  with check (true);

drop policy if exists "admin_read_orders" on public.orders;
create policy "admin_read_orders"
  on public.orders for select
  using (auth.role() = 'authenticated');

drop policy if exists "admin_update_orders" on public.orders;
create policy "admin_update_orders"
  on public.orders for update
  using (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- 6. STORAGE: bucket para imágenes de cursos
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('course-media', 'course-media', true)
on conflict (id) do nothing;

drop policy if exists "public_read_course_media" on storage.objects;
create policy "public_read_course_media"
  on storage.objects for select
  using (bucket_id = 'course-media');

drop policy if exists "admin_write_course_media" on storage.objects;
create policy "admin_write_course_media"
  on storage.objects for insert
  with check (bucket_id = 'course-media' and auth.role() = 'authenticated');

drop policy if exists "admin_update_course_media" on storage.objects;
create policy "admin_update_course_media"
  on storage.objects for update
  using (bucket_id = 'course-media' and auth.role() = 'authenticated');

drop policy if exists "admin_delete_course_media" on storage.objects;
create policy "admin_delete_course_media"
  on storage.objects for delete
  using (bucket_id = 'course-media' and auth.role() = 'authenticated');

-- ============================================================
-- 7. SEMILLA DE DATOS (CATEGORÍAS)
-- ============================================================
insert into public.categories (name, slug) values
  ('Docencia y Educación', 'docencia-y-educacion'),
  ('Salud y Ciencias', 'salud-y-ciencias'),
  ('Seguridad y Criminalística', 'seguridad-y-criminalistica'),
  ('Administración y Gestión', 'administracion-y-gestion'),
  ('Oficios', 'oficios')
on conflict (slug) do nothing;

-- ============================================================
-- 8. SEMILLA DE DATOS (CURSOS)
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
  (select id from public.categories where slug = 'docencia-y-educacion')
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
  (select id from public.categories where slug = 'salud-y-ciencias')
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
  (select id from public.categories where slug = 'seguridad-y-criminalistica')
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
  (select id from public.categories where slug = 'seguridad-y-criminalistica')
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
  (select id from public.categories where slug = 'oficios')
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
  (select id from public.categories where slug = 'oficios')
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
  (select id from public.categories where slug = 'docencia-y-educacion')
)
on conflict (slug) do nothing;
