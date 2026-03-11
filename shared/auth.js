// ─────────────────────────────────────────────────────────────────────────────
// shared/auth.js — единственное место где живёт Supabase и сессия
// Импортируй нужное: import { db, getSession, logout, uploadFile } from './shared/auth.js'
// ─────────────────────────────────────────────────────────────────────────────

export const SUPABASE_URL      = 'https://syiguslqvexxsqncvpjs.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_NUK2SDmrmngpwoEiQyqllA_OyuoY49I';

// ─── Сессия ──────────────────────────────────────────────────────────────────

export function getSession() {
  try { return JSON.parse(localStorage.getItem('banerve_session')); }
  catch { return null; }
}

export function saveSession(session) {
  localStorage.setItem('banerve_session', JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem('banerve_session');
  window.location.href = './login.html';
}

// Обновить токен через refresh_token
export async function refreshSession(refreshToken) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const session = {
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_at:    Math.floor(Date.now() / 1000) + data.expires_in,
      user:          data.user
    };
    saveSession(session);
    return session;
  } catch { return null; }
}

// ─── Инициализация страницы (вызывай в начале каждой HTML-страницы) ───────────
//
// Принимает объект опций:
//   role: 'admin' | 'advertiser' | 'publisher' | null  — требуемая роль (null = любая)
//
// Возвращает { session, token } или редиректит на login.html
//
export async function initPage({ role = null } = {}) {
  let session = getSession();

  // Нет сессии вообще
  if (!session) { clearSession(); return; }

  // Токен истёк — попробовать обновить
  if (session.expires_at < Math.floor(Date.now() / 1000)) {
    session = await refreshSession(session.refresh_token);
    if (!session) { clearSession(); return; }
  }

  // Проверка роли
  if (role === 'admin') {
    if (session.user?.user_metadata?.role !== 'admin') { clearSession(); return; }
  }
  // Для advertiser/publisher проверка через user_roles происходит в самом приложении,
  // здесь мы только убеждаемся что сессия валидна.

  return { session, token: session.access_token, user: session.user };
}

// ─── Logout ──────────────────────────────────────────────────────────────────

export async function logout() {
  const session = getSession();
  if (session) {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          'apikey':        SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session.access_token}`
        }
      });
    } catch { /* игнорировать ошибки сети */ }
  }
  clearSession();
}

// ─── REST API ─────────────────────────────────────────────────────────────────
//
// Использование:
//   const rows  = await db('publishers')
//   const row   = await db('publishers', 'POST', { name: 'X', email: 'x@x.com' })
//   await db('publishers', 'PATCH', { name: 'Y' }, '?id=eq.123')
//   await db('publishers', 'DELETE', null, '?id=eq.123')
//
export async function db(table, method = 'GET', body = null, params = '') {
  const session = getSession();
  const token   = session?.access_token ?? SUPABASE_ANON_KEY;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    method,
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      'Prefer':        method === 'POST' ? 'return=representation' : ''
    },
    body: body ? JSON.stringify(body) : null
  });

  if (res.status === 401) { clearSession(); return null; }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[db] ${method} ${table}: ${text}`);
  }

  if (method === 'DELETE' || method === 'PATCH') return null;
  return res.json();
}

// ─── Storage ──────────────────────────────────────────────────────────────────
//
// Загружает файл в бакет AD/
// Возвращает публичный URL
//
export async function uploadFile(file, folderName) {
  const session = getSession();
  const token   = session?.access_token ?? SUPABASE_ANON_KEY;

  const ext  = file.name.split('.').pop();
  const path = `${folderName.replace(/\s+/g, '_')}/${Date.now()}.${ext}`;

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/AD/${path}`, {
    method: 'POST',
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type':  file.type
    },
    body: file
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[uploadFile] ${text}`);
  }

  return `${SUPABASE_URL}/storage/v1/object/public/AD/${path}`;
}

// ─── Realtime ─────────────────────────────────────────────────────────────────
//
// Минимальная обёртка над Supabase Realtime WebSocket
// Используй если не подключаешь supabase-js через CDN
//
// Пример:
//   const unsub = subscribeTable('impressions', (payload) => {
//     console.log('новая запись', payload.record);
//     setState({ impressions: [...state.impressions, payload.record] });
//   });
//   // Когда уходишь со страницы:
//   unsub();
//
export function subscribeTable(table, callback) {
  const session = getSession();
  const token   = session?.access_token ?? SUPABASE_ANON_KEY;

  const wsUrl = `${SUPABASE_URL.replace('https', 'wss')}/realtime/v1/websocket` +
    `?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`;

  const ws = new WebSocket(wsUrl);
  const topic = `realtime:public:${table}`;
  let heartbeat;

  ws.onopen = () => {
    // Авторизация
    ws.send(JSON.stringify({
      topic: 'realtime:public',
      event: 'phx_join',
      payload: { user_token: token },
      ref: '1'
    }));
    // Подписка на таблицу
    ws.send(JSON.stringify({
      topic,
      event: 'phx_join',
      payload: {
        config: {
          broadcast: { self: false },
          presence:  { key: '' },
          postgres_changes: [{ event: '*', schema: 'public', table }]
        }
      },
      ref: '2'
    }));
    // Heartbeat каждые 30 секунд
    heartbeat = setInterval(() => {
      ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: '0' }));
    }, 30_000);
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.event === 'postgres_changes' && msg.payload?.data) {
      callback(msg.payload.data);
    }
  };

  ws.onerror = (e) => console.warn('[realtime] error', e);

  // Возвращаем функцию отписки
  return () => {
    clearInterval(heartbeat);
    ws.close();
  };
}

// ─── Хелперы форматирования (общие для всех панелей) ─────────────────────────

export function fmt(n) {
  return Number(n || 0).toLocaleString('ru-RU');
}

export function fmtUSD(n) {
  return '$' + Number(n || 0).toFixed(2);
}

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtDatetime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}
