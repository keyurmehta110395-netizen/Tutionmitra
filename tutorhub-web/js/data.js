/* ============================================================
   TuitionMitra — data layer (Supabase-backed)
   ------------------------------------------------------------
   STORE is an in-memory cache, refreshed from the live database
   via DB.refresh(). Views read STORE synchronously (fast, no
   flicker); mutations (DB.addBooking, DB.updateUser, ...) hit
   Supabase then refresh the relevant slice of the cache.
   Row Level Security (see sql/schema.sql) means the rows that
   come back are ALREADY filtered to what the signed-in user is
   allowed to see — a teacher's query for "bookings" only ever
   returns their own bookings, a student's only theirs, and an
   admin's returns everything. That's what enforces "teacher and
   student see limited data, owner/admin sees and controls
   everything" — at the database layer, not just in the UI.
   ============================================================ */

const STORE = {
  session: null,
  me: null,                 // current user's normalized profile (+ favorites/children)
  teachers: [],              // public_teachers view — active teachers only, safe columns
  allProfiles: [],           // admin-only: every profile (students/teachers/parents/admin)
  usersById: {},              // merged lookup cache used by DB.getUser()
  bookings: [],
  messages: [],
  reviews: [],
  notifications: [],
  masters: { subjects:[], boards:[], classes:[], cities:[], languages:[], modes:[], timeSlots:[], qualifications:[] },
};

function uid(prefix){ return prefix + '-' + Math.random().toString(36).slice(2,9); }

function normalizeTeacher(row){
  const t = {
    id: row.id, role: 'teacher', name: row.name, city: row.city, status: row.status || 'active',
    subjects: row.subjects || [], boards: row.boards || [], classes: row.classes || [],
    languages: row.languages || [], modes: row.modes || [], teachesAllSubjects: !!row.teaches_all_subjects,
    fee: row.fee || 0, experience: row.experience || 0,
    qualification: row.qualification || '', university: row.university || '', bio: row.bio || '', gender: row.gender || '',
    address: row.address || '', pinCode: row.pin_code || '', altPhone: row.alt_phone || '',
    achievements: row.achievements || '', videoUrl: row.video_url || '', availabilityNote: row.availability_note || '',
    rating: Number(row.rating || 0), reviewsCount: row.reviews_count ?? row.reviewsCount ?? 0,
    profileComplete: row.profile_complete ?? row.profileComplete ?? 0,
    email: row.email, phone: row.phone,
  };
  STORE.usersById[t.id] = t;
  return t;
}
function normalizeProfile(row){
  const tp = Array.isArray(row.teacher_profiles) ? row.teacher_profiles[0] : row.teacher_profiles;
  const p = {
    id: row.id, role: row.role, name: row.name, email: row.email, phone: row.phone,
    city: row.city, status: row.status, classLevel: row.class_level, board: row.board,
  };
  if (tp) Object.assign(p, {
    subjects: tp.subjects || [], boards: tp.boards || [], classes: tp.classes || [],
    languages: tp.languages || [], modes: tp.modes || [], teachesAllSubjects: !!tp.teaches_all_subjects,
    fee: tp.fee || 0, experience: tp.experience || 0,
    qualification: tp.qualification || '', university: tp.university || '', bio: tp.bio || '', gender: tp.gender || '',
    address: tp.address || '', pinCode: tp.pin_code || '', altPhone: tp.alt_phone || '',
    achievements: tp.achievements || '', videoUrl: tp.video_url || '', availabilityNote: tp.availability_note || '',
    rating: Number(tp.rating || 0), reviewsCount: tp.reviews_count || 0, profileComplete: tp.profile_complete || 0,
  });
  STORE.usersById[p.id] = p;
  return p;
}
function normalizeBooking(row){
  return {
    id: row.id, studentId: row.student_id, teacherId: row.teacher_id, subject: row.subject,
    classLevel: row.class_level, mode: row.mode, day: row.day, slot: row.slot,
    status: row.status, recurring: row.recurring, fee: row.fee, createdAt: row.created_at,
  };
}
function normalizeMessage(row){
  return { id: row.id, bookingId: row.booking_id, from: row.from_id, to: row.to_id, text: row.text, ts: row.created_at };
}
function normalizeReview(row){
  return { id: row.id, teacherId: row.teacher_id, studentId: row.student_id, rating: row.rating, text: row.text, date: row.created_at };
}
function normalizeNotification(row){
  return { id: row.id, userId: row.user_id, text: row.text, read: row.read, ts: row.created_at };
}

async function friendlyError(error, fallback){
  if(!error) return fallback;
  if(error.code === '23505') return 'That slot was just taken by someone else — pick another.';
  return error.message || fallback;
}

const DB = {
  get state(){ return STORE; },

  // ---------------- session / bootstrap ----------------
  async refresh(){
    const { data: { session } } = await supabase.auth.getSession();
    STORE.session = session;

    // Public data — available even signed out, needed for browse/search.
    const { data: masterRows } = await supabase.from('masters').select('*');
    const grouped = { subjects:[], boards:[], classes:[], cities:[], languages:[], modes:[], timeSlots:[], qualifications:[] };
    (masterRows||[]).forEach(r=>{ if(!grouped[r.key]) grouped[r.key]=[]; grouped[r.key].push(r.value); });
    STORE.masters = grouped;
    STORE.masterKeys = Object.keys(grouped).sort(); // includes any custom categories an admin added

    const { data: teacherRows } = await supabase.from('public_teachers').select('*').eq('status','active');
    STORE.teachers = (teacherRows||[]).map(normalizeTeacher);

    const { data: reviewRows } = await supabase.from('reviews').select('*');
    STORE.reviews = (reviewRows||[]).map(normalizeReview);

    if(!session){ STORE.me = null; STORE.bookings=[]; STORE.messages=[]; STORE.notifications=[]; STORE.allProfiles=[]; return null; }

    const { data: meRow, error: meErr } = await supabase.from('profiles').select('*, teacher_profiles(*)').eq('id', session.user.id).single();
    if(meErr || !meRow){ STORE.me = null; return null; }
    const me = normalizeProfile(meRow);

    if(me.role === 'student'){
      const { data: favs } = await supabase.from('favorites').select('teacher_id').eq('student_id', me.id);
      me.favorites = (favs||[]).map(f=>f.teacher_id);
    }
    if(me.role === 'parent'){
      const { data: kids } = await supabase.from('parent_children').select('child_id').eq('parent_id', me.id);
      me.children = (kids||[]).map(k=>k.child_id);
      for(const kid of me.children){
        if(!STORE.usersById[kid]){
          const { data: kidRow } = await supabase.from('profiles').select('*').eq('id', kid).single();
          if(kidRow) normalizeProfile(kidRow);
        }
      }
    }
    STORE.me = me;

    const { data: bookingRows } = await supabase.from('bookings').select('*');
    STORE.bookings = (bookingRows||[]).map(normalizeBooking);

    // Make sure we have display names for everyone in a booking with me (teacher<->student).
    const neededIds = new Set();
    STORE.bookings.forEach(b=>{ neededIds.add(b.studentId); neededIds.add(b.teacherId); });
    const missing = [...neededIds].filter(id => !STORE.usersById[id]);
    if(missing.length){
      const { data: extra } = await supabase.from('profiles').select('*').in('id', missing);
      (extra||[]).forEach(normalizeProfile);
    }

    const { data: msgRows } = await supabase.from('messages').select('*');
    STORE.messages = (msgRows||[]).map(normalizeMessage);

    const { data: notifRows } = await supabase.from('notifications').select('*').eq('user_id', me.id);
    STORE.notifications = (notifRows||[]).map(normalizeNotification);

    if(me.role === 'admin'){
      const { data: allRows } = await supabase.from('profiles').select('*, teacher_profiles(*)');
      STORE.allProfiles = (allRows||[]).map(normalizeProfile);
    } else {
      STORE.allProfiles = [];
    }

    return me;
  },

  // ---------------- auth ----------------
  async login(email, password){
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if(error){
      const msg = /email not confirmed/i.test(error.message) ? 'Please confirm your email first (check your inbox), or ask the admin to disable email confirmation in Supabase for testing.'
        : /invalid login credentials/i.test(error.message) ? 'Incorrect email or password.'
        : error.message;
      return { error: msg };
    }
    await DB.refresh();
    return { user: STORE.me };
  },
  async logout(){
    await supabase.auth.signOut();
    // Wipe the in-memory cache so nothing from this session lingers if
    // someone else signs in on the same device/tab without a full reload.
    STORE.me = null; STORE.allProfiles = []; STORE.usersById = {};
    STORE.bookings = []; STORE.messages = []; STORE.notifications = [];
    await DB.refresh();
  },
  async requestPasswordReset(email){
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
    if(error) return { error: error.message };
    return { ok: true };
  },
  async register({ role, name, email, phone, password, city, classLevel, board }){
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { role, name, phone, city, class_level: classLevel||null, board: board||null } },
    });
    if(error) return { error: error.message };
    if(!data.session) return { needsConfirmation: true };
    await DB.refresh();

    // Self-healing fallback: normally a database trigger creates the
    // profile row automatically. If that trigger is missing or failed
    // (e.g. an older/partial schema run), create the row directly here
    // instead of leaving the account stuck with no profile.
    if(!STORE.me){
      const sanitizedRole = ['student','teacher','parent'].includes(role) ? role : 'student';
      const { error: insErr } = await supabase.from('profiles').insert({
        id: data.user.id, role: sanitizedRole, name, email, phone, city,
        status: sanitizedRole==='teacher' ? 'pending' : 'active',
        class_level: classLevel || null, board: board || null,
      });
      if(insErr){
        return { error: `Account created, but the profile could not be set up (${insErr.message}). This usually means sql/schema.sql didn't fully run in Supabase — see the README troubleshooting section.` };
      }
      if(sanitizedRole === 'teacher'){
        await supabase.from('teacher_profiles').insert({ id: data.user.id });
      }
      await DB.refresh();
    }
    if(!STORE.me){
      return { error: "Signed up, but couldn't load your profile. Check that sql/schema.sql ran completely in Supabase, then try logging in." };
    }
    return { user: STORE.me };
  },

  // ---------------- users ----------------
  getUser(id){ return STORE.usersById[id] || null; },
  async updateUser(id, patch){
    const { error } = await supabase.from('profiles').update(patch).eq('id', id);
    if(error) return { error: error.message };
    await DB.refresh();
    return { ok: true };
  },
  async deleteProfile(id){
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if(error) return { error: error.message };
    await DB.refresh();
    return { ok: true };
  },
  async updateTeacherProfile(id, patch){
    const { error } = await supabase.from('teacher_profiles').update(patch).eq('id', id);
    if(error) return { error: error.message };
    await DB.refresh();
    return { ok: true };
  },
  async linkChild(childEmail){
    const { error } = await supabase.rpc('link_child', { child_email: childEmail });
    if(error) return { error: error.message };
    await DB.refresh();
    return { ok: true };
  },
  async toggleFavorite(teacherId){
    const has = (STORE.me.favorites||[]).includes(teacherId);
    if(has) await supabase.from('favorites').delete().eq('student_id', STORE.me.id).eq('teacher_id', teacherId);
    else await supabase.from('favorites').insert({ student_id: STORE.me.id, teacher_id: teacherId });
    await DB.refresh();
    return !has;
  },

  // ---------------- teachers / search ----------------
  listTeachers(filters={}){
    let list = (filters.status && filters.status !== 'active') ? STORE.allProfiles.filter(u=>u.role==='teacher') : STORE.teachers;
    if(filters.status) list = list.filter(t=>t.status===filters.status);
    if(filters.subject) list = list.filter(t=>t.teachesAllSubjects || t.subjects?.includes(filters.subject));
    if(filters.classLevel) list = list.filter(t=>t.classes?.includes(filters.classLevel));
    if(filters.board) list = list.filter(t=>t.boards?.includes(filters.board));
    if(filters.city) list = list.filter(t=> (t.city||'').trim().toLowerCase() === filters.city.trim().toLowerCase());
    if(filters.mode) list = list.filter(t=>t.modes?.includes(filters.mode));
    if(filters.language) list = list.filter(t=>t.languages?.includes(filters.language));
    if(filters.maxFee) list = list.filter(t=>t.fee<=Number(filters.maxFee));
    if(filters.minRating) list = list.filter(t=>t.rating>=Number(filters.minRating));
    if(filters.gender) list = list.filter(t=>t.gender===filters.gender);
    if(filters.q){
      const q = filters.q.toLowerCase();
      list = list.filter(t=> t.name.toLowerCase().includes(q) || (t.subjects||[]).some(s=>s.toLowerCase().includes(q)));
    }
    const sort = filters.sort || 'rating';
    return [...list].sort((a,b)=>{
      if(sort==='rating') return b.rating-a.rating;
      if(sort==='fee_low') return a.fee-b.fee;
      if(sort==='fee_high') return b.fee-a.fee;
      if(sort==='experience') return b.experience-a.experience;
      return 0;
    });
  },

  // ---------------- bookings ----------------
  listBookings(filters={}){
    let list = STORE.bookings;
    if(filters.studentId) list = list.filter(b=>b.studentId===filters.studentId);
    if(filters.teacherId) list = list.filter(b=>b.teacherId===filters.teacherId);
    if(filters.status) list = list.filter(b=>b.status===filters.status);
    return [...list].sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
  },
  async addBooking(b){
    const clash = STORE.bookings.find(x=> x.teacherId===b.teacherId && x.day===b.day && x.slot===b.slot && (x.status==='pending'||x.status==='confirmed'));
    if(clash) return { error:'That slot is already booked for this teacher. Please pick another.' };
    const { data, error } = await supabase.from('bookings').insert({
      student_id: b.studentId, teacher_id: b.teacherId, subject: b.subject, class_level: b.classLevel,
      mode: b.mode, day: b.day, slot: b.slot, recurring: !!b.recurring, fee: b.fee,
    }).select().single();
    if(error) return { error: await friendlyError(error, "Couldn't create the booking.") };
    await supabase.from('notifications').insert({ user_id: b.teacherId, text: `New booking request from ${STORE.me.name} for ${b.subject}, ${b.classLevel}.` });
    await DB.refresh();
    return { booking: normalizeBooking(data) };
  },
  async updateBookingStatus(id, status){
    const { data, error } = await supabase.from('bookings').update({ status }).eq('id', id).select().single();
    if(error) return { error: error.message };
    const b = normalizeBooking(data);
    const other = STORE.me.id === b.teacherId ? b.studentId : b.teacherId;
    await supabase.from('notifications').insert({ user_id: other, text: `Your booking (${b.subject}) is now ${status}.` });
    await DB.refresh();
    return { booking: b };
  },
  async deleteBooking(id){
    const { error } = await supabase.from('bookings').delete().eq('id', id);
    if(error) return { error: error.message };
    await DB.refresh();
    return { ok: true };
  },

  // ---------------- messages ----------------
  listMessages(bookingId){ return STORE.messages.filter(m=>m.bookingId===bookingId).sort((a,b)=>a.ts.localeCompare(b.ts)); },
  async sendMessage(bookingId, from, to, text){
    const { data, error } = await supabase.from('messages').insert({ booking_id: bookingId, from_id: from, to_id: to, text }).select().single();
    if(error) return { error: error.message };
    const m = normalizeMessage(data);
    STORE.messages.push(m);
    await supabase.from('notifications').insert({ user_id: to, text: `New message: "${text.slice(0,40)}${text.length>40?'…':''}"` });
    return { message: m };
  },

  // ---------------- reviews ----------------
  listReviews(teacherId){ return STORE.reviews.filter(r=>r.teacherId===teacherId).sort((a,b)=>b.date.localeCompare(a.date)); },
  async addReview(review){
    const { error } = await supabase.from('reviews').insert({ teacher_id: review.teacherId, student_id: review.studentId, rating: review.rating, text: review.text });
    if(error) return { error: await friendlyError(error, "Couldn't submit the review — you may need a completed class with this teacher first.") };
    await DB.refresh();
    return { ok: true };
  },
  async deleteReview(id){
    const { error } = await supabase.from('reviews').delete().eq('id', id);
    if(error) return { error: error.message };
    await DB.refresh();
    return { ok: true };
  },

  // ---------------- notifications ----------------
  listNotifications(userId){ return STORE.notifications.filter(n=>n.userId===userId).sort((a,b)=>b.ts.localeCompare(a.ts)); },
  async markAllRead(userId){
    await supabase.from('notifications').update({ read:true }).eq('user_id', userId).eq('read', false);
    STORE.notifications.forEach(n=>{ if(n.userId===userId) n.read=true; });
  },

  // ---------------- masters ----------------
  listMaster(key){ return STORE.masters[key] || []; },
  async addMasterItem(key, value){
    const { error } = await supabase.from('masters').insert({ key, value });
    if(error) return { error: error.message };
    await DB.refresh();
    return { ok: true };
  },
  async removeMasterItem(key, value){
    await supabase.from('masters').delete().eq('key', key).eq('value', value);
    await DB.refresh();
  },

  // ---------------- admin stats ----------------
  stats(){
    const teachers = STORE.allProfiles.filter(u=>u.role==='teacher');
    const students = STORE.allProfiles.filter(u=>u.role==='student');
    const parents = STORE.allProfiles.filter(u=>u.role==='parent');
    const b = STORE.bookings;
    const live = b.filter(x=>x.status!=='rejected' && x.status!=='cancelled');
    return {
      teachers: teachers.length, students: students.length, parents: parents.length,
      pendingTeachers: teachers.filter(t=>t.status==='pending').length,
      bookings: b.length,
      confirmed: b.filter(x=>x.status==='confirmed').length,
      pending: b.filter(x=>x.status==='pending').length,
      completed: b.filter(x=>x.status==='completed').length,
      revenue: live.reduce((s,x)=>s+x.fee,0),
      commission: Math.round(live.reduce((s,x)=>s+x.fee,0)*0.1),
    };
  },

  // ---------------- backup / restore (admin only — see README caveats) ----------------
  async exportBackup(){
    const [profiles, teacherProfiles, bookings, messages, reviews, notifications, masters, favorites, parentChildren] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('teacher_profiles').select('*'),
      supabase.from('bookings').select('*'),
      supabase.from('messages').select('*'),
      supabase.from('reviews').select('*'),
      supabase.from('notifications').select('*'),
      supabase.from('masters').select('*'),
      supabase.from('favorites').select('*'),
      supabase.from('parent_children').select('*'),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      profiles: profiles.data||[], teacher_profiles: teacherProfiles.data||[],
      bookings: bookings.data||[], messages: messages.data||[], reviews: reviews.data||[],
      notifications: notifications.data||[], masters: masters.data||[],
      favorites: favorites.data||[], parent_children: parentChildren.data||[],
    };
  },
  async restoreBackup(backup, log){
    const say = (m)=> log ? log(m) : console.log(m);
    // profiles/teacher_profiles: this updates rows for users that already
    // exist (their auth accounts must already exist — see README, this
    // cannot recreate deleted accounts, only restore their data).
    for(const table of ['profiles','teacher_profiles','masters','bookings','messages','reviews','notifications','favorites','parent_children']){
      const rows = backup[table];
      if(!rows || !rows.length) continue;
      const { error } = await supabase.from(table).upsert(rows);
      say(error ? `⚠ ${table}: ${error.message}` : `✓ ${table}: ${rows.length} rows restored`);
    }
    await DB.refresh();
  },
};
