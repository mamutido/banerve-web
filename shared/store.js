// ─────────────────────────────────────────────────────────────────────────────
// shared/store.js — состояние приложения, навигация, Realtime-подписки
//
// Импортируй нужное:
//   import { state, setState, initNav, onPageEnter, onPageLeave } from './shared/store.js'
// ─────────────────────────────────────────────────────────────────────────────

import { subscribeTable } from './auth.js';

// ─── Состояние ────────────────────────────────────────────────────────────────
//
// Единственный источник истины для всего приложения.
// Никогда не меняй напрямую — только через setState().
//
export const state = {
  // Текущая страница (совпадает с hash в URL)
  page: null,

  // Кэш данных по разделам — чтобы не загружать заново при возврате
  // Каждый ключ — имя страницы, значение — массив записей или null (не загружено)
  cache: {},

  // Активные Realtime-подписки { tableName: unsubFn }
  _subscriptions: {},

  // Реестр render-функций { pageName: renderFn }
  // Заполняется через onPageEnter()
  _renderers: {},

  // Реестр loader-функций { pageName: loaderFn }
  // Заполняется через onPageEnter()
  _loaders: {},
};

// ─── setState ─────────────────────────────────────────────────────────────────
//
// Единственный способ изменить состояние.
// Вызывает рендер только текущей страницы, не всего приложения.
//
// Примеры:
//   setState({ publishers: newList })
//   setState({ page: 'publishers' })
//   setState(s => ({ count: s.count + 1 }))  // функциональный апдейт
//
export function setState(patch) {
  const update = typeof patch === 'function' ? patch(state) : patch;
  Object.assign(state, update);

  // Если обновилась страница — ничего не рендерим, навигация сама разберётся
  if ('page' in update) return;

  // Рендерим только текущую страницу
  const renderer = state._renderers[state.page];
  if (renderer) renderer(state);
}

// ─── Навигация ────────────────────────────────────────────────────────────────
//
// Инициализирует навигацию через URL hash (#publishers, #creatives, и т.д.)
// Вызывай один раз при загрузке страницы.
//
// Параметры:
//   defaultPage  — страница по умолчанию если hash пустой
//
export function initNav(defaultPage = 'dashboard') {
  // Обработчик смены hash
  window.addEventListener('hashchange', () => {
    const page = location.hash.slice(1) || defaultPage;
    _navigate(page);
  });

  // Клики по nav-item — просто меняем hash, остальное делает hashchange
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => {
      location.hash = el.dataset.page;
    });
  });

  // Загрузить текущий hash при старте
  const initial = location.hash.slice(1) || defaultPage;
  location.hash = initial; // тригернёт hashchange если hash уже был установлен
  _navigate(initial);
}

// Внутренняя функция смены страницы
function _navigate(page) {
  const prev = state.page;

  // Уйти со старой страницы
  if (prev && prev !== page) {
    _leavePage(prev);
  }

  // Показать нужный .page блок
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');

  // Пометить активный nav-item
  document.querySelectorAll('[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Обновить state.page
  state.page = page;

  // Войти на новую страницу
  _enterPage(page);
}

// ─── Регистрация страниц ──────────────────────────────────────────────────────
//
// Вызывай для каждого раздела чтобы зарегистрировать loader и renderer.
//
// loader  — async функция загрузки данных из Supabase, должна вызвать setState()
// renderer — функция отрисовки, получает state, обновляет DOM
//
// Пример:
//   onPageEnter('publishers', {
//     load:   async () => { const data = await db('publishers'); setState({ publishers: data }); },
//     render: (s)   => { document.getElementById('publishers-list').innerHTML = renderList(s.publishers); },
//     realtime: ['publishers']  // какие таблицы слушать пока на этой странице
//   });
//
export function onPageEnter(page, { load, render, realtime = [] }) {
  state._loaders[page]   = load;
  state._renderers[page] = render;

  // Запомнить какие таблицы слушать для этой страницы
  state[`_realtime_${page}`] = realtime;
}

// Войти на страницу: загрузить данные, запустить Realtime
function _enterPage(page) {
  const loader   = state._loaders[page];
  const realtime = state[`_realtime_${page}`] || [];

  // Загрузить данные (используем кэш если есть)
  if (loader) {
    if (state.cache[page]) {
      // Данные уже есть — рендерим сразу, потом обновляем в фоне
      const renderer = state._renderers[page];
      if (renderer) renderer(state);
      loader(); // фоновое обновление
    } else {
      loader(); // первая загрузка
    }
  }

  // Подписаться на Realtime для нужных таблиц
  realtime.forEach(table => {
    if (state._subscriptions[table]) return; // уже подписаны
    state._subscriptions[table] = subscribeTable(table, (payload) => {
      _handleRealtimeEvent(table, payload);
    });
  });
}

// Уйти со страницы: отписаться от Realtime таблиц которые не нужны на следующей
function _leavePage(page) {
  const tables = state[`_realtime_${page}`] || [];
  tables.forEach(table => {
    const unsub = state._subscriptions[table];
    if (unsub) {
      unsub();
      delete state._subscriptions[table];
    }
  });
}

// ─── Обработчик Realtime событий ─────────────────────────────────────────────
//
// При получении события обновляет кэш и запускает ре-рендер текущей страницы.
//
function _handleRealtimeEvent(table, payload) {
  const { type, record, old_record } = payload;

  // Найти все страницы которые слушают эту таблицу
  Object.keys(state).forEach(key => {
    if (!key.startsWith('_realtime_')) return;
    const page = key.replace('_realtime_', '');
    const tables = state[key];
    if (!tables.includes(table)) return;

    // Обновить кэш
    if (state.cache[page] && Array.isArray(state[table])) {
      if (type === 'INSERT') {
        setState({ [table]: [...(state[table] || []), record] });
      } else if (type === 'UPDATE') {
        setState({ [table]: (state[table] || []).map(r => r.id === record.id ? record : r) });
      } else if (type === 'DELETE') {
        setState({ [table]: (state[table] || []).filter(r => r.id !== old_record.id) });
      }
    }
  });

  // Принудительно обновить текущую страницу
  const renderer = state._renderers[state.page];
  if (renderer) renderer(state);
}

// ─── Инвалидация кэша ────────────────────────────────────────────────────────
//
// Вызывай после создания/удаления записей чтобы следующий вход на страницу
// загрузил свежие данные.
//
// invalidateCache('publishers')          — сбросить один раздел
// invalidateCache('publishers', 'apps')  — несколько
// invalidateCache()                      — сбросить всё
//
export function invalidateCache(...pages) {
  if (!pages.length) {
    state.cache = {};
  } else {
    pages.forEach(p => delete state.cache[p]);
  }
}
