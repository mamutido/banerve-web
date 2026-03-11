// ─────────────────────────────────────────────────────────────────────────────
// shared/components.js — переиспользуемые UI-компоненты
//
// Импортируй нужное:
//   import { toast, openModal, closeModal, openConfirm, emptyState,
//            skeleton, badge, pageHeader, renderHeader } from './shared/components.js'
// ─────────────────────────────────────────────────────────────────────────────

import { logout } from './auth.js';

// ─── Header ──────────────────────────────────────────────────────────────────
//
// Вставляет header в элемент с id="app-header".
// label — подзаголовок роли: 'Admin', 'Advertiser', 'Publisher'
//
// Вызывай один раз при загрузке страницы:
//   renderHeader('Admin');
//
// renderHeader(label, options)
// label   — 'Admin' | 'Advertiser' | 'Publisher'
// options — { email, showRoleSwitch }
//
// showRoleSwitch: true — показать переключатель Advertiser/Publisher в шапке
//
export function renderHeader(label = 'Admin', { email = null, showRoleSwitch = false } = {}) {
  const el = document.getElementById('app-header');
  if (!el) return;

  const roleSwitch = showRoleSwitch ? `
    <select id="role-switch" style="
      background: var(--surface2,#1a1a1a);
      border: 1px solid var(--border,#2a2a2a);
      color: var(--text2,#888);
      border-radius: 6px;
      padding: 6px 10px;
      font-family: 'Space Mono', monospace;
      font-size: 12px;
      cursor: pointer;
      outline: none;
    ">
      <option value="advertiser" ${label === 'Advertiser' ? 'selected' : ''}>📣 Advertiser</option>
      <option value="publisher"  ${label === 'Publisher'  ? 'selected' : ''}>📱 Publisher</option>
    </select>
  ` : `<span style="font-family:'Space Mono',monospace; font-size:12px; color:var(--text2,#888);">${label}</span>`;

  const emailBadge = email ? `
    <span style="font-family:'Space Mono',monospace; font-size:12px; color:var(--text2,#888); border:1px solid var(--border,#2a2a2a); border-radius:6px; padding:6px 10px;">
      ${email}
    </span>
  ` : '';

  el.innerHTML = `
    <div class="logo">BA<span>NERVE</span></div>
    <div style="display:flex; align-items:center; gap:12px;">
      ${emailBadge}
      ${roleSwitch}
      <span class="status-dot"></span>
      <button class="btn btn-outline btn-sm" id="logout-btn">Выйти →</button>
    </div>
  `;

  document.getElementById('logout-btn').addEventListener('click', logout);

  if (showRoleSwitch) {
    document.getElementById('role-switch').addEventListener('change', function() {
      const pages = { advertiser: 'advertiser.html', publisher: 'publisher.html' };
      window.location.href = pages[this.value] || 'advertiser.html';
    });
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
//
// Показывает уведомление в правом нижнем углу на 3 секунды.
//
// toast('Сохранено ✓')
// toast('Что-то пошло не так', 'error')
// toast('Внимание', 'warning')
//
let _toastTimer = null;

export function toast(msg, type = 'success') {
  let el = document.getElementById('_toast');

  if (!el) {
    el = document.createElement('div');
    el.id = '_toast';
    el.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      padding: 12px 18px; border-radius: 8px;
      font-family: 'Space Mono', monospace; font-size: 13px;
      transition: opacity 0.2s, transform 0.2s;
      opacity: 0; transform: translateY(8px); pointer-events: none;
    `;
    document.body.appendChild(el);
  }

  const styles = {
    success: 'background:#1a2a1a; border:1px solid #4dff91; color:#4dff91;',
    error:   'background:#2a1a1a; border:1px solid #ff4d4d; color:#ff4d4d;',
    warning: 'background:#2a2010; border:1px solid #ffb347; color:#ffb347;',
    info:    'background:#1a1a2a; border:1px solid #4d9fff; color:#4d9fff;',
  };

  el.style.cssText += styles[type] || styles.info;
  el.textContent = msg;
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';

  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
  }, 3000);
}

// ─── Modal ────────────────────────────────────────────────────────────────────
//
// Универсальная модалка. HTML инжектируется в тело.
//
// openModal('Добавить паблишера', `<div>...форма...</div>`, () => save())
// closeModal()
//
// Кнопка «Сохранить» вызывает onSave.
// Клик на оверлей или ✕ закрывает.
//
export function openModal(title, bodyHtml, onSave, { saveLabel = 'Сохранить →', showSave = true } = {}) {
  let overlay = document.getElementById('_modal_overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = '_modal_overlay';
    overlay.style.cssText = `
      display:none; position:fixed; inset:0; z-index:1000;
      background:rgba(0,0,0,0.7); align-items:center; justify-content:center;
    `;
    overlay.innerHTML = `
      <div id="_modal" style="
        background:var(--surface,#111); border:1px solid var(--border,#2a2a2a);
        border-radius:16px; padding:32px; width:100%; max-width:560px;
        max-height:90vh; overflow-y:auto; position:relative;
      ">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px; padding-bottom:16px; border-bottom:1px solid var(--border,#2a2a2a);">
          <span id="_modal_title" style="font-size:18px; font-weight:700; font-family:'Syne',sans-serif;"></span>
          <button id="_modal_close" style="
            background:transparent; border:1px solid var(--border,#2a2a2a);
            color:var(--text2,#888); width:32px; height:32px; border-radius:6px;
            cursor:pointer; font-size:16px; display:flex; align-items:center; justify-content:center;
          ">✕</button>
        </div>
        <div id="_modal_body"></div>
        <div id="_modal_actions" style="display:flex; gap:12px; margin-top:24px;">
          <button id="_modal_save" style="
            background:var(--accent,#e8ff4d); color:#000; border:none;
            padding:12px 24px; border-radius:8px; cursor:pointer;
            font-family:'Syne',sans-serif; font-size:14px; font-weight:700;
          "></button>
          <button id="_modal_cancel" style="
            background:transparent; border:1px solid var(--border,#2a2a2a);
            color:var(--text2,#888); padding:12px 24px; border-radius:8px;
            cursor:pointer; font-family:'Syne',sans-serif; font-size:14px;
          ">Отмена</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.getElementById('_modal_close').addEventListener('click', closeModal);
    document.getElementById('_modal_cancel').addEventListener('click', closeModal);
  }

  document.getElementById('_modal_title').textContent = title;
  document.getElementById('_modal_body').innerHTML = bodyHtml;

  const saveBtn = document.getElementById('_modal_save');
  saveBtn.textContent = saveLabel;
  saveBtn.style.display = showSave ? '' : 'none';
  saveBtn.onclick = onSave || null;

  document.getElementById('_modal_actions').style.display = (showSave || true) ? 'flex' : 'none';

  overlay.style.display = 'flex';

  // Закрыть по Escape
  const onKey = e => { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
}

export function closeModal() {
  const overlay = document.getElementById('_modal_overlay');
  if (overlay) overlay.style.display = 'none';
}

// ─── Confirm ──────────────────────────────────────────────────────────────────
//
// Диалог подтверждения опасного действия.
//
// openConfirm('Удалить паблишера?', () => doDelete())
//
export function openConfirm(msg, onYes, { danger = true } = {}) {
  openModal(
    'Подтверждение',
    `<p style="font-size:15px; color:var(--text,#f0f0f0); line-height:1.6;">${msg}</p>`,
    onYes,
    { saveLabel: danger ? 'Удалить' : 'Подтвердить' }
  );

  // Покрасить кнопку в красный если опасное действие
  if (danger) {
    const btn = document.getElementById('_modal_save');
    if (btn) btn.style.background = '#ff4d4d';
  }
}

// ─── Empty state ──────────────────────────────────────────────────────────────
//
// HTML-строка для пустого списка.
//
// el.innerHTML = emptyState('Нет паблишеров', 'Добавь первого владельца приложения')
//
export function emptyState(title, sub = '') {
  return `
    <div style="
      text-align:center; padding:64px 24px; color:var(--text2,#888);
    ">
      <div style="font-size:32px; margin-bottom:12px; opacity:0.3;">◦</div>
      <div style="font-size:16px; font-weight:700; color:var(--text,#f0f0f0); margin-bottom:6px;">${title}</div>
      ${sub ? `<div style="font-size:13px; font-family:'Space Mono',monospace;">${sub}</div>` : ''}
    </div>
  `;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
//
// Плейсхолдеры пока данные загружаются.
//
// el.innerHTML = skeleton(3)  // 3 карточки-заглушки
//
export function skeleton(count = 3) {
  const card = `
    <div style="
      background:var(--surface,#111); border:1px solid var(--border,#2a2a2a);
      border-radius:12px; padding:20px;
      animation: _skeleton_pulse 1.5s ease-in-out infinite;
    ">
      <div style="height:12px; width:40%; background:#222; border-radius:4px; margin-bottom:12px;"></div>
      <div style="height:18px; width:70%; background:#222; border-radius:4px; margin-bottom:8px;"></div>
      <div style="height:12px; width:55%; background:#222; border-radius:4px;"></div>
    </div>
  `;

  // Инжектировать keyframes один раз
  if (!document.getElementById('_skeleton_style')) {
    const style = document.createElement('style');
    style.id = '_skeleton_style';
    style.textContent = `
      @keyframes _skeleton_pulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.4; }
      }
    `;
    document.head.appendChild(style);
  }

  return `<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:16px;">
    ${Array(count).fill(card).join('')}
  </div>`;
}

// ─── Badge ────────────────────────────────────────────────────────────────────
//
// Цветной статус-бейдж.
//
// badge('active')   → зелёный
// badge('paused')   → оранжевый
// badge('draft')    → серый
// badge('rejected') → красный
// badge('pending')  → синий
//
const BADGE_STYLES = {
  active:   'background:rgba(77,255,145,0.15); color:#4dff91;',
  approved: 'background:rgba(77,255,145,0.15); color:#4dff91;',
  paused:   'background:rgba(255,107,53,0.15); color:#ff6b35;',
  draft:    'background:rgba(136,136,136,0.15); color:#888;',
  inactive: 'background:rgba(136,136,136,0.15); color:#888;',
  rejected: 'background:rgba(255,77,77,0.15); color:#ff4d4d;',
  pending:  'background:rgba(77,159,255,0.15); color:#4d9fff;',
};

export function badge(status) {
  const style = BADGE_STYLES[status] || BADGE_STYLES.draft;
  return `<span style="
    ${style}
    padding:3px 10px; border-radius:20px;
    font-size:11px; font-family:'Space Mono',monospace;
    font-weight:700; text-transform:uppercase; letter-spacing:0.5px;
  ">${status}</span>`;
}

// ─── Page header ──────────────────────────────────────────────────────────────
//
// Заголовок раздела с кнопкой действия.
//
// pageHeader('Publishers', 'Добавить', () => openAddModal())
// pageHeader('Stats')  — без кнопки
//
export function pageHeader(title, btnLabel = null, onBtnClick = null) {
  return `
    <div style="
      display:flex; align-items:center; justify-content:space-between;
      margin-bottom:24px; padding-bottom:16px;
      border-bottom:1px solid var(--border,#2a2a2a);
    ">
      <h2 style="font-size:22px; font-weight:700; font-family:'Syne',sans-serif;">${title}</h2>
      ${btnLabel ? `
        <button onclick="(${onBtnClick})()" style="
          background:var(--accent,#e8ff4d); color:#000; border:none;
          padding:10px 20px; border-radius:8px; cursor:pointer;
          font-family:'Syne',sans-serif; font-size:14px; font-weight:700;
        ">${btnLabel}</button>
      ` : ''}
    </div>
  `;
}

// ─── Copy to clipboard ────────────────────────────────────────────────────────
//
// copyToClipboard('текст')
// copyToClipboard('текст', 'Ключ скопирован!')
//
export async function copyToClipboard(text, successMsg = 'Скопировано!') {
  try {
    await navigator.clipboard.writeText(text);
    toast(successMsg);
  } catch {
    // Fallback для старых браузеров
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast(successMsg);
  }
}
