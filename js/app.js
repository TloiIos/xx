// app.js
(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));

  // ── STATE ──
  let keys = {};
  let packages = {};
  let currentPage = 'dashboard';
  let sortKey = 'createdAt';
  let sortDir = 'desc';
  let page = 1;
  let searchTerm = '';
  let statusFilter = 'all';
  let pkgFilter = 'all';
  const PAGE_SIZE = 10;

  // ── HELPERS ──
  const now = () => Date.now();

  function keyStatus(rec) {
    if (!rec) return 'unknown';
    if (rec.status === 'banned') return 'banned';
    if (!rec.expiresAt) return 'active';
    return rec.expiresAt > now() ? 'active' : 'expired';
  }

  function fmtDate(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  }

  function genKey(prefix) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const seg = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), b => chars[b % chars.length]).join('');
    return (prefix || 'KEY').toUpperCase() + '-' + seg() + '-' + seg() + '-' + seg() + '-' + seg();
  }

  function pkgName(id) {
    if (!id) return '—';
    if (packages[id]) return packages[id].name || '—';
    return '—';
  }

  function getLatestUID(devices) {
    if (!devices) return null;
    const keys = Object.keys(devices);
    return keys.length ? keys[keys.length - 1] : null;
  }

  // ── TOAST ──
  function toast(type, title, msg) {
    const stack = $('#toastStack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.innerHTML = `
      <div class="toast__body"><strong>${esc(title)}</strong><p>${esc(msg)}</p></div>
      <button class="toast__close">✕</button>
      <i class="toast__progress"></i>
    `;
    stack.appendChild(el);
    el.querySelector('.toast__close').onclick = () => el.remove();
    setTimeout(() => el.remove(), 4000);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } 
    catch { return false; }
  }

  // ── NAVIGATION ──
  function gotoPage(pageId) {
    currentPage = pageId;
    $$('.page').forEach(p => p.classList.toggle('is-active', p.dataset.pageId === pageId));
    $$('.nav-item[data-page]').forEach(n => n.classList.toggle('is-active', n.dataset.page === pageId));
    document.body.classList.remove('sidebar-open');
    $('#sidebar').classList.remove('is-open');
    if (pageId === 'uid') renderUIDList();
  }

  $$('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', () => {
      if (el.id === 'navRefresh') { loadData(); return; }
      gotoPage(el.dataset.page);
    });
  });

  $$('[data-goto]').forEach(el => {
    el.addEventListener('click', () => gotoPage(el.dataset.goto));
  });

  // ── LOAD DATA ──
  async function loadData() {
    try {
      const [k, p] = await Promise.all([KeyAPI.getKeys(), KeyAPI.getPackages()]);
      keys = k;
      packages = p;
      renderAll();
    } catch (err) {
      toast('danger', 'Lỗi', err.message);
    }
  }

  function renderAll() {
    renderStats();
    renderRecent();
    renderPkgGrid();
    renderPkgFilters();
    renderTable();
    renderUIDList();
  }

  // ── STATS ──
  function renderStats() {
    const list = Object.values(keys);
    const active = list.filter(k => keyStatus(k) === 'active').length;
    const expired = list.filter(k => keyStatus(k) === 'expired').length;
    const total = list.length;
    let totalUID = 0;
    list.forEach(k => { if (k.devices) totalUID += Object.keys(k.devices).length; });

    const el = (id, v) => { const e = $(`#${id}`); if (e) e.textContent = v; };
    el('statTotal', total);
    el('statActive', active);
    el('statExpired', expired);
    el('statPackages', Object.keys(packages).length);
    el('navKeyCount', total);
    el('navPkgCount', Object.keys(packages).length);
    el('navUIDCount', totalUID);

    const pct = total ? Math.round(active/total*100) : 0;
    el('activePct', pct + '%');
    const bar = $('#activeBar');
    if (bar) bar.style.width = pct + '%';
    const sum = $('#activeSummary');
    if (sum) sum.textContent = `${active} / ${total} key còn hạn`;
  }

  // ── RECENT ──
  function renderRecent() {
    const feed = $('#recentKeys');
    if (!feed) return;
    const recent = Object.entries(keys)
      .sort((a,b) => (b[1]?.createdAt||0) - (a[1]?.createdAt||0))
      .slice(0, 10);
    if (!recent.length) {
      feed.innerHTML = '<li style="padding:24px;color:var(--text-3);text-align:center">Chưa có key nào.</li>';
      return;
    }
    feed.innerHTML = recent.map(([id,k]) => {
      const st = keyStatus(k);
      const devCount = Object.keys(k.devices||{}).length;
      const keyDisplay = k.key || id;
      return `
      <li class="activity-item">
        <div class="activity-item__dot" style="background:${st === 'active' ? 'var(--green)' : st === 'banned' ? 'var(--red)' : 'var(--amber)'}"></div>
        <div class="activity-item__body">
          <p><code class="key-code" data-copy="${esc(keyDisplay)}">${esc(keyDisplay)}</code></p>
          <span>${esc(pkgName(k.packageId||k.package))} · ${devCount}/${k.maxDevices||1} thiết bị · ${fmtDate(k.createdAt)}</span>
        </div>
        <span class="status-badge status-badge--${st === 'active' ? 'completed' : st === 'banned' ? 'failed' : 'pending'}"><i></i>${st === 'active' ? 'Còn hạn' : st === 'banned' ? 'Bị khoá' : 'Hết hạn'}</span>
      </li>`;
    }).join('');
  }

  // ── PACKAGES ──
  function renderPkgGrid() {
    const grid = $('#pkgGrid');
    if (!grid) return;
    const entries = Object.entries(packages);
    if (!entries.length) {
      grid.innerHTML = `<div class="datagrid__empty"><svg viewBox="0 0 24 24"><path d="M12 2l9 5v10l-9 5-9-5V7l9-5z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><strong>Chưa có gói nào</strong><p>Nhấn "Tạo Gói mới" để tạo gói đầu tiên.</p></div>`;
      return;
    }
    const counts = {};
    Object.values(keys).forEach(k => { const id = k.packageId||k.package; if (id) counts[id] = (counts[id]||0)+1; });
    grid.innerHTML = entries.map(([id,p]) => {
      const dur = p.durationDays || (p.duration ? Math.floor(p.duration/86400000) : 0);
      return `
      <div class="pkg-card">
        <div class="pkg-card__head">
          <div class="pkg-card__icon"><svg viewBox="0 0 24 24"><path d="M12 2l9 5v10l-9 5-9-5V7l9-5z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 7l9 5 9-5M12 12v10" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></div>
          <button class="dg-action dg-action--danger" data-del-pkg="${esc(id)}">✕</button>
        </div>
        <div class="pkg-card__name">${esc(p.name)}</div>
        <div class="pkg-card__price">${p.price ? Number(p.price).toLocaleString('vi-VN') + 'đ' : 'Miễn phí'}</div>
        <ul class="pkg-card__meta">
          <li><span>Thời hạn</span><b>${dur > 0 ? dur + ' ngày' : 'Vĩnh viễn'}</b></li>
          <li><span>Số key</span><b>${counts[id]||0}</b></li>
          <li><span>Max thiết bị</span><b>${p.maxDevices||1}</b></li>
          ${p.note ? `<li><span>Mô tả</span><b>${esc(p.note)}</b></li>` : ''}
        </ul>
        <button class="btn btn--secondary btn--sm pkg-card__cta" data-create-for="${esc(id)}">+ Tạo key gói này</button>
      </div>`;
    }).join('');
  }

  function renderPkgFilters() {
    const opts = Object.entries(packages).map(([id,p]) => `<option value="${esc(id)}">${esc(p.name)}</option>`).join('');
    const pf = $('#packageFilter');
    if (pf) {
      const cur = pf.value;
      pf.innerHTML = `<option value="all">Tất cả gói</option>` + opts;
      if ([...pf.options].some(o => o.value === cur)) pf.value = cur;
    }
    const fp = $('#fPackage');
    if (fp) {
      fp.innerHTML = Object.keys(packages).length 
        ? `<option value="" disabled selected>— Chọn gói —</option>` + opts 
        : `<option value="" disabled selected>Chưa có gói</option>`;
    }
  }

  // ── TABLE ──
  function getFilteredKeys() {
    let list = Object.entries(keys).map(([id,k]) => ({
      id, ...k,
      _status: keyStatus(k),
      _pkgName: pkgName(k.packageId||k.package),
      _devCount: Object.keys(k.devices||{}).length,
      _maxDev: k.maxDevices||1,
      _key: k.key||id,
      _latestUID: getLatestUID(k.devices)
    }));

    const q = searchTerm.trim().toLowerCase();
    if (q) {
      list = list.filter(k => 
        k._key.toLowerCase().includes(q) ||
        (k.note||'').toLowerCase().includes(q) ||
        k._pkgName.toLowerCase().includes(q) ||
        Object.keys(k.devices||{}).some(uid => uid.toLowerCase().includes(q))
      );
    }

    if (statusFilter !== 'all') list = list.filter(k => k._status === statusFilter);
    if (pkgFilter !== 'all') list = list.filter(k => (k.packageId||k.package) === pkgFilter);

    list.sort((a,b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (sortKey === 'package') { va = a._pkgName; vb = b._pkgName; }
      if (sortKey === 'devices') { va = a._devCount; vb = b._devCount; }
      if (sortKey === 'key') { va = a._key; vb = b._key; }
      va = va ?? 0; vb = vb ?? 0;
      const r = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      return sortDir === 'asc' ? r : -r;
    });
    return list;
  }

  function renderTable() {
    const body = $('#tableBody');
    if (!body) return;
    const list = getFilteredKeys();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (page > pages) page = pages;
    const start = (page-1)*PAGE_SIZE;
    const slice = list.slice(start, start+PAGE_SIZE);

    const sub = $('#keysSubtitle');
    if (sub) sub.textContent = `${list.length} key`;
    const empty = $('#tableEmpty');
    if (empty) empty.hidden = list.length > 0;
    const info = $('#pageInfo');
    if (info) info.textContent = list.length ? `Hiển thị ${start+1}–${Math.min(start+PAGE_SIZE, list.length)} / ${list.length}` : 'Hiển thị 0–0 / 0';

    if (!slice.length) { body.innerHTML = ''; return; }

    body.innerHTML = slice.map(k => {
      const st = k._status;
      const badge = st === 'active' ? 'completed' : st === 'banned' ? 'failed' : 'pending';
      const label = st === 'active' ? 'Còn hạn' : st === 'banned' ? 'Bị khoá' : 'Hết hạn';
      const devInfo = `${k._devCount}/${k._maxDev}`;
      const latest = k._latestUID;
      return `
      <div class="dg-row dg-row--keys">
        <span class="dg-cell">
          <code class="key-code" data-copy="${esc(k._key)}">${esc(k._key)}</code>
          ${latest ? `<span style="display:block;font-size:10px;color:var(--text-3)">⭐ ${esc(latest.substring(0,12))}...</span>` : ''}
        </span>
        <span class="dg-cell">${esc(k._pkgName)}</span>
        <span class="dg-cell">${fmtDate(k.createdAt)}</span>
        <span class="dg-cell">${k.expiresAt ? fmtDate(k.expiresAt) : 'Vĩnh viễn'}</span>
        <span class="dg-cell"><span class="device-badge ${k._devCount >= k._maxDev ? 'device-badge--full' : ''}">📱 ${devInfo}</span></span>
        <span class="dg-cell"><span class="status-badge status-badge--${badge}"><i></i>${label}</span></span>
        <span class="dg-cell dg-cell--end dg-actions">
          <button class="dg-action" data-view-devices="${esc(k.id)}" title="Xem thiết bị">
            <svg viewBox="0 0 24 24"><rect x="5" y="8" width="14" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="16" r="1.5" fill="currentColor"/></svg>
          </button>
          <button class="dg-action" data-copy="${esc(k._key)}" title="Sao chép key">
            <svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>
          </button>
          <button class="dg-action" data-ban="${esc(k.id)}" title="${st === 'banned' ? 'Mở khoá' : 'Khoá'}">
            <svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 11V8a4 4 0 018 0v3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>
          </button>
          <button class="dg-action dg-action--danger" data-del="${esc(k.id)}" title="Xoá">
            <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6.5 7l1 13h9l1-13" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>
          </button>
        </span>
      </div>`;
    }).join('');

    // Pagination
    const pag = $('#pagination');
    if (!pag) return;
    let html = `<button class="page-btn" data-pg="${page-1}" ${page===1?'disabled':''}>‹</button>`;
    for (let i=1; i<=pages; i++) {
      if (pages > 7 && i > 2 && i < pages-1 && Math.abs(i-page) > 1) {
        if (!html.endsWith('…</span>')) html += `<span class="page-ellipsis">…</span>`;
        continue;
      }
      html += `<button class="page-btn ${i===page?'is-active':''}" data-pg="${i}">${i}</button>`;
    }
    html += `<button class="page-btn" data-pg="${page+1}" ${page===pages?'disabled':''}>›</button>`;
    pag.innerHTML = html;
  }

  // ── UID LIST ──
  let uidPage = 1;
  let uidSearch = '';
  let uidStatus = 'all';
  const UID_PAGE_SIZE = 15;

  function renderUIDList() {
    const body = $('#uidBody');
    if (!body) return;

    let allUIDs = [];
    Object.entries(keys).forEach(([keyId, keyData]) => {
      if (keyData.devices) {
        Object.entries(keyData.devices).forEach(([uid, active]) => {
          allUIDs.push({
            uid, keyId, active,
            keyDisplay: keyData.key || keyId,
            pkgName: pkgName(keyData.packageId||keyData.package)
          });
        });
      }
    });

    const q = uidSearch.trim().toLowerCase();
    if (q) {
      allUIDs = allUIDs.filter(u => 
        u.uid.toLowerCase().includes(q) ||
        u.keyDisplay.toLowerCase().includes(q)
      );
    }

    if (uidStatus !== 'all') {
      allUIDs = allUIDs.filter(u => uidStatus === 'active' ? u.active : !u.active);
    }

    allUIDs.reverse();

    const sub = $('#uidSubtitle');
    if (sub) sub.textContent = `${allUIDs.length} UID`;
    const empty = $('#uidEmpty');
    if (empty) empty.hidden = allUIDs.length > 0;

    const pages = Math.max(1, Math.ceil(allUIDs.length / UID_PAGE_SIZE));
    if (uidPage > pages) uidPage = pages;
    const start = (uidPage-1)*UID_PAGE_SIZE;
    const slice = allUIDs.slice(start, start+UID_PAGE_SIZE);

    const info = $('#uidPageInfo');
    if (info) info.textContent = allUIDs.length ? `Hiển thị ${start+1}–${Math.min(start+UID_PAGE_SIZE, allUIDs.length)} / ${allUIDs.length}` : 'Hiển thị 0–0 / 0';

    if (!slice.length) { body.innerHTML = ''; return; }

    body.innerHTML = slice.map(u => `
      <div class="dg-row dg-row--uid">
        <span class="dg-cell" style="font-family:monospace;font-size:13px">
          <code class="key-code" data-copy="${esc(u.uid)}">${esc(u.uid)}</code>
          ${u.active ? ' ✅' : ''}
        </span>
        <span class="dg-cell"><code class="key-code" data-copy="${esc(u.keyDisplay)}">${esc(u.keyDisplay)}</code></span>
        <span class="dg-cell">${esc(u.pkgName)}</span>
        <span class="dg-cell"><span class="status-badge status-badge--${u.active ? 'completed' : 'pending'}"><i></i>${u.active ? 'Đang dùng' : 'Chưa dùng'}</span></span>
        <span class="dg-cell dg-cell--end dg-actions">
          <button class="dg-action" data-view-devices="${esc(u.keyId)}" title="Xem key">
            <svg viewBox="0 0 24 24"><rect x="5" y="8" width="14" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="16" r="1.5" fill="currentColor"/></svg>
          </button>
          <button class="dg-action" data-copy="${esc(u.uid)}" title="Sao chép UID">
            <svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>
          </button>
          <button class="dg-action dg-action--danger" data-remove-uid="${esc(u.uid)}" data-key-id="${esc(u.keyId)}" title="Xoá UID">
            <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6.5 7l1 13h9l1-13" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>
          </button>
        </span>
      </div>
    `).join('');

    // Pagination
    const pag = $('#uidPagination');
    if (!pag) return;
    let html = `<button class="page-btn" data-uid-pg="${uidPage-1}" ${uidPage===1?'disabled':''}>‹</button>`;
    for (let i=1; i<=pages; i++) {
      html += `<button class="page-btn ${i===uidPage?'is-active':''}" data-uid-pg="${i}">${i}</button>`;
    }
    html += `<button class="page-btn" data-uid-pg="${uidPage+1}" ${uidPage===pages?'disabled':''}>›</button>`;
    pag.innerHTML = html;
  }

  // ── EVENTS ──
  // Search
  $('#tableSearch')?.addEventListener('input', e => {
    searchTerm = e.target.value;
    page = 1;
    renderTable();
  });

  // Status filter
  $('#statusFilter')?.addEventListener('change', e => {
    statusFilter = e.target.value;
    page = 1;
    renderTable();
  });

  // Package filter
  $('#packageFilter')?.addEventListener('change', e => {
    pkgFilter = e.target.value;
    page = 1;
    renderTable();
  });

  // Pagination
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-pg]');
    if (btn && !btn.disabled) {
      page = +btn.dataset.pg;
      renderTable();
    }
    const uidBtn = e.target.closest('[data-uid-pg]');
    if (uidBtn && !uidBtn.disabled) {
      uidPage = +uidBtn.dataset.uidPg;
      renderUIDList();
    }
  });

  // Sort
  document.querySelectorAll('.dg-cell--sortable').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.sort;
      if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortKey = key; sortDir = 'desc'; }
      renderTable();
    });
  });

  // Copy
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-copy]');
    if (el) {
      if (await copyText(el.dataset.copy)) toast('success', 'Đã sao chép', el.dataset.copy);
      return;
    }
  });

  // ── MODALS ──
  function openModal(id) {
    const m = $(id);
    if (m) m.hidden = false;
  }
  function closeModal(el) {
    const m = el.closest('.modal');
    if (m) m.hidden = true;
  }
  document.querySelectorAll('[data-close-modal]').forEach(el => {
    el.addEventListener('click', () => closeModal(el));
  });
  document.querySelectorAll('.modal__backdrop').forEach(el => {
    el.addEventListener('click', () => closeModal(el));
  });

  // ── CREATE KEY ──
  document.querySelectorAll('#topCreateKeyBtn, #dashCreateKeyBtn, #keysCreateBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!Object.keys(packages).length) {
        toast('warning', 'Chưa có gói', 'Hãy tạo gói trước.');
        gotoPage('packages');
        openModal('#pkgModal');
        return;
      }
      openModal('#keyModal');
    });
  });

  $('#keyForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const qty = Math.min(100, Math.max(1, +$('#fQuantity').value || 1));
    const pkgId = $('#fPackage').value;
    if (!pkgId) { toast('warning', 'Thiếu gói', 'Chọn gói cho key.'); return; }
    const pkg = packages[pkgId];
    const maxDev = $('#fMaxDevices').value !== '' ? +$('#fMaxDevices').value : (pkg?.maxDevices || 1);
    const dur = $('#fDuration').value !== '' ? +$('#fDuration').value : (pkg?.durationDays || 0);
    const note = $('#fNote').value.trim();
    const prefix = $('#fPrefix').value.trim() || 'KEY';

    const btn = $('#keySubmit');
    btn.classList.add('is-loading');
    btn.disabled = true;

    try {
      const created = [];
      for (let i=0; i<qty; i++) {
        const keyVal = genKey(prefix);
        const record = {
          key: keyVal,
          packageId: pkgId,
          createdAt: now(),
          expiresAt: dur > 0 ? now() + dur*864e5 : null,
          status: 'active',
          maxDevices: maxDev,
          devices: {},
          note: note || null
        };
        await KeyAPI.createKey(record);
        keys[keyVal] = record;
        created.push(keyVal);
      }
      renderAll();
      closeModal($('#keyModal'));
      const list = $('#keyResultList');
      if (list) list.innerHTML = created.map(k => `<code class="key-code key-code--lg" data-copy="${esc(k)}">${esc(k)}</code>`).join('');
      openModal('#resultModal');
      toast('success', 'Thành công', `Đã tạo ${created.length} key.`);
    } catch (err) {
      toast('danger', 'Lỗi', err.message);
    } finally {
      btn.classList.remove('is-loading');
      btn.disabled = false;
    }
  });

  // ── CREATE PACKAGE ──
  $('#createPkgBtn')?.addEventListener('click', () => openModal('#pkgModal'));

  $('#pkgForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#pName').value.trim();
    const dur = $('#pDuration').value;
    if (!name || dur === '') { toast('warning', 'Thiếu thông tin', 'Nhập tên và thời hạn.'); return; }

    const btn = $('#pkgSubmit');
    btn.classList.add('is-loading');
    btn.disabled = true;

    try {
      const record = {
        name,
        durationDays: +dur,
        maxDevices: +$('#pMaxDevices').value || 1,
        price: +$('#pPrice').value || 0,
        note: $('#pNote').value.trim() || null,
        createdAt: now(),
        status: 'active'
      };
      const res = await KeyAPI.createPackage(record);
      packages[res.name] = record;
      renderAll();
      closeModal($('#pkgModal'));
      $('#pkgForm').reset();
      toast('success', 'Thành công', `Gói "${name}" đã được tạo.`);
    } catch (err) {
      toast('danger', 'Lỗi', err.message);
    } finally {
      btn.classList.remove('is-loading');
      btn.disabled = false;
    }
  });

  // ── COPY ALL ──
  $('#copyAllKeysBtn')?.addEventListener('click', async () => {
    const keys = [...document.querySelectorAll('#keyResultList .key-code')].map(el => el.textContent);
    if (await copyText(keys.join('\n'))) toast('success', 'Đã sao chép', `${keys.length} key.`);
  });

  // ── ADD GLOBAL UID ──
  $('#addGlobalUIDBtn')?.addEventListener('click', () => {
    const uid = prompt('Nhập UID mới:');
    if (!uid || !uid.trim()) return;
    let targetId = null;
    for (const [id, key] of Object.entries(keys)) {
      if (Object.keys(key.devices||{}).length < (key.maxDevices||1) && keyStatus(key) === 'active') {
        targetId = id;
        break;
      }
    }
    if (!targetId) {
      toast('warning', 'Không có key trống', 'Tất cả key đã đầy hoặc không hoạt động.');
      return;
    }
    const key = keys[targetId];
    if (key.devices && key.devices[uid.trim()]) {
      toast('warning', 'UID đã tồn tại', `UID ${uid.trim()} đã tồn tại.`);
      return;
    }
    const newDevices = { ...key.devices };
    newDevices[uid.trim()] = true;
    KeyAPI.updateKey(targetId, { devices: newDevices }).then(() => {
      keys[targetId].devices = newDevices;
      renderAll();
      toast('success', 'Đã thêm UID', `UID ${uid.trim()} được thêm vào key ${key.key}`);
      gotoPage('uid');
    }).catch(err => toast('danger', 'Lỗi', err.message));
  });

  // ── UID SEARCH ──
  $('#uidSearch')?.addEventListener('input', e => {
    uidSearch = e.target.value;
    uidPage = 1;
    renderUIDList();
  });

  $('#uidStatusFilter')?.addEventListener('change', e => {
    uidStatus = e.target.value;
    uidPage = 1;
    renderUIDList();
  });

  // ── DELEGATED ACTIONS ──
  document.addEventListener('click', async e => {
    // View devices
    const viewDev = e.target.closest('[data-view-devices]');
    if (viewDev) {
      const id = viewDev.dataset.viewDevices;
      const key = keys[id];
      if (!key) return;
      const devices = key.devices || {};
      const list = Object.entries(devices);
      const latest = getLatestUID(devices);
      let msg = `📱 Thiết bị của key: ${key.key || id}\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `Tổng: ${list.length} / ${key.maxDevices||1} thiết bị\n`;
      if (latest) msg += `⭐ UID mới nhất: ${latest}\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      if (list.length) {
        list.forEach(([uid, active]) => {
          msg += `${active ? '✅' : '❌'} ${uid}\n`;
        });
      } else {
        msg += 'Chưa có thiết bị nào.';
      }
      alert(msg);
      return;
    }

    // Ban
    const ban = e.target.closest('[data-ban]');
    if (ban) {
      const id = ban.dataset.ban;
      const rec = keys[id];
      if (!rec) return;
      const newStatus = rec.status === 'banned' ? 'active' : 'banned';
      try {
        await KeyAPI.updateKey(id, { status: newStatus });
        rec.status = newStatus;
        renderAll();
        toast('success', newStatus === 'banned' ? 'Đã khoá' : 'Đã mở khoá', rec.key);
      } catch (err) { toast('danger', 'Lỗi', err.message); }
      return;
    }

    // Delete key
    const del = e.target.closest('[data-del]');
    if (del) {
      const id = del.dataset.del;
      if (!keys[id]) return;
      if (!confirm(`Xoá key "${keys[id].key||id}"?`)) return;
      try {
        await KeyAPI.deleteKey(id);
        delete keys[id];
        renderAll();
        toast('success', 'Đã xoá', 'Key đã bị xoá.');
      } catch (err) { toast('danger', 'Lỗi', err.message); }
      return;
    }

    // Delete package
    const delPkg = e.target.closest('[data-del-pkg]');
    if (delPkg) {
      const id = delPkg.dataset.delPkg;
      if (!packages[id]) return;
      if (!confirm(`Xoá gói "${packages[id].name}"?`)) return;
      try {
        await KeyAPI.deletePackage(id);
        delete packages[id];
        renderAll();
        toast('success', 'Đã xoá gói', 'Gói đã bị xoá.');
      } catch (err) { toast('danger', 'Lỗi', err.message); }
      return;
    }

    // Create for package
    const createFor = e.target.closest('[data-create-for]');
    if (createFor) {
      openModal('#keyModal');
      const fp = $('#fPackage');
      if (fp) fp.value = createFor.dataset.createFor;
      return;
    }

    // Remove UID
    const removeUID = e.target.closest('[data-remove-uid]');
    if (removeUID) {
      const uid = removeUID.dataset.removeUid;
      const keyId = removeUID.dataset.keyId;
      if (!confirm(`Xoá UID "${uid}"?`)) return;
      const key = keys[keyId];
      if (!key) return;
      const newDevices = { ...key.devices };
      delete newDevices[uid];
      try {
        await KeyAPI.updateKey(keyId, { devices: newDevices });
        keys[keyId].devices = newDevices;
        renderAll();
        toast('success', 'Đã xoá UID', `UID ${uid} đã được xoá.`);
      } catch (err) { toast('danger', 'Lỗi', err.message); }
      return;
    }
  });

  // ── CHECK KEY ──
  $('#checkForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const val = $('#checkInput').value.trim();
    const result = $('#checkResult');
    if (!val) { toast('warning', 'Chưa nhập key', 'Vui lòng nhập key.'); return; }
    const btn = $('#checkSubmit');
    btn.classList.add('is-loading');
    btn.disabled = true;
    result.hidden = true;

    try {
      const rec = await KeyAPI.getKey(val);
      if (!rec || !rec.key) {
        result.innerHTML = `
          <div class="check-card check-card--invalid">
            <div class="check-card__icon">✕</div>
            <h3>Key không tồn tại</h3>
            <p><code>${esc(val)}</code> không có trong hệ thống.</p>
          </div>`;
        result.hidden = false;
      } else {
        const st = keyStatus(rec);
        const devCount = Object.keys(rec.devices||{}).length;
        const latest = getLatestUID(rec.devices);
        const map = {
          active: { cls: 'valid', icon: '✅', label: 'Key hợp lệ — Còn hạn' },
          expired: { cls: 'expired', icon: '⏱', label: 'Key đã hết hạn' },
          banned: { cls: 'invalid', icon: '🔒', label: 'Key đã bị khoá' }
        };
        const m = map[st] || map.expired;
        result.innerHTML = `
          <div class="check-card check-card--${m.cls}">
            <div class="check-card__icon">${m.icon}</div>
            <h3>${m.label}</h3>
            <ul class="check-card__meta">
              <li><span>Key</span><b><code>${esc(rec.key)}</code></b></li>
              <li><span>Gói</span><b>${esc(pkgName(rec.packageId||rec.package))}</b></li>
              <li><span>Ngày tạo</span><b>${fmtDate(rec.createdAt)}</b></li>
              <li><span>Hết hạn</span><b>${rec.expiresAt ? fmtDate(rec.expiresAt) : 'Vĩnh viễn'}</b></li>
              <li><span>Thời gian còn lại</span><b>${rec.expiresAt ? (rec.expiresAt > now() ? 'Còn ' + Math.floor((rec.expiresAt-now())/864e5) + ' ngày' : 'Đã hết') : 'Vĩnh viễn'}</b></li>
              <li><span>Thiết bị</span><b>${devCount} / ${rec.maxDevices||1}</b></li>
              <li><span>UID mới nhất</span><b style="font-family:monospace;font-size:12px">${latest || 'Chưa có'}</b></li>
              ${rec.note ? `<li><span>Ghi chú</span><b>${esc(rec.note)}</b></li>` : ''}
            </ul>
          </div>`;
        result.hidden = false;
      }
    } catch (err) {
      toast('danger', 'Lỗi', err.message);
    } finally {
      btn.classList.remove('is-loading');
      btn.disabled = false;
    }
  });

  // ── EXPORT ──
  $('#exportBtn')?.addEventListener('click', () => {
    const list = Object.values(keys);
    if (!list.length) { toast('info', 'Không có dữ liệu', 'Chưa có key nào.'); return; }
    const lines = ['Key,Gói,Ngày tạo,Hết hạn,Trạng thái,Thiết bị,UID mới nhất'];
    list.forEach(k => {
      lines.push(`${k.key},${pkgName(k.packageId||k.package)},${fmtDate(k.createdAt)},${k.expiresAt ? fmtDate(k.expiresAt) : 'Vĩnh viễn'},${keyStatus(k)},${Object.keys(k.devices||{}).length}/${k.maxDevices||1},${getLatestUID(k.devices)||''}`);
    });
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `keys-${new Date().toISOString().slice(0,10)}.csv` });
    a.click();
    URL.revokeObjectURL(a.href);
    toast('success', 'Đã xuất file', `${list.length} key → CSV`);
  });

  // ── DELETE EXPIRED ──
  $('#deleteExpiredBtn')?.addEventListener('click', async () => {
    const expired = Object.entries(keys).filter(([,k]) => keyStatus(k) === 'expired');
    if (!expired.length) { toast('info', 'Không có key hết hạn', 'Tất cả key đều còn hạn.'); return; }
    if (!confirm(`Xoá ${expired.length} key hết hạn?`)) return;
    try {
      await Promise.all(expired.map(([id]) => KeyAPI.deleteKey(id)));
      expired.forEach(([id]) => delete keys[id]);
      renderAll();
      toast('success', 'Đã dọn dẹp', `Đã xoá ${expired.length} key hết hạn.`);
    } catch (err) { toast('danger', 'Lỗi', err.message); }
  });

  // ── REFRESH ──
  $('#refreshBtn')?.addEventListener('click', () => loadData());

  // ── THEME ──
  const saved = localStorage.getItem('theme');
  if (saved) document.documentElement.dataset.theme = saved;
  $('#themeToggle')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
  });

  // ── CLOCK ──
  function tick() {
    const d = new Date();
    const t = $('#clockTime');
    if (t) t.textContent = d.toLocaleTimeString('vi-VN', { hour12: false });
    const dt = $('#clockDate');
    if (dt) dt.textContent = d.toLocaleDateString('vi-VN', { weekday:'short', day:'numeric', month:'numeric' });
    const label = $('#todayLabel');
    if (label) label.textContent = d.toLocaleDateString('vi-VN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  }
  tick();
  setInterval(tick, 1000);

  // ── MOBILE MENU ──
  $('#mobileMenuBtn')?.addEventListener('click', () => {
    $('#sidebar').classList.toggle('is-open');
    document.body.classList.toggle('sidebar-open');
  });

  // ── SEARCH TRIGGER ──
  $('#searchTrigger')?.addEventListener('click', () => {
    gotoPage('keys');
    $('#tableSearch')?.focus();
  });

  // ── KEYBOARD ──
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      gotoPage('keys');
      $('#tableSearch')?.focus();
    }
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal:not([hidden])').forEach(m => m.hidden = true);
    }
  });

  // ── INIT ──
  loadData();
  setInterval(() => { renderStats(); renderTable(); }, 60000);
})();