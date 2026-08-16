/* ============================================================
   TuitionMitra — Supabase connection config
   ------------------------------------------------------------
   Fill these in after creating your free Supabase project:
   Dashboard → Project Settings → API → "Project URL" and "anon public" key.
   The anon key is safe to ship in frontend code — it has no power on its
   own; every table is locked down by the Row Level Security policies in
   sql/schema.sql, so this key can only do what a policy explicitly allows.
   ============================================================ */
const SUPABASE_URL = 'https://imbxnqdluwpitrkfamnj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltYnhucWRsdXdwaXRya2ZhbW5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MTM1MDgsImV4cCI6MjEwMjM4OTUwOH0.T9VY5hpS3J4Swvxghq2fcugfsXty6zO6i46h_Z1J_bM';

const SUPABASE_CONFIGURED = !SUPABASE_URL.includes('YOUR-PROJECT-REF') && !SUPABASE_ANON_KEY.includes('YOUR-ANON-PUBLIC-KEY');

const supabase = SUPABASE_CONFIGURED
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
