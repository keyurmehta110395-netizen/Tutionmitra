/* ============================================================
   TuitionMitra — Supabase connection config
   ------------------------------------------------------------
   Fill these in after creating your free Supabase project:
   Dashboard → Project Settings → API → "Project URL" and "anon public" key.
   The anon key is safe to ship in frontend code — it has no power on its
   own; every table is locked down by the Row Level Security policies in
   sql/schema.sql, so this key can only do what a policy explicitly allows.
   ============================================================ */
const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';

const SUPABASE_CONFIGURED = !SUPABASE_URL.includes('YOUR-PROJECT-REF') && !SUPABASE_ANON_KEY.includes('YOUR-ANON-PUBLIC-KEY');

const supabase = SUPABASE_CONFIGURED
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
