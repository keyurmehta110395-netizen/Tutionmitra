# TuitionMitra — Hosted Tutor Marketplace

A real, online, multi-user version of the demo: one shared database, real
login accounts, and role-based access — students and teachers each see only
their own data, while the admin (you, the platform owner) sees and controls
everything. Includes CSV/Excel/PDF export and a full backup/restore tool.

**Stack:** static frontend (deploy to Netlify **or** Vercel — both covered
below) + [Supabase](https://supabase.com) for the database, auth, and
row-level security. No server to run yourself.

---

## Part 1 — Create the backend (Supabase), ~5 minutes

1. Go to https://supabase.com → **Start your project** → sign in with GitHub
   or email (free tier is enough for this).
2. **New project** → pick an organization, name it (e.g. `tuitionmitra`),
   set a database password (save it somewhere), pick the region closest to
   your users → **Create new project**. Wait ~2 minutes for it to spin up.
3. Open `sql/schema.sql` in a text editor. Find the line near the top that
   says `owner_email text := 'owner@example.com';` and change it to **the
   exact email you're going to sign up with** — that account becomes admin
   automatically the moment it registers, with no manual step later.
4. In Supabase, left sidebar → **SQL Editor** → **New query**.
5. Select the **entire contents** of `sql/schema.sql` (Ctrl+A / Cmd+A in
   your editor, then copy), paste into the SQL editor, and click **Run**.
   This creates every table, the security rules, and seeds the starting
   master data (subjects, cities, etc). You should see "Success. No rows
   returned." — if you instead see an error partway through, you likely
   pasted only part of the file; re-select all and try again.
6. **Verify it actually worked** — paste this into a new query and run it:
   ```sql
   select 'masters rows' as check, count(*)::text as result from public.masters
   union all select 'profiles rows', count(*)::text from public.profiles;
   ```
   "masters rows" should show 40+. If it shows 0, step 5 didn't fully run —
   go back and re-run the whole file.
7. Go to **Project Settings → API**. Copy the **Project URL** and the
   **anon public** key.
8. Open `js/config.js` in this folder and paste them in:
   ```js
   const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
   ```
   The anon key is safe to ship in frontend code — every table is locked
   down by the policies in `schema.sql`, so this key can only do what those
   policies explicitly allow (see **Role-based visibility** below).
9. *(Optional, recommended for a faster demo)* Go to **Authentication →
   Providers → Email** and turn **off** "Confirm email" if you don't want
   new users to have to click an email link before their first login.
   Leave it **on** for a real production launch.

## Part 2 — Deploy the frontend

Pick **either** host — both are free and work equally well with this app.

### Option A: Netlify

**Drag & drop (fastest):**
1. Go to https://app.netlify.com/drop
2. Drag this whole `tutorhub-web` folder onto the page.
3. Netlify gives you a live URL immediately (e.g. `your-app.netlify.app`).
4. If you see a **"This project is private"** banner, click **"Go live or
   manage access"** in that banner and make the site public — by default
   some Netlify accounts create sites as team-only until you publish them.

**CLI:**
```bash
npm install -g netlify-cli
cd tutorhub-web
netlify deploy --prod
```

**Git-based (best for ongoing updates):**
Push this folder to a GitHub repo → in Netlify: **Add new site → Import from
Git** → pick the repo → build command: none → publish directory: `.` (or
wherever `index.html` lives) → Deploy.

`netlify.toml` is already included and picked up automatically.

### Option B: Vercel via GitHub (recommended — full walkthrough)

**Step 1 — put the code on GitHub**
1. Go to https://github.com and sign in (or create a free account)
2. Click the **+** icon (top right) → **New repository**
3. Name it e.g. `tuitionmitra`, leave it **Public** or **Private** (either
   works), don't check any of the initialize options → **Create repository**
4. On the next page, under "…or push an existing repository from the
   command line", if you have git installed run from inside the
   `tutorhub-web` folder:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/tuitionmitra.git
   git push -u origin main
   ```
   No git installed / prefer no command line? On the repo page, click
   **uploading an existing file**, then drag in every file/folder from
   `tutorhub-web` (keep the folder structure — `js/`, `css/`, `sql/`, etc.)
   and commit.

**Step 2 — connect Vercel**
1. Go to https://vercel.com → **Sign Up** (choose **Continue with GitHub**
   so it's linked automatically) or log in if you already have an account
2. Click **Add New… → Project**
3. Find your `tuitionmitra` repo in the list → click **Import**
4. Vercel auto-detects it as a static site (**Framework Preset: Other**) —
   leave Build Command and Output Directory blank
5. Click **Deploy**
6. After ~30 seconds you get a live URL like `tuitionmitra.vercel.app` —
   this is publicly live immediately, no extra "make it public" step
   (unlike Netlify's private-project banner)

**Step 3 — updating the site later**
Any time you change a file (like `js/config.js`), just push again:
```bash
git add .
git commit -m "Update config"
git push
```
Vercel automatically redeploys within a minute. No re-uploading needed.

**Prefer the command line instead of GitHub?**
```bash
npm install -g vercel
cd tutorhub-web
vercel --prod
```

`vercel.json` is already included and picked up automatically either way.

### Either way

Once deployed, install it as a "mobile app": open the site on a phone →
browser menu → **Add to Home Screen / Install app**.

## Part 3 — You're already the admin

Because you set `owner_email` in Part 1, step 3, there's no manual step
here: register on your live site with that exact email, and you'll land
straight on the Admin dashboard. (Forgot to set it, or want to change the
owner later? Edit `owner_email` in `sql/schema.sql`'s `handle_new_user`
function, re-run just that function in the SQL Editor, and re-register with
the new email — or promote an existing account by hand once via **Table
Editor → profiles → set role to `admin`**.)

Nobody can self-register as admin from the signup form by tampering with
the page — the role is decided entirely server-side.

---

## Role-based visibility — how it actually works

This isn't just hidden buttons in the UI. Every table has **Row Level
Security** policies in Postgres, so the database itself refuses to return
rows a user isn't allowed to see — even if someone opened the browser
console and queried Supabase directly.

- **Student:** sees their own profile, their own bookings/messages/
  notifications, their favourites, and the public teacher directory (name,
  subjects, fee, rating, bio — no other students' data, no other students'
  bookings).
- **Teacher:** sees their own profile and teaching settings, and only the
  bookings/messages made with them (which also reveals the connected
  student's name/contact, since a tutor reasonably needs that to arrange
  classes — but nothing about students they haven't booked with).
- **Parent:** sees their own profile and, after linking a child (by the
  child's email, via a secure lookup function — a parent can't browse
  arbitrary accounts), that child's bookings.
- **Admin (you):** full read/write access to every table — every user,
  every booking, every message, master data, the works.
- **Public/signed-out visitors:** can browse the teacher directory and
  read reviews, but see no personal contact details and no bookings.

Master data (subjects, cities, boards, etc.) is publicly readable (needed
for the search dropdowns) but only admins can add/edit/remove entries.

## Backup, restore, and exports

**Admin → Data Center:**
- **Backup:** downloads one JSON file containing every table (profiles,
  bookings, messages, reviews, notifications, master data). Keep these
  somewhere safe, ideally on a schedule.
- **Restore:** upload a backup JSON to restore that data. One real
  limitation, worth understanding: user *login* accounts live in Supabase
  Auth, a separate system from these data tables, for security reasons a
  frontend can't touch. Restore can update/recreate data for accounts that
  still exist, but it can't resurrect a deleted login. Practically: don't
  delete user accounts casually, and take backups regularly.

**Admin → Reports** (and also in the Data Center):
- **Export CSV** and **Export Excel** — full booking report, opens in any
  spreadsheet app.
- **Export Word** — a `.doc` file that opens directly in Microsoft Word.
- **Export PDF** — a formatted, shareable document.
- **Print** — uses your browser's print dialog (works offline once the
  page is loaded).

**Admin → Bookings** — every booking on the platform in one table: change
any booking's status inline, or delete it outright.

**Admin → Dashboard / Masters** — full add/edit/delete control: approve or
suspend teachers, edit a teacher's entire profile on their behalf, delete
any teacher/student/parent account's data, delete individual reviews from a
teacher's page, and add brand-new master-data categories (not just values
within the built-in ones) without touching code.

## Teacher profile — what teachers can fill in

The teacher profile form now covers subjects (pick specific ones, or check
"teaches any/all subjects" to match every search), boards, classes,
languages, teaching modes, fee, experience, qualification, university,
achievements, city, PIN code, address, alternate phone, gender, bio, an
intro video link, and availability notes — everything a family would want
to see before booking.

## About & version

Every deployment shows its version number and changelog at **#/about**
(linked from the footer) — useful for confirming which build is live after
an update.

---

## What changed vs. the local-only demo

The previous version of this app stored everything in each browser's
`localStorage` — nobody's data was shared, and "offline" meant "fully
functional with no server at all." This version trades a little of that
offline-ness for something you actually asked for: one real shared
database that many people can use from different devices, with proper
per-role permissions and an owner who can see and manage everything.

Concretely:
- The app shell (HTML/CSS/JS, the install-to-home-screen behaviour) still
  works offline — it's cached by the service worker.
- Live data (search results, bookings, messages, dashboards) now requires
  an internet connection, since it's reading from your shared Supabase
  database.
- Passwords are handled by Supabase Auth (properly hashed), not stored in
  plain text like the old local demo.

## Already set up? Applying the v1.3.0 update

If you deployed an earlier version, run `sql/migration_v2.sql` once in your
Supabase SQL Editor (safe to run more than once — edit the `owner_email`
line inside it first). It adds the expanded teacher profile fields, the
"teaches any subject" flag, a `qualifications` master category, **admin
delete permissions** that the first schema version was missing, and the
**owner-email auto-admin bootstrap** described in Part 3. Then redeploy the
updated `tutorhub-web` folder.

## Troubleshooting

**Sign-up doesn't work, city dropdown is empty, or admin doesn't show up:**
these three symptoms almost always share one root cause — `sql/schema.sql`
didn't fully execute (commonly because only part of the file got copied).
Run the verification query from Part 1, step 6. If "masters rows" is 0,
re-run the *entire* file (select-all before copying, not just a few lines).
As of this version, sign-up is also self-healing: if the automatic
profile-creation step is missing in your database, the app creates the
profile directly instead of leaving the account stuck — so a plain "sign-up
failed" error should now come with a specific reason.

**Can't log in at all / every dashboard tab looks broken:**

1. **`js/config.js` still has placeholder values.** The app detects this
   itself and shows a "Setup needed" screen instead of a blank page — if
   you're not seeing that screen, you're on an older build; redeploy the
   latest `tutorhub-web` folder. Fix: Part 1, steps 7–8 above.
2. **Email confirmation is required but nobody confirmed the email.**
   Supabase requires email confirmation by default — if you registered a
   test account and it can't log in, either check that inbox for the
   confirmation link, or go to Supabase → Authentication → Providers →
   Email and turn **off** "Confirm email" for easier testing (Part 1,
   step 9). The login page shows the specific reason for a failed login
   instead of a generic toast — read that message first.
3. **You ran an old `schema.sql` and haven't applied `migration_v2.sql`
   yet.** Admin buttons like Delete would fail silently before this fix
   because the database had no delete policy at all — see above.

**Netlify shows "This project is private":** that's a Netlify visitor-access
setting, unrelated to Supabase — click **"Go live or manage access"** in
that banner and publish the site. (Vercel doesn't have this behaviour.)

Other issues:
- **"new row violates row-level security policy":** you're trying to do
  something a policy doesn't allow for your role (e.g. a non-admin editing
  master data) — this is the security working as intended, not a bug. If
  it happens on an admin action, you likely need `migration_v2.sql`.
- **Newly registered teacher doesn't show up in search:** teacher accounts
  start as "pending" until an admin approves them (Admin → Dashboard →
  "Teachers awaiting approval"), and search only shows `active` teachers —
  by design.
- **CSV/Excel/Word/PDF buttons do nothing:** those libraries load from a
  CDN; check your internet connection on first use (the browser caches
  them after that). A toast will tell you if a library failed to load.
- **SQL editor error on step 4:** make sure you copied the *entire* file —
  the policies near the bottom depend on the tables/functions defined
  above them.
- **Forgot your admin password:** use "Forgot password?" on the login page
  (Supabase emails a reset link), or reset it directly from Supabase →
  Authentication → Users.
