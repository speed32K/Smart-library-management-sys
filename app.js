// Shared helpers — backend is Supabase (database + login + live updates).
// Needs this before app.js on every page:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

const SUPABASE_URL = 'https://iiwtuqykguqjgfdykedz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_V6lxl-rue77_pyio3pt01Q_OGe7muJY'; // public key, safe in the browser
const ADMIN_EMAIL = 'admin@smartlibrary.app';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------- Books ---------- */
async function getBooks() {
  const { data, error } = await sb.from('books').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

const likeEscape = s => s.replace(/[\\%_]/g, c => '\\' + c);

async function searchBooks(query) {
  const q = query.trim();
  if (!q) return [];
  // 1) exact serial number
  const exact = await sb.from('books').select('*').ilike('serial', likeEscape(q));
  if (exact.error) throw exact.error;
  if (exact.data.length) return exact.data;
  // 2) partial name or serial
  const [byName, bySerial] = await Promise.all([
    sb.from('books').select('*').ilike('name', '%' + likeEscape(q) + '%'),
    sb.from('books').select('*').ilike('serial', '%' + likeEscape(q) + '%')
  ]);
  if (byName.error) throw byName.error;
  const seen = new Set();
  return [...byName.data, ...(bySerial.data || [])].filter(b => !seen.has(b.id) && seen.add(b.id));
}

// returns an error message, or null when saved
async function addBook(book) {
  const { error } = await sb.from('books').insert(book);
  if (!error) return null;
  if (error.code === '23505') return 'Serial number already exists.';
  return error.message;
}

// returns true if a book was deleted
async function deleteBook(serial) {
  const { data, error } = await sb.from('books').delete().ilike('serial', likeEscape(serial.trim())).select();
  if (error) throw error;
  return data.length > 0;
}

// Runs callback on EVERY device whenever a book is added, changed or deleted
function onBooksChanged(callback) {
  return sb.channel('books-live-' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'books' }, callback)
    .subscribe();
}

/* ---------- Admin login (Supabase Auth) ---------- */
async function login(user, pass) {
  const u = user.trim().replace(/^@/, '').toLowerCase();
  if (u !== 'admin') return false;
  const { error } = await sb.auth.signInWithPassword({ email: ADMIN_EMAIL, password: pass });
  return !error;
}
async function isAdmin() {
  const { data } = await sb.auth.getSession();
  return !!data.session && data.session.user.email === ADMIN_EMAIL;
}
async function logout() { await sb.auth.signOut(); }

/* ---------- Misc ---------- */
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Small inline icons (Lucide-style)
const ICON = {
  book:   '<svg class="i" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  search: '<svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  shield: '<svg class="i" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
  plus:   '<svg class="i" viewBox="0 0 24 24"><path d="M5 12h14M12 5v14"/></svg>',
  trash:  '<svg class="i" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>',
  list:   '<svg class="i" viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  logout: '<svg class="i" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  back:   '<svg class="i" viewBox="0 0 24 24"><path d="m12 19-7-7 7-7M19 12H5"/></svg>',
  library:'<svg class="i" viewBox="0 0 24 24"><path d="m16 6 4 14M12 6v14M8 8v12M4 4v16"/></svg>',
  nobook: '<svg class="i" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="m9.5 7.5 5 5M14.5 7.5l-5 5"/></svg>'
};
