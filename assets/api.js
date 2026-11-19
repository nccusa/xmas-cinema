// 政大學生會 聖誕露天電影院：共用連線工具
// 這裡的金鑰是 Supabase 的「公開金鑰」，本來就會出現在網頁上；
// 真正的資料保護靠資料庫的權限控管（RLS）與伺服器端函式。
const CFG = {
  url: 'https://zrmghtvsxijwuzrypbpe.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpybWdodHZzeGlqd3V6cnlwYnBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwOTkxOTgsImV4cCI6MjExMDY3NTE5OH0.nfD_2vxFXDw0jsr_1S5Me1kWB9g2YZYbbrclQY1dZrc'
};

const Api = {
  session: null,
  storeKey: 'xc_session',
  loadSession() {
    try { this.session = JSON.parse(sessionStorage.getItem(this.storeKey)); } catch (e) { this.session = null; }
    return this.session;
  },
  saveSession(s) {
    this.session = s;
    try { s ? sessionStorage.setItem(this.storeKey, JSON.stringify(s)) : sessionStorage.removeItem(this.storeKey); } catch (e) {}
  },
  headers(json = true, extra = {}) {
    const h = { apikey: CFG.key, Authorization: 'Bearer ' + (this.session ? this.session.access_token : CFG.key), ...extra };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  },
  async handle(r) {
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!r.ok) {
      if (r.status === 401 && this.session) { this.saveSession(null); }
      const msg = (data && (data.message || data.error_description || data.msg)) || ('連線發生錯誤（' + r.status + '）');
      throw new Error(msg);
    }
    return data;
  },
  async ensureFresh() {
    if (!this.session) return;
    if ((this.session.expires_at || 0) - 90 > Date.now() / 1000) return;
    try {
      const r = await fetch(CFG.url + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', headers: { apikey: CFG.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: this.session.refresh_token })
      });
      const d = await this.handle(r);
      d.expires_at = Math.floor(Date.now() / 1000) + d.expires_in;
      this.saveSession(d);
    } catch (e) { this.saveSession(null); throw new Error('登入已過期，請重新登入'); }
  },
  async rpc(name, args = {}) {
    await this.ensureFresh();
    const r = await fetch(CFG.url + '/rest/v1/rpc/' + name, { method: 'POST', headers: this.headers(), body: JSON.stringify(args) });
    return this.handle(r);
  },
  async select(table, query) {
    await this.ensureFresh();
    const r = await fetch(CFG.url + '/rest/v1/' + table + '?' + query, { headers: this.headers(false) });
    return this.handle(r);
  },
  async insert(table, row) {
    await this.ensureFresh();
    const r = await fetch(CFG.url + '/rest/v1/' + table, { method: 'POST', headers: this.headers(true, { Prefer: 'return=representation' }), body: JSON.stringify(row) });
    return this.handle(r);
  },
  async patch(table, filter, row) {
    await this.ensureFresh();
    const r = await fetch(CFG.url + '/rest/v1/' + table + '?' + filter, { method: 'PATCH', headers: this.headers(true, { Prefer: 'return=representation' }), body: JSON.stringify(row) });
    return this.handle(r);
  },
  async login(email, password) {
    const r = await fetch(CFG.url + '/auth/v1/token?grant_type=password', {
      method: 'POST', headers: { apikey: CFG.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const d = await this.handle(r);
    d.expires_at = Math.floor(Date.now() / 1000) + d.expires_in;
    this.saveSession(d);
    return d;
  },
  async logout() {
    try { await fetch(CFG.url + '/auth/v1/logout', { method: 'POST', headers: this.headers() }); } catch (e) {}
    this.saveSession(null);
  }
};

// 所有顯示到畫面上的文字都先經過這個函式，避免惡意程式碼（XSS）
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}
function money(n) { return 'NT$ ' + Number(n || 0).toLocaleString('zh-TW'); }
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {
    const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e2) {}
    t.remove(); return ok;
  }
}
const STATUS_TEXT = { pending_payment: '待付款', paid: '已付款', picked_up: '已取餐', cancelled: '已取消' };
