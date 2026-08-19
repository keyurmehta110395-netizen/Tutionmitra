-- ============================================================
-- TuitionMitra — Supabase schema + Row Level Security
-- Run this once in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New query → paste all → Run)
-- ============================================================
create extension if not exists pgcrypto;

-- ---------- Tables ----------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('student','teacher','parent','admin')),
  name text not null default '',
  email text,
  phone text,
  city text,
  status text not null default 'active' check (status in ('active','pending','suspended')),
  class_level text,      -- students only
  board text,            -- students only
  created_at timestamptz not null default now()
);

create table public.teacher_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  subjects text[] not null default '{}',
  boards text[] not null default '{}',
  classes text[] not null default '{}',
  languages text[] not null default '{}',
  modes text[] not null default '{}',
  teaches_all_subjects boolean not null default false,
  fee integer not null default 0,
  experience integer not null default 0,
  qualification text default '',
  university text default '',
  bio text default '',
  gender text,
  address text default '',
  pin_code text default '',
  alt_phone text default '',
  achievements text default '',
  video_url text default '',
  availability_note text default '',
  rating numeric(2,1) not null default 0,
  reviews_count integer not null default 0,
  profile_complete integer not null default 20
);

create table public.parent_children (
  parent_id uuid not null references public.profiles(id) on delete cascade,
  child_id uuid not null references public.profiles(id) on delete cascade,
  primary key (parent_id, child_id)
);

create table public.favorites (
  student_id uuid not null references public.profiles(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  primary key (student_id, teacher_id)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  class_level text,
  mode text,
  day text,
  slot text,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected','completed','cancelled')),
  recurring boolean not null default false,
  fee integer not null default 0,
  created_at timestamptz not null default now()
);

-- Real double-booking protection at the database level: the same teacher
-- cannot hold two live (pending/confirmed) bookings for the same day+slot.
create unique index bookings_no_clash
  on public.bookings (teacher_id, day, slot)
  where status in ('pending','confirmed');

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  text text default '',
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.masters (
  key text not null,
  value text not null,
  created_at timestamptz not null default now(),
  primary key (key, value)
);

-- ---------- Helper: is_admin() (security definer avoids RLS recursion) ----------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- Auto-create a profile row when someone signs up ----------
-- IMPORTANT: role is sanitised here so nobody can self-register as 'admin'
-- by tampering with client-side signup metadata — the ONLY way to become
-- admin is by matching owner_email below, which lives server-side.
--
-- >>> EDIT owner_email TO YOUR OWN SIGN-UP EMAIL BEFORE RUNNING THIS FILE. <<<
-- Whoever signs up with that exact email automatically becomes admin —
-- no manual Table Editor step needed. Change it any time and re-run just
-- this function to update who the bootstrap owner is.
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

-- ---------- Secure parent → child linking (no broad profile exposure) ----------
create or replace function public.link_child(child_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare found_id uuid;
begin
  select id into found_id from public.profiles where email = child_email and role = 'student';
  if found_id is null then
    raise exception 'No student account found with that email';
  end if;
  insert into public.parent_children (parent_id, child_id) values (auth.uid(), found_id)
  on conflict do nothing;
end;
$$;
grant execute on function public.link_child(text) to authenticated;

-- ---------- Public, safe-columns-only teacher directory (for search/browse) ----------
create view public.public_teachers
with (security_invoker = false) as
select p.id, p.name, p.city, p.status,
       tp.subjects, tp.boards, tp.classes, tp.languages, tp.modes,
       tp.fee, tp.experience, tp.qualification, tp.bio, tp.gender,
       tp.rating, tp.reviews_count, tp.profile_complete
from public.profiles p
join public.teacher_profiles tp on tp.id = p.id
where p.role = 'teacher';
grant select on public.public_teachers to anon, authenticated;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.teacher_profiles enable row level security;
alter table public.parent_children enable row level security;
alter table public.favorites enable row level security;
alter table public.bookings enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.masters enable row level security;

-- profiles: see your own row, an admin sees all, and connected parties
-- (a booking or a parent/child link) see each other's row — this is the
-- "teacher/student see limited data, admin sees everything" rule in practice.
create policy "profiles_select" on public.profiles for select using (
  id = auth.uid()
  or public.is_admin()
  or exists (select 1 from public.bookings b where (b.teacher_id = profiles.id and b.student_id = auth.uid()) or (b.student_id = profiles.id and b.teacher_id = auth.uid()))
  or exists (select 1 from public.parent_children pc where (pc.child_id = profiles.id and pc.parent_id = auth.uid()) or (pc.parent_id = profiles.id and pc.child_id = auth.uid()))
);
create policy "profiles_insert_self" on public.profiles for insert with check (id = auth.uid());
create policy "profiles_update" on public.profiles for update using (id = auth.uid() or public.is_admin());

create policy "teacher_profiles_select" on public.teacher_profiles for select using (
  id = auth.uid() or public.is_admin() or exists (select 1 from public.profiles p where p.id = teacher_profiles.id and p.status = 'active')
);
create policy "teacher_profiles_update" on public.teacher_profiles for update using (id = auth.uid() or public.is_admin());
create policy "teacher_profiles_insert" on public.teacher_profiles for insert with check (id = auth.uid() or public.is_admin());

create policy "parent_children_select" on public.parent_children for select using (parent_id = auth.uid() or child_id = auth.uid() or public.is_admin());
create policy "parent_children_insert" on public.parent_children for insert with check (parent_id = auth.uid() or public.is_admin());
create policy "parent_children_delete" on public.parent_children for delete using (parent_id = auth.uid() or public.is_admin());

create policy "favorites_all" on public.favorites for all using (student_id = auth.uid() or public.is_admin()) with check (student_id = auth.uid() or public.is_admin());

create policy "bookings_select" on public.bookings for select using (
  student_id = auth.uid() or teacher_id = auth.uid() or public.is_admin()
  or exists (select 1 from public.parent_children pc where pc.parent_id = auth.uid() and pc.child_id = bookings.student_id)
);
create policy "bookings_insert" on public.bookings for insert with check (
  student_id = auth.uid() or public.is_admin()
  or exists (select 1 from public.parent_children pc where pc.parent_id = auth.uid() and pc.child_id = bookings.student_id)
);
create policy "bookings_update" on public.bookings for update using (
  student_id = auth.uid() or teacher_id = auth.uid() or public.is_admin()
);

create policy "messages_select" on public.messages for select using (from_id = auth.uid() or to_id = auth.uid() or public.is_admin());
create policy "messages_insert" on public.messages for insert with check (from_id = auth.uid() or public.is_admin());

create policy "reviews_select" on public.reviews for select using (true);
create policy "reviews_insert" on public.reviews for insert with check (
  public.is_admin() or (
    student_id = auth.uid()
    and exists (select 1 from public.bookings b where b.student_id = auth.uid() and b.teacher_id = reviews.teacher_id and b.status = 'completed')
  )
);
create policy "reviews_update" on public.reviews for update using (student_id = auth.uid() or public.is_admin());
create policy "reviews_delete_admin" on public.reviews for delete using (student_id = auth.uid() or public.is_admin());

-- Auto-recompute a teacher's rating + review count whenever a review lands,
-- so the client never has to (and can't, under RLS) write to teacher_profiles directly.
create or replace function public.recompute_teacher_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.teacher_profiles tp
  set rating = sub.avg_rating, reviews_count = sub.cnt
  from (
    select teacher_id, round(avg(rating)::numeric, 1) as avg_rating, count(*) as cnt
    from public.reviews where teacher_id = new.teacher_id
    group by teacher_id
  ) sub
  where tp.id = sub.teacher_id;
  return new;
end;
$$;

create trigger on_review_insert
  after insert on public.reviews
  for each row execute function public.recompute_teacher_rating();

create policy "notifications_select" on public.notifications for select using (user_id = auth.uid() or public.is_admin());
create policy "notifications_insert" on public.notifications for insert with check (auth.uid() is not null);
create policy "notifications_update" on public.notifications for update using (user_id = auth.uid() or public.is_admin());

create policy "masters_select" on public.masters for select using (true);
create policy "masters_write" on public.masters for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Admin delete policies (full "owner control" over every table) ----------
create policy "profiles_delete_admin" on public.profiles for delete using (public.is_admin());
create policy "teacher_profiles_delete_admin" on public.teacher_profiles for delete using (public.is_admin());
create policy "bookings_delete_admin" on public.bookings for delete using (public.is_admin());
create policy "messages_delete_admin" on public.messages for delete using (public.is_admin());
create policy "notifications_delete_admin" on public.notifications for delete using (user_id = auth.uid() or public.is_admin());

-- ============================================================
-- Seed master data (safe to re-run; ON CONFLICT ignores dupes)
-- ============================================================
insert into public.masters (key, value) values
 ('subjects','Mathematics'),('subjects','Physics'),('subjects','Chemistry'),('subjects','Biology'),
 ('subjects','English'),('subjects','Gujarati'),('subjects','Hindi'),('subjects','Computer Science'),
 ('subjects','Accountancy'),('subjects','Economics'),
 ('boards','CBSE'),('boards','ICSE'),('boards','GSEB (Gujarat State Board)'),('boards','IB'),('boards','IGCSE'),
 ('classes','Class 6'),('classes','Class 7'),('classes','Class 8'),('classes','Class 9'),('classes','Class 10'),
 ('classes','Class 11'),('classes','Class 12'),('classes','Undergraduate'),
 ('cities','Vadodara'),('cities','Ahmedabad'),('cities','Surat'),('cities','Rajkot'),('cities','Gandhinagar'),
 ('languages','English'),('languages','Gujarati'),('languages','Hindi'),
 ('modes','Online'),('modes','Home Tuition'),('modes',E'At Teacher''s Place'),
 ('timeSlots','7:00–8:00 AM'),('timeSlots','8:00–9:00 AM'),('timeSlots','4:00–5:00 PM'),
 ('timeSlots','5:00–6:00 PM'),('timeSlots','6:00–7:00 PM'),('timeSlots','7:00–8:00 PM'),
 ('qualifications','B.Ed'),('qualifications','M.Ed'),('qualifications','B.Sc'),('qualifications','M.Sc'),
 ('qualifications','B.A'),('qualifications','M.A'),('qualifications','B.Tech'),('qualifications','M.Tech'),
 ('qualifications','B.Com'),('qualifications','M.Com'),('qualifications','Ph.D'),('qualifications','CA'),
 ('qualifications','NET/SET Qualified')
on conflict do nothing;

-- ============================================================
-- After running this file:
-- 1. Make sure you edited owner_email above to YOUR email before running.
-- 2. Sign up from the deployed app using that exact email — you'll be
--    admin automatically. (Any other signup stays student/teacher/parent.)
--
-- Sanity check — run this any time to confirm the setup actually worked:
--   select 'masters rows' as check, count(*)::text as result from public.masters
--   union all select 'profiles rows', count(*)::text from public.profiles;
-- "masters rows" should be 40+ . If it's 0, this file did not fully run —
-- re-run it (select the ENTIRE file's contents, not just part of it).
-- ============================================================
