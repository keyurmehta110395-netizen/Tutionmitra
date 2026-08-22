//* ============================================================
   TuitionMitra — Supabase connection config
   ------------------------------------------------------------
   Supabase Dashboard → Project Settings → API
   ============================================================ */

const SUPABASE_URL = 'https://imbxnqdluwpitrkfamnj.supabase.co';

const SUPABASE_ANON_KEY =
  'sb_publishable_rWJhlNDn4q0s9oZitwUy-w_9UhAHok8';

const SUPABASE_CONFIGURED =
  !SUPABASE_URL.includes('YOUR-PROJECT-REF') &&
  !SUPABASE_ANON_KEY.includes('YOUR-ANON-PUBLIC-KEY');

const supabase = SUPABASE_CONFIGURED
  ? window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true
        }
      }
    )
  : null;