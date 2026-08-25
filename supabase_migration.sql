-- ============================================================
-- MIGRACIÓN: WhatsApp editable por curso
-- ============================================================
-- Ejecutar en el SQL Editor de Supabase sobre una base ya creada
-- con schema.sql. Es idempotente: se puede correr más de una vez
-- sin romper nada.

-- ------------------------------------------------------------
-- 1. Columna: courses.whatsapp_number
-- ------------------------------------------------------------
-- Número de WhatsApp propio de cada curso (solo dígitos, con código
-- de país, ej: 5493876543210). Si queda en NULL, el sitio usa el
-- WhatsApp general del negocio (WHATSAPP_NUMBER en el frontend).
alter table public.courses
  add column if not exists whatsapp_number text;

comment on column public.courses.whatsapp_number is
  'Número de WhatsApp de contacto para este curso (solo dígitos, con código de país). Si es NULL, el sitio usa el WhatsApp general del negocio.';

-- ------------------------------------------------------------
-- 2. Validación de formato
-- ------------------------------------------------------------
-- Solo dígitos, entre 10 y 15 caracteres (código de país + número,
-- sin "+" ni espacios). Corre en cada insert/update de courses.
create or replace function public.validate_course_whatsapp_number()
returns trigger as $$
begin
  if new.whatsapp_number is not null and new.whatsapp_number <> '' then
    if new.whatsapp_number !~ '^[0-9]{10,15}$' then
      raise exception 'whatsapp_number inválido: debe contener solo dígitos (10 a 15), con código de país. Valor recibido: %', new.whatsapp_number;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_courses_validate_whatsapp on public.courses;
create trigger trg_courses_validate_whatsapp
  before insert or update on public.courses
  for each row execute function public.validate_course_whatsapp_number();

-- ------------------------------------------------------------
-- 3. RLS: solo el admin puede editar este campo
-- ------------------------------------------------------------
-- Este proyecto no tiene una tabla de roles: el único "admin" es
-- cualquier usuario autenticado por Supabase Auth (se crea a mano
-- desde Authentication → Users). Las políticas ya existentes sobre
-- public.courses siguen esa misma regla y cubren también la columna
-- nueva; se re-declaran acá para dejarlo explícito y a prueba de que
-- alguien las haya borrado o modificado.

-- Lectura pública: solo cursos activos (sin cambios).
drop policy if exists "public_read_courses" on public.courses;
create policy "public_read_courses"
  on public.courses for select
  using (active = true);

-- Solo usuarios autenticados (administradores) pueden insertar,
-- actualizar (incluido whatsapp_number) o borrar cursos.
drop policy if exists "admin_all_courses" on public.courses;
create policy "admin_all_courses"
  on public.courses for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
