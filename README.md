# SIPAJAGA — BPS Kota Palopo

Aplikasi jadwal petugas jaga yang dapat **di-install seperti APK** (PWA), jalan **offline**, dan punya **logo web** sendiri. Tetap statis, jadi bisa di-hosting gratis di GitHub Pages tanpa server dan tanpa database.

> Mode admin/login sengaja **tidak disertakan**. Perubahan jadwal dilakukan langsung pada file `data/jadwal.json` di GitHub.

## Fitur

- **Tampilan aplikasi**: header sticky, navigasi bawah ala aplikasi, tema terang/gelap, kartu "Sedang bertugas" + "Berikutnya", hitung mundur, dan tabel responsif.
- **Installable (PWA)**: tombol *Install aplikasi*, splash screen, ikon adaptif Android & Apple, shortcut, dan berjalan dalam mode standalone.
- **Offline**: service worker menyimpan halaman, CSS, JS, ikon, dan data jadwal. Jika internet mati, jadwal terakhir tetap dibuka.
- **Notifikasi jaga**: pengingat 10 menit sebelum jaga dan 5 menit sebelum selesai (aktif saat aplikasi terbuka; izin browser diperlukan).
- **Aksesibilitas & cetak**: skip link, fokus terlihat, ARIA pada tab, dan stylesheet khusus cetak.

## Deploy ke GitHub Pages

1. Buat repository baru di GitHub, lalu unggah **semua isi folder ini** (termasuk `.nojekyll`, `manifest.webmanifest`, dan `sw.js`).
2. Buka **Settings → Pages**. Pilih **Deploy from a branch**, branch `main`, folder **/(root)**, lalu **Save**.
3. Tunggu 1–2 menit. Alamat situs: `https://NAMA-AKUN.github.io/NAMA-REPO/`.
4. Pasang alamat tersebut sebagai tautan di website resmi bpspalopo.

> Service worker memerlukan `https://` (GitHub Pages sudah HTTPS). Saat uji di komputer, gunakan `localhost`, bukan klik dua kali pada `index.html`.

## Uji di komputer

```bash
npm start
# atau
node tools/serve.js 8080
```

Lalu buka `http://localhost:8080`. Alternatif: ekstensi **Live Server** di VS Code atau `npx serve`.

## Mengubah jadwal

Semua data ada di `data/jadwal.json`. Edit langsung di GitHub (ikon pensil), lalu **Commit changes**. Situs ikut berubah dalam beberapa menit.

- `mulaiRotasi`: tanggal Senin pertama Shift 1 (format `YYYY-MM-DD`, wajib hari Senin). **Konfirmasi tanggal resmi sebelum publikasi.**
- `diperbarui`: isi dengan tanggal terakhir Anda mengubah data.
- `rotasi`: siapa mengisi tugas A, B, C pada Shift 1, 2, 3. Cukup ditulis sekali.
- `hari`: pola jam tugas per hari. `"24:00"` sampai `"07:00"` berarti dini hari berikutnya.
- `libur`: tampilkan banner hari libur.
  `{ "tanggal": "2026-12-25", "keterangan": "Hari Raya Natal" }`
- `pengecualian`: tukar jaga, cuti, atau pengganti pada tanggal tertentu.
  `{ "tanggal": "2026-12-02", "tugas": "A", "petugas": "Fauzan", "alasan": "Menggantikan Bahrum (cuti)" }`
  Tambahkan `"mulai": "18:00"` bila hanya satu sesi yang diganti.

Pisahkan setiap item dengan koma dan perhatikan tanda kurung/kutip. GitHub menandai JSON yang salah sebelum Anda menyimpan.

## Logo & ikon

- Logo utama: `assets/logo.svg` (vektor, dipakai di header, favicon, dan shortcut).
- Favicon: `favicon.svg`.
- Ikon PWA: `assets/icons/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, dan `maskable-icon-512.png`.

Ikon PNG dibuat otomatis dari desain yang sama tanpa dependensi:

```bash
node tools/make-icons.js
```

## Struktur folder

```
index.html              Halaman utama
manifest.webmanifest    Metadata PWA (nama, warna, ikon, shortcut)
sw.js                   Service worker (offline + update)
favicon.svg             Favicon
assets/
  logo.svg              Logo web vektor
  store.js              Validasi & pemuatan data jadwal
  app.js                Tampilan, PWA, tema, notifikasi
  style.css             Seluruh gaya (terang/gelap/cetak)
  icons/                Ikon PNG untuk PWA
data/jadwal.json        Data jadwal
tools/
  serve.js              Server lokal untuk uji
  make-icons.js         Generator ikon PNG
```

## Menyematkan di website lain

Cukup beri tautan. Jika ingin tampil di dalam halaman:

```html
<iframe src="https://NAMA-AKUN.github.io/NAMA-REPO/" style="width:100%;height:900px;border:0" title="Jadwal petugas jaga"></iframe>
```

## Pemecahan masalah

- **Tombol Install tidak muncul**: pada iPhone/iPad buka *Bagikan → Add to Home Screen*; di Chrome/Edge tombol muncul setelah PWA memenuhi syarat (HTTPS + kunjungan berulang).
- **Jadwal tidak berubah setelah commit GitHub**: tunggu beberapa menit, lalu muat ulang dua kali (service worker memperbarui cache).
- **Notifikasi tidak muncul**: izinkan notifikasi di browser dan biarkan halaman aplikasi tetap terbuka. Untuk notifikasi saat aplikasi tertutup diperlukan server push.
