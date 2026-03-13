// ─────────────────────────────────────────────────────────────────────────────
// shared/crypto.js — общие функции для крипто-платежей (advertiser + publisher)
// ─────────────────────────────────────────────────────────────────────────────

import { SUPABASE_URL, SUPABASE_ANON_KEY, getSession, db, fmtUSD, fmtDatetime } from './auth.js';
import { toast, openModal, closeModal } from './components.js';

// Токен из сессии (вызывать каждый раз, не кешировать)
function getToken() {
  return getSession()?.access_token ?? SUPABASE_ANON_KEY;
}

// ─── Advertiser: депозит ──────────────────────────────────────────────────────

export async function openDepositModal(userId) {
  openModal('Пополнение USDT (TRC-20)', `
    <div style="padding:8px 0;">
      <div style="margin-bottom:20px;">
        <label style="display:block;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--text2);margin-bottom:8px;font-family:'Space Mono',monospace;">Сумма пополнения (USD)</label>
        <input type="number" id="deposit-amount-input" placeholder="Минимум 5" min="5" step="1"
               style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:11px 14px;color:var(--text);font-family:'Space Mono',monospace;font-size:16px;outline:none;">
        <div style="margin-top:6px;font-size:12px;color:var(--text2);font-family:'Space Mono',monospace;">
          Минимум: 5 USD · Зачисляется как USDT 1:1
        </div>
      </div>
      <div style="background:rgba(255,107,53,0.1);border:1px solid rgba(255,107,53,0.3);border-radius:8px;padding:12px;font-size:12px;color:#ff6b35;font-family:'Space Mono',monospace;line-height:1.6;">
        ⚠️ Оплата через сеть TRC-20. Выберите USDT TRC-20 на странице оплаты CryptoCloud.
      </div>
    </div>
  `, () => createInvoiceAndRedirect(userId), { saveLabel: 'Создать счёт →' });
}

async function createInvoiceAndRedirect(userId) {
  const amountEl = document.getElementById('deposit-amount-input');
  const amount = parseFloat(amountEl?.value);
  if (!amount || amount < 5) { toast('Минимальная сумма: 5 USD', 'error'); return; }

  const btn = document.getElementById('_modal_save');
  if (btn) { btn.disabled = true; btn.textContent = 'Создание счёта...'; }

  try {
    const token = getToken();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ amount, user_id: userId })
    });
    const data = await res.json();
    if (!res.ok || data.error) { toast(data.error || 'Ошибка создания счёта', 'error'); return; }

    await fetch(`${SUPABASE_URL}/rest/v1/crypto_payments`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'deposit', user_id: userId,
        amount_requested: data.amount_requested || amount,
        amount_usdt: amount, tx_hash: data.invoice_id,
        status: 'pending_confirmations', network: 'TRC20'
      })
    });

    window.open(data.pay_url, '_blank');
    closeModal();
    toast('Счёт создан! Оплатите на открывшейся странице.', 'info');
  } catch(e) { toast('Ошибка: ' + e.message, 'error'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Создать счёт →'; } }
}

export async function loadCryptoDeposits(userId, tbodyId = 'crypto-deposits-list') {
  try {
    const payments = await db('crypto_payments', 'GET', null,
      `?user_id=eq.${userId}&type=eq.deposit&order=created_at.desc&limit=20`);
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    if (!payments?.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text2);padding:32px;">Нет пополнений</td></tr>';
      return;
    }
    const statusLabel = {
      confirmed: '<span style="color:var(--success);">✓ Зачислено</span>',
      pending_confirmations: '<span style="color:#4d9fff;">⏳ Ожидание</span>',
      below_minimum: '<span style="color:var(--error);">✗ Меньше минимума</span>',
      failed: '<span style="color:var(--error);">✗ Ошибка</span>',
    };
    tbody.innerHTML = payments.map(p => `
      <tr>
        <td class="mono">${fmtDatetime(p.created_at)}</td>
        <td style="color:var(--success);font-family:'Space Mono',monospace;">+${p.amount_usdt} USDT</td>
        <td>${statusLabel[p.status] || p.status}</td>
        <td style="font-size:11px;font-family:'Space Mono',monospace;">
          ${p.network_tx_hash
            ? `<a href="https://tronscan.org/#/transaction/${p.network_tx_hash}" target="_blank" style="color:var(--accent);">${p.network_tx_hash.slice(0,16)}...</a>`
            : (p.tx_hash ? `<span style="color:var(--text2);">invoice:${p.tx_hash.slice(0,12)}...</span>` : '—')}
        </td>
      </tr>`).join('');
  } catch(e) { console.warn('crypto deposits load error', e); }
}

// ─── Publisher: вывод ─────────────────────────────────────────────────────────

export async function initWalletSection(userId) {
  try {
    const token = getToken();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/crypto_wallets?user_id=eq.${userId}&role=eq.publisher&select=withdrawal_address,withdrawal_verified`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } }
    );
    const wallets = await res.json();
    const wallet = wallets?.[0];

    if (wallet?.withdrawal_verified && wallet?.withdrawal_address) {
      showWalletState('verified', wallet.withdrawal_address);
    } else {
      showWalletState('none');
    }
    loadCryptoWithdrawals(userId);
  } catch(e) { console.warn('wallet load error', e); }
}

export function showWalletState(state, address = '') {
  document.getElementById('wallet-none').style.display     = state === 'none'     ? '' : 'none';
  document.getElementById('wallet-verify').style.display   = state === 'verify'   ? '' : 'none';
  document.getElementById('wallet-verified').style.display = state === 'verified' ? '' : 'none';
  document.getElementById('withdraw-section').style.display = state === 'verified' ? '' : 'none';
  if (state === 'verified') {
    document.getElementById('wallet-address-display').textContent = address;
  }
}

export async function sendVerifyCode(userId) {
  const address = document.getElementById('wallet-input').value.trim();
  if (!address) { toast('Введи адрес кошелька', 'error'); return; }
  if (!/^T[a-zA-Z0-9]{33}$/.test(address)) { toast('Некорректный TRC-20 адрес (должен начинаться с T)', 'error'); return; }

  const btn = document.getElementById('btn-send-code');
  btn.disabled = true; btn.textContent = 'Отправка...';
  try {
    const token = getToken();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'send_code', address })
    });
    const data = await res.json();
    if (data.error) { toast(data.error, 'error'); return; }
    toast('Код отправлен на ваш email');
    showWalletState('verify');
  } catch(e) { toast('Ошибка соединения', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Подтвердить →'; }
}

export async function verifyWalletCode() {
  const code = document.getElementById('verify-code-input').value.trim();
  if (!code) { toast('Введи код из письма', 'error'); return; }

  const btn = document.getElementById('btn-verify-code');
  btn.disabled = true; btn.textContent = 'Проверка...';
  try {
    const token = getToken();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'verify_code', code })
    });
    const data = await res.json();
    if (data.error) { toast(data.error, 'error'); return; }
    toast('Кошелёк подтверждён ✓', 'success');
    showWalletState('verified', data.address);
  } catch(e) { toast('Ошибка соединения', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Подтвердить'; }
}

export async function requestWithdrawal(userId) {
  const amount = parseFloat(document.getElementById('withdraw-amount').value);
  if (!amount || amount < 10) { toast('Минимальная сумма вывода: 10 USDT', 'error'); return; }

  const btn = document.getElementById('btn-request-withdraw');
  btn.disabled = true; btn.textContent = 'Отправка...';

  try {
    const token = getToken();

    const walletRes = await fetch(
      `${SUPABASE_URL}/rest/v1/crypto_wallets?user_id=eq.${userId}&role=eq.publisher&select=withdrawal_address`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } }
    );
    const wallets = await walletRes.json();
    const walletAddress = wallets?.[0]?.withdrawal_address;
    if (!walletAddress) { toast('Кошелёк не найден', 'error'); return; }

    if (amount >= 500 && !confirm(`Вы запрашиваете вывод ${amount} USDT. Продолжить?`)) return;

    // Rate limit проверка на фронте
    const since = new Date(Date.now() - 24*60*60*1000).toISOString();
    const rlRes = await fetch(
      `${SUPABASE_URL}/rest/v1/crypto_payments?user_id=eq.${userId}&type=eq.withdrawal&status=in.(paid,processing)&created_at=gte.${since}&select=id`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}`, 'Prefer': 'count=exact' } }
    );
    const rlCount = parseInt(rlRes.headers.get('content-range')?.split('/')[1] || '0');
    if (rlCount >= 5) { toast('Превышен лимит: максимум 5 выводов в сутки', 'error'); return; }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/crypto_payments`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json', 'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        type: 'withdrawal', user_id: userId,
        amount_usdt: amount, wallet_address: walletAddress,
        status: 'pending', network: 'TRC20'
      })
    });
    if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Ошибка'); }

    await fetch(`${SUPABASE_URL}/rest/v1/transactions`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId, type: 'withdrawal_pending',
        amount: -amount, status: 'pending',
        notes: `Заявка на вывод ${amount} USDT`
      })
    });

    toast('Заявка на вывод создана ✓', 'success');
    document.getElementById('withdraw-amount').value = '';
    loadCryptoWithdrawals(userId);
  } catch(e) { toast('Ошибка: ' + e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Запросить вывод →'; }
}

export async function loadCryptoWithdrawals(userId, tbodyId = 'crypto-withdrawals-list') {
  try {
    const token = getToken();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/crypto_payments?user_id=eq.${userId}&type=eq.withdrawal&order=created_at.desc&limit=20`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } }
    );
    const payments = await res.json();
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    if (!payments?.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text2);padding:32px;">Нет выводов</td></tr>';
      return;
    }
    const statusLabel = {
      pending:    '<span style="color:#4d9fff;">⏳ Ожидает</span>',
      processing: '<span style="color:#ffb347;">🔄 Обрабатывается</span>',
      paid:       '<span style="color:var(--success);">✓ Выплачено</span>',
      rejected:   '<span style="color:var(--error);">✗ Отклонено</span>',
      cancelled:  '<span style="color:var(--text2);">— Отменено</span>',
      failed:     '<span style="color:var(--error);">✗ Ошибка</span>',
    };
    tbody.innerHTML = payments.map(p => `
      <tr>
        <td class="mono">${fmtDatetime(p.created_at)}</td>
        <td style="color:var(--error);font-family:'Space Mono',monospace;">-${p.amount_usdt} USDT</td>
        <td>${statusLabel[p.status] || p.status}</td>
        <td style="font-size:11px;font-family:'Space Mono',monospace;">
          ${p.network_tx_hash
            ? `<a href="https://tronscan.org/#/transaction/${p.network_tx_hash}" target="_blank" style="color:var(--accent);">${p.network_tx_hash.slice(0,16)}...</a>`
            : (p.tx_hash ? `<span style="color:var(--text2);">invoice:${p.tx_hash.slice(0,12)}...</span>` : '—')}
        </td>
      </tr>`).join('');
  } catch(e) { console.warn('withdrawals load error', e); }
}
