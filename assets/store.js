/* SIPAJAGA store: memuat dan memvalidasi data jadwal dari data/jadwal.json. */
(function () {
  "use strict";

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
  const DEFAULT_ZONE = "Asia/Makassar";

  let data = null;
  let loadPromise = null;
  const listeners = new Set();

  const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
  const pad = n => String(n).padStart(2, "0");
  const toNum = s => {
    const [y, m, d] = String(s).split("-").map(Number);
    return Date.UTC(y, m - 1, d) / 864e5;
  };
  const toISO = d => new Date(d * 864e5).toISOString().slice(0, 10);
  const fmt = (d, o) => new Intl.DateTimeFormat("id-ID", Object.assign({ timeZone: "UTC" }, o)).format(new Date(d * 864e5));
  const dow = d => (d + 4) % 7; // 0 = Minggu
  const mondayOf = d => d - ((dow(d) + 6) % 7);
  const mins = t => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
  const tt = t => String(t).replace(":", ".");
  const clone = v => JSON.parse(JSON.stringify(v));

  function localDate(zone) {
    const z = zone || (data && data.zonaWaktu) || DEFAULT_ZONE;
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: z, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23"
      }).formatToParts(new Date());
      const v = {};
      parts.forEach(p => { v[p.type] = p.value; });
      return { day: toNum(v.year + "-" + v.month + "-" + v.day), min: +v.hour * 60 + +v.minute };
    } catch (_) {
      const n = new Date();
      return { day: toNum(n.getFullYear() + "-" + pad(n.getMonth() + 1) + "-" + pad(n.getDate())), min: n.getHours() * 60 + n.getMinutes() };
    }
  }
  function todayISO(zone) { return toISO(localDate(zone).day); }

  function normalize(j) {
    const out = clone(j);
    out.instansi = out.instansi || "BPS Kota Palopo";
    out.aplikasi = out.aplikasi || "SIPAJAGA";
    out.zonaWaktu = out.zonaWaktu || DEFAULT_ZONE;
    out.diperbarui = out.diperbarui || out.mulaiRotasi;
    out.catatan = out.catatan || "";
    out.tugas = out.tugas || {};
    out.libur = out.libur || [];
    out.pengecualian = out.pengecualian || [];
    return out;
  }

  function validate(j) {
    if (!isObj(j)) throw new Error("Data jadwal harus berupa objek JSON.");
    if (!DATE_RE.test(j.mulaiRotasi || "")) throw new Error("mulaiRotasi harus berformat YYYY-MM-DD.");
    if (new Date(toNum(j.mulaiRotasi) * 864e5).getUTCDay() !== 1) throw new Error("mulaiRotasi harus hari Senin.");
    if (j.diperbarui && !DATE_RE.test(j.diperbarui)) throw new Error("diperbarui harus berformat YYYY-MM-DD.");
    if (!j.zonaWaktu || typeof j.zonaWaktu !== "string") throw new Error("zonaWaktu wajib diisi.");
    if (!isObj(j.tugas) || !Object.keys(j.tugas).length) throw new Error("Daftar tugas (tugas) kosong.");
    if (!Array.isArray(j.rotasi) || !j.rotasi.length) throw new Error("Rotasi kosong.");
    j.rotasi.forEach((r, i) => {
      if (!isObj(r)) throw new Error("Rotasi ke-" + (i + 1) + " tidak valid.");
      ["A", "B", "C"].forEach(k => {
        if (typeof r[k] !== "string" || !r[k].trim()) throw new Error("Rotasi ke-" + (i + 1) + ": petugas " + k + " wajib diisi.");
      });
    });
    if (!Array.isArray(j.hari) || !j.hari.length) throw new Error("Pola hari (hari) kosong.");
    j.hari.forEach((g, i) => {
      if (!isObj(g) || !Array.isArray(g.nama) || !g.nama.length) throw new Error("Hari ke-" + (i + 1) + ": nama hari wajib diisi.");
      if (!Array.isArray(g.slot) || !g.slot.length) throw new Error("Hari ke-" + (i + 1) + ": minimal satu slot jaga.");
      g.slot.forEach((s, k) => {
        if (!isObj(s) || !TIME_RE.test(s.mulai || "") || !TIME_RE.test(s.selesai || "")) {
          throw new Error("Hari ke-" + (i + 1) + ", slot ke-" + (k + 1) + ": jam tidak valid.");
        }
        if (!Object.prototype.hasOwnProperty.call(j.tugas, s.tugas)) {
          throw new Error("Hari ke-" + (i + 1) + ", slot ke-" + (k + 1) + ": jenis tugas tidak dikenal.");
        }
      });
    });
    (j.libur || []).forEach((l, i) => {
      if (!isObj(l) || !DATE_RE.test(l.tanggal || "")) throw new Error("Libur ke-" + (i + 1) + ": tanggal tidak valid.");
    });
    (j.pengecualian || []).forEach((e, i) => {
      if (!isObj(e) || !DATE_RE.test(e.tanggal || "")) throw new Error("Pengecualian ke-" + (i + 1) + ": tanggal tidak valid.");
      if (!Object.prototype.hasOwnProperty.call(j.tugas, e.tugas)) throw new Error("Pengecualian ke-" + (i + 1) + ": jenis tugas tidak dikenal.");
      if (typeof e.petugas !== "string" || !e.petugas.trim()) throw new Error("Pengecualian ke-" + (i + 1) + ": petugas pengganti wajib diisi.");
      if (e.mulai && !TIME_RE.test(e.mulai)) throw new Error("Pengecualian ke-" + (i + 1) + ": jam mulai tidak valid.");
    });
    return true;
  }

  function emit() { listeners.forEach(fn => { try { fn(data); } catch (e) { console.error("SIPAJAGA listener:", e); } }); }

  function load() {
    if (loadPromise) return loadPromise;
    loadPromise = fetch("data/jadwal.json", { cache: "no-cache" })
      .then(res => { if (!res.ok) throw new Error("Gagal memuat jadwal (HTTP " + res.status + ")"); return res.json(); })
      .then(raw => {
        const parsed = normalize(raw);
        validate(parsed);
        data = parsed; emit(); return data;
      })
      .catch(e => { loadPromise = null; throw e; });
    return loadPromise;
  }
  function reload() { loadPromise = null; data = null; return load(); }

  window.SIPAJAGA_STORE = {
    load, reload, validate, normalize,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    getData: () => data,
    toJSON: () => data ? JSON.stringify(data, null, 2) : "",
    helpers: { pad, toNum, toISO, fmt, dow, mondayOf, mins, tt, clone, localDate, todayISO }
  };
})();
