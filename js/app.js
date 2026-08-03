// app.js - Cập nhật với tab UID
(() => {
  "use strict";

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  /* ── STATE ─────────────────────────────────── */
  let keys = {};
  let packages = {};
  const table = { search: "", status: "all", pkg: "all", sortKey: "createdAt", sortDir: "desc", page: 1 };
  const uidTable = { search: "", status: "all", page: 1 };
  const PAGE_SIZE = 10;
  const UID_PAGE_SIZE = 15;
  let lastCreatedKeys = [];

  /* ── HELPERS ───────────────────────────────── */
  const now = () => Date.now();

  function keyStatus(rec) {
    if (!rec) return "unknown";
    if (rec.status === "banned" || rec.status === "inactive") return "banned";
    if (!rec.expiresAt) return "active";
    return rec.expiresAt > now() ? "active" : "expired";
  }

  const fmtDate = (ts) => {
    if (!ts) return "—";
    if (typeof ts === 'number' && ts > 1000000000000) {
      return new Date(ts).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    }
    const date = new Date(ts);
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  function timeLeft(rec) {
    if (!rec || !rec.expiresAt) return "Vĩnh viễn";
    const ms = rec.expiresAt - now();
    if (ms <= 0) return "Đã hết hạn";
    const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5);
    if (d > 0) return `Còn ${d} ngày ${h} giờ`;
    if (h > 0) return `Còn ${h} giờ`;
    return "Còn ít phút";
  }

  function genKey(prefix) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const seg = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), b => chars[b % chars.length]).join("");
    const body = `${seg()}-${seg()}-${seg()}-${seg()}`;
    return prefix ? `${prefix.toUpperCase()}-${body}` : body;
  }

  const pkgName = (id) => {
    if (!id) return "—";
    if (packages[id]) return packages[id].name || "—";
    for (const [pkgId, pkg] of Object.entries(packages)) {
      if (pkgId === id) return pkg.name || "—";
    }
    return "—";
  };

  const getLatestUID = (devices) => {
    if (!devices || typeof devices !== 'object') return null;
    const deviceKeys = Object.keys(devices);
    if (deviceKeys.length === 0) return null;
    return deviceKeys[deviceKeys.length - 1];
  };

  const fmtPrice = (v) => v ? Number(v).toLocaleString("vi-VN") + "đ" : "Miễn phí";

  /* ── TOAST ─────────────────────────────────── */
  const toastStack = $("#toastStack");
  const TOAST_ICONS = {
    success: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 12.5l2.7 2.7L16 9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    danger: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v6M12 16.5v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    warning: '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2L12 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4M12 17v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5V8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };

  function toast(type, title, message, duration = 4200) {
    if (!toastStack) return;
    const el = document.createElement("div");
    el.className = `toast toast--${type}`;
    el.innerHTML = `
      <div class="toast__icon">${TOAST_ICONS[type]}</div>
      <div class="toast__body"><strong>${esc(title)}</strong><p>${esc(message)}</p></div>
      <button class="toast__close" aria-label="Đóng">✕</button>
      <i class="toast__progress" style="animation-duration:${duration}ms"></i>`;
    toastStack.appendChild(el);
    const remove = () => { el.classList.add("is-leaving"); setTimeout(() => el.remove(), 320); };
    el.querySelector(".toast__close")?.addEventListener("click", remove);
    setTimeout(remove, duration);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        return true;
      } catch {
        return false;
      } finally {
        ta.remove();
      }
    }
  }

  /* ── NAVIGATION ────────────────────── */
  function gotoPage(pageId) {
    $$(".page").forEach(p => p.classList.toggle("is-active", p.dataset.pageId === pageId));
    $$(".nav-item[data-page]").forEach(n => n.classList.toggle("is-active", n.dataset.page === pageId));
    document.body.classList.remove("sidebar-open");
    $("#sidebar")?.classList.remove("is-open");
    
    // Refresh UID list khi vào tab UID
    if (pageId === "uid") {
      renderUIDList();
    }
  }

  $$(".nav-item[data-page]").forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      if (item.id === "navRefresh") { loadAll(true); return; }
      gotoPage(item.dataset.page);
    });
  });
  $$("[data-goto]").forEach(b => b.addEventListener("click", () => gotoPage(b.dataset.goto)));

  /* ── DATA LOAD ─────────────────────────────── */
  async function loadAll(notify = false) {
    renderSkeleton();
    try {
      const [k, p] = await Promise.all([KeyAPI.getKeys(), KeyAPI.getPackages()]);
      keys = k;
      packages = p;
      renderAll();
      if (notify) toast("success", "Đã làm mới", "Dữ liệu đã được đồng bộ từ Firebase.");
    } catch (err) {
      console.error(err);
      toast("danger", "Lỗi kết nối", "Không thể tải dữ liệu từ Firebase: " + err.message);
      const body = $("#tableBody");
      if (body) body.innerHTML = "";
      const subtitle = $("#keysSubtitle");
      if (subtitle) subtitle.textContent = "Lỗi tải dữ liệu";
    }
  }

  function renderAll() {
    renderStats();
    renderRecent();
    renderPkgStats();
    renderPkgGrid();
    renderPkgFilters();
    renderTable();
    renderUIDList();
  }

  /* ── STATS ─────────────────────────────────── */
  function renderStats() {
    const list = Object.values(keys);
    const active = list.filter(k => keyStatus(k) === "active").length;
    const expired = list.filter(k => keyStatus(k) === "expired").length;
    const total = list.length;
    
    // Đếm tổng số UID
    let totalUID = 0;
    list.forEach(k => {
      if (k.devices) totalUID += Object.keys(k.devices).length;
    });
    
    const el = (id, val) => { const e = $(`#${id}`); if (e) e.textContent = val; };
    el("statTotal", total);
    el("statActive", active);
    el("statExpired", expired);
    el("statPackages", Object.keys(packages).length);
    el("navKeyCount", total);
    el("navPkgCount", Object.keys(packages).length);
    el("navUIDCount", totalUID);
    
    const pct = total ? Math.round(active / total * 100) : 0;
    el("activePct", pct + "%");
    const bar = $("#activeBar");
    if (bar) bar.style.setProperty("--w", pct + "%");
    const summary = $("#activeSummary");
    if (summary) summary.textContent = `${active} / ${total} key còn hạn`;
  }

  /* ── RECENT KEYS ───────────────── */
  function renderRecent() {
    const feed = $("#recentKeys");
    if (!feed) return;
    const recent = Object.entries(keys)
      .sort((a, b) => (b[1]?.createdAt || 0) - (a[1]?.createdAt || 0))
      .slice(0, 10);
    if (!recent.length) {
      feed.innerHTML = `<li style="padding:24px;color:var(--text-3);text-align:center">Chưa có key nào. Nhấn "Tạo Key" để bắt đầu.</li>`;
      return;
    }
    feed.innerHTML = recent.map(([id, k]) => {
      const st = keyStatus(k);
      const deviceCount = Object.keys(k.devices || {}).length;
      const keyDisplay = k.key || id;
      const latestUID = getLatestUID(k.devices);
      return `
      <li class="activity-item">
        <div class="activity-item__dot" style="--dot:${st === "active" ? "var(--green)" : st === "banned" ? "var(--red)" : "var(--amber)"}"></div>
        <div class="activity-item__body">
          <p><code class="key-code" data-copy="${esc(keyDisplay)}" title="Nhấn để sao chép">${esc(keyDisplay)}</code></p>
          <span>${esc(pkgName(k.packageId || k.package))} · ${deviceCount}/${k.maxDevices || 1} thiết bị · ${fmtDate(k.createdAt)}</span>
          ${latestUID ? `<span style="font-size:11px;color:var(--text-3)">🆕 UID: ${esc(latestUID.substring(0, 8))}...</span>` : ''}
        </div>
        <span class="status-badge status-badge--${st === "active" ? "completed" : st === "banned" ? "failed" : "pending"}"><i></i>${st === "active" ? "Còn hạn" : st === "banned" ? "Bị khoá" : "Hết hạn"}</span>
      </li>`;
    }).join("");
  }

  /* ── PACKAGE STATS ─────────────── */
  function renderPkgStats() {
    const wrap = $("#pkgStats");
    if (!wrap) return;
    const entries = Object.entries(packages);
    if (!entries.length) {
      wrap.innerHTML = `<li style="padding:24px;color:var(--text-3);text-align:center">Chưa có gói nào.</li>`;
      return;
    }
    const counts = {};
    Object.values(keys).forEach(k => { 
      const pkgId = k.packageId || k.package;
      if (pkgId) counts[pkgId] = (counts[pkgId] || 0) + 1; 
    });
    const total = Object.values(keys).length || 1;
    const colors = ["var(--cyan)", "var(--purple)", "var(--pink)", "var(--green)", "var(--amber)", "var(--blue)"];
    wrap.innerHTML = entries.map(([id, p], i) => {
      const c = counts[id] || 0;
      const pct = Math.round(c / total * 100);
      return `
      <li class="pkg-stat">
        <div class="pkg-stat__head">
          <span class="pkg-stat__name"><i style="background:${colors[i % colors.length]}"></i>${esc(p.name)}</span>
          <span class="pkg-stat__count">${c} key</span>
        </div>
        <div class="pkg-stat__bar"><i style="width:${pct}%;background:${colors[i % colors.length]}"></i></div>
      </li>`;
    }).join("");
  }

  /* ── PACKAGE GRID ───────────────────── */
  function renderPkgGrid() {
    const grid = $("#pkgGrid");
    if (!grid) return;
    const entries = Object.entries(packages);
    if (!entries.length) {
      grid.innerHTML = `
        <div class="datagrid__empty" style="grid-column:1/-1">
          <svg viewBox="0 0 24 24"><path d="M12 2l9 5v10l-9 5-9-5V7l9-5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
          <strong>Chưa có gói nào</strong>
          <p>Nhấn "Tạo Gói mới" để tạo gói đầu tiên.</p>
        </div>`;
      return;
    }
    const counts = {};
    Object.values(keys).forEach(k => { 
      const pkgId = k.packageId || k.package;
      if (pkgId) counts[pkgId] = (counts[pkgId] || 0) + 1; 
    });
    grid.innerHTML = entries.map(([id, p]) => {
      const dur = p.durationDays !== undefined ? p.durationDays : (p.duration ? Math.floor(p.duration / 86400000) : 0);
      return `
      <article class="pkg-card">
        <header class="pkg-card__head">
          <div class="pkg-card__icon">
            <svg viewBox="0 0 24 24"><path d="M12 2l9 5v10l-9 5-9-5V7l9-5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 7l9 5 9-5M12 12v10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
          </div>
          <button class="dg-action dg-action--danger" data-del-pkg="${esc(id)}" title="Xoá gói">
            <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6.5 7l1 13h9l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </header>
        <h3 class="pkg-card__name">${esc(p.name)}</h3>
        <p class="pkg-card__price">${fmtPrice(p.price)}</p>
        <ul class="pkg-card__meta">
          <li><span>Thời hạn</span><b>${dur > 0 ? dur + " ngày" : "Vĩnh viễn"}</b></li>
          <li><span>Số key</span><b>${counts[id] || 0}</b></li>
          <li><span>Max thiết bị</span><b>${p.maxDevices || 1}</b></li>
          ${p.note ? `<li><span>Mô tả</span><b>${esc(p.note)}</b></li>` : ""}
        </ul>
        <button class="btn btn--secondary btn--sm pkg-card__cta" data-create-for="${esc(id)}">+ Tạo key gói này</button>
      </article>`;
    }).join("");
  }

  function renderPkgFilters() {
    const opts = Object.entries(packages).map(([id, p]) => `<option value="${esc(id)}">${esc(p.name)}</option>`).join("");
    const pf = $("#packageFilter");
    if (!pf) return;
    const cur = pf.value;
    pf.innerHTML = `<option value="all">Tất cả gói</option>` + opts;
    if ([...pf.options].some(o => o.value === cur)) pf.value = cur;
    const fp = $("#fPackage");
    if (fp) {
      fp.innerHTML = Object.keys(packages).length
        ? `<option value="" disabled selected>— Chọn gói —</option>` + opts
        : `<option value="" disabled selected>Chưa có gói (tạo gói trước)</option>`;
    }
  }

  /* ── DATAGRID KEYS ──────────────────────────────── */
  function getFilteredKeys() {
    let list = Object.entries(keys).map(([id, k]) => ({ 
      id, 
      ...k, 
      _status: keyStatus(k),
      _packageName: pkgName(k.packageId || k.package),
      _deviceCount: Object.keys(k.devices || {}).length,
      _maxDevices: k.maxDevices || 1,
      _keyDisplay: k.key || id,
      _latestUID: getLatestUID(k.devices)
    }));
    
    const q = table.search.trim().toLowerCase();
    if (q) {
      list = list.filter(k => {
        const searchFields = [
          (k._keyDisplay || "").toLowerCase(),
          (k.note || "").toLowerCase(),
          k._packageName.toLowerCase(),
          (k.packageId || "").toLowerCase()
        ];
        if (k.devices) {
          Object.keys(k.devices).forEach(uid => {
            searchFields.push(uid.toLowerCase());
          });
        }
        return searchFields.some(field => field.includes(q));
      });
    }
    
    if (table.status !== "all") {
      list = list.filter(k => k._status === table.status);
    }
    
    if (table.pkg !== "all") {
      const pkgId = table.pkg;
      list = list.filter(k => (k.packageId || k.package) === pkgId);
    }
    
    list.sort((a, b) => {
      let va = a[table.sortKey];
      let vb = b[table.sortKey];
      
      if (table.sortKey === "package") { 
        va = a._packageName; 
        vb = b._packageName; 
      }
      if (table.sortKey === "devices") { 
        va = a._deviceCount; 
        vb = b._deviceCount; 
      }
      if (table.sortKey === "key") { 
        va = a._keyDisplay; 
        vb = b._keyDisplay; 
      }
      
      va = va ?? 0;
      vb = vb ?? 0;
      
      let r;
      if (typeof va === "string" && typeof vb === "string") {
        r = va.localeCompare(vb);
      } else {
        r = va - vb;
      }
      
      return table.sortDir === "asc" ? r : -r;
    });
    
    return list;
  }

  function renderSkeleton() {
    const body = $("#tableBody");
    if (!body) return;
    body.innerHTML = Array.from({ length: 6 }, () => `
      <div class="dg-row dg-row--keys dg-skeleton">
        ${Array.from({ length: 7 }, () => `<span class="dg-cell"><i class="skel"></i></span>`).join("")}
      </div>`).join("");
  }

  function renderTable() {
    const body = $("#tableBody");
    if (!body) return;
    const list = getFilteredKeys();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (table.page > pages) table.page = pages;
    const start = (table.page - 1) * PAGE_SIZE;
    const slice = list.slice(start, start + PAGE_SIZE);

    const subtitle = $("#keysSubtitle");
    if (subtitle) subtitle.textContent = `${list.length} key`;
    const empty = $("#tableEmpty");
    if (empty) empty.hidden = list.length > 0;
    const info = $("#pageInfo");
    if (info) info.textContent = list.length
      ? `Hiển thị ${start + 1}–${Math.min(start + PAGE_SIZE, list.length)} / ${list.length}`
      : "Hiển thị 0–0 / 0";

    body.innerHTML = slice.map(k => {
      const st = k._status;
      const badge = st === "active"
        ? `<span class="status-badge status-badge--completed"><i></i>Còn hạn</span>`
        : st === "banned"
          ? `<span class="status-badge status-badge--failed"><i></i>Bị khoá</span>`
          : `<span class="status-badge status-badge--pending"><i></i>Hết hạn</span>`;
      
      const deviceInfo = `${k._deviceCount}/${k._maxDevices}`;
      const keyDisplay = k._keyDisplay;
      const latestUID = k._latestUID;
      
      return `
      <div class="dg-row dg-row--keys" data-key-id="${esc(k.id)}">
        <span class="dg-cell dg-id">
          <code class="key-code" data-copy="${esc(keyDisplay)}" title="Nhấn để sao chép">${esc(keyDisplay)}</code>
          ${latestUID ? `<span class="latest-uid"><span class="uid-star">⭐</span> ${esc(latestUID.substring(0, 12))}...</span>` : ''}
        </span>
        <span class="dg-cell dg-product">${esc(k._packageName)}</span>
        <span class="dg-cell dg-date">${fmtDate(k.createdAt)}</span>
        <span class="dg-cell dg-date" title="${esc(timeLeft(k))}">${k.expiresAt ? fmtDate(k.expiresAt) : "Vĩnh viễn"}</span>
        <span class="dg-cell dg-devices">
          <span class="device-badge ${k._deviceCount >= k._maxDevices ? 'device-badge--full' : ''}" title="${k._deviceCount} thiết bị đang dùng / ${k._maxDevices} tối đa">
            📱 ${deviceInfo}
          </span>
        </span>
        <span class="dg-cell">${badge}</span>
        <span class="dg-cell dg-cell--end dg-actions">
          <button class="dg-action" data-view-devices="${esc(k.id)}" title="Xem thiết bị">
            <svg viewBox="0 0 24 24"><rect x="5" y="8" width="14" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="16" r="1.5" fill="currentColor"/></svg>
          </button>
          <button class="dg-action" data-copy="${esc(keyDisplay)}" title="Sao chép key">
            <svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>
          </button>
          <button class="dg-action" data-ban="${esc(k.id)}" title="${st === "banned" ? "Mở khoá key" : "Khoá key"}">
            <svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 11V8a4 4 0 018 0v3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>
          </button>
          <button class="dg-action dg-action--danger" data-del="${esc(k.id)}" title="Xoá key">
            <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6.5 7l1 13h9l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </span>
      </div>`;
    }).join("");

    // pagination
    const pag = $("#pagination");
    if (!pag) return;
    let html = `<button class="page-btn" data-pg="${table.page - 1}" ${table.page === 1 ? "disabled" : ""}>‹</button>`;
    for (let i = 1; i <= pages; i++) {
      if (pages > 7 && i > 2 && i < pages - 1 && Math.abs(i - table.page) > 1) {
        if (!html.endsWith("…</span>")) html += `<span class="page-ellipsis">…</span>`;
        continue;
      }
      html += `<button class="page-btn ${i === table.page ? "is-active" : ""}" data-pg="${i}">${i}</button>`;
    }
    html += `<button class="page-btn" data-pg="${table.page + 1}" ${table.page === pages ? "disabled" : ""}>›</button>`;
    pag.innerHTML = html;

    // sort arrows
    $$(".dg-cell--sortable").forEach(b => {
      const active = b.dataset.sort === table.sortKey;
      b.classList.toggle("sort-asc", active && table.sortDir === "asc");
      b.classList.toggle("sort-desc", active && table.sortDir === "desc");
    });
  }

  /* ── TABLE EVENTS ──────────────────────────── */
  const search = $("#tableSearch");
  if (search) {
    search.addEventListener("input", e => { 
      table.search = e.target.value; 
      table.page = 1; 
      renderTable(); 
    });
  }
  
  const statusFilter = $("#statusFilter");
  if (statusFilter) {
    statusFilter.addEventListener("change", e => { 
      table.status = e.target.value; 
      table.page = 1; 
      renderTable(); 
    });
  }
  
  const packageFilter = $("#packageFilter");
  if (packageFilter) {
    packageFilter.addEventListener("change", e => { 
      table.pkg = e.target.value; 
      table.page = 1; 
      renderTable(); 
    });
  }
  
  const pagination = $("#pagination");
  if (pagination) {
    pagination.addEventListener("click", e => {
      const btn = e.target.closest("[data-pg]");
      if (btn && !btn.disabled) { 
        table.page = +btn.dataset.pg; 
        renderTable(); 
      }
    });
  }
  
  $$(".dg-cell--sortable").forEach(b => {
    b.addEventListener("click", () => {
      const k = b.dataset.sort;
      if (table.sortKey === k) {
        table.sortDir = table.sortDir === "asc" ? "desc" : "asc";
      } else { 
        table.sortKey = k; 
        table.sortDir = "desc"; 
      }
      renderTable();
    });
  });

  /* ── UID LIST ──────────────────────────────── */
  function renderUIDList() {
    const body = $("#uidBody");
    if (!body) return;
    
    // Lấy tất cả UID từ tất cả keys
    let allUIDs = [];
    Object.entries(keys).forEach(([keyId, keyData]) => {
      if (keyData.devices && typeof keyData.devices === 'object') {
        Object.entries(keyData.devices).forEach(([uid, active]) => {
          allUIDs.push({
            uid: uid,
            keyId: keyId,
            keyDisplay: keyData.key || keyId,
            packageName: pkgName(keyData.packageId || keyData.package),
            active: active,
            maxDevices: keyData.maxDevices || 1,
            totalDevices: Object.keys(keyData.devices || {}).length
          });
        });
      }
    });
    
    // Sắp xếp UID theo thời gian thêm (mới nhất trước)
    // Vì không có timestamp, sắp xếp theo thứ tự trong danh sách (giả định)
    allUIDs.reverse();
    
    // Tìm kiếm
    const q = uidTable.search.trim().toLowerCase();
    if (q) {
      allUIDs = allUIDs.filter(u => 
        u.uid.toLowerCase().includes(q) || 
        u.keyDisplay.toLowerCase().includes(q) ||
        u.packageName.toLowerCase().includes(q)
      );
    }
    
    // Lọc theo trạng thái
    if (uidTable.status !== "all") {
      allUIDs = allUIDs.filter(u => {
        if (uidTable.status === "active") return u.active === true;
        if (uidTable.status === "inactive") return u.active === false;
        return true;
      });
    }
    
    const subtitle = $("#uidSubtitle");
    if (subtitle) subtitle.textContent = `${allUIDs.length} UID`;
    
    const empty = $("#uidEmpty");
    if (empty) empty.hidden = allUIDs.length > 0;
    
    if (allUIDs.length === 0) {
      body.innerHTML = '';
      return;
    }
    
    // Phân trang
    const pages = Math.max(1, Math.ceil(allUIDs.length / UID_PAGE_SIZE));
    if (uidTable.page > pages) uidTable.page = pages;
    const start = (uidTable.page - 1) * UID_PAGE_SIZE;
    const slice = allUIDs.slice(start, start + UID_PAGE_SIZE);
    
    body.innerHTML = slice.map(u => `
      <div class="dg-row dg-row--uid">
        <span class="dg-cell dg-uid" style="font-family:monospace;font-size:13px">
          <code data-copy="${esc(u.uid)}" style="cursor:pointer;background:var(--bg-2);padding:2px 8px;border-radius:4px;">${esc(u.uid)}</code>
          ${u.active ? ' ✅' : ''}
        </span>
        <span class="dg-cell">
          <code class="key-code" data-copy="${esc(u.keyDisplay)}" title="Nhấn để sao chép">${esc(u.keyDisplay)}</code>
        </span>
        <span class="dg-cell">${esc(u.packageName)}</span>
        <span class="dg-cell">
          <span class="status-badge status-badge--${u.active ? 'completed' : 'pending'}">
            <i></i>${u.active ? 'Đang dùng' : 'Chưa dùng'}
          </span>
        </span>
        <span class="dg-cell dg-cell--end dg-actions">
          <button class="dg-action" data-view-devices="${esc(u.keyId)}" title="Xem key">
            <svg viewBox="0 0 24 24"><rect x="5" y="8" width="14" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="16" r="1.5" fill="currentColor"/></svg>
          </button>
          <button class="dg-action" data-copy="${esc(u.uid)}" title="Sao chép UID">
            <svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>
          </button>
          <button class="dg-action dg-action--danger" data-remove-uid="${esc(u.uid)}" data-key-id="${esc(u.keyId)}" title="Xoá UID">
            <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6.5 7l1 13h9l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </span>
      </div>
    `).join('');
    
    // UID Pagination
    const uidPag = document.getElementById('uidPagination');
    if (uidPag) {
      let html = `<button class="page-btn" data-uid-pg="${uidTable.page - 1}" ${uidTable.page === 1 ? "disabled" : ""}>‹</button>`;
      for (let i = 1; i <= pages; i++) {
        html += `<button class="page-btn ${i === uidTable.page ? "is-active" : ""}" data-uid-pg="${i}">${i}</button>`;
      }
      html += `<button class="page-btn" data-uid-pg="${uidTable.page + 1}" ${uidTable.page === pages ? "disabled" : ""}>›</button>`;
      uidPag.innerHTML = html;
    }
  }

  /* ── UID EVENTS ──────────────────────────────── */
  const uidSearch = $("#uidSearch");
  if (uidSearch) {
    uidSearch.addEventListener("input", e => {
      uidTable.search = e.target.value;
      uidTable.page = 1;
      renderUIDList();
    });
  }
  
  const uidStatusFilter = $("#uidStatusFilter");
  if (uidStatusFilter) {
    uidStatusFilter.addEventListener("change", e => {
      uidTable.status = e.target.value;
      uidTable.page = 1;
      renderUIDList();
    });
  }
  
  document.addEventListener("click", (e) => {
    const uidPagBtn = e.target.closest("[data-uid-pg]");
    if (uidPagBtn && !uidPagBtn.disabled) {
      uidTable.page = +uidPagBtn.dataset.uidPg;
      renderUIDList();
      return;
    }
    
    // Xoá UID từ danh sách
    const removeUIDBtn = e.target.closest("[data-remove-uid]");
    if (removeUIDBtn) {
      const uid = removeUIDBtn.dataset.removeUid;
      const keyId = removeUIDBtn.dataset.keyId;
      if (!confirm(`Xoá UID "${uid}" khỏi key?`)) return;
      
      const key = keys[keyId];
      if (!key) return;
      
      const newDevices = { ...key.devices };
      delete newDevices[uid];
      
      KeyAPI.updateKey(keyId, { devices: newDevices }).then(() => {
        keys[keyId].devices = newDevices;
        renderAll();
        toast('success', 'Đã xoá UID', `UID ${uid} đã được xoá khỏi key.`);
      }).catch(err => toast('danger', 'Lỗi', err.message));
      return;
    }
  });

  /* ── MODAL: XEM THIẾT BỊ ───────────────────── */
  function showDevicesModal(keyId) {
    const key = keys[keyId];
    if (!key) {
      toast("danger", "Lỗi", "Không tìm thấy key");
      return;
    }
    const devices = key.devices || {};
    const deviceList = Object.entries(devices);
    const currentCount = deviceList.length;
    const maxDevices = key.maxDevices || 1;
    const isFull = currentCount >= maxDevices;
    const latestUID = getLatestUID(devices);
    
    const modal = document.createElement('div');
    modal.className = 'modal is-open';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal__backdrop" data-close-modal></div>
      <div class="modal__panel" style="max-width:550px">
        <header class="modal__head">
          <div>
            <h2>📱 Thiết bị của key</h2>
            <p><code>${esc(key.key || keyId)}</code></p>
          </div>
          <button class="icon-btn" data-close-modal aria-label="Đóng">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </header>
        <div class="modal__body">
          <div style="margin-bottom:12px;display:flex;justify-content:space-between;font-size:13px;color:var(--text-2)">
            <span>${currentCount} / ${maxDevices} thiết bị ${isFull ? '🔴 (Đã đầy)' : '🟢 (Còn trống)'}</span>
            <button class="btn btn--sm btn--ghost" id="addDeviceBtn" ${isFull ? 'disabled style="opacity:0.5;cursor:not-allowed"' : ''}>
              ${isFull ? '⚠️ Đã đầy' : '+ Thêm UID'}
            </button>
          </div>
          
          ${latestUID ? `
            <div style="background:var(--bg-2);padding:10px 14px;border-radius:8px;margin-bottom:12px;border-left:3px solid var(--cyan)">
              <span style="font-size:12px;color:var(--text-3)">🆕 UID mới nhất</span>
              <div style="font-family:monospace;font-size:14px;font-weight:600;color:var(--text-1);word-break:break-all">${esc(latestUID)}</div>
              <span style="font-size:11px;color:var(--text-3)">Thiết bị đang hoạt động</span>
            </div>
          ` : `<div style="background:var(--bg-2);padding:10px 14px;border-radius:8px;margin-bottom:12px;border-left:3px solid var(--amber)"><span style="font-size:13px;color:var(--text-3)">⚠️ Chưa có thiết bị nào</span></div>`}
          
          ${deviceList.length ? `
            <ul style="list-style:none;padding:0;margin:0">
              ${deviceList.map(([uid, active], index) => `
                <li style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);font-family:monospace;font-size:13px;${uid === latestUID ? 'background:var(--bg-2);border-radius:4px;' : ''}">
                  <span style="display:flex;align-items:center;gap:6px">
                    ${uid === latestUID ? '⭐' : ''}
                    ${esc(uid)}
                  </span>
                  <span>
                    <span class="status-badge status-badge--${active ? 'completed' : 'pending'}" style="font-size:11px">
                      <i></i>${active ? '✅ Đang dùng' : '❌ Chưa dùng'}
                    </span>
                    <button class="dg-action dg-action--danger" data-remove-device="${esc(uid)}" title="Xoá UID" style="margin-left:8px">
                      <svg viewBox="0 0 24 24" width="14" height="14"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6.5 7l1 13h9l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                  </span>
                </li>
              `).join('')}
            </ul>
          ` : `<p style="text-align:center;color:var(--text-3);padding:20px">Chưa có thiết bị nào</p>`}
        </div>
        <footer class="modal__foot">
          <button type="button" class="btn btn--ghost" data-close-modal>Đóng</button>
        </footer>
      </div>
    `;
    document.body.appendChild(modal);

    // Add device
    modal.querySelector('#addDeviceBtn')?.addEventListener('click', () => {
      if (isFull) {
        toast('warning', 'Đã đầy', `Key chỉ hỗ trợ tối đa ${maxDevices} thiết bị.`);
        return;
      }
      const uid = prompt('Nhập UID thiết bị mới:');
      if (uid && uid.trim()) {
        if (key.devices && key.devices[uid.trim()]) {
          toast('warning', 'UID đã tồn tại', `UID ${uid.trim()} đã được thêm trước đó.`);
          return;
        }
        const newDevices = { ...key.devices };
        newDevices[uid.trim()] = true;
        KeyAPI.updateKey(keyId, { devices: newDevices }).then(() => {
          keys[keyId].devices = newDevices;
          renderAll();
          modal.remove();
          const remaining = maxDevices - currentCount - 1;
          toast('success', 'Đã thêm UID', `UID ${uid.trim()} đã được thêm. Còn ${remaining} thiết bị trống.`);
          showDevicesModal(keyId);
        }).catch(err => toast('danger', 'Lỗi', err.message));
      }
    });

    // Remove device
    modal.querySelectorAll('[data-remove-device]').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid = btn.dataset.removeDevice;
        if (!confirm(`Xoá UID "${uid}"?`)) return;
        const newDevices = { ...key.devices };
        delete newDevices[uid];
        KeyAPI.updateKey(keyId, { devices: newDevices }).then(() => {
          keys[keyId].devices = newDevices;
          renderAll();
          modal.remove();
          toast('success', 'Đã xoá UID', `UID ${uid} đã được xoá.`);
          showDevicesModal(keyId);
        }).catch(err => toast('danger', 'Lỗi', err.message));
      });
    });

    // Close modal
    modal.querySelectorAll('[data-close-modal]').forEach(el => {
      el.addEventListener('click', () => modal.remove());
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  // Delegated events
  document.addEventListener("click", async (e) => {
    const copyEl = e.target.closest("[data-copy]");
    if (copyEl) {
      if (await copyText(copyEl.dataset.copy)) toast("success", "Đã sao chép", copyEl.dataset.copy);
      return;
    }

    const viewDevicesEl = e.target.closest("[data-view-devices]");
    if (viewDevicesEl) {
      const id = viewDevicesEl.dataset.viewDevices;
      showDevicesModal(id);
      return;
    }

    const banEl = e.target.closest("[data-ban]");
    if (banEl) {
      const id = banEl.dataset.ban;
      const rec = keys[id];
      if (!rec) return;
      const newStatus = rec.status === "banned" ? "active" : "banned";
      try {
        await KeyAPI.updateKey(id, { status: newStatus });
        rec.status = newStatus;
        renderAll();
        toast(newStatus === "banned" ? "warning" : "success", newStatus === "banned" ? "Đã khoá key" : "Đã mở khoá", rec.key || id);
      } catch (err) { toast("danger", "Lỗi", err.message); }
      return;
    }

    const delEl = e.target.closest("[data-del]");
    if (delEl) {
      const id = delEl.dataset.del;
      if (!keys[id]) return;
      const keyDisplay = keys[id]?.key || id;
      if (!confirm(`Xoá key "${keyDisplay}"?`)) return;
      try {
        await KeyAPI.deleteKey(id);
        delete keys[id];
        renderAll();
        toast("success", "Đã xoá key", "Key đã bị xoá khỏi hệ thống.");
      } catch (err) { toast("danger", "Lỗi", err.message); }
      return;
    }

    const delPkgEl = e.target.closest("[data-del-pkg]");
    if (delPkgEl) {
      const id = delPkgEl.dataset.delPkg;
      if (!packages[id]) return;
      if (!confirm(`Xoá gói "${packages[id]?.name}"? (Key thuộc gói này vẫn giữ nguyên)`)) return;
      try {
        await KeyAPI.deletePackage(id);
        delete packages[id];
        renderAll();
        toast("success", "Đã xoá gói", "Gói đã bị xoá.");
      } catch (err) { toast("danger", "Lỗi", err.message); }
      return;
    }

    const createFor = e.target.closest("[data-create-for]");
    if (createFor) {
      openModal("#keyModal");
      const fp = $("#fPackage");
      if (fp) fp.value = createFor.dataset.createFor;
    }
  });

  /* ── MODALS ────────────────────────────────── */
  function openModal(sel) {
    const m = $(sel);
    if (!m) return;
    m.hidden = false;
    requestAnimationFrame(() => m.classList.add("is-open"));
  }
  
  function closeModal(m) {
    if (!m) return;
    m.classList.add("is-closing");
    m.classList.remove("is-open");
    setTimeout(() => { m.classList.remove("is-closing"); m.hidden = true; }, 260);
  }
  
  $$(".modal").forEach(m => m.addEventListener("click", e => {
    if (e.target.closest("[data-close-modal]")) closeModal(m);
  }));
  
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") $$(".modal:not([hidden])").forEach(closeModal);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      gotoPage("keys");
      const search = $("#tableSearch");
      if (search) search.focus();
    }
  });

  // Create key buttons
  ["#topCreateKeyBtn", "#dashCreateKeyBtn", "#keysCreateBtn"].forEach(sel => {
    const btn = $(sel);
    if (btn) {
      btn.addEventListener("click", () => {
        if (!Object.keys(packages).length) {
          toast("warning", "Chưa có gói", "Hãy tạo gói trước khi tạo key.");
          gotoPage("packages");
          openModal("#pkgModal");
          return;
        }
        openModal("#keyModal");
      });
    }
  });

  // Add global UID button
  const addGlobalUIDBtn = $("#addGlobalUIDBtn");
  if (addGlobalUIDBtn) {
    addGlobalUIDBtn.addEventListener("click", () => {
      const uid = prompt('Nhập UID mới:');
      if (!uid || !uid.trim()) return;
      
      // Tìm key đầu tiên có thể thêm UID
      let targetKeyId = null;
      for (const [id, key] of Object.entries(keys)) {
        const deviceCount = Object.keys(key.devices || {}).length;
        const maxDevices = key.maxDevices || 1;
        if (deviceCount < maxDevices && keyStatus(key) === "active") {
          targetKeyId = id;
          break;
        }
      }
      
      if (!targetKeyId) {
        toast('warning', 'Không có key trống', 'Tất cả key đã đầy hoặc không hoạt động. Hãy tạo key mới.');
        return;
      }
      
      const key = keys[targetKeyId];
      if (key.devices && key.devices[uid.trim()]) {
        toast('warning', 'UID đã tồn tại', `UID ${uid.trim()} đã tồn tại trong key.`);
        return;
      }
      
      const newDevices = { ...key.devices };
      newDevices[uid.trim()] = true;
      
      KeyAPI.updateKey(targetKeyId, { devices: newDevices }).then(() => {
        keys[targetKeyId].devices = newDevices;
        renderAll();
        toast('success', 'Đã thêm UID', `UID ${uid.trim()} đã được thêm vào key ${key.key}`);
        gotoPage('uid');
      }).catch(err => toast('danger', 'Lỗi', err.message));
    });
  }
  
  const createPkgBtn = $("#createPkgBtn");
  if (createPkgBtn) createPkgBtn.addEventListener("click", () => openModal("#pkgModal"));
  
  const searchTrigger = $("#searchTrigger");
  if (searchTrigger) {
    searchTrigger.addEventListener("click", () => { 
      gotoPage("keys"); 
      const s = $("#tableSearch"); 
      if (s) s.focus(); 
    });
  }

  /* ── FORM: TẠO KEY ─────────────────────────── */
  const keyForm = $("#keyForm");
  if (keyForm) {
    keyForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const qty = Math.min(100, Math.max(1, +$("#fQuantity").value || 1));
      const pkgId = $("#fPackage").value;
      if (!pkgId) { toast("warning", "Thiếu gói", "Vui lòng chọn gói cho key."); return; }
      const pkg = packages[pkgId];
      const customDur = $("#fDuration").value;
      const inputMaxDevices = $("#fMaxDevices").value;
      const maxDevices = inputMaxDevices !== "" ? +inputMaxDevices : (pkg?.maxDevices || 1);
      const durationDays = customDur !== "" ? +customDur : (pkg?.durationDays || (pkg?.duration ? Math.floor(pkg.duration / 86400000) : 0));
      const note = $("#fNote").value.trim();
      const prefix = $("#fPrefix").value.trim() || "KEY";

      const btn = $("#keySubmit");
      if (!btn) return;
      btn.classList.add("is-loading");
      btn.disabled = true;
      try {
        const created = [];
        for (let i = 0; i < qty; i++) {
          const keyValue = genKey(prefix);
          const record = {
            key: keyValue,
            packageId: pkgId,
            createdAt: now(),
            expiresAt: durationDays > 0 ? now() + durationDays * 864e5 : null,
            status: "active",
            note: note || null,
            maxDevices: maxDevices,
            devices: {},
          };
          await KeyAPI.createKey(record);
          keys[keyValue] = record;
          created.push(keyValue);
        }
        lastCreatedKeys = created;
        renderAll();
        closeModal($("#keyModal"));
        const resultList = $("#keyResultList");
        if (resultList) {
          resultList.innerHTML = created.map(k =>
            `<code class="key-code key-code--lg" data-copy="${esc(k)}" title="Nhấn để sao chép">${esc(k)}</code>`
          ).join("");
        }
        openModal("#resultModal");
        toast("success", "Tạo key thành công", `Đã tạo ${created.length} key mới với giới hạn ${maxDevices} thiết bị.`);
      } catch (err) {
        toast("danger", "Lỗi tạo key", err.message);
      } finally {
        btn.classList.remove("is-loading");
        btn.disabled = false;
      }
    });
  }

  const copyAllBtn = $("#copyAllKeysBtn");
  if (copyAllBtn) {
    copyAllBtn.addEventListener("click", async () => {
      if (await copyText(lastCreatedKeys.join("\n")))
        toast("success", "Đã sao chép", `${lastCreatedKeys.length} key vào clipboard.`);
    });
  }

  /* ── FORM: TẠO GÓI ─────────────────────────── */
  const pkgForm = $("#pkgForm");
  if (pkgForm) {
    pkgForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("#pName").value.trim();
      const dur = $("#pDuration").value;
      const maxDevices = +$("#pMaxDevices")?.value || 1;
      let ok = true;
      const pNameField = $("#pName")?.closest(".float-field");
      if (pNameField) pNameField.classList.toggle("has-error", !name);
      if (!name) ok = false;
      const pDurField = $("#pDuration")?.closest(".float-field");
      if (pDurField) pDurField.classList.toggle("has-error", dur === "");
      if (dur === "") ok = false;
      if (!ok) return;

      const btn = $("#pkgSubmit");
      if (!btn) return;
      btn.classList.add("is-loading");
      btn.disabled = true;
      try {
        const record = {
          name,
          durationDays: +dur,
          maxDevices: maxDevices,
          price: +$("#pPrice").value || 0,
          note: $("#pNote").value.trim() || null,
          createdAt: now(),
          status: "active",
        };
        const res = await KeyAPI.createPackage(record);
        const pkgId = res.name;
        packages[pkgId] = record;
        renderAll();
        closeModal($("#pkgModal"));
        pkgForm.reset();
        toast("success", "Tạo gói thành công", `Gói "${name}" đã được thêm với giới hạn ${maxDevices} thiết bị.`);
      } catch (err) {
        toast("danger", "Lỗi tạo gói", err.message);
      } finally {
        btn.classList.remove("is-loading");
        btn.disabled = false;
      }
    });
  }

  /* ── CHECK KEY ─────────────────────────────── */
  const checkForm = $("#checkForm");
  if (checkForm) {
    checkForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const val = $("#checkInput").value.trim();
      const result = $("#checkResult");
      if (!val) { toast("warning", "Chưa nhập key", "Vui lòng nhập key cần kiểm tra."); return; }
      const btn = $("#checkSubmit");
      if (btn) { btn.classList.add("is-loading"); btn.disabled = true; }
      if (result) result.hidden = true;
      try {
        const rec = await KeyAPI.getKey(val);
        if (!rec || !rec.key) {
          if (result) {
            result.innerHTML = `
              <div class="check-card check-card--invalid">
                <div class="check-card__icon">✕</div>
                <h3>Key không tồn tại</h3>
                <p><code>${esc(val)}</code> không có trong hệ thống.</p>
              </div>`;
            result.hidden = false;
          }
        } else {
          const st = keyStatus(rec);
          const deviceCount = Object.keys(rec.devices || {}).length;
          const latestUID = getLatestUID(rec.devices);
          const map = {
            active: { cls: "valid", icon: "✅", label: "Key hợp lệ — Còn hạn" },
            expired: { cls: "expired", icon: "⏱", label: "Key đã hết hạn" },
            banned: { cls: "invalid", icon: "🔒", label: "Key đã bị khoá" },
          };
          const m = map[st] || map.expired;
          if (result) {
            result.innerHTML = `
              <div class="check-card check-card--${m.cls}">
                <div class="check-card__icon">${m.icon}</div>
                <h3>${m.label}</h3>
                <ul class="check-card__meta">
                  <li><span>Key</span><b><code>${esc(rec.key)}</code></b></li>
                  <li><span>Gói</span><b>${esc(pkgName(rec.packageId || rec.package))}</b></li>
                  <li><span>Ngày tạo</span><b>${fmtDate(rec.createdAt)}</b></li>
                  <li><span>Hết hạn</span><b>${rec.expiresAt ? fmtDate(rec.expiresAt) : "Vĩnh viễn"}</b></li>
                  <li><span>Thời gian còn lại</span><b>${timeLeft(rec)}</b></li>
                  <li><span>Thiết bị</span><b>${deviceCount} / ${rec.maxDevices || 1}</b></li>
                  <li><span>UID mới nhất</span><b style="font-family:monospace;font-size:12px">${latestUID ? esc(latestUID) : 'Chưa có'}</b></li>
                  ${rec.note ? `<li><span>Ghi chú</span><b>${esc(rec.note)}</b></li>` : ""}
                </ul>
              </div>`;
            result.hidden = false;
          }
        }
      } catch (err) {
        toast("danger", "Lỗi kiểm tra", err.message);
      } finally {
        if (btn) { btn.classList.remove("is-loading"); btn.disabled = false; }
      }
    });
  }

  /* ── SHELL: theme / clock / sidebar ── */
  const THEME_KEY = "nebula-theme";
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  
  const themeToggle = $("#themeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem(THEME_KEY, next);
    });
  }

  function tickClock() {
    const d = new Date();
    const time = $("#clockTime");
    if (time) time.textContent = d.toLocaleTimeString("vi-VN", { hour12: false });
    const date = $("#clockDate");
    if (date) date.textContent = d.toLocaleDateString("vi-VN", { weekday: "short", day: "numeric", month: "numeric" });
  }
  tickClock();
  setInterval(tickClock, 1000);
  
  const todayLabel = $("#todayLabel");
  if (todayLabel) todayLabel.textContent = new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const collapseBtn = $("#sidebarCollapse");
  if (collapseBtn) collapseBtn.addEventListener("click", () => $("#sidebar")?.classList.toggle("is-collapsed"));
  
  const menuBtn = $("#mobileMenuBtn");
  if (menuBtn) {
    menuBtn.addEventListener("click", () => {
      $("#sidebar")?.classList.toggle("is-open");
      document.body.classList.toggle("sidebar-open");
    });
  }
  
  document.addEventListener("click", e => {
    if (document.body.classList.contains("sidebar-open") && !e.target.closest("#sidebar") && !e.target.closest("#mobileMenuBtn")) {
      $("#sidebar")?.classList.remove("is-open");
      document.body.classList.remove("sidebar-open");
    }
  });

  const refreshBtn = $("#refreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", () => loadAll(true));

  // Delete expired
  const deleteExpiredBtn = $("#deleteExpiredBtn");
  if (deleteExpiredBtn) {
    deleteExpiredBtn.addEventListener("click", async () => {
      const expired = Object.entries(keys).filter(([, k]) => keyStatus(k) === "expired");
      if (!expired.length) { toast("info", "Không có key hết hạn", "Tất cả key đều còn hạn."); return; }
      if (!confirm(`Xoá ${expired.length} key hết hạn?`)) return;
      try {
        await Promise.all(expired.map(([id]) => KeyAPI.deleteKey(id)));
        expired.forEach(([id]) => delete keys[id]);
        renderAll();
        toast("success", "Đã dọn dẹp", `Đã xoá ${expired.length} key hết hạn.`);
      } catch (err) { toast("danger", "Lỗi", err.message); }
    });
  }

  // Export
  const exportBtn = $("#exportBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const list = Object.values(keys);
      if (!list.length) { toast("info", "Không có dữ liệu", "Chưa có key nào để xuất."); return; }
      const lines = ["Key,Gói,Ngày tạo,Hết hạn,Trạng thái,Thiết bị,UID mới nhất"];
      list.forEach(k => lines.push(
        `${k.key},${pkgName(k.packageId || k.package)},${fmtDate(k.createdAt)},${k.expiresAt ? fmtDate(k.expiresAt) : "Vĩnh viễn"},${keyStatus(k)},${Object.keys(k.devices || {}).length}/${k.maxDevices || 1},${getLatestUID(k.devices) || ""}`
      ));
      const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `keys-${new Date().toISOString().slice(0, 10)}.csv` });
      a.click();
      URL.revokeObjectURL(a.href);
      toast("success", "Đã xuất file", `${list.length} key → CSV`);
    });
  }

  /* ── PARTICLES ──────────────────────────────── */
  (function particles() {
    const canvas = $("#particles");
    if (!canvas || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    let w, h, pts = [];
    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      pts = Array.from({ length: Math.min(60, w / 24) }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - .5) * .3, vy: (Math.random() - .5) * .3,
        r: Math.random() * 1.6 + .4, a: Math.random() * .4 + .1,
      }));
    }
    resize();
    window.addEventListener("resize", resize);
    (function draw() {
      ctx.clearRect(0, 0, w, h);
      pts.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 7);
        ctx.fillStyle = `rgba(160,180,255,${p.a})`;
        ctx.fill();
      });
      requestAnimationFrame(draw);
    })();
  })();

  /* ── CURSOR GLOW ────────────────────────────── */
  const glow = $(".cursor-glow");
  if (glow && matchMedia("(pointer:fine)").matches) {
    document.addEventListener("mousemove", e => {
      glow.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    }, { passive: true });
  }

  // Ripple
  document.addEventListener("pointerdown", e => {
    const btn = e.target.closest(".btn");
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const r = document.createElement("span");
    r.className = "ripple";
    const size = Math.max(rect.width, rect.height) * 2;
    r.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`;
    btn.appendChild(r);
    setTimeout(() => r.remove(), 650);
  });

  /* ── INIT ──────────────────────────────────── */
  loadAll();
  setInterval(() => { renderStats(); renderTable(); renderUIDList(); }, 60000);
})();
