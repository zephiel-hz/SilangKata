# SilangKata ✚ — Teka-Teki Silang Kolaboratif

> "Main TTS seru berdua secara real-time"

**SilangKata** adalah game Teka-Teki Silang (TTS) kolaboratif berbasis **Progressive Web App (PWA)** yang sepenuhnya **serverless**. Dibuat untuk casual gamers, pasangan, keluarga, dan teman yang ingin mengasah otak bersama tanpa hambatan registrasi atau login.

---

## 🎯 Fitur Utama

- **Mode Solo**: Mengisi teka-teki silang interaktif sendiri dengan stopwatch tanpa batas waktu dan kalkulasi skor otomatis.
- **Pilihan Jumlah Pertanyaan Fleksibel**: Pemain bebas memilih 6 kata (Kilat), 8 kata (Santai), 12 kata (Standar), 16 kata (Menantang), hingga 20 kata (Maraton).
- **Stopwatch Tanpa Tekanan Waktu**: Waktu dihitung maju dari 00:00 (stopwatch), memberi kebebasan bermain santai selama apapun tanpa takut *game over* karena waktu habis.
- **Mode Co-op 2 Pemain (WebRTC P2P)**:
  - Dua pemain saling terhubung langsung via kode room 6 karakter menggunakan **PeerJS** tanpa database atau WebSocket server.
  - **Asymmetric Clues**: Host bertugas mengisi kata **Mendatar (Across)**, sedangkan Guest bertugas mengisi kata **Menurun (Down)**.
  - Setiap pemain hanya melihat petunjuk miliknya sendiri secara penuh — memaksa komunikasi aktif dan kolaborasi!
  - Sinkronisasi huruf real-time (<200ms) dengan pembeda warna (Sky Blue untuk input sendiri, Rose untuk input partner).
  - Setelah ronde selesai, semua pemain dapat memilih **Main Lagi**; room kembali ke pengaturan setelah seluruh pemain terhubung menyetujui.
- **Generator Kata Otomatis (Multi-Provider AI)**:
  - Generate puzzle baru setiap ronde via Vercel Serverless Function dengan provider AI yang tersedia.
  - Petunjuk AI dan seluruh kamus fallback ditulis sebagai kalimat Bahasa Indonesia yang jelas, alami, dan spesifik; hasil AI yang berupa frasa terpotong atau menyebut jawabannya disaring. Jika soal AI yang lolos kurang dari jumlah yang diminta, kekurangannya diisi dari bank offline pada tema yang sama tanpa mengulang jawaban. Bank offline tambahan berada di `data/offline-banks/`, dikurasi per tema dengan rujukan sumber, dan disimpan di cache agar tersedia saat offline. Tema campuran mengambil gabungan lintas bidang. Ejaan nama diri dipertahankan, termasuk bentuk historis seperti **Soekarno**.
  - Riwayat hingga 80 jawaban dan petunjuk terbaru disimpan lokal per tema untuk mengurangi pengulangan; jika AI hanya menghasilkan sebagian soal, aplikasi memberi tahu bahwa sisanya berasal dari kamus fallback.
- **Client-Side Crossword Grid Engine**:
  - Algoritma penyusunan grid dinamis dan acak di browser tanpa kompilasi/bundler, menjamin bentuk yang selalu bervariasi setiap ronde.
- **PWA & Offline-First**:
  - Installable di Android, iOS, dan Desktop.
  - Dilengkapi Service Worker (`silangkata-v1`) untuk memuat app shell seketika.
- **Desain Modern Deep Slate**:
  - Palet warna slate yang tenang dan bersih di mata, responsif fluid `clamp()` dan dukungan `100dvh`.
- **Web Audio API & Haptics**:
  - Efek suara sintetis retro-futuristik tanpa dependensi file audio eksternal.

---

## 📸 Preview Antarmuka

Menu utama menampilkan pengaturan tema, jumlah pertanyaan, dan tingkat kesulitan di samping pilihan mode solo atau co-op. Lobby dan room menyediakan alur membuat atau bergabung ke permainan; papan teka-teki tetap menjadi fokus saat bermain.

---

## 🎮 Cara Bermain

### Mode Solo (3 Langkah)
1. Pilih tema, jumlah pertanyaan, dan tingkat kesulitan di menu utama, lalu pilih **Main solo**.
2. Klik kotak atau petunjuk untuk mengarahkan kursor; ketik huruf untuk mengisi kata.
3. Tuntaskan seluruh kata untuk mendapatkan **100 poin per kata** ditambah **300 poin bonus tuntas**, dan lihat catatan waktu stopwatch terbaikmu!

### Mode Co-op (5 Langkah)
1. **Pemain 1 (Host)**: Pilih **Main co-op** → **Buat room baru** → Salin kode room (misal: `ABC123`).
2. **Pemain 2 (Guest)**: Buka SilangKata di perangkat/browser lain → Pilih **Main co-op** → Masukkan kode room → **Gabung room**.
3. Saat terhubung, game otomatis dimulai:
   - Host memegang peran **Mendatar** (hanya melihat petunjuk mendatar).
   - Guest memegang peran **Menurun** (hanya melihat petunjuk menurun).
4. Saling berkomunikasi (voice call atau bicara langsung) untuk saling memberi petunjuk kotak yang bersilangan.
5. Selesaikan teka-teki bersama dengan santai untuk mencatatkan waktu dan skor tim terbaik!

---

## 🚀 Setup & Menjalankan Lokal

### Prasyarat
- Node.js versi 18+ atau 20+
- npm

### Langkah Menjalankan
1. Clone repositori:
   ```bash
   git clone https://github.com/username/silangkata.git
   cd silangkata
   ```

2. Jalankan test otomatis:
   ```bash
   npm test
   ```

3. Jalankan server lokal:
   ```bash
   # Menjalankan aplikasi dan API /api/generate-puzzle
   npm start
   ```

   `npm start` menjalankan Vercel CLI lokal agar fungsi API dan `.env.local` dapat digunakan. Jika Vercel CLI belum tersedia, `npx` akan meminta izin untuk mengunduhnya.

   Untuk melihat UI tanpa API (soal terbatas dari fallback lokal):
   ```bash
   npm run start:static
   ```

4. Buka di browser: `http://localhost:3000` (atau port yang ditampilkan).

---

## 🌐 Deploy ke Vercel (Produksi)

Game ini dirancang **100% siap deploy ke Vercel** tanpa konfigurasi rumit:

1. Push repository ke GitHub.
2. Buka dashboard [Vercel](https://vercel.com/) dan klik **"Add New Project"**.
3. Import repositori `silangkata`.
4. Pada bagian **Environment Variables**, tambahkan:
   - **Key**: `GEMINI_API_KEY`
   - **Value**: Masukkan API key Google AI Studio milikmu (lihat panduan di bawah).
5. Klik **"Deploy"**. Vercel akan langsung mem-publish aplikasi dan fungsi serverless `/api/generate-puzzle`.

*(Catatan: Jika `GEMINI_API_KEY` belum dipasang saat deploy, aplikasi tetap berjalan normal menggunakan kamus kata kurasi lokal).*

---

## 🔑 Konfigurasi API Key AI (Multi-Provider Support)

SilangKata mendukung berbagai provider AI secara otomatis dengan sistem prioritas cerdas:

1. **Groq Cloud (Sangat Direkomendasikan ⭐ — Gratis & Tercepat ~1 detik)**
   - Daftar gratis di [Groq Console](https://console.groq.com/).
   - Buat API key di menu **API Keys**.
   - Pasang di `.env.local`:
     ```env
     GROQ_API_KEY=gsk_...
     ```
2. **OpenRouter (Akses DeepSeek & Llama Gratis)**
   - Daftar di [OpenRouter](https://openrouter.ai/).
   - Buat API key dan pasang di `.env.local`:
     ```env
     OPENROUTER_API_KEY=sk-or-v1-...
     ```
3. **DeepSeek API Resmi**
   - Daftar di [DeepSeek Platform](https://platform.deepseek.com/).
   - Pasang di `.env.local`:
     ```env
     DEEPSEEK_API_KEY=sk-...
     ```
4. **Google Gemini API**
   - Dapatkan key di [Google AI Studio](https://aistudio.google.com/app/apikey).
   - Pasang di `.env.local`:
     ```env
     GEMINI_API_KEY=AIzaSy...
     ```

*(Catatan: Jika tidak ada API key yang disetel atau seluruh provider AI sedang gangguan, aplikasi tetap berjalan 100% mulus menggunakan kamus kurasi lokal).*

---

## 📂 Struktur Project

```
silangkata/
├── index.html                 # Struktur 5 layar permainan & antarmuka HUD
├── styles.css                 # Cyberpunk Neon design system & responsivitas
├── app.js                     # Game logic, Crossword Generator, Web Audio SFX
├── multiplayer.js             # PeerJS WebRTC P2P DataChannel synchronization
├── manifest.json              # Spesifikasi Web App Manifest untuk PWA
├── sw.js                      # Service Worker (Cache-first offline gameplay)
├── vercel.json                # Vercel deployment headers & PWA configuration
├── package.json               # Package metadata & test scripts
├── test.js                    # Automated test suite (crossword & API verification)
├── api/
│   └── generate-puzzle.js     # Vercel Serverless Function (Proxy Gemini 1.5 Flash)
├── vendor/
│   └── peerjs.min.js          # Standalone PeerJS library
└── icons/
    ├── icon-192.png           # PWA icon 192x192
    └── icon-512.png           # PWA icon 512x512
```

---

## 🛠 Troubleshooting & Pertanyaan Umum

### 1. PeerJS Tidak Terhubung atau Error "Peer Unavailable"
- Pastikan kedua perangkat memiliki koneksi internet aktif untuk signaling awal.
- Pastikan kode room 6 karakter dimasukkan dengan tepat (huruf besar/kecil otomatis dinormalisasi).
- Pada beberapa jaringan korporat atau firewall ketat yang memblokir WebRTC, aktifkan koneksi seluler/tethering.

### 2. Apakah Game Tetap Bisa Dimainkan Jika Kuota AI Habis?
- **Ya!** Jika semua provider AI gagal atau API key tidak disetel, sistem memakai kamus Bahasa Indonesia bawaan. Jika AI hanya menghasilkan sebagian soal yang lolos validasi, soal AI tersebut tetap dipakai dan kekurangannya diisi dari kamus fallback sesuai tema.

### 3. Apakah Bisa Dimainkan di Layar Smartphone Kecil (Mobile)?
- **Ya!** Ukuran cell grid menggunakan rumus CSS `clamp(26px, 6.5vw, 44px)` yang menyesuaikan lebar layar secara otomatis dari 320px (iPhone SE) hingga desktop 4K. Tersedia pula hidden virtual keyboard helper untuk kenyamanan mengetik di keyboard sentuh mobile.

---

## 📜 Lisensi
MIT License © SilangKata Team.
Made with 💙 in Indonesia.
