/* SIPAJAGA UI: tampilan jadwal, PWA, tema, notifikasi, dan pembaruan. */
(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  const store = window.SIPAJAGA_STORE;
  const H = store.helpers;
  const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const NOTIF_KEY = "sipajaga.notif.v1";
  const THEME_KEY = "sipajaga.theme.v1";

  let D = null, view = 0, selDay = 0, lastDay = null;
  let deferredPrompt = null, newWorker = null, notifOn = false, lastNotifMinute = -1;
  const sent = new Set();

  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = H.pad, toNum = H.toNum, toISO = H.toISO, fmt = H.fmt, dow = H.dow, mondayOf = H.mondayOf, mins = H.mins, tt = H.tt;

  function zoneLabel(z) {
    return z === "Asia/Makassar" ? "WITA" : z === "Asia/Jakarta" ? "WIB" : z === "Asia/Jayapura" ? "WIT" : z === "UTC" ? "UTC" : z;
  }
  function initials(name) {
    return String(name || "-").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase();
  }
  function duration(m) {
    m = Math.max(0, m);
    const h = Math.floor(m / 60), x = m % 60;
    return (h ? h + " jam " : "") + (x ? x + " menit" : h ? "lebih" : "beberapa saat");
  }
  function greeting(min) {
    return min < 11 * 60 ? "Selamat pagi" : min < 15 * 60 ? "Selamat siang" : min < 18 * 60 ? "Selamat sore" : "Selamat malam";
  }

  function weekInfo(d) {
    const w = Math.floor((mondayOf(d) - toNum(D.mulaiRotasi)) / 7);
    if (w < 0) return { before: true };
    const n = D.rotasi.length;
    return { before: false, week: w + 1, shift: ((w % n) + n) % n };
  }
  function who(d, s) {
    const iso = toISO(d);
    const ex = D.pengecualian.find(e => e.tanggal === iso && e.tugas === s.tugas && (!e.mulai || e.mulai === s.mulai));
    if (ex) return { nama: ex.petugas, ket: ex.alasan || "Pengganti" };
    if (s.petugas) return { nama: s.petugas };
    const wi = weekInfo(d);
    return { nama: wi.before ? "-" : (D.rotasi[wi.shift][s.tugas] || "-") };
  }
  function slotsOn(d) {
    const g = D.hari.find(x => x.nama.includes(HARI[dow(d)]));
    return ((g && g.slot) || []).map(s => {
      let a = mins(s.mulai), b = mins(s.selesai);
      if (b <= a) b += 1440;
      return Object.assign({}, s, { a: a, b: b }, who(d, s));
    });
  }

  function renderNow() {
    const n = H.localDate();
    $("#greeting").textContent = greeting(n.min);
    $("#clock").textContent = fmt(n.day, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) +
      ", pukul " + pad(Math.floor(n.min / 60)) + "." + pad(n.min % 60) + " " + zoneLabel(D.zonaWaktu);
    const box = $("#nowList");

    if (weekInfo(n.day).before) {
      box.innerHTML = '<p class="empty-now">Rotasi jaga dimulai pada ' + esc(fmt(toNum(D.mulaiRotasi), { day: "numeric", month: "long", year: "numeric" })) + '.</p>';
      $("#nextWrap").hidden = true;
      return;
    }

    const hits = [];
    [n.day - 1, n.day].forEach(d => slotsOn(d).forEach(s => {
      const a = (d - n.day) * 1440 + s.a, b = (d - n.day) * 1440 + s.b;
      if (n.min >= a && n.min < b) hits.push({ s: s, end: b % 1440, left: b - n.min });
    }));
    box.innerHTML = hits.length ? hits.map(h =>
      '<article class="duty k-' + esc(h.s.tugas) + '">' +
        '<span class="badge-initial" aria-hidden="true">' + esc(initials(h.s.nama)) + '</span>' +
        '<div class="what">' + esc(D.tugas[h.s.tugas] || h.s.tugas) + '</div>' +
        '<div class="who">' + esc(h.s.nama) + '</div>' +
        '<div class="left">Sampai pukul ' + pad(Math.floor(h.end / 60)) + "." + pad(h.end % 60) + ' · ' + duration(h.left) + ' lagi' + '</div>' +
      '</article>'
    ).join("") : '<p class="empty-now">Tidak ada petugas yang dijadwalkan pada jam ini.</p>';

    const upcoming = [];
    for (let d = n.day; d <= n.day + 1; d++) slotsOn(d).forEach(s => {
      const start = (d - n.day) * 1440 + s.a;
      if (start > n.min) upcoming.push({ s: s, day: d, start: start });
    });
    upcoming.sort((a, b) => a.start - b.start);
    const top = upcoming.slice(0, 3);
    $("#nextWrap").hidden = !top.length;
    $("#nextList").innerHTML = top.map(u => {
      const label = u.day === n.day ? "Hari ini" : u.day === n.day + 1 ? "Besok" : HARI[dow(u.day)];
      return '<div class="next-item"><strong>' + esc(D.tugas[u.s.tugas] || u.s.tugas) + ' · ' + esc(u.s.nama) + '</strong>' +
        '<span>' + label + ', ' + tt(u.s.mulai) + ' — ' + tt(u.s.selesai) + '</span></div>';
    }).join("");
  }

  function renderWeek() {
    const n = H.localDate(), mon = mondayOf(n.day) + 7 * view, wi = weekInfo(mon);
    $("#weekTitle").textContent = view === 0 ? "Minggu ini" : view === 1 ? "Minggu depan" : view === -1 ? "Minggu lalu" : "Jadwal mingguan";
    $("#weekRange").textContent = fmt(mon, { day: "numeric", month: "long" }) + " sampai " + fmt(mon + 6, { day: "numeric", month: "long", year: "numeric" });
    $("#shiftBadge").textContent = wi.before ? "Belum berlaku" : "Shift " + (wi.shift + 1);
    if (selDay < mon || selDay > mon + 6) selDay = (n.day >= mon && n.day <= mon + 6) ? n.day : mon;

    $("#tabs").innerHTML = [0, 1, 2, 3, 4, 5, 6].map(i => {
      const d = mon + i;
      return '<button class="tab' + (d === n.day ? " today" : "") + '" role="tab" type="button" data-d="' + d + '" aria-selected="' + (d === selDay) + '">' +
        '<span>' + HARI[dow(d)].slice(0, 3) + '</span><b>' + fmt(d, { day: "numeric" }) + '</b></button>';
    }).join("");
    document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => { selDay = +b.dataset.d; renderWeek(); }));

    const iso = toISO(selDay), lib = D.libur.find(l => l.tanggal === iso), hb = $("#holiday");
    const exs = D.pengecualian.filter(e => e.tanggal === iso);
    hb.hidden = !lib && !exs.length;
    if (lib || exs.length) {
      hb.textContent = (lib ? "Hari libur: " + lib.keterangan + ". " : "") +
        (exs.length ? "Perubahan jaga: " + exs.map(e => e.tugas + " → " + e.petugas).join(", ") + "." : "");
    }
    $("#dayCap").textContent = HARI[dow(selDay)] + ", " + fmt(selDay, { day: "numeric", month: "long", year: "numeric" }) + (selDay === n.day ? " (hari ini)" : "");

    const rows = wi.before ? [] : slotsOn(selDay);
    $("#rows").innerHTML = rows.length ? rows.map(s =>
      '<tr><td>' + tt(s.mulai) + ' sampai ' + tt(s.selesai) + '</td>' +
      '<td><span class="tag k-' + esc(s.tugas) + '">' + esc(D.tugas[s.tugas] || s.tugas) + '</span></td>' +
      '<td>' + esc(s.nama) + (s.ket ? '<span class="sub">Pengganti: ' + esc(s.ket) + '</span>' : '') + '</td></tr>'
    ).join("") : '<tr><td colspan="3" class="empty">' + (wi.before ? "Rotasi belum berlaku pada minggu ini." : "Tidak ada jadwal jaga pada hari ini.") + '</td></tr>';
  }

  function renderRot() {
    const mon = mondayOf(H.localDate().day);
    let h = "";
    for (let i = 0; i < D.rotasi.length; i++) {
      const m = mon + 7 * i, wi = weekInfo(m);
      if (wi.before) continue;
      const r = D.rotasi[wi.shift];
      h += '<tr class="' + (i === 0 ? "cur" : "") + '"><td>' +
        fmt(m, { day: "numeric", month: "short" }) + " sampai " + fmt(m + 6, { day: "numeric", month: "short", year: "numeric" }) +
        (i === 0 ? '<span class="sub">Minggu ini</span>' : "") + '</td>' +
        '<td>Shift ' + (wi.shift + 1) + '</td><td>' + esc(r.A) + '</td><td>' + esc(r.B) + '</td><td>' + esc(r.C) + '</td></tr>';
    }
    $("#rotBody").innerHTML = h || '<tr><td colspan="5" class="empty">Rotasi belum dimulai.</td></tr>';
  }

  function renderStatus() {
    $("#statusRow").hidden = navigator.onLine !== false;
    $("#footerBrand").textContent = D.instansi;
    $("#note").textContent = D.catatan || "";
    $("#updated").textContent = "Data diperbarui " + fmt(toNum(D.diperbarui), { day: "numeric", month: "long", year: "numeric" });
  }

  function renderAll() {
    if (!D) return;
    renderNow(); renderWeek(); renderRot(); renderStatus();
  }

  function toast(message, type) {
    const el = document.createElement("div");
    el.className = "toast " + (type || "");
    el.textContent = message;
    $("#toast").appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .25s"; setTimeout(() => el.remove(), 260); }, 3600);
  }

  /* Tema */
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').setAttribute("content", theme === "dark" ? "#081a30" : "#0f2f55");
    $("#themeBtn").setAttribute("aria-label", theme === "dark" ? "Aktifkan tema terang" : "Aktifkan tema gelap");
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) { /* abaikan */ }
  }

  /* Notifikasi lokal (saat halaman aplikasi terbuka) */
  function updateNotifBtn() {
    const btn = $("#notifBtn");
    btn.setAttribute("aria-label", notifOn ? "Matikan notifikasi jaga" : "Aktifkan notifikasi jaga");
    btn.style.color = notifOn ? "var(--amber)" : "";
    btn.title = notifOn ? "Notifikasi jaga aktif" : "Aktifkan notifikasi jaga";
  }
  async function toggleNotif() {
    if (!("Notification" in window)) { toast("Browser ini tidak mendukung notifikasi.", "err"); return; }
    if (notifOn) {
      notifOn = false; try { localStorage.setItem(NOTIF_KEY, "0"); } catch (_) {} updateNotifBtn();
      toast("Notifikasi jaga dimatikan."); return;
    }
    let perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission();
    if (perm !== "granted") { toast("Izin notifikasi ditolak browser.", "err"); return; }
    notifOn = true; try { localStorage.setItem(NOTIF_KEY, "1"); } catch (_) {} updateNotifBtn();
    toast("Notifikasi jaga aktif saat aplikasi terbuka.");
    checkNotifications();
  }
  function notify(title, body) {
    try { new Notification(title, { body: body, icon: "assets/icons/icon-192.png", tag: "sipajaga-jaga", silent: false }); } catch (_) { /* sebagian browser memerlukan service worker untuk notifikasi */ }
  }
  function checkNotifications() {
    if (!D || !notifOn || Notification.permission !== "granted") return;
    const n = H.localDate();
    if (lastNotifMinute === n.min) return;
    lastNotifMinute = n.min;
    [n.day - 1, n.day].forEach(d => slotsOn(d).forEach(s => {
      const start = (d - n.day) * 1440 + s.a, end = (d - n.day) * 1440 + s.b;
      const keyBase = toISO(d) + "|" + s.tugas + "|" + s.mulai;
      if (start - n.min > 0 && start - n.min <= 10) {
        const k = keyBase + "|start";
        if (!sent.has(k)) { sent.add(k); notify("Jaga akan segera dimulai", D.tugas[s.tugas] + " · " + s.nama + " mulai pukul " + tt(s.mulai) + "."); }
      }
      if (end - n.min > 0 && end - n.min <= 5) {
        const k = keyBase + "|end";
        if (!sent.has(k)) { sent.add(k); notify("Jaga hampir selesai", D.tugas[s.tugas] + " · " + s.nama + " berakhir pukul " + tt(s.selesai) + "."); }
      }
    }));
  }

  /* PWA */
  function initPWA() {
    const btn = $("#installBtn");
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (!standalone && ios) btn.hidden = false;

    window.addEventListener("beforeinstallprompt", e => {
      e.preventDefault(); deferredPrompt = e; btn.hidden = false;
    });
    btn.addEventListener("click", async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        deferredPrompt = null; btn.hidden = true;
        if (choice && choice.outcome === "accepted") toast("SIPAJAGA sedang dipasang...");
      } else {
        toast(ios ? "Ketuk tombol Bagikan, lalu pilih Add to Home Screen." : "Buka menu browser, lalu pilih Install app / Add to Home Screen.", "err");
      }
    });
    window.addEventListener("appinstalled", () => { btn.hidden = true; toast("SIPAJAGA berhasil dipasang."); });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").then(reg => {
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              newWorker = sw; $("#updateBanner").hidden = false;
            }
          });
        });
        reg.addEventListener("controllerchange", () => window.location.reload());
      }).catch(e => console.warn("Service worker gagal:", e));
    }
    $("#updateBtn").addEventListener("click", () => {
      if (newWorker) newWorker.postMessage({ type: "SKIP_WAITING" });
      else window.location.reload();
    });
    window.addEventListener("online", renderStatus);
    window.addEventListener("offline", renderStatus);
  }

  function bind() {
    $("#prev").onclick = () => { view--; renderWeek(); };
    $("#next").onclick = () => { view++; renderWeek(); };
    $("#today").onclick = () => { view = 0; selDay = H.localDate().day; renderWeek(); };
    $("#print").onclick = () => window.print();
    $("#themeBtn").onclick = () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    $("#notifBtn").onclick = toggleNotif;
  }

  function start() {
    let theme = "light";
    try { theme = localStorage.getItem(THEME_KEY) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); } catch (_) {}
    applyTheme(theme);
    try { notifOn = localStorage.getItem(NOTIF_KEY) === "1"; } catch (_) {}
    updateNotifBtn();
    bind();
    initPWA();

    store.subscribe(() => { D = store.getData(); renderAll(); });
    store.load().then(j => {
      D = j; selDay = H.localDate().day; lastDay = selDay;
      $("#nowList").innerHTML = "";
      renderAll();
    }).catch(e => {
      console.error("SIPAJAGA:", e);
      $("#clock").textContent = "Jadwal belum tersedia";
      $("#nowList").innerHTML = "";
      const box = $("#error"); box.hidden = false;
      box.textContent = "Jadwal tidak dapat dimuat. Periksa koneksi lalu muat ulang halaman, atau hubungi pengelola BPS Kota Palopo.";
    });

    setInterval(() => {
      if (!D) return;
      const n = H.localDate();
      if (n.day !== lastDay) { lastDay = n.day; if (view === 0) selDay = n.day; renderAll(); }
      else renderNow();
      checkNotifications();
    }, 30000);
  }

  window.SIPAJAGA_UI = { toast, renderAll, refresh: () => store.reload() };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
