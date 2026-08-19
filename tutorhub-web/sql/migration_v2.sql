-- ============================================================
-- TuitionMitra — migration v2
-- Run this in the SQL Editor of a project that already ran the
-- original schema.sql. Safe to run more than once.
-- (Setting up a brand-new project? Just run the updated
-- schema.sql instead — it already includes all of this.)
-- ============================================================

-- ---------- More teacher profile fields ("max information") ----------
alter table public.teacher_profiles add column if not exists teaches_all_subjects boolean not null default false;
alter table public.teacher_profiles add column if not exists address text default '';
alter table public.teacher_profiles add column if not exists pin_code text default '';
alter table public.teacher_profiles add column if not exists alt_phone text default '';
alter table public.teacher_profiles add column if not exists university text default '';
alter table public.teacher_profiles add column if not exists achievements text default '';
alter table public.teacher_profiles add column if not exists video_url text default '';
alter table public.teacher_profiles add column if not exists availability_note text default '';

-- ---------- Missing admin delete policies ----------
-- Without these, an admin's "Delete" button fails silently (RLS blocks
-- any operation with no matching policy, deletes included) — this is one
-- of the likely causes of "admin control for everything" not working.
drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles for delete using (public.is_admin());

drop policy if exists "teacher_profiles_delete_admin" on public.teacher_profiles;
create policy "teacher_profiles_delete_admin" on public.teacher_profiles for delete using (public.is_admin());

drop policy if exists "bookings_delete_admin" on public.bookings;
create policy "bookings_delete_admin" on public.bookings for delete using (public.is_admin());

drop policy if exists "messages_delete_admin" on public.messages;
create policy "messages_delete_admin" on public.messages for delete using (public.is_admin());

drop policy if exists "reviews_delete_admin" on public.reviews;
create policy "reviews_delete_admin" on public.reviews for delete using (student_id = auth.uid() or public.is_admin());

drop policy if exists "notifications_delete_admin" on public.notifications;
create policy "notifications_delete_admin" on public.notifications for delete using (user_id = auth.uid() or public.is_admin());

-- ---------- A default "Qualifications" master category (used in the
-- expanded teacher profile form's qualification dropdown) ----------
insert into public.masters (key, value) values
 ('qualifications','B.Ed'),('qualifications','M.Ed'),('qualifications','B.Sc'),('qualifications','M.Sc'),
 ('qualifications','B.A'),('qualifications','M.A'),('qualifications','B.Tech'),('qualifications','M.Tech'),
 ('qualifications','B.Com'),('qualifications','M.Com'),('qualifications','Ph.D'),('qualifications','CA'),
 ('qualifications','NET/SET Qualified')
on conflict do nothing;

-- ---------- Owner email auto-admin bootstrap ----------
-- >>> EDIT owner_email BELOW TO YOUR OWN SIGN-UP EMAIL BEFORE RUNNING. <<<
-- Whoever signs up (or re-signs-up) with that exact email becomes admin
-- automatically — no manual Table Editor role edit needed going forward.
-- This only affects NEW signups; if you already have an account, either
-- re-register with the owner email, or promote your existing row once via
-- Table Editor → profiles → set role to admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  req_role text;
  owner_email text := 'keyurmehta110395@gmail.com'; -- <<< CHANGE THIS to your email
begin
  req_role := coalesce(new.raw_user_meta_data->>'role', 'student');
  if lower(new.email) = lower(owner_email) then
    req_role := 'admin';
  elsif req_role = 'admin' then
    req_role := 'student';
  end if;

  insert into public.profiles (id, role, name, email, phone, city, status, class_level, board)
  values (
    new.id, req_role,
    coalesce(new.raw_user_meta_data->>'name',''),
    new.email,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'city',
    case when req_role = 'teacher' then 'pending' else 'active' end,
    new.raw_user_meta_data->>'class_level',
    new.raw_user_meta_data->>'board'
  )
  on conflict (id) do nothing;

  if req_role = 'teacher' then
    insert into public.teacher_profiles (id) values (new.id) on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Sanity check — run any time to confirm setup is correct:
--   select 'masters rows' as check, count(*)::text as result from public.masters
--   union all select 'profiles rows', count(*)::text from public.profiles;
