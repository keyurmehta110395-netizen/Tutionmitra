/* ============================================================
   TuitionMitra — app shell: router + views (Supabase-backed)
   ============================================================ */

const APP_VERSION = '1.4.0';
const APP_BUILD_DATE = '2026-08-16';

function currentUser(){ return STORE.me; }

function esc(str){ return String(str==null?'':str).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtMoney(n){ return '₹' + Number(n||0).toLocaleString('en-IN'); }
function fmtDate(d){ if(!d) return ''; const dt = new Date(d); return isNaN(dt) ? d : dt.toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'}); }
function stars(rating){ const full = Math.round(rating); return '★'.repeat(full) + '☆'.repeat(5-full); }
function initials(name){ return (name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase(); }

// Type-to-search city field: works even if the master list is empty, and
// lets people enter a city that isn't in the suggestions.
function cityField(name, currentValue, placeholder){
  const listId = 'cityOptions_' + name.replace(/[^a-zA-Z0-9]/g,'');
  const opts = (STORE.masters.cities||[]).map(c=>`<option value="${esc(c)}">`).join('');
  return `<input list="${listId}" name="${name}" value="${esc(currentValue||'')}" placeholder="${esc(placeholder||'Type a city…')}" autocomplete="off">
    <datalist id="${listId}">${opts}</datalist>`;
}

function toast(msg, kind='ok'){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + kind;
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>{ el.className = 'toast ' + kind; }, 2800);
}
function showAuthError(msg){
  const box = document.getElementById('authError');
  if(box) box.innerHTML = `<div class="card-pad" style="background:var(--rust-bg);color:var(--rust);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:.86rem;">${esc(msg)}</div>`;
}

function openModal(title, bodyHtml, footHtml=''){
  const back = document.getElementById('modalBack');
  back.innerHTML = `<div class="modal">
    <div class="modal-head"><h3 style="margin:0;font-size:1.1rem;">${title}</h3><button class="iconbtn" data-action="close-modal">✕</button></div>
    <div class="modal-body">${bodyHtml}</div>
    ${footHtml ? `<div class="modal-foot">${footHtml}</div>` : ''}
  </div>`;
  back.style.display = 'flex';
}
function closeModal(){ document.getElementById('modalBack').style.display = 'none'; document.getElementById('modalBack').innerHTML=''; }

async function guarded(fn){
  try{ await fn(); }
  catch(err){ console.error(err); toast(err.message || 'Something went wrong — please try again.', 'err'); }
}

/* ---------------- Router ---------------- */
const routes = {};
function route(path, handler){ routes[path] = { handler }; }
function navigate(hash){ location.hash = hash; }

function matchRoute(hash){
  const path = (hash || '#/').replace(/^#/, '') || '/';
  for(const key of Object.keys(routes)){
    const parts = key.split('/');
    const given = path.split('/');
    if(parts.length !== given.length) continue;
    const params = {};
    let ok = true;
    for(let i=0;i<parts.length;i++){
      if(parts[i].startsWith(':')) params[parts[i].slice(1)] = decodeURIComponent(given[i]);
      else if(parts[i] !== given[i]) { ok = false; break; }
    }
    if(ok) return { route: routes[key], params };
  }
  return null;
}

const ROLE_ROUTES = {
  '/student/dashboard':['student'], '/student/bookings':['student'], '/student/profile':['student'],
  '/teacher/dashboard':['teacher'], '/teacher/requests':['teacher'], '/teacher/calendar':['teacher'], '/teacher/profile':['teacher'],
  '/parent/dashboard':['parent'],
  '/admin/dashboard':['admin'], '/admin/masters':['admin'], '/admin/reports':['admin'], '/admin/data':['admin'], '/admin/bookings':['admin'],
  '/notifications':['student','teacher','parent','admin'],
};

let renderToken = 0;
async function render(){
  const myToken = ++renderToken;
  const hash = location.hash || '#/';
  const m = matchRoute(hash);
  const app = document.getElementById('view');
  const user = currentUser();

  if(!m){ app.innerHTML = notFoundView(); renderNav(user); return; }
  const path = hash.replace(/^#/,'');
  const requiredRoles = ROLE_ROUTES[path];
  if(requiredRoles && (!user || !requiredRoles.includes(user.role))){
    app.innerHTML = authGateView(requiredRoles);
    renderNav(user);
    return;
  }

  app.innerHTML = `<div class="wrap section center"><p class="muted">Loading…</p></div>`;
  try{
    const html = await m.route.handler(m.params, user);
    if(myToken !== renderToken) return; // a newer navigation happened meanwhile
    app.innerHTML = html;
  }catch(err){
    console.error(err);
    if(myToken !== renderToken) return;
    app.innerHTML = `<div class="wrap section"><div class="empty"><div class="glyph">⚠️</div><h3>Something went wrong loading this page</h3><p class="muted">${esc(err.message||'')}</p><a href="#/" class="btn btn-outline mt-16">Back home</a></div></div>`;
  }
  renderNav(user);
  window.scrollTo(0,0);
  runPostRender();
}

function authGateView(roles){
  return `<div class="wrap section center">
    <div class="empty">
      <div class="glyph">🔒</div>
      <h3>Please sign in to continue</h3>
      <p class="muted">This page is for: ${roles.join(', ')}</p>
      <a href="#/login" class="btn btn-brass mt-16">Go to login</a>
    </div>
  </div>`;
}
function notFoundView(){
  return `<div class="wrap section center"><div class="empty"><div class="glyph">📄</div><h3>Page not found</h3><a href="#/" class="btn btn-outline mt-16">Back home</a></div></div>`;
}

/* ---------------- Nav ---------------- */
function renderNav(user){
  const nav = document.getElementById('navlinks');
  const userBox = document.getElementById('navuser');
  const path = (location.hash||'#/').replace(/^#/,'')||'/';
  const link = (href, label, badge='') => `<a href="${href}" class="${path===href.replace('#','')?'active':''}">${label}${badge}</a>`;

  if(!user){
    nav.innerHTML = link('#/','Home') + link('#/search','Find Teachers') + link('#/how-it-works','How it works');
    userBox.innerHTML = `<a href="#/login" class="btn btn-ghost btn-sm">Log in</a><a href="#/register" class="btn btn-brass btn-sm">Join Free</a>`;
    return;
  }
  const unread = DB.listNotifications(user.id).filter(n=>!n.read).length;
  const badge = unread ? `<span class="navbadge">${unread}</span>` : '';
  let links = '';
  if(user.role==='student') links = link('#/student/dashboard','Dashboard') + link('#/search','Find Teachers') + link('#/student/bookings','My Bookings') + link('#/notifications','Alerts',badge);
  if(user.role==='teacher') links = link('#/teacher/dashboard','Dashboard') + link('#/teacher/requests','Requests') + link('#/teacher/calendar','Calendar') + link('#/notifications','Alerts',badge);
  if(user.role==='parent') links = link('#/parent/dashboard','Dashboard') + link('#/search','Find Teachers') + link('#/notifications','Alerts',badge);
  if(user.role==='admin') links = link('#/admin/dashboard','Dashboard') + link('#/admin/bookings','Bookings') + link('#/admin/masters','Masters') + link('#/admin/reports','Reports') + link('#/admin/data','Data Center');
  nav.innerHTML = links;
  userBox.innerHTML = `<span class="pill">👤 ${esc(user.name.split(' ')[0]||'')} · ${esc(user.role)}</span><button class="btn btn-ghost btn-sm" data-action="logout">Log out</button>`;
}

/* ============================================================
   PUBLIC VIEWS
   ============================================================ */
route('/', async () => {
  const t = DB.listTeachers().slice(0,3);
  const m = STORE.masters;
  return `
  <section class="hero">
    <div class="wrap">
      <div class="eyebrow" style="color:#E7C877">TUITIONMITRA · GUJARAT'S TUTOR MARKETPLACE</div>
      <h1>Find the right tutor the way your school found the right topper — by record, not guesswork.</h1>
      <p class="lead">Search verified teachers by subject, board, city and budget. Book a trial, chat directly, and track every class in one ledger.</p>
      <form class="hero-search" data-action="hero-search">
        <select name="subject"><option value="">Any subject</option>${m.subjects.map(s=>`<option>${s}</option>`).join('')}</select>
        <select name="classLevel"><option value="">Any class</option>${m.classes.map(s=>`<option>${s}</option>`).join('')}</select>
        ${cityField('city', '', 'Any city')}
        <button class="btn btn-brass" type="submit">Search Teachers</button>
      </form>
      <div class="stripe-strip">
        <div class="item"><b>${STORE.teachers.length}</b>Verified teachers</div>
        <div class="item"><b>${m.subjects.length}</b>Subjects covered</div>
        <div class="item"><b>${STORE.reviews.length}</b>Reviews from real classes</div>
        <div class="item"><b>${m.cities.length}</b>Cities live</div>
      </div>
    </div>
  </section>

  <section class="wrap section">
    <div class="flex-between mb-16">
      <div><div class="eyebrow">CATALOG</div><h2 style="margin:0;">Top-rated teachers this week</h2></div>
      <a href="#/search" class="btn btn-outline btn-sm">Browse all →</a>
    </div>
    <div class="grid grid-3">${t.length ? t.map(teacherCard).join('') : '<p class="muted">No teachers yet — be the first to join!</p>'}</div>
  </section>

  <section class="wrap section-tight" style="padding-bottom:60px;">
    <div class="eyebrow">HOW IT WORKS</div>
    <h2>Six steps, one ledger entry each</h2>
    <div class="grid grid-3 mt-16">
      ${[['1','Search','Filter by subject, board, city, budget, mode.'],
         ['2','Compare','Shortlist and compare fees, ratings and availability.'],
         ['3','Request','Send a booking request with your preferred slot.'],
         ['4','Confirm','Teacher accepts — booking is locked in the calendar.'],
         ['5','Attend','Chat, join class, mark it complete.'],
         ['6','Review','Rate the teacher so the next family can trust the record.']]
         .map(([n,tt,d])=>`<div class="card card-pad"><div class="eyebrow mono">STEP ${n}</div><h3>${tt}</h3><p class="muted" style="margin:0;">${d}</p></div>`).join('')}
    </div>
  </section>`;
});

route('/how-it-works', () => routes['/'].handler());

route('/about', () => `
  <div class="wrap section" style="max-width:640px;">
    <div class="eyebrow">ABOUT</div>
    <h2>TuitionMitra</h2>
    <div class="card card-pad mt-16">
      <div class="flex-between">
        <div><b>Version</b><div class="mono muted">${APP_VERSION}</div></div>
        <div><b>Build date</b><div class="mono muted">${APP_BUILD_DATE}</div></div>
        <div><b>Environment</b><div class="mono muted">${SUPABASE_CONFIGURED ? 'Connected' : 'Not configured'}</div></div>
      </div>
      <div class="hr"></div>
      <p>A teacher-hiring and student-booking marketplace demo. Frontend is static
      HTML/CSS/JS deployed on Netlify; data, auth, and role-based access run on
      Supabase (Postgres + Row Level Security).</p>
      <b>Changelog</b>
      <ul class="muted" style="padding-left:18px;line-height:1.7;">
        <li><b>1.4.0</b> — Redesigned login/register pages (branded card layout, show/hide password, tile-style role picker, browse-without-account link), full GitHub → Vercel walkthrough.</li>
        <li><b>1.3.0</b> — Owner-email auto-admin bootstrap (no manual role edit needed), self-healing sign-up if the database trigger is missing, city fields switched to type-to-search (works even with an empty list), Vercel deployment support alongside Netlify.</li>
        <li><b>1.2.0</b> — Admin full CRUD (edit/delete teachers, students, bookings, reviews), dynamic master categories, expanded teacher profile (any/specific subjects, address, achievements, video intro), Word export, forgot-password, setup diagnostics, About page.</li>
        <li><b>1.1.0</b> — Moved from per-device local storage to a shared Supabase backend: real accounts, role-based visibility, backup/restore, CSV/Excel/PDF export.</li>
        <li><b>1.0.0</b> — Initial offline-first demo (local data only).</li>
      </ul>
    </div>
  </div>`);

route('/login', () => `
  <div class="auth-wrap">
    <div class="auth-card" style="max-width:420px;">
      <div class="auth-head">
        <span class="mark">TM</span>
        <h2>Welcome back</h2>
        <p>Log in to your TuitionMitra account</p>
      </div>
      <div class="auth-body">
        <div id="authError"></div>
        <form data-action="login-form">
          <div class="field"><label>Email</label><input name="email" type="email" required placeholder="you@example.com" autocomplete="email"></div>
          <div class="field">
            <div class="flex-between"><label style="margin-bottom:0;">Password</label><button type="button" class="iconbtn" style="font-size:.76rem;color:var(--brass-dark);" data-action="forgot-password">Forgot password?</button></div>
            <div class="pw-field">
              <input name="password" type="password" required autocomplete="current-password" id="loginPw">
              <button type="button" class="pw-toggle" data-action="toggle-password" data-target="loginPw" aria-label="Show password">👁</button>
            </div>
          </div>
          <button class="btn btn-brass btn-block mt-8" type="submit">Log in</button>
        </form>
        <div class="auth-divider">or</div>
        <a href="#/search" class="btn btn-ghost btn-block">Browse teachers without an account</a>
        <p class="mt-16 center">New here? <a href="#/register" style="color:var(--brass-dark);font-weight:600;">Create an account</a></p>
      </div>
    </div>
  </div>`);

route('/register', () => `
  <div class="auth-wrap">
    <div class="auth-card" style="max-width:560px;">
      <div class="auth-head">
        <span class="mark">TM</span>
        <h2>Create your account</h2>
        <p>Join as a student, teacher, or parent</p>
      </div>
      <div class="auth-body">
        <div id="authError"></div>
        <form data-action="register-form">
          <div class="field">
            <label>I am a…</label>
            <div class="role-picker">
              <label><input type="radio" name="role" value="student" checked><span class="tile"><span class="glyph">🎓</span><span class="lbl">Student</span></span></label>
              <label><input type="radio" name="role" value="teacher"><span class="tile"><span class="glyph">📚</span><span class="lbl">Teacher</span></span></label>
              <label><input type="radio" name="role" value="parent"><span class="tile"><span class="glyph">👪</span><span class="lbl">Parent</span></span></label>
            </div>
          </div>
          <div class="field-row mt-8">
            <div class="field"><label>Full name</label><input name="name" required autocomplete="name"></div>
            <div class="field"><label>City</label>${cityField('city', '', 'e.g. Vadodara')}</div>
          </div>
          <div class="field-row">
            <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email"></div>
            <div class="field"><label>Mobile number</label><input name="phone" required placeholder="10-digit number" autocomplete="tel"></div>
          </div>
          <div class="field">
            <label>Password</label>
            <div class="pw-field">
              <input name="password" type="password" required minlength="6" autocomplete="new-password" id="registerPw">
              <button type="button" class="pw-toggle" data-action="toggle-password" data-target="registerPw" aria-label="Show password">👁</button>
            </div>
            <div class="help">At least 6 characters.</div>
          </div>
          <button class="btn btn-brass btn-block mt-8" type="submit">Create account</button>
        </form>
        <p class="help mt-16">Teacher accounts start as "pending" until an admin approves them.</p>
        <p class="mt-8 center">Already have an account? <a href="#/login" style="color:var(--brass-dark);font-weight:600;">Log in</a></p>
      </div>
    </div>
  </div>`);

/* ---------------- Search / Teacher profile ---------------- */
function teacherCard(t){
  return `<div class="catalog-card">
    <div class="punch">${t.rating}<small>★ ${t.reviewsCount}</small></div>
    <div class="ch">
      <div class="flex gap-12">
        <div class="avatar">${initials(t.name)}</div>
        <div>
          <div style="font-weight:700;">${esc(t.name)} ${t.status && t.status!=='active'?`<span class="badge badge-pending">${esc(t.status)}</span>`:''}</div>
          <div class="muted" style="font-size:.82rem;">${esc(t.qualification||'')}</div>
        </div>
      </div>
    </div>
    <div class="cb">
      <div>${t.teachesAllSubjects ? `<span class="tag" style="background:var(--ledger-bg);color:var(--ledger);border-color:var(--ledger);">All subjects</span>` : (t.subjects||[]).map(s=>`<span class="tag">${s}</span>`).join('')}</div>
      <div class="muted" style="font-size:.82rem;margin-top:6px;">${esc(t.city||'')} · ${t.experience||0} yrs exp · ${(t.modes||[]).join(', ')}</div>
      <div class="mono" style="margin-top:8px;font-weight:700;color:var(--ink);">${fmtMoney(t.fee)}<span class="muted" style="font-weight:400;">/hr</span></div>
    </div>
    <div class="cf">
      <a href="#/teacher/${t.id}" class="btn btn-ink btn-sm" style="flex:1;">View profile</a>
      <button class="btn btn-ghost btn-sm" data-action="fav-toggle" data-id="${t.id}">☆</button>
    </div>
  </div>`;
}

route('/search', () => {
  const m = STORE.masters;
  return `<div class="wrap section">
    <div class="eyebrow">SEARCH ENGINE</div>
    <h2>Find a teacher</h2>
    <form class="card card-pad mt-16" data-action="filter-form" id="filterForm">
      <div class="grid" style="grid-template-columns:repeat(4,1fr);gap:12px;">
        <div class="field"><label>Subject</label><select name="subject"><option value="">Any</option>${m.subjects.map(s=>`<option>${s}</option>`).join('')}</select></div>
        <div class="field"><label>Class</label><select name="classLevel"><option value="">Any</option>${m.classes.map(s=>`<option>${s}</option>`).join('')}</select></div>
        <div class="field"><label>Board</label><select name="board"><option value="">Any</option>${m.boards.map(s=>`<option>${s}</option>`).join('')}</select></div>
        <div class="field"><label>City</label>${cityField('city', '', 'Any')}</div>
        <div class="field"><label>Mode</label><select name="mode"><option value="">Any</option>${m.modes.map(s=>`<option>${s}</option>`).join('')}</select></div>
        <div class="field"><label>Language</label><select name="language"><option value="">Any</option>${m.languages.map(s=>`<option>${s}</option>`).join('')}</select></div>
        <div class="field"><label>Max budget (₹/hr)</label><input type="number" name="maxFee" placeholder="e.g. 600"></div>
        <div class="field"><label>Min rating</label><select name="minRating"><option value="">Any</option><option value="4.5">4.5+</option><option value="4">4.0+</option></select></div>
      </div>
      <div class="flex-between mt-8">
        <div class="field" style="max-width:260px;margin:0;"><input name="q" placeholder="Search by name or keyword…"></div>
        <div class="flex gap-12">
          <select name="sort" style="width:auto;"><option value="rating">Sort: Top rated</option><option value="fee_low">Fee: Low to high</option><option value="fee_high">Fee: High to low</option><option value="experience">Most experienced</option></select>
          <button class="btn btn-brass" type="submit">Apply filters</button>
        </div>
      </div>
    </form>
    <div id="searchResults" class="grid grid-3 mt-24"></div>
  </div>`;
});

function runSearch(){
  const form = document.getElementById('filterForm');
  const results = document.getElementById('searchResults');
  if(!form || !results) return;
  const data = Object.fromEntries(new FormData(form).entries());
  const list = DB.listTeachers(data);
  results.innerHTML = list.length ? list.map(teacherCard).join('') :
    `<div class="empty" style="grid-column:1/-1;"><div class="glyph">🔎</div><h3>No teachers match yet</h3><p class="muted">Try widening your filters.</p></div>`;
}

route('/teacher/:id', (params, user) => {
  const t = DB.getUser(params.id);
  if(!t || t.role!=='teacher') return notFoundView();
  const reviews = DB.listReviews(t.id);
  const isFav = user && user.role==='student' && (user.favorites||[]).includes(t.id);
  return `<div class="wrap section">
    <div class="grid grid-sidebar" style="grid-template-columns:1fr 320px;">
      <div>
        <div class="card card-pad">
          <div class="flex gap-16">
            <div class="avatar" style="width:64px;height:64px;font-size:1.5rem;">${initials(t.name)}</div>
            <div style="flex:1;">
              <div class="flex-between">
                <h2 style="margin:0;">${esc(t.name)}</h2>
                <span class="stars">${stars(t.rating)} <span class="muted mono" style="font-size:.8rem;">(${t.reviewsCount})</span></span>
              </div>
              <div class="muted">${esc(t.qualification||'')}${t.university?', '+esc(t.university):''} · ${t.experience||0} yrs experience · ${esc(t.city||'')}</div>
              <div class="mt-8">${t.teachesAllSubjects ? `<span class="tag" style="background:var(--ledger-bg);color:var(--ledger);border-color:var(--ledger);">Teaches all subjects</span>` : (t.subjects||[]).map(s=>`<span class="tag">${s}</span>`).join('')}</div>
            </div>
          </div>
          <p class="mt-16">${esc(t.bio||'')}</p>
          ${t.videoUrl ? `<p><a href="${esc(t.videoUrl)}" target="_blank" rel="noopener">▶ Watch intro video</a></p>` : ''}
          <div class="hr"></div>
          <div class="grid grid-2">
            <div><b>Boards</b><p class="muted">${(t.boards||[]).join(', ')||'—'}</p></div>
            <div><b>Classes taught</b><p class="muted">${(t.classes||[]).join(', ')||'—'}</p></div>
            <div><b>Teaching mode</b><p class="muted">${(t.modes||[]).join(', ')||'—'}</p></div>
            <div><b>Languages</b><p class="muted">${(t.languages||[]).join(', ')||'—'}</p></div>
            ${t.achievements ? `<div style="grid-column:1/-1;"><b>Achievements</b><p class="muted">${esc(t.achievements)}</p></div>` : ''}
            ${t.availabilityNote ? `<div style="grid-column:1/-1;"><b>Availability</b><p class="muted">${esc(t.availabilityNote)}</p></div>` : ''}
          </div>
        </div>

        <div class="card card-pad mt-16">
          <h3>Student reviews</h3>
          ${reviews.length ? reviews.map(r=>`<div class="mb-16"><div class="flex-between"><span class="stars">${stars(r.rating)}</span>${user&&user.role==='admin'?`<button class="btn btn-ghost btn-sm" data-action="delete-review" data-id="${r.id}" style="color:var(--rust);">Delete</button>`:''}</div><span class="muted" style="font-size:.8rem;">${fmtDate(r.date)}</span><p style="margin:4px 0 0;">${esc(r.text)}</p></div>`).join('<hr class="hr">') : '<p class="muted">No reviews yet.</p>'}
        </div>
      </div>

      <div>
        <div class="card card-pad" style="position:sticky;top:80px;">
          <div class="mono" style="font-size:1.4rem;font-weight:700;">${fmtMoney(t.fee)}<span class="muted" style="font-size:.85rem;font-weight:400;">/hour</span></div>
          <div class="rowbtns mt-16">
            <button class="btn btn-brass btn-block" data-action="open-book" data-id="${t.id}">Send Booking Request</button>
          </div>
          <div class="rowbtns mt-8">
            <button class="btn btn-outline btn-block" data-action="fav-toggle" data-id="${t.id}">${isFav?'★ Saved to favourites':'☆ Save to favourites'}</button>
          </div>
          <p class="help mt-16">No payment is captured in this demo — booking just reserves the slot.</p>
        </div>
      </div>
    </div>
  </div>`;
});

function bookingModal(teacherId){
  const t = DB.getUser(teacherId);
  const m = STORE.masters;
  openModal(`Book ${esc(t.name)}`, `
    <form id="bookForm">
      <div class="field-row">
        <div class="field"><label>Subject</label><select name="subject">${(t.teachesAllSubjects ? STORE.masters.subjects : (t.subjects||[])).map(s=>`<option>${s}</option>`).join('')}</select></div>
        <div class="field"><label>Class</label><select name="classLevel">${(t.classes||[]).map(s=>`<option>${s}</option>`).join('')}</select></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Mode</label><select name="mode">${(t.modes||[]).map(s=>`<option>${s}</option>`).join('')}</select></div>
        <div class="field"><label>Preferred day</label><select name="day">${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d=>`<option>${d}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Time slot</label><select name="slot">${m.timeSlots.map(s=>`<option>${s}</option>`).join('')}</select></div>
      <div class="field"><label><input type="checkbox" name="recurring" style="width:auto;" checked> Repeat weekly</label></div>
    </form>
  `, `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-brass" data-action="submit-booking" data-id="${teacherId}">Send Request</button>`);
}

/* ============================================================
   STUDENT VIEWS
   ============================================================ */
route('/student/dashboard', (p, user) => {
  const bookings = DB.listBookings({studentId:user.id});
  const upcoming = bookings.filter(b=>b.status==='confirmed');
  const pending = bookings.filter(b=>b.status==='pending');
  const completed = bookings.filter(b=>b.status==='completed');
  const favs = (user.favorites||[]).map(id=>DB.getUser(id)).filter(Boolean);
  const spend = bookings.filter(b=>b.status!=='rejected'&&b.status!=='cancelled').reduce((s,b)=>s+b.fee,0);
  return dashboardShell(user, `
    <h2>Hi ${esc((user.name||'').split(' ')[0])}, here's your week</h2>
    <div class="stat-grid mt-16">
      <div class="stat-ledger"><div class="num">${upcoming.length}</div><div class="label">Upcoming classes</div></div>
      <div class="stat-ledger"><div class="num">${pending.length}</div><div class="label">Pending requests</div></div>
      <div class="stat-ledger"><div class="num">${completed.length}</div><div class="label">Completed classes</div></div>
      <div class="stat-ledger"><div class="num">${fmtMoney(spend)}</div><div class="label">Total spend so far</div></div>
    </div>
    <div class="grid grid-2 mt-24">
      <div class="card card-pad">
        <div class="flex-between"><h3 style="margin:0;">Upcoming &amp; pending</h3><a href="#/student/bookings" class="btn btn-ghost btn-sm">View all</a></div>
        ${bookings.slice(0,4).map(bookingRow).join('') || '<p class="muted mt-16">No bookings yet — go find a teacher!</p>'}
      </div>
      <div class="card card-pad">
        <div class="flex-between"><h3 style="margin:0;">Favourite teachers</h3><a href="#/search" class="btn btn-ghost btn-sm">Find more</a></div>
        ${favs.length ? favs.map(t=>`<div class="flex-between mt-8"><div class="flex gap-12"><div class="avatar">${initials(t.name)}</div><div><b>${esc(t.name)}</b><div class="muted" style="font-size:.8rem;">${(t.subjects||[]).join(', ')}</div></div></div><a href="#/teacher/${t.id}" class="btn btn-ghost btn-sm">View</a></div>`).join('') : '<p class="muted mt-16">Save teachers you like to compare later.</p>'}
      </div>
    </div>`);
});

function bookingRow(b){
  const other = DB.getUser(b.teacherId) || DB.getUser(b.studentId);
  const badgeClass = {confirmed:'badge-ok', pending:'badge-pending', completed:'badge-ink', rejected:'badge-bad', cancelled:'badge-bad'}[b.status] || 'badge-ink';
  return `<div class="flex-between mt-8" style="padding:10px 0;border-bottom:1px solid var(--line);">
    <div>
      <b>${esc(b.subject)}</b> · ${esc(b.classLevel||'')}<br>
      <span class="muted" style="font-size:.8rem;">${esc(other?.name||'')} · ${esc(b.day||'')} ${esc(b.slot||'')}</span>
    </div>
    <span class="badge ${badgeClass}">${b.status}</span>
  </div>`;
}

route('/student/bookings', (p, user) => {
  const bookings = DB.listBookings({studentId:user.id});
  return dashboardShell(user, `
    <div class="flex-between"><h2 style="margin:0;">My bookings</h2></div>
    <div class="card mt-16 table-wrap">
      <table>
        <thead><tr><th>Teacher</th><th>Subject</th><th>Class</th><th>Day / Slot</th><th>Mode</th><th>Fee</th><th>Status</th><th></th></tr></thead>
        <tbody>
        ${bookings.map(b=>{
          const t = DB.getUser(b.teacherId);
          const badgeClass = {confirmed:'badge-ok', pending:'badge-pending', completed:'badge-ink', rejected:'badge-bad', cancelled:'badge-bad'}[b.status] || 'badge-ink';
          return `<tr>
            <td>${esc(t?.name)}</td><td>${esc(b.subject)}</td><td>${esc(b.classLevel||'')}</td>
            <td>${esc(b.day||'')}<br><span class="muted">${esc(b.slot||'')}</span></td><td>${esc(b.mode||'')}</td><td class="mono">${fmtMoney(b.fee)}</td>
            <td><span class="badge ${badgeClass}">${b.status}</span></td>
            <td class="rowbtns">
              ${b.status==='confirmed' ? `<button class="btn btn-ghost btn-sm" data-action="open-chat" data-id="${b.id}">Chat</button>` : ''}
              ${b.status==='completed' ? `<button class="btn btn-ghost btn-sm" data-action="open-review" data-id="${b.id}">Rate</button>` : ''}
              ${(b.status==='pending'||b.status==='confirmed') ? `<button class="btn btn-ghost btn-sm" data-action="cancel-booking" data-id="${b.id}">Cancel</button>` : ''}
            </td>
          </tr>`;
        }).join('') || `<tr><td colspan="8" class="empty">No bookings yet.</td></tr>`}
        </tbody>
      </table>
    </div>`);
});

route('/student/profile', (p, user) => dashboardShell(user, `
  <h2>Edit profile</h2>
  <form class="card card-pad mt-16" data-action="save-student-profile" style="max-width:480px;">
    <div class="field"><label>Full name</label><input name="name" value="${esc(user.name)}" required></div>
    <div class="field"><label>City</label>${cityField('city', user.city, 'e.g. Vadodara')}</div>
    <div class="field"><label>Board</label><select name="board"><option value="">Not set</option>${STORE.masters.boards.map(b=>`<option ${b===user.board?'selected':''}>${b}</option>`).join('')}</select></div>
    <div class="field"><label>Class</label><select name="classLevel"><option value="">Not set</option>${STORE.masters.classes.map(c=>`<option ${c===user.classLevel?'selected':''}>${c}</option>`).join('')}</select></div>
    <button class="btn btn-brass" type="submit">Save changes</button>
  </form>`));

route('/notifications', (p, user) => {
  const list = DB.listNotifications(user.id);
  return dashboardShell(user, `
    <div class="flex-between"><h2 style="margin:0;">Notifications</h2><button class="btn btn-ghost btn-sm" data-action="mark-read">Mark all read</button></div>
    <div class="card mt-16">
      ${list.map(n=>`<div style="padding:14px 18px;border-bottom:1px solid var(--line);${n.read?'':'background:#FBF3E3;'}">
        <div>${esc(n.text)}</div><div class="muted" style="font-size:.76rem;">${new Date(n.ts).toLocaleString('en-IN')}</div>
      </div>`).join('') || '<div class="empty">No notifications yet.</div>'}
    </div>`);
});

/* ============================================================
   TEACHER VIEWS
   ============================================================ */
route('/teacher/dashboard', (p, user) => {
  const bookings = DB.listBookings({teacherId:user.id});
  const pending = bookings.filter(b=>b.status==='pending');
  const today = bookings.filter(b=>b.status==='confirmed');
  const earnings = bookings.filter(b=>b.status==='completed').reduce((s,b)=>s+b.fee,0);
  const reviews = DB.listReviews(user.id);
  const pendingNote = user.status==='pending' ? `<div class="card card-pad mt-16" style="border-left:4px solid var(--brass);"><b>Your profile is awaiting admin approval.</b><p class="muted" style="margin:4px 0 0;">You'll appear in search results once approved.</p></div>` : '';
  return dashboardShell(user, `
    <h2>Welcome back, ${esc((user.name||'').split(' ')[0])}</h2>
    ${pendingNote}
    <div class="stat-grid mt-16">
      <div class="stat-ledger"><div class="num">${pending.length}</div><div class="label">New requests</div></div>
      <div class="stat-ledger"><div class="num">${today.length}</div><div class="label">Confirmed classes</div></div>
      <div class="stat-ledger"><div class="num">${fmtMoney(earnings)}</div><div class="label">Earnings (completed classes)</div></div>
      <div class="stat-ledger"><div class="num">${user.profileComplete||0}%</div><div class="label">Profile completion</div></div>
    </div>
    <div class="grid grid-2 mt-24">
      <div class="card card-pad">
        <div class="flex-between"><h3 style="margin:0;">New requests</h3><a href="#/teacher/requests" class="btn btn-ghost btn-sm">View all</a></div>
        ${pending.length ? pending.slice(0,4).map(bookingRow).join('') : '<p class="muted mt-16">No new requests right now.</p>'}
      </div>
      <div class="card card-pad">
        <div class="flex-between"><h3 style="margin:0;">Recent reviews</h3></div>
        ${reviews.length ? reviews.slice(0,3).map(r=>`<div class="mt-8"><span class="stars">${stars(r.rating)}</span><p style="margin:2px 0 0;font-size:.86rem;">${esc(r.text)}</p></div>`).join('') : '<p class="muted mt-16">No reviews yet.</p>'}
      </div>
    </div>`);
});

route('/teacher/requests', (p, user) => {
  const bookings = DB.listBookings({teacherId:user.id});
  return dashboardShell(user, `
    <h2>Booking requests</h2>
    <div class="card mt-16 table-wrap">
      <table>
        <thead><tr><th>Student</th><th>Subject</th><th>Class</th><th>Day / Slot</th><th>Mode</th><th>Status</th><th></th></tr></thead>
        <tbody>
        ${bookings.map(b=>{
          const s = DB.getUser(b.studentId);
          const badgeClass = {confirmed:'badge-ok', pending:'badge-pending', completed:'badge-ink', rejected:'badge-bad', cancelled:'badge-bad'}[b.status] || 'badge-ink';
          return `<tr>
            <td>${esc(s?.name)}</td><td>${esc(b.subject)}</td><td>${esc(b.classLevel||'')}</td>
            <td>${esc(b.day||'')}<br><span class="muted">${esc(b.slot||'')}</span></td><td>${esc(b.mode||'')}</td>
            <td><span class="badge ${badgeClass}">${b.status}</span></td>
            <td class="rowbtns">
              ${b.status==='pending' ? `<button class="btn btn-brass btn-sm" data-action="accept-booking" data-id="${b.id}">Accept</button><button class="btn btn-ghost btn-sm" data-action="reject-booking" data-id="${b.id}">Decline</button>` : ''}
              ${b.status==='confirmed' ? `<button class="btn btn-ghost btn-sm" data-action="open-chat" data-id="${b.id}">Chat</button><button class="btn btn-ghost btn-sm" data-action="complete-booking" data-id="${b.id}">Mark complete</button>` : ''}
            </td>
          </tr>`;
        }).join('') || `<tr><td colspan="7" class="empty">No requests yet.</td></tr>`}
        </tbody>
      </table>
    </div>`);
});

route('/teacher/calendar', (p, user) => {
  const bookings = DB.listBookings({teacherId:user.id}).filter(b=>b.status==='confirmed');
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  return dashboardShell(user, `
    <h2>Weekly calendar</h2>
    <div class="week-grid mt-16">
      ${days.map(d=>`<div class="week-day"><div class="d-head">${d.slice(0,3)}</div>${bookings.filter(b=>b.day===d).map(b=>`<div class="slot">${b.slot}<br>${esc(DB.getUser(b.studentId)?.name||'')}</div>`).join('') || '<div class="muted" style="font-size:.72rem;">Free</div>'}</div>`).join('')}
    </div>`);
});

const CHIP_FIELDS = [
  ['boards','Boards'], ['classes','Classes'],
  ['languages','Languages'], ['modes','Teaching Modes'],
];
route('/teacher/profile', (p, user) => dashboardShell(user, `
  <h2>Edit teaching profile</h2>
  <p class="muted">This is what students see when they search — the more complete, the better your match rate.</p>
  <form class="card card-pad mt-16" data-action="save-teacher-profile">
    <div class="eyebrow">SUBJECTS</div>
    <div class="field mt-8">
      <label><input type="checkbox" id="allSubjectsChk" name="teachesAllSubjects" style="width:auto;" ${user.teachesAllSubjects?'checked':''}> I teach <b>any / all subjects</b> (skip picking specific ones below)</label>
    </div>
    <div class="field" id="specificSubjectsField" style="${user.teachesAllSubjects?'opacity:.4;':''}">
      <label>Specific subjects</label>
      <div class="chip-select">
        ${STORE.masters.subjects.map(v=>`<label><input type="checkbox" name="subjects" value="${esc(v)}" ${(user.subjects||[]).includes(v)?'checked':''} ${user.teachesAllSubjects?'disabled':''}> ${esc(v)}</label>`).join('')}
      </div>
    </div>

    ${CHIP_FIELDS.map(([key,label])=>`
      <div class="field">
        <label>${label}</label>
        <div class="chip-select">
          ${STORE.masters[key].map(v=>`<label><input type="checkbox" name="${key}" value="${esc(v)}" ${ (user[key]||[]).includes(v) ? 'checked':''}> ${esc(v)}</label>`).join('')}
        </div>
      </div>`).join('')}

    <div class="eyebrow mt-16">RATES &amp; EXPERIENCE</div>
    <div class="field-row mt-8">
      <div class="field"><label>Fee (₹/hour)</label><input type="number" name="fee" value="${user.fee||0}" min="0" required></div>
      <div class="field"><label>Experience (years)</label><input type="number" name="experience" value="${user.experience||0}" min="0" required></div>
    </div>

    <div class="eyebrow mt-16">QUALIFICATIONS</div>
    <div class="field-row mt-8">
      <div class="field"><label>Highest qualification</label>
        <select name="qualification"><option value="">Select…</option>${(STORE.masters.qualifications||[]).map(q=>`<option ${q===user.qualification?'selected':''}>${q}</option>`).join('')}</select>
      </div>
      <div class="field"><label>University / Institute</label><input name="university" value="${esc(user.university||'')}" placeholder="e.g. MS University, Baroda"></div>
    </div>
    <div class="field"><label>Achievements / certifications</label><textarea name="achievements" rows="2" placeholder="Awards, publications, top-scorer batches, etc.">${esc(user.achievements||'')}</textarea></div>

    <div class="eyebrow mt-16">CONTACT &amp; LOCATION</div>
    <div class="field-row mt-8">
      <div class="field"><label>City</label>${cityField('city', user.city, 'e.g. Vadodara')}</div>
      <div class="field"><label>PIN code</label><input name="pinCode" value="${esc(user.pinCode||'')}" placeholder="e.g. 390001"></div>
    </div>
    <div class="field"><label>Address</label><input name="address" value="${esc(user.address||'')}" placeholder="Area / locality — shown only after a booking is confirmed"></div>
    <div class="field"><label>Alternate phone</label><input name="altPhone" value="${esc(user.altPhone||'')}"></div>

    <div class="eyebrow mt-16">PROFILE</div>
    <div class="field mt-8"><label>Gender</label><select name="gender"><option ${user.gender==='Female'?'selected':''}>Female</option><option ${user.gender==='Male'?'selected':''}>Male</option><option ${user.gender==='Other'?'selected':''}>Other</option></select></div>
    <div class="field"><label>Bio</label><textarea name="bio" rows="3" placeholder="Tell students about your teaching style…">${esc(user.bio||'')}</textarea></div>
    <div class="field"><label>Intro video link (optional)</label><input name="videoUrl" value="${esc(user.videoUrl||'')}" placeholder="YouTube / Drive link"></div>
    <div class="field"><label>Availability notes</label><input name="availabilityNote" value="${esc(user.availabilityNote||'')}" placeholder="e.g. Weekday evenings, Sunday mornings"></div>

    <button class="btn btn-brass mt-8" type="submit">Save profile</button>
  </form>`));

/* ============================================================
   PARENT VIEWS
   ============================================================ */
route('/parent/dashboard', (p, user) => {
  const kids = (user.children||[]).map(id=>DB.getUser(id)).filter(Boolean);
  const allKidBookings = kids.flatMap(k=>DB.listBookings({studentId:k.id}));
  const upcoming = allKidBookings.filter(b=>b.status==='confirmed');
  const pending = allKidBookings.filter(b=>b.status==='pending');
  const spend = allKidBookings.filter(b=>b.status!=='rejected'&&b.status!=='cancelled').reduce((s,b)=>s+b.fee,0);
  return dashboardShell(user, `
    <h2>Hello ${esc((user.name||'').split(' ')[0])}</h2>
    <div class="stat-grid mt-16">
      <div class="stat-ledger"><div class="num">${kids.length}</div><div class="label">Linked children</div></div>
      <div class="stat-ledger"><div class="num">${upcoming.length}</div><div class="label">Upcoming classes</div></div>
      <div class="stat-ledger"><div class="num">${pending.length}</div><div class="label">Pending requests</div></div>
      <div class="stat-ledger"><div class="num">${fmtMoney(spend)}</div><div class="label">Total spend</div></div>
    </div>
    <div class="card card-pad mt-16">
      <h3 style="margin-top:0;">Link a child's account</h3>
      <p class="muted">Enter the email your child registered as a Student with.</p>
      <form class="flex gap-8" data-action="link-child"><input name="childEmail" type="email" required placeholder="child@example.com"><button class="btn btn-brass" type="submit">Link</button></form>
    </div>
    ${kids.map(k=>{
      const bookings = DB.listBookings({studentId:k.id});
      return `<div class="card card-pad mt-16">
        <div class="flex-between"><h3 style="margin:0;">${esc(k.name)} · ${esc(k.classLevel||'')}</h3><a href="#/search" class="btn btn-ghost btn-sm">Book a teacher</a></div>
        ${bookings.map(bookingRow).join('') || '<p class="muted mt-16">No bookings yet.</p>'}
      </div>`;
    }).join('') || '<p class="muted mt-16">No linked children yet.</p>'}
  `);
});

/* ============================================================
   ADMIN VIEWS
   ============================================================ */
route('/admin/dashboard', (p, user) => {
  const st = DB.stats();
  return dashboardShell(user, `
    <h2>Platform overview</h2>
    <div class="stat-grid mt-16">
      <div class="stat-ledger"><div class="num">${st.teachers}</div><div class="label">Teachers (${st.pendingTeachers} pending)</div></div>
      <div class="stat-ledger"><div class="num">${st.students}</div><div class="label">Students</div></div>
      <div class="stat-ledger"><div class="num">${st.bookings}</div><div class="label">Total bookings</div></div>
      <div class="stat-ledger"><div class="num">${fmtMoney(st.revenue)}</div><div class="label">Gross booking value</div></div>
      <div class="stat-ledger"><div class="num">${fmtMoney(st.commission)}</div><div class="label">Platform commission (10%)</div></div>
    </div>
    <div class="grid grid-2 mt-24">
      <div class="card card-pad">
        <h3>Bookings by status</h3>
        <canvas id="statusChart" width="420" height="220" style="width:100%;height:220px;"></canvas>
      </div>
      <div class="card card-pad">
        <div class="flex-between"><h3 style="margin:0;">Teachers awaiting approval</h3></div>
        ${STORE.allProfiles.filter(t=>t.role==='teacher'&&t.status==='pending').map(t=>`<div class="flex-between mt-8"><div class="flex gap-12"><div class="avatar">${initials(t.name)}</div><div><b>${esc(t.name)}</b><div class="muted" style="font-size:.8rem;">${(t.subjects||[]).join(', ')}</div></div></div>
          <div class="rowbtns"><button class="btn btn-brass btn-sm" data-action="approve-teacher" data-id="${t.id}">Approve</button></div></div>`).join('') || '<p class="muted mt-16">All caught up.</p>'}
      </div>
    </div>
    <div class="grid grid-2 mt-24">
      <div class="card card-pad">
        <div class="flex-between"><h3 style="margin:0;">All teachers</h3></div>
        <div class="table-wrap mt-8"><table><thead><tr><th>Name</th><th>City</th><th>Status</th><th></th></tr></thead><tbody>
        ${STORE.allProfiles.filter(u=>u.role==='teacher').map(t=>`<tr><td>${esc(t.name)}</td><td>${esc(t.city||'')}</td><td><span class="badge ${t.status==='active'?'badge-ok':t.status==='pending'?'badge-pending':'badge-bad'}">${t.status}</span></td>
          <td class="rowbtns">
            <button class="btn btn-ghost btn-sm" data-action="admin-edit-teacher" data-id="${t.id}">Edit</button>
            ${t.status!=='active'?`<button class="btn btn-ghost btn-sm" data-action="approve-teacher" data-id="${t.id}">Activate</button>`:`<button class="btn btn-ghost btn-sm" data-action="suspend-teacher" data-id="${t.id}">Suspend</button>`}
            <button class="btn btn-ghost btn-sm" data-action="delete-user" data-id="${t.id}" style="color:var(--rust);">Delete</button>
          </td></tr>`).join('') || `<tr><td colspan="4" class="empty">No teachers yet.</td></tr>`}
        </tbody></table></div>
      </div>
      <div class="card card-pad">
        <div class="flex-between"><h3 style="margin:0;">All students</h3></div>
        <div class="table-wrap mt-8"><table><thead><tr><th>Name</th><th>City</th><th>Class</th><th></th></tr></thead><tbody>
        ${STORE.allProfiles.filter(u=>u.role==='student').map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.city||'')}</td><td>${esc(s.classLevel||'')}</td>
          <td class="rowbtns"><button class="btn btn-ghost btn-sm" data-action="delete-user" data-id="${s.id}" style="color:var(--rust);">Delete</button></td></tr>`).join('') || `<tr><td colspan="4" class="empty">No students yet.</td></tr>`}
        </tbody></table></div>
      </div>
    </div>
    <div class="card card-pad mt-24">
      <div class="flex-between"><h3 style="margin:0;">All parents</h3></div>
      <div class="table-wrap mt-8"><table><thead><tr><th>Name</th><th>City</th><th></th></tr></thead><tbody>
      ${STORE.allProfiles.filter(u=>u.role==='parent').map(pu=>`<tr><td>${esc(pu.name)}</td><td>${esc(pu.city||'')}</td>
        <td class="rowbtns"><button class="btn btn-ghost btn-sm" data-action="delete-user" data-id="${pu.id}" style="color:var(--rust);">Delete</button></td></tr>`).join('') || `<tr><td colspan="3" class="empty">No parents yet.</td></tr>`}
      </tbody></table></div>
    </div>`);
});

function teacherEditFormHtml(t){
  return `
    <div class="eyebrow">SUBJECTS</div>
    <div class="field mt-8"><label><input type="checkbox" id="allSubjectsChk" name="teachesAllSubjects" style="width:auto;" ${t.teachesAllSubjects?'checked':''}> Teaches any / all subjects</label></div>
    <div class="field" id="specificSubjectsField" style="${t.teachesAllSubjects?'opacity:.4;':''}">
      <div class="chip-select">${STORE.masters.subjects.map(v=>`<label><input type="checkbox" name="subjects" value="${esc(v)}" ${(t.subjects||[]).includes(v)?'checked':''} ${t.teachesAllSubjects?'disabled':''}> ${esc(v)}</label>`).join('')}</div>
    </div>
    ${CHIP_FIELDS.map(([key,label])=>`<div class="field"><label>${label}</label><div class="chip-select">${STORE.masters[key].map(v=>`<label><input type="checkbox" name="${key}" value="${esc(v)}" ${(t[key]||[]).includes(v)?'checked':''}> ${esc(v)}</label>`).join('')}</div></div>`).join('')}
    <div class="field-row"><div class="field"><label>Fee (₹/hr)</label><input type="number" name="fee" value="${t.fee||0}"></div><div class="field"><label>Experience (yrs)</label><input type="number" name="experience" value="${t.experience||0}"></div></div>
    <div class="field-row"><div class="field"><label>City</label>${cityField('city', t.city, 'e.g. Vadodara')}</div><div class="field"><label>Status</label><select name="status"><option value="active" ${t.status==='active'?'selected':''}>active</option><option value="pending" ${t.status==='pending'?'selected':''}>pending</option><option value="suspended" ${t.status==='suspended'?'selected':''}>suspended</option></select></div></div>
    <div class="field"><label>Qualification</label><input name="qualification" value="${esc(t.qualification||'')}"></div>
    <div class="field"><label>Bio</label><textarea name="bio" rows="3">${esc(t.bio||'')}</textarea></div>`;
}

/* ---------------- Admin bookings manager ---------------- */
route('/admin/bookings', (p, user) => dashboardShell(user, `
  <h2>All bookings</h2>
  <div class="card mt-16 table-wrap">
    <table><thead><tr><th>Student</th><th>Teacher</th><th>Subject</th><th>Day/Slot</th><th>Fee</th><th>Status</th><th></th></tr></thead><tbody>
    ${STORE.bookings.map(b=>`<tr>
      <td>${esc(DB.getUser(b.studentId)?.name||'')}</td><td>${esc(DB.getUser(b.teacherId)?.name||'')}</td><td>${esc(b.subject)}</td>
      <td>${esc(b.day||'')}<br><span class="muted">${esc(b.slot||'')}</span></td><td class="mono">${fmtMoney(b.fee)}</td>
      <td><select data-action="admin-set-booking-status" data-id="${b.id}">${['pending','confirmed','completed','rejected','cancelled'].map(s=>`<option value="${s}" ${s===b.status?'selected':''}>${s}</option>`).join('')}</select></td>
      <td><button class="btn btn-ghost btn-sm" data-action="delete-booking" data-id="${b.id}" style="color:var(--rust);">Delete</button></td>
    </tr>`).join('') || `<tr><td colspan="7" class="empty">No bookings yet.</td></tr>`}
    </tbody></table>
  </div>`));

const MASTER_LABELS = { subjects:'Subjects', boards:'Boards', classes:'Classes', cities:'Cities', languages:'Languages', modes:'Teaching Modes', timeSlots:'Time Slots', qualifications:'Qualifications' };
function masterLabel(key){ return MASTER_LABELS[key] || key.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase()); }
route('/admin/masters', (p, user) => {
  const keys = (STORE.masterKeys && STORE.masterKeys.length ? STORE.masterKeys : Object.keys(MASTER_LABELS));
  return dashboardShell(user, `
    <div class="flex-between"><h2 style="margin:0;">Master management</h2></div>
    <p class="muted">Add or remove values without touching code — every dropdown across the platform reads from here. You can also create a brand-new category below.</p>
    <div class="card card-pad mt-16">
      <h3 style="margin-top:0;font-size:1rem;">Add a new category</h3>
      <form class="flex gap-8" data-action="add-master-category">
        <input name="key" placeholder="Category name, e.g. paymentMethods" required>
        <input name="val" placeholder="First value in it" required>
        <button class="btn btn-outline btn-sm" type="submit">Create</button>
      </form>
    </div>
    <div class="grid grid-3 mt-16">
      ${keys.map(key=>`
      <div class="card card-pad">
        <h3 style="font-size:1rem;">${esc(masterLabel(key))}</h3>
        <div class="mt-8">${DB.listMaster(key).map(v=>`<span class="tag">${esc(v)} <button data-action="remove-master" data-key="${key}" data-val="${esc(v)}" style="border:none;background:none;color:var(--rust);cursor:pointer;margin-left:4px;">✕</button></span>`).join('') || '<span class="muted" style="font-size:.8rem;">Empty</span>'}</div>
        <form class="flex gap-8 mt-8" data-action="add-master" data-key="${key}"><input name="val" placeholder="Add new…" required><button class="btn btn-outline btn-sm" type="submit">Add</button></form>
      </div>`).join('')}
    </div>`);
});

route('/admin/reports', (p, user) => {
  return dashboardShell(user, `
    <div class="flex-between"><h2 style="margin:0;">Reports</h2>
      <div class="rowbtns">
        <button class="btn btn-outline btn-sm" data-action="export-csv">Export CSV</button>
        <button class="btn btn-outline btn-sm" data-action="export-xlsx">Export Excel</button>
        <button class="btn btn-outline btn-sm" data-action="export-word">Export Word</button>
        <button class="btn btn-outline btn-sm" data-action="export-pdf">Export PDF</button>
        <button class="btn btn-outline btn-sm" data-action="print-report">Print</button>
      </div>
    </div>
    <div id="reportArea" class="card card-pad mt-16">
      <h3>Booking report — all time</h3>
      <div class="table-wrap">
        <table><thead><tr><th>ID</th><th>Student</th><th>Teacher</th><th>Subject</th><th>Fee</th><th>Status</th><th>Date</th></tr></thead><tbody>
        ${STORE.bookings.map(b=>`<tr><td class="mono" style="font-size:.72rem;">${b.id.slice(0,8)}</td><td>${esc(DB.getUser(b.studentId)?.name)}</td><td>${esc(DB.getUser(b.teacherId)?.name)}</td><td>${esc(b.subject)}</td><td class="mono">${fmtMoney(b.fee)}</td><td>${b.status}</td><td>${fmtDate(b.createdAt)}</td></tr>`).join('') || `<tr><td colspan="7" class="empty">No bookings yet.</td></tr>`}
        </tbody></table>
      </div>
    </div>
    <p class="help mt-16">CSV/Excel downloads happen entirely in your browser. PDF export renders a formatted document you can save or print.</p>`);
});

route('/admin/data', (p, user) => `
  ${dashboardShell(user, `
    <h2>Data Center</h2>
    <p class="muted">Full backup/restore of the shared database. Only admins can see this page.</p>

    <div class="grid grid-2 mt-16">
      <div class="card card-pad">
        <h3 style="margin-top:0;">Backup</h3>
        <p class="muted">Downloads every table (profiles, bookings, messages, reviews, notifications, masters) as one JSON file.</p>
        <button class="btn btn-brass" data-action="backup-data">Download full backup (.json)</button>
      </div>
      <div class="card card-pad">
        <h3 style="margin-top:0;">Restore</h3>
        <p class="muted">Upload a backup JSON file to restore data. <b>Important:</b> this can only restore data for user accounts that still exist — it cannot recreate deleted logins (those live in Supabase Auth, not this table). Restore booking/review/message history any time; for full user recovery, avoid deleting accounts in the first place.</p>
        <input type="file" id="restoreFile" accept="application/json" class="mt-8">
        <button class="btn btn-outline mt-8" data-action="restore-data">Restore from file</button>
        <div id="restoreLog" class="mono mt-16" style="font-size:.78rem;white-space:pre-line;"></div>
      </div>
    </div>

    <div class="card card-pad mt-16">
      <h3 style="margin-top:0;">Export &amp; share</h3>
      <p class="muted">Same exports as the Reports page, handy from here too.</p>
      <div class="rowbtns">
        <button class="btn btn-outline btn-sm" data-action="export-csv">Bookings → CSV</button>
        <button class="btn btn-outline btn-sm" data-action="export-xlsx">Bookings → Excel</button>
        <button class="btn btn-outline btn-sm" data-action="export-word">Bookings → Word</button>
        <button class="btn btn-outline btn-sm" data-action="export-pdf">Bookings → PDF</button>
      </div>
    </div>
  `)}`);

/* ---------------- Shared dashboard shell ---------------- */
function dashboardShell(user, contentHtml){
  const path = (location.hash||'').replace(/^#/,'');
  const items = {
    student: [['#/student/dashboard','🏠 Dashboard'],['#/search','🔍 Find Teachers'],['#/student/bookings','📅 My Bookings'],['#/student/profile','⚙️ Edit Profile'],['#/notifications','🔔 Notifications']],
    teacher: [['#/teacher/dashboard','🏠 Dashboard'],['#/teacher/requests','📥 Requests'],['#/teacher/calendar','🗓 Calendar'],['#/teacher/profile','⚙️ Edit Profile'],['#/notifications','🔔 Notifications']],
    parent: [['#/parent/dashboard','🏠 Dashboard'],['#/search','🔍 Find Teachers'],['#/notifications','🔔 Notifications']],
    admin: [['#/admin/dashboard','🏠 Overview'],['#/admin/bookings','📖 Bookings'],['#/admin/masters','🗂 Master Data'],['#/admin/reports','📊 Reports'],['#/admin/data','💾 Data Center']],
  }[user.role] || [];
  return `<div class="wrap section">
    <div class="grid grid-sidebar">
      <nav class="side-nav card card-pad">${items.map(([href,label])=>`<a href="${href}" class="${path===href.replace('#','')?'active':''}">${label}</a>`).join('')}</nav>
      <div>${contentHtml}</div>
    </div>
  </div>`;
}

/* ---------------- Simple offline-friendly bar chart ---------------- */
function drawStatusChart(){
  const canvas = document.getElementById('statusChart');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = 220;
  canvas.width = w*dpr; canvas.height = h*dpr; ctx.scale(dpr,dpr);
  const st = DB.stats();
  const data = [['Confirmed',st.confirmed,'#2F5233'],['Pending',st.pending,'#C7962C'],['Completed',st.completed,'#16233F']];
  const max = Math.max(1, ...data.map(d=>d[1]));
  const barW = 70, gap = 50, base = h-30;
  ctx.clearRect(0,0,w,h);
  ctx.font = '12px Inter, sans-serif';
  data.forEach((d,i)=>{
    const x = 40 + i*(barW+gap);
    const barH = (d[1]/max) * (h-70);
    ctx.fillStyle = d[2];
    ctx.fillRect(x, base-barH, barW, barH);
    ctx.fillStyle = '#16233F';
    ctx.fillText(d[1], x+barW/2-4, base-barH-8);
    ctx.fillStyle = '#5B6472';
    ctx.fillText(d[0], x, base+18);
  });
}

/* ============================================================
   Exports: CSV / Excel / PDF
   ============================================================ */
function bookingReportRows(){
  const rows = [['ID','Student','Teacher','Subject','Class','Fee','Status','Date']];
  STORE.bookings.forEach(b=>rows.push([b.id, DB.getUser(b.studentId)?.name||'', DB.getUser(b.teacherId)?.name||'', b.subject, b.classLevel||'', b.fee, b.status, fmtDate(b.createdAt)]));
  return rows;
}
function exportCSV(){
  const rows = bookingReportRows();
  const csv = rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tuitionmitra-bookings.csv'; a.click();
}
function exportXLSX(){
  if(typeof XLSX === 'undefined'){ toast('Excel library failed to load — check your internet connection and retry.', 'err'); return; }
  const rows = bookingReportRows();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bookings');
  XLSX.writeFile(wb, 'tuitionmitra-bookings.xlsx');
}
function exportWord(){
  const rows = bookingReportRows();
  const tableHtml = `<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt;">
    <thead><tr style="background:#16233F;color:#fff;">${rows[0].map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.slice(1).map(r=>`<tr>${r.map(c=>`<td>${esc(String(c??''))}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="utf-8"><title>TuitionMitra Booking Report</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
  </head>
  <body>
    <h2 style="font-family:Georgia,serif;color:#16233F;">TuitionMitra — Booking Report</h2>
    <p style="font-family:Calibri,Arial,sans-serif;font-size:10pt;color:#5B6472;">Generated ${new Date().toLocaleString('en-IN')}</p>
    ${tableHtml}
  </body></html>`;
  const blob = new Blob(['\ufeff', doc], { type: 'application/msword' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tuitionmitra-bookings.doc'; a.click();
}
function exportPDF(){
  if(typeof window.jspdf === 'undefined'){ toast('PDF library failed to load — check your internet connection and retry.', 'err'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(14); doc.text('TuitionMitra — Booking Report', 14, 16);
  doc.setFontSize(9); doc.text(new Date().toLocaleString('en-IN'), 14, 22);
  const rows = bookingReportRows();
  if(doc.autoTable){
    doc.autoTable({ head:[rows[0]], body: rows.slice(1), startY: 28, styles:{fontSize:8}, headStyles:{fillColor:[22,35,63]} });
  } else {
    let y = 30;
    rows.forEach(r=>{ doc.text(r.join(' | '), 14, y); y += 6; });
  }
  doc.save('tuitionmitra-bookings.pdf');
}

/* ============================================================
   Global event delegation
   ============================================================ */
function runPostRender(){
  runSearch();
  drawStatusChart();
}

document.addEventListener('submit', (e)=>{
  const el = e.target;
  const action = el.dataset && el.dataset.action;
  if(!action) return;
  e.preventDefault();
  const d = () => Object.fromEntries(new FormData(el).entries());

  if(action === 'hero-search'){
    const data = d();
    const qs = data;
    navigate('#/search');
    setTimeout(()=>{
      const form = document.getElementById('filterForm');
      if(form){ Object.entries(qs).forEach(([k,v])=>{ if(form[k]) form[k].value = v; }); runSearch(); }
    }, 60);
    return;
  }
  if(action === 'filter-form'){ runSearch(); return; }

  if(action === 'login-form'){
    guarded(async ()=>{
      const data = d();
      const btnEl = el.querySelector('button[type=submit]');
      if(btnEl){ btnEl.disabled = true; btnEl.textContent = 'Signing in…'; }
      const res = await DB.login(data.email.trim(), data.password);
      if(btnEl){ btnEl.disabled = false; btnEl.textContent = 'Log in'; }
      if(res.error){ showAuthError(res.error); return; }
      toast(`Welcome back, ${(res.user.name||'').split(' ')[0]}!`);
      navigate('#/' + (res.user.role==='admin' ? 'admin/dashboard' : res.user.role+'/dashboard'));
      render();
    });
    return;
  }
  if(action === 'register-form'){
    guarded(async ()=>{
      const data = d();
      const res = await DB.register(data);
      if(res.error){ showAuthError(res.error); return; }
      if(res.needsConfirmation){ toast('Account created — check your email to confirm, then log in.'); navigate('#/login'); return; }
      toast(data.role==='teacher' ? 'Account created! Your profile is pending admin approval.' : 'Account created — welcome!');
      navigate('#/' + (res.user.role==='admin' ? 'admin/dashboard' : res.user.role+'/dashboard'));
      render();
    });
    return;
  }

  if(action === 'send-chat'){
    guarded(async ()=>{
      const text = el.text.value.trim();
      if(!text) return;
      const bookingId = el.dataset.booking;
      const b = STORE.bookings.find(x=>x.id===bookingId);
      const other = STORE.me.id===b.studentId ? b.teacherId : b.studentId;
      const res = await DB.sendMessage(bookingId, STORE.me.id, other, text);
      if(res.error){ toast(res.error, 'err'); return; }
      chatModal(bookingId);
    });
    return;
  }

  if(action === 'add-master-category'){
    guarded(async ()=>{
      const data = d();
      const key = data.key.trim().replace(/\s+/g,'_');
      if(!key || !data.val.trim()) return;
      const res = await DB.addMasterItem(key, data.val.trim());
      if(res.error){ toast(res.error, 'err'); return; }
      toast('Category created');
      render();
    });
    return;
  }
  if(action === 'add-master'){
    guarded(async ()=>{
      const val = el.val.value.trim();
      if(!val) return;
      const res = await DB.addMasterItem(el.dataset.key, val);
      if(res.error){ toast(res.error, 'err'); return; }
      render();
    });
    return;
  }

  if(action === 'save-teacher-profile'){
    guarded(async ()=>{
      const fd = new FormData(el);
      const getAll = (k)=> fd.getAll(k);
      const teachesAll = fd.get('teachesAllSubjects') === 'on';
      const patch = {
        subjects: teachesAll ? [] : getAll('subjects'), teaches_all_subjects: teachesAll,
        boards: getAll('boards'), classes: getAll('classes'),
        languages: getAll('languages'), modes: getAll('modes'),
        fee: Number(fd.get('fee')||0), experience: Number(fd.get('experience')||0),
        qualification: fd.get('qualification')||'', university: fd.get('university')||'',
        achievements: fd.get('achievements')||'', bio: fd.get('bio')||'', gender: fd.get('gender')||'',
        address: fd.get('address')||'', pin_code: fd.get('pinCode')||'', alt_phone: fd.get('altPhone')||'',
        video_url: fd.get('videoUrl')||'', availability_note: fd.get('availabilityNote')||'',
        profile_complete: Math.min(100, 30 + (teachesAll||getAll('subjects').length ? 15:0) + getAll('boards').length*5 + (fd.get('bio')?15:0) + (fd.get('qualification')?15:0) + (fd.get('achievements')?10:0)),
      };
      const res1 = await DB.updateTeacherProfile(STORE.me.id, patch);
      const res2 = await DB.updateUser(STORE.me.id, { city: fd.get('city') });
      if(res1.error || res2?.error){ toast(res1.error||res2.error, 'err'); return; }
      toast('Profile saved');
      render();
    });
    return;
  }

  if(action === 'save-student-profile'){
    guarded(async ()=>{
      const data = d();
      const res = await DB.updateUser(STORE.me.id, { name: data.name, city: data.city, board: data.board||null, class_level: data.classLevel||null });
      if(res.error){ toast(res.error, 'err'); return; }
      toast('Profile saved');
      render();
    });
    return;
  }

  if(action === 'link-child'){
    guarded(async ()=>{
      const data = d();
      const res = await DB.linkChild(data.childEmail.trim());
      if(res.error){ toast(res.error, 'err'); return; }
      toast('Child linked!');
      render();
    });
    return;
  }
});

document.addEventListener('change', (e)=>{
  if(e.target.id === 'allSubjectsChk'){
    const field = document.getElementById('specificSubjectsField');
    if(!field) return;
    const checked = e.target.checked;
    field.style.opacity = checked ? '.4' : '1';
    field.querySelectorAll('input[type=checkbox]').forEach(cb=>{ cb.disabled = checked; });
    return;
  }
  if(e.target.dataset && e.target.dataset.action === 'admin-set-booking-status'){
    guarded(async ()=>{
      const res = await DB.updateBookingStatus(e.target.dataset.id, e.target.value);
      if(res.error){ toast(res.error, 'err'); return; }
      toast('Booking status updated');
      render();
    });
    return;
  }
});

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-action]');
  if(!btn) return;
  const action = btn.dataset.action;

  if(action === 'toggle-password'){
    const input = document.getElementById(btn.dataset.target);
    if(!input) return;
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.textContent = showing ? '👁' : '🙈';
    btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    return;
  }

  if(action === 'forgot-password'){
    openModal('Reset your password', `
      <form id="forgotForm">
        <div class="field"><label>Email</label><input name="email" type="email" required placeholder="you@example.com"></div>
        <p class="help">We'll email you a reset link.</p>
      </form>
    `, `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-brass" data-action="submit-forgot-password">Send link</button>`);
    return;
  }
  if(action === 'submit-forgot-password'){
    guarded(async ()=>{
      const form = document.getElementById('forgotForm');
      const email = form.email.value.trim();
      if(!email){ toast('Enter your email first', 'err'); return; }
      const res = await DB.requestPasswordReset(email);
      if(res.error){ toast(res.error, 'err'); return; }
      toast('Password reset email sent, if that account exists.');
      closeModal();
    });
    return;
  }

  if(action === 'logout'){ guarded(async ()=>{ await DB.logout(); toast('Logged out'); navigate('#/'); render(); }); return; }
  if(action === 'close-modal'){ closeModal(); return; }
  if(action === 'modal-backdrop' && e.target.id==='modalBack'){ closeModal(); return; }

  if(action === 'fav-toggle'){
    guarded(async ()=>{
      const user = STORE.me;
      if(!user || user.role!=='student'){ toast('Log in as a student to save favourites.', 'err'); return; }
      const nowFav = await DB.toggleFavorite(btn.dataset.id);
      toast(nowFav ? 'Saved to favourites' : 'Removed from favourites');
      render();
    });
    return;
  }

  if(action === 'open-book'){
    const user = STORE.me;
    if(!user){ toast('Please log in as a student or parent to book.', 'err'); navigate('#/login'); return; }
    if(user.role!=='student' && user.role!=='parent'){ toast('Only students/parents can send booking requests.', 'err'); return; }
    bookingModal(btn.dataset.id);
    return;
  }
  if(action === 'submit-booking'){
    guarded(async ()=>{
      const form = document.getElementById('bookForm');
      const d = Object.fromEntries(new FormData(form).entries());
      const user = STORE.me;
      const studentId = user.role==='student' ? user.id : (user.children||[])[0];
      if(!studentId){ toast('No linked student found — link a child from your dashboard first.', 'err'); return; }
      const t = DB.getUser(btn.dataset.id);
      const res = await DB.addBooking({ studentId, teacherId: btn.dataset.id, subject:d.subject, classLevel:d.classLevel, mode:d.mode, day:d.day, slot:d.slot, recurring: !!d.recurring, fee: t.fee });
      if(res.error){ toast(res.error, 'err'); return; }
      closeModal();
      toast('Booking request sent!');
      render();
    });
    return;
  }

  if(action === 'accept-booking'){ guarded(async ()=>{ await DB.updateBookingStatus(btn.dataset.id, 'confirmed'); toast('Booking confirmed'); render(); }); return; }
  if(action === 'reject-booking'){ guarded(async ()=>{ await DB.updateBookingStatus(btn.dataset.id, 'rejected'); toast('Request declined', 'err'); render(); }); return; }
  if(action === 'complete-booking'){ guarded(async ()=>{ await DB.updateBookingStatus(btn.dataset.id, 'completed'); toast('Marked as completed'); render(); }); return; }
  if(action === 'cancel-booking'){ guarded(async ()=>{ await DB.updateBookingStatus(btn.dataset.id, 'cancelled'); toast('Booking cancelled'); render(); }); return; }

  if(action === 'open-review'){ reviewModal(btn.dataset.id); return; }
  if(action === 'submit-review'){
    guarded(async ()=>{
      const form = document.getElementById('reviewForm');
      const d = Object.fromEntries(new FormData(form).entries());
      const b = STORE.bookings.find(x=>x.id===btn.dataset.id);
      const res = await DB.addReview({ teacherId:b.teacherId, studentId:b.studentId, rating:Number(d.rating), text:d.text||'Great class!' });
      if(res.error){ toast(res.error, 'err'); return; }
      closeModal(); toast('Thanks for your review!'); render();
    });
    return;
  }

  if(action === 'open-chat'){ chatModal(btn.dataset.id); return; }
  if(action === 'mark-read'){ guarded(async ()=>{ await DB.markAllRead(STORE.me.id); render(); }); return; }

  if(action === 'approve-teacher'){ guarded(async ()=>{ await DB.updateUser(btn.dataset.id, {status:'active'}); toast('Teacher approved'); render(); }); return; }
  if(action === 'suspend-teacher'){ guarded(async ()=>{ await DB.updateUser(btn.dataset.id, {status:'suspended'}); toast('Teacher suspended', 'err'); render(); }); return; }

  if(action === 'admin-edit-teacher'){
    const t = DB.getUser(btn.dataset.id);
    openModal(`Edit ${esc(t.name)}`, `<form id="adminTeacherForm">${teacherEditFormHtml(t)}</form>`,
      `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-brass" data-action="admin-save-teacher" data-id="${t.id}">Save</button>`);
    return;
  }
  if(action === 'admin-save-teacher'){
    guarded(async ()=>{
      const form = document.getElementById('adminTeacherForm');
      const fd = new FormData(form);
      const getAll = (k)=> fd.getAll(k);
      const teachesAll = fd.get('teachesAllSubjects') === 'on';
      const res1 = await DB.updateTeacherProfile(btn.dataset.id, {
        subjects: teachesAll ? [] : getAll('subjects'), teaches_all_subjects: teachesAll,
        boards: getAll('boards'), classes: getAll('classes'), languages: getAll('languages'), modes: getAll('modes'),
        fee: Number(fd.get('fee')||0), experience: Number(fd.get('experience')||0),
        qualification: fd.get('qualification')||'', bio: fd.get('bio')||'',
      });
      const res2 = await DB.updateUser(btn.dataset.id, { city: fd.get('city'), status: fd.get('status') });
      if(res1.error || res2?.error){ toast(res1.error||res2.error, 'err'); return; }
      closeModal(); toast('Teacher updated'); render();
    });
    return;
  }
  if(action === 'delete-user'){
    guarded(async ()=>{
      const t = DB.getUser(btn.dataset.id);
      if(!confirm(`Delete ${t?.name||'this user'}? This removes their profile data (bookings, messages, reviews) permanently. It does not delete their login account.`)) return;
      const res = await DB.deleteProfile(btn.dataset.id);
      if(res.error){ toast(res.error, 'err'); return; }
      toast('User data deleted'); render();
    });
    return;
  }
  if(action === 'delete-review'){
    guarded(async ()=>{
      if(!confirm('Delete this review permanently?')) return;
      const res = await DB.deleteReview(btn.dataset.id);
      if(res.error){ toast(res.error, 'err'); return; }
      toast('Review deleted'); render();
    });
    return;
  }
  if(action === 'delete-booking'){
    guarded(async ()=>{
      if(!confirm('Delete this booking permanently?')) return;
      const res = await DB.deleteBooking(btn.dataset.id);
      if(res.error){ toast(res.error, 'err'); return; }
      toast('Booking deleted'); render();
    });
    return;
  }

  if(action === 'remove-master'){ guarded(async ()=>{ await DB.removeMasterItem(btn.dataset.key, btn.dataset.val); render(); }); return; }

  if(action === 'export-csv'){ exportCSV(); toast('CSV downloaded'); return; }
  if(action === 'export-xlsx'){ exportXLSX(); toast('Excel file downloaded'); return; }
  if(action === 'export-word'){ exportWord(); toast('Word file downloaded'); return; }
  if(action === 'export-pdf'){ exportPDF(); toast('PDF downloaded'); return; }
  if(action === 'print-report'){ window.print(); return; }

  if(action === 'backup-data'){
    guarded(async ()=>{
      const backup = await DB.exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], {type:'application/json'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `tuitionmitra-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
      toast('Backup downloaded');
    });
    return;
  }
  if(action === 'restore-data'){
    guarded(async ()=>{
      const fileInput = document.getElementById('restoreFile');
      const logEl = document.getElementById('restoreLog');
      if(!fileInput.files.length){ toast('Choose a backup .json file first', 'err'); return; }
      logEl.textContent = 'Reading file…';
      const text = await fileInput.files[0].text();
      let backup;
      try{ backup = JSON.parse(text); } catch(err){ toast('That file is not valid JSON', 'err'); return; }
      logEl.textContent = 'Restoring…\n';
      await DB.restoreBackup(backup, (line)=>{ logEl.textContent += line + '\n'; });
      logEl.textContent += 'Done.';
      toast('Restore complete');
      render();
    });
    return;
  }

  if(action === 'toggle-nav'){ document.getElementById('navlinks').classList.toggle('open'); return; }
});

function reviewModal(bookingId){
  openModal('Rate your teacher', `
    <form id="reviewForm">
      <div class="field"><label>Rating</label>
        <div class="chip-select">${[5,4,3,2,1].map(n=>`<label><input type="radio" name="rating" value="${n}" ${n===5?'checked':''}> ${n}★</label>`).join('')}</div>
      </div>
      <div class="field"><label>Your feedback</label><textarea name="text" rows="3" placeholder="How was the teaching?"></textarea></div>
    </form>
  `, `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-brass" data-action="submit-review" data-id="${bookingId}">Submit</button>`);
}

function chatModal(bookingId){
  const b = STORE.bookings.find(x=>x.id===bookingId);
  const me = STORE.me;
  const other = DB.getUser(me.id===b.studentId ? b.teacherId : b.studentId);
  const msgs = DB.listMessages(bookingId);
  openModal(`Chat with ${esc(other?.name||'')}`, `
    <div id="chatThread" style="max-height:280px;overflow:auto;display:flex;flex-direction:column;gap:8px;">
      ${msgs.map(m=>`<div style="align-self:${m.from===me.id?'flex-end':'flex-start'};background:${m.from===me.id?'var(--ink)':'var(--paper-dim)'};color:${m.from===me.id?'#fff':'var(--ink)'};padding:8px 12px;border-radius:10px;max-width:80%;">
        ${esc(m.text)}<div style="font-size:.66rem;opacity:.7;margin-top:3px;">${new Date(m.ts).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</div></div>`).join('') || '<p class="muted">No messages yet — say hello!</p>'}
    </div>
    <form class="flex gap-8 mt-16" data-action="send-chat" data-booking="${bookingId}"><input name="text" placeholder="Type a message…" required><button class="btn btn-brass" type="submit">Send</button></form>
  `);
}

/* ============================================================
   Boot
   ============================================================ */
window.addEventListener('hashchange', render);

function setupNeededView(){
  return `<div class="wrap section" style="max-width:640px;">
    <div class="card card-pad" style="border-left:4px solid var(--rust);">
      <div class="eyebrow" style="color:var(--rust);">SETUP NEEDED</div>
      <h2>Connect your Supabase project first</h2>
      <p>This app can't log in or load any dashboard yet because <code>js/config.js</code>
      still has placeholder values instead of your real Supabase URL and key.</p>
      <ol style="padding-left:20px;line-height:1.8;">
        <li>Create a free project at <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a></li>
        <li>Run <code>sql/schema.sql</code> in its SQL Editor</li>
        <li>Copy your Project URL + anon key from Project Settings → API</li>
        <li>Paste them into <code>js/config.js</code>, redeploy, and reload this page</li>
      </ol>
      <p class="muted">Full step-by-step instructions are in <code>README.md</code>.</p>
    </div>
  </div>`;
}

async function boot(){
  if(typeof SUPABASE_CONFIGURED === 'undefined' || !SUPABASE_CONFIGURED){
    document.getElementById('view').innerHTML = setupNeededView();
    renderNav(null);
    return;
  }
  try{
    await DB.refresh();
  }catch(err){
    console.error('Initial data load failed:', err);
    document.getElementById('view').innerHTML = `<div class="wrap section"><div class="empty">
      <div class="glyph">⚠️</div><h3>Couldn't reach the database</h3>
      <p class="muted">${esc(err.message||'Unknown error')}</p>
      <p class="muted">Double-check the URL/key in <code>js/config.js</code> and that <code>sql/schema.sql</code> ran successfully, then reload.</p>
    </div></div>`;
    return;
  }
  await render();
  supabase.auth.onAuthStateChange(async () => { await DB.refresh(); render(); });
  const setOnline = ()=> document.getElementById('offlineBanner').classList.toggle('show', !navigator.onLine);
  window.addEventListener('online', setOnline);
  window.addEventListener('offline', setOnline);
  setOnline();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
}
document.addEventListener('DOMContentLoaded', boot);
