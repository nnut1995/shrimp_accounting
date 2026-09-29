import { createClient } from '@supabase/supabase-js';
export function accountingClient(config) {
  const base = new URL(config.accountingBaseUrl);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) throw new Error('Accounting URL must use HTTPS or localhost.');
  const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let token, expires = 0;
  async function accessToken() {
    if (token && expires > Date.now() + 60000) return token;
    const { data, error } = await supabase.auth.signInWithPassword({ email: config.accountingEmail, password: config.accountingPassword });
    if (error || !data.session) throw new Error('เข้าสู่ระบบบัญชีไม่ได้ กรุณาตรวจอีเมลและรหัสผ่านในการตั้งค่าบอต');
    token = data.session.access_token; expires = data.session.expires_at * 1000;
    return token;
  }
  async function request(route, method = 'GET', payload, key, version) {
    const response = await fetch(new URL(route, base), {
      method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}), ...(version ? { 'If-Match': version } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    const body = await response.json();
    if (!response.ok) {
      if (response.status === 401) { token = null; expires = 0; }
      // Only validation errors are suitable for displaying; never forward an upstream body/log.
      const error = new Error(response.status === 412 ? 'ล็อตถูกแก้ไขจากที่อื่น กรุณาพิมพ์แก้ไขอีกครั้งเพื่อตรวจร่างจากข้อมูลล่าสุด' : response.status === 422 ? String(body.error?.message).slice(0, 500) : `ระบบบัญชีตอบกลับ ${response.status} (${body.error?.code ?? 'error'})`);
      error.status = response.status; error.code = body.error?.code; throw error;
    }
    return body;
  }
  return {
    check: () => request('/api/v1/lots?limit=1'),
    preview: async lot => (await request('/api/v1/lots/preview', 'POST', lot)).data,
    create: async (lot, key) => (await request('/api/v1/lots', 'POST', lot, key)).data,
    editSnapshot: async id => (await request(`/api/v1/lots/${encodeURIComponent(id)}?edit=1`)).data,
    update: async (id, lot, key, version) => (await request(`/api/v1/lots/${encodeURIComponent(id)}`, 'PUT', lot, key, version)).data,
    detail: async id => (await request(`/api/v1/lots/${encodeURIComponent(id)}`)).data,
    async findDuplicates(lot) {
      const found = [];
      for (let offset = 0; ; offset += 100) {
        const res = await request(`/api/v1/lots?from=${encodeURIComponent(lot.buy_date)}&to=${encodeURIComponent(lot.buy_date)}&limit=100&offset=${offset}`);
        for (const row of res.data) if (row.suppliers?.name?.trim() === lot.supplier.trim()) found.push(row);
        if (offset + 100 >= res.pagination.total) break;
      }
      return found;
    },
  };
}
