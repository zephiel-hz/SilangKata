// app.js — SilangKata Core Game Engine & Controller

(function () {
  'use strict';

  // ==========================================
  // 1. AUDIO & HAPTIC SYSTEM (Web Audio API)
  // ==========================================
  class SoundManager {
    constructor() {
      this.ctx = null;
      this.isMuted = localStorage.getItem('silangkata_muted') === 'true';
    }

    _initCtx() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    toggleMute() {
      this.isMuted = !this.isMuted;
      localStorage.setItem('silangkata_muted', this.isMuted);
      return !this.isMuted;
    }

    playTone(freq, duration, type = 'sine', gainVal = 0.15) {
      if (this.isMuted) return;
      try {
        this._initCtx();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
      } catch (_) {}
    }

    playType() {
      this.playTone(520, 0.05, 'triangle', 0.1);
    }

    playCorrect() {
      if (this.isMuted) return;
      try {
        this._initCtx();
        const now = this.ctx.currentTime;
        [523.25, 659.25, 783.99].forEach((freq, idx) => { // C5, E5, G5
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.09);
          gain.gain.setValueAtTime(0.2, now + idx * 0.09);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.25);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now + idx * 0.09);
          osc.stop(now + idx * 0.09 + 0.25);
        });
      } catch (_) {}
    }

    playError() {
      this.playTone(180, 0.2, 'sawtooth', 0.15);
    }

    playVictory() {
      if (this.isMuted) return;
      try {
        this._initCtx();
        const now = this.ctx.currentTime;
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.12);
          gain.gain.setValueAtTime(0.25, now + idx * 0.12);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.45);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now + idx * 0.12);
          osc.stop(now + idx * 0.12 + 0.45);
        });
      } catch (_) {}
    }
  }

  const sound = new SoundManager();

  function triggerHaptic(pattern = [30]) {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(pattern); } catch (_) {}
    }
  }

  // ==========================================
  // 2. CLIENT-SIDE CROSSWORD GENERATOR ALGORITHM
  // ==========================================
  class CrosswordGenerator {
    static generate(wordList) {
      if (!Array.isArray(wordList) || wordList.length === 0) return null;

      // Filter kata valid
      const cleanList = wordList
        .map(item => ({
          word: (item.word || '').toUpperCase().replace(/[^A-Z]/g, ''),
          clue: item.clue || ''
        }))
        .filter(item => item.word.length >= 3);

      if (cleanList.length === 0) return null;

      let bestResult = null;
      let bestScore = -Infinity;

      // Lakukan 15 percobaan dengan orientasi & kombinasi acak untuk bentuk yang selalu bervariasi
      const ATTEMPTS = 15;
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const result = this._attemptGenerate(cleanList);
        if (result) {
          const wordCount = result.placedWords.length;
          const w = result.maxCol - result.minCol + 1;
          const h = result.maxRow - result.minRow + 1;
          const area = w * h;
          const ratio = Math.max(w / h, h / w);
          // Utamakan jumlah kata yang masuk, bentuk seimbang (bukan garis panjang), lalu acak
          const score = (wordCount * 200) - (area * 0.35) - (ratio * 15) + (Math.random() * 12);

          if (score > bestScore) {
            bestScore = score;
            bestResult = result;
          }
        }
      }

      if (!bestResult) return null;
      return this._compactAndNumber(bestResult.placedWords, bestResult.gridMap);
    }

    static _attemptGenerate(words) {
      // Acak urutan kata dengan pembobotan panjang kata + jitter acak
      const pool = [...words].sort((a, b) => {
        const scoreA = a.word.length * 2 + Math.random() * 3.5;
        const scoreB = b.word.length * 2 + Math.random() * 3.5;
        return scoreB - scoreA;
      });

      const gridMap = new Map();
      const placedWords = [];

      // Pilih kata pertama dan arah acak (50% across, 50% down)
      const first = pool[0];
      const firstDir = Math.random() > 0.5 ? 'across' : 'down';
      const startOffset = -Math.floor(first.word.length / 2);

      for (let i = 0; i < first.word.length; i++) {
        const r = firstDir === 'across' ? 0 : startOffset + i;
        const c = firstDir === 'across' ? startOffset + i : 0;
        gridMap.set(`${r},${c}`, first.word[i]);
      }

      placedWords.push({
        word: first.word,
        clue: first.clue,
        row: firstDir === 'across' ? 0 : startOffset,
        col: firstDir === 'across' ? startOffset : 0,
        dir: firstDir
      });

      // Tempatkan kata berikutnya dengan pencarian persilangan
      for (let w = 1; w < pool.length; w++) {
        const candidate = pool[w];
        const validPlacements = [];

        for (let p = 0; p < placedWords.length; p++) {
          const placed = placedWords[p];
          const nextDir = placed.dir === 'across' ? 'down' : 'across';

          for (let i = 0; i < candidate.word.length; i++) {
            const char = candidate.word[i];
            for (let j = 0; j < placed.word.length; j++) {
              if (placed.word[j] === char) {
                const intersectRow = placed.dir === 'across' ? placed.row : placed.row + j;
                const intersectCol = placed.dir === 'across' ? placed.col + j : placed.col;

                const startRow = nextDir === 'across' ? intersectRow : intersectRow - i;
                const startCol = nextDir === 'across' ? intersectCol - i : intersectCol;

                if (this._canPlaceWord(candidate.word, startRow, startCol, nextDir, gridMap)) {
                  const score = this._scorePlacement(candidate.word, startRow, startCol, nextDir, gridMap);
                  validPlacements.push({ row: startRow, col: startCol, dir: nextDir, score });
                }
              }
            }
          }
        }

        if (validPlacements.length > 0) {
          validPlacements.sort((a, b) => b.score - a.score);
          // Ambil salah satu dari posisi terbaik secara acak untuk variasi bentuk
          const pickIdx = validPlacements.length > 1 && Math.random() < 0.35 ? 1 : 0;
          const bestPos = validPlacements[pickIdx];

          for (let i = 0; i < candidate.word.length; i++) {
            const r = bestPos.dir === 'across' ? bestPos.row : bestPos.row + i;
            const c = bestPos.dir === 'across' ? bestPos.col + i : bestPos.col;
            gridMap.set(`${r},${c}`, candidate.word[i]);
          }

          placedWords.push({
            word: candidate.word,
            clue: candidate.clue,
            row: bestPos.row,
            col: bestPos.col,
            dir: bestPos.dir
          });
        }
      }

      if (placedWords.length < 3) return null;

      let minRow = Infinity, maxRow = -Infinity, minCol = Infinity, maxCol = -Infinity;
      for (const key of gridMap.keys()) {
        const [r, c] = key.split(',').map(Number);
        if (r < minRow) minRow = r;
        if (r > maxRow) maxRow = r;
        if (c < minCol) minCol = c;
        if (c > maxCol) maxCol = c;
      }

      return { placedWords, gridMap, minRow, maxRow, minCol, maxCol };
    }

    static _canPlaceWord(word, startRow, startCol, dir, gridMap) {
      // 1. Sel tepat sebelum awal kata harus kosong
      const preRow = dir === 'across' ? startRow : startRow - 1;
      const preCol = dir === 'across' ? startCol - 1 : startCol;
      if (gridMap.has(`${preRow},${preCol}`)) return false;

      // 2. Sel tepat setelah akhir kata harus kosong
      const postRow = dir === 'across' ? startRow : startRow + word.length;
      const postCol = dir === 'across' ? startCol + word.length : startCol;
      if (gridMap.has(`${postRow},${postCol}`)) return false;

      let intersectionCount = 0;

      for (let i = 0; i < word.length; i++) {
        const r = dir === 'across' ? startRow : startRow + i;
        const c = dir === 'across' ? startCol + i : startCol;
        const key = `${r},${c}`;

        if (gridMap.has(key)) {
          if (gridMap.get(key) !== word[i]) {
            return false; // Huruf tabrakan tidak cocok
          }
          intersectionCount++;
        } else {
          // Untuk sel baru, cek tidak boleh ada huruf tetangga paralel (menempel tidak sah)
          if (dir === 'across') {
            if (gridMap.has(`${r - 1},${c}`) || gridMap.has(`${r + 1},${c}`)) return false;
          } else {
            if (gridMap.has(`${r},${c - 1}`) || gridMap.has(`${r},${c + 1}`)) return false;
          }
        }
      }

      // Harus ada minimal 1 persilangan dengan kata yang sudah ada
      return intersectionCount >= 1;
    }

    static _scorePlacement(word, startRow, startCol, dir, gridMap) {
      let intersections = 0;
      let distFromCenter = 0;

      for (let i = 0; i < word.length; i++) {
        const r = dir === 'across' ? startRow : startRow + i;
        const c = dir === 'across' ? startCol + i : startCol;
        if (gridMap.has(`${r},${c}`)) intersections++;
        distFromCenter += Math.abs(r) + Math.abs(c);
      }

      // Berikan random jitter agar variasi bentuk selalu acak & unik
      return intersections * 28 - (distFromCenter / word.length) * 1.8 + Math.random() * 8;
    }

    static _compactAndNumber(placedWords, gridMap) {
      let minRow = Infinity, maxRow = -Infinity;
      let minCol = Infinity, maxCol = -Infinity;

      for (const [key] of gridMap.entries()) {
        const [r, c] = key.split(',').map(Number);
        if (r < minRow) minRow = r;
        if (r > maxRow) maxRow = r;
        if (c < minCol) minCol = c;
        if (c > maxCol) maxCol = c;
      }

      const rows = maxRow - minRow + 1;
      const cols = maxCol - minCol + 1;

      // Geser semua kata agar koordinat mulai dari 0,0
      const normalizedWords = placedWords.map(w => ({
        ...w,
        row: w.row - minRow,
        col: w.col - minCol,
        solved: false
      }));

      // Inisialisasi matriks sel
      const cells = {};
      for (const w of normalizedWords) {
        for (let i = 0; i < w.word.length; i++) {
          const r = w.dir === 'across' ? w.row : w.row + i;
          const c = w.dir === 'across' ? w.col + i : w.col;
          const key = `${r}-${c}`;
          if (!cells[key]) {
            cells[key] = {
              row: r,
              col: c,
              letter: w.word[i],
              num: null,
              acrossWordIdx: null,
              downWordIdx: null
            };
          }
        }
      }

      // Hitung nomor kotak urut atas-ke-bawah, kiri-ke-kanan
      let currentNum = 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const key = `${r}-${c}`;
          if (!cells[key]) continue;

          let isStartCell = false;

          // Cek apakah sel ini merupakan awal dari kata mendatar
          for (let idx = 0; idx < normalizedWords.length; idx++) {
            const w = normalizedWords[idx];
            if (w.row === r && w.col === c) {
              if (w.dir === 'across') {
                w.num = currentNum;
                cells[key].acrossWordIdx = idx;
                isStartCell = true;
              } else if (w.dir === 'down') {
                w.num = currentNum;
                cells[key].downWordIdx = idx;
                isStartCell = true;
              }
            }
          }

          if (isStartCell) {
            cells[key].num = currentNum;
            currentNum++;
          }
        }
      }

      // Asosiasikan setiap sel dengan index kata yang melewatinya
      for (let idx = 0; idx < normalizedWords.length; idx++) {
        const w = normalizedWords[idx];
        for (let i = 0; i < w.word.length; i++) {
          const r = w.dir === 'across' ? w.row : w.row + i;
          const c = w.dir === 'across' ? w.col + i : w.col;
          const key = `${r}-${c}`;
          if (w.dir === 'across') cells[key].acrossWordIdx = idx;
          if (w.dir === 'down') cells[key].downWordIdx = idx;
        }
      }

      return {
        rows,
        cols,
        cells,
        words: normalizedWords
      };
    }
  }

  // Kamus fallback client-side jika serverless offline atau dijalankan statis
  const CLIENT_FALLBACKS = {
    hewan: [
      { word: 'KUCING', clue: 'Hewan ini berkaki empat, suka mendengkur, dan sering memakan ikan.' },
      { word: 'KELINCI', clue: 'Mamalia ini memiliki telinga panjang dan dikenal suka memakan wortel.' },
      { word: 'KAMBING', clue: 'Hewan ini berkaki empat dan biasanya memakan rumput.' },
      { word: 'BURUNG', clue: 'Unggas ini memiliki sayap yang memungkinkannya terbang di angkasa.' },
      { word: 'GAJAH', clue: 'Hewan darat berukuran besar ini memiliki belalai yang panjang.' },
      { word: 'SINGA', clue: 'Pemangsa di savana ini dikenal sebagai raja hutan dan memiliki surai lebat.' },
      { word: 'HARIMAU', clue: 'Kucing besar ini memiliki bulu oranye dengan pola belang hitam.' },
      { word: 'ZEBRA', clue: 'Kuda liar dari Afrika ini memiliki belang hitam dan putih.' },
      { word: 'MONYET', clue: 'Primata ini dikenal cerdas dan sering hidup di pepohonan.' },
      { word: 'JERAPAH', clue: 'Hewan ini dikenal sebagai yang tertinggi di dunia karena lehernya panjang.' },
      { word: 'LUMBA', clue: 'Mamalia laut ini dikenal cerdas dan sering dianggap ramah.' },
      { word: 'BADAK', clue: 'Hewan ini memiliki satu atau dua cula di bagian hidungnya.' },
      { word: 'PENGUIN', clue: 'Burung yang hidup di wilayah kutub ini berbulu hitam putih dan pandai menyelam.' },
      { word: 'ELANG', clue: 'Burung pemangsa ini memiliki penglihatan yang sangat tajam.' },
      { word: 'BEBEK', clue: 'Unggas air ini memiliki paruh pipih dan suka berenang.' },
      { word: 'BERUANG', clue: 'Mamalia ini dikenal suka mencari madu dan ikan.' },
      { word: 'KOMODO', clue: 'Kadal raksasa purba ini berasal dari wilayah Nusa Tenggara.' },
      { word: 'TUPAI', clue: 'Hewan pengerat ini berekor lebat dan suka memakan kacang.' }
    ],
    buah: [
      { word: 'MANGGA', clue: 'Buah tropis ini terasa manis dan memiliki daging berwarna oranye.' },
      { word: 'PISANG', clue: 'Buah ini biasanya berkulit kuning dan kaya akan kalium.' },
      { word: 'JERUK', clue: 'Buah bulat ini berkulit oranye dan kaya akan vitamin C.' },
      { word: 'APEL', clue: 'Buah ini bertekstur renyah dan dapat berwarna merah atau hijau.' },
      { word: 'MELON', clue: 'Buah ini beraroma harum, terasa manis, dan memiliki daging berserat.' },
      { word: 'SEMANGKA', clue: 'Buah berukuran besar ini berkulit hijau, berdaging merah, dan kaya air.' },
      { word: 'DURIAN', clue: 'Buah yang dijuluki raja buah ini memiliki aroma tajam dan kulit berduri keras.' },
      { word: 'PEPAYA', clue: 'Buah lonjong ini berdaging oranye, terasa manis, dan memiliki biji bulat.' },
      { word: 'ANGGUR', clue: 'Buah kecil berbentuk bulat ini tumbuh dalam tandan dan terasa manis.' },
      { word: 'NANAS', clue: 'Buah ini memiliki kulit kasar bersisik dan mahkota yang berduri.' },
      { word: 'ALPUKAT', clue: 'Buah berwarna hijau ini berdaging lembut dan mengandung lemak sehat.' },
      { word: 'RAMBUTAN', clue: 'Buah ini berkulit merah, memiliki rambut lebat, dan mengandung banyak air.' }
    ],
    transportasi: [
      { word: 'PESAWAT', clue: 'Kendaraan udara bermesin jet ini dapat menghubungkan pulau-pulau.' },
      { word: 'KERETA', clue: 'Rangkaian gerbong ini melaju di atas rel baja.' },
      { word: 'KAPAL', clue: 'Kendaraan air ini dapat mengarungi samudra yang luas.' },
      { word: 'SEPEDA', clue: 'Kendaraan beroda dua ini bergerak saat pengendaranya mengayuh pedal.' },
      { word: 'MOTOR', clue: 'Kendaraan beroda dua ini menggunakan mesin berbahan bakar.' },
      { word: 'MOBIL', clue: 'Kendaraan bermotor beroda empat ini digunakan untuk bepergian melalui jalan.' },
      { word: 'BUS', clue: 'Kendaraan umum ini dapat mengangkut banyak penumpang.' },
      { word: 'PERAHU', clue: 'Wahana air tradisional ini digerakkan dengan dayung atau layar.' },
      { word: 'BECAK', clue: 'Kendaraan tradisional beroda tiga ini bergerak dengan kayuhan.' },
      { word: 'DELMAN', clue: 'Kereta beroda ini ditarik oleh seekor kuda.' },
      { word: 'TRUK', clue: 'Kendaraan ini digunakan untuk mengangkut muatan berat dan barang logistik.' },
      { word: 'HELIKOPTER', clue: 'Kendaraan udara ini terbang dengan bantuan baling-baling yang berputar di atasnya.' },
      { word: 'FERI', clue: 'Kapal ini digunakan untuk menyeberangkan penumpang dan kendaraan antarpulau.' },
      { word: 'ANGKOT', clue: 'Mobil van ini melayani angkutan kota dengan rute tertentu.' },
      { word: 'BAJAJ', clue: 'Kendaraan bermesin beroda tiga ini dikenal sebagai angkutan khas ibu kota.' },
      { word: 'RAKIT', clue: 'Wahana apung ini dibuat dengan menyusun batang bambu dan dapat digunakan di sungai.' }
    ],
    makanan: [
      { word: 'RENDANG', clue: 'Masakan khas Minangkabau ini dimasak lama dengan santan dan rempah.' },
      { word: 'BAKSO', clue: 'Bola daging ini disajikan dalam kuah kaldu yang hangat.' },
      { word: 'SATE', clue: 'Potongan daging ini ditusuk, dibakar, lalu disajikan dengan bumbu kacang.' },
      { word: 'SOTO', clue: 'Hidangan berkuah ini biasanya berisi daging, tauge, dan rempah.' },
      { word: 'GADO', clue: 'Salad sayuran khas Betawi ini disajikan dengan saus kacang.' },
      { word: 'NASI', clue: 'Beras yang dimasak hingga lunak ini menjadi makanan pokok banyak orang.' },
      { word: 'PEMPEK', clue: 'Makanan khas Palembang ini dibuat dari ikan dan tepung sagu.' },
      { word: 'RAWON', clue: 'Sup daging sapi khas Jawa Timur ini berwarna hitam karena kluwek.' },
      { word: 'LONTONG', clue: 'Beras yang dibungkus daun pisang ini direbus hingga padat dan empuk.' },
      { word: 'MARTABAK', clue: 'Hidangan ini tersedia dalam varian manis dan varian asin yang berisi telur.' },
      { word: 'TEMPE', clue: 'Kedelai ini difermentasi dengan kapang hingga menyatu menjadi satu keping.' },
      { word: 'TAHU', clue: 'Olahan kedelai ini dibuat dengan menggumpalkan sari kedelai.' },
      { word: 'GUDEG', clue: 'Masakan khas Yogyakarta ini dibuat dari nangka muda dan santan.' }
    ],
    teknologi: [
      { word: 'KOMPUTER', clue: 'Perangkat elektronik ini memproses data dalam bentuk digital.' },
      { word: 'INTERNET', clue: 'Jaringan global ini menghubungkan komputer di berbagai penjuru dunia.' },
      { word: 'ROBOT', clue: 'Mesin otomatis ini menjalankan tugas sesuai program yang diberikan.' },
      { word: 'SATELIT', clue: 'Benda yang mengorbit Bumi ini dapat membantu mengirimkan sinyal.' },
      { word: 'SERVER', clue: 'Komputer pusat ini menyediakan layanan dan data bagi perangkat lain.' },
      { word: 'KAMERA', clue: 'Alat optik ini digunakan untuk merekam gambar digital.' },
      { word: 'MONITOR', clue: 'Layar ini menampilkan keluaran visual dari sebuah sistem.' },
      { word: 'KEYBOARD', clue: 'Papan tombol ini digunakan untuk mengetik huruf dan angka.' },
      { word: 'KODING', clue: 'Kegiatan ini melibatkan penulisan instruksi untuk sebuah program.' },
      { word: 'DATA', clue: 'Kumpulan fakta dan angka ini disusun agar dapat diolah.' },
      { word: 'SENSOR', clue: 'Komponen ini mendeteksi perubahan pada kondisi fisik di sekitarnya.' },
      { word: 'LAPTOP', clue: 'Komputer portabel ini memiliki layar yang dapat dilipat.' }
    ],
    olahraga: [
      { word: 'FUTSAL', clue: 'Permainan bola ini dimainkan di lapangan tertutup oleh dua tim yang masing-masing terdiri atas lima orang.' },
      { word: 'SENAM', clue: 'Olahraga ini melatih kebugaran tubuh sekaligus meningkatkan kelenturan.' },
      { word: 'RENANG', clue: 'Olahraga air ini dilakukan dengan menggerakkan tubuh di dalam kolam.' },
      { word: 'LARI', clue: 'Aktivitas ini dilakukan dengan melangkahkan kaki secara cepat untuk menempuh jarak.' },
      { word: 'TINJU', clue: 'Olahraga adu pukulan ini dilakukan dengan sarung tangan di dalam ring.' },
      { word: 'BASKET', clue: 'Dalam permainan bola ini, para pemain berusaha memasukkan bola ke keranjang.' },
      { word: 'VOLI', clue: 'Dalam permainan ini, para pemain memukul bola agar melewati net yang tinggi.' },
      { word: 'TENIS', clue: 'Olahraga lapangan ini dimainkan dengan bola lentur dan alat pemukul berjaring.' },
      { word: 'CATUR', clue: 'Permainan asah otak ini mengandalkan strategi untuk menggerakkan bidak.' },
      { word: 'SILAT', clue: 'Seni bela diri ini diwariskan sebagai bagian dari budaya leluhur.' }
    ],
    umum: [
      { word: 'IBUKOTA', clue: 'Kota ini menjadi pusat administrasi pemerintahan suatu negara.' },
      { word: 'KOMPAS', clue: 'Alat navigasi ini membantu menunjukkan arah mata angin.' },
      { word: 'SAMUDRA', clue: 'Lautan yang sangat luas ini membentang dan mengelilingi benua.' },
      { word: 'BENDERA', clue: 'Kain yang dikibarkan ini menjadi lambang kedaulatan suatu negara.' },
      { word: 'RUPIAH', clue: 'Mata uang ini digunakan secara resmi di Negara Republik Indonesia.' },
      { word: 'MONAS', clue: 'Monumen di Jakarta ini memiliki puncak berbentuk lidah api berwarna emas.' },
      { word: 'GARUDA', clue: 'Lambang negara Indonesia ini digambarkan mencengkeram sebuah pita.' },
      { word: 'MUSEUM', clue: 'Gedung ini menyimpan dan memamerkan berbagai benda bersejarah.' },
      { word: 'PASPOR', clue: 'Dokumen identitas resmi ini diperlukan saat bepergian ke luar negeri.' },
      { word: 'KARTINI', clue: 'Tokoh pahlawan ini dikenal karena perjuangannya untuk pendidikan dan emansipasi perempuan.' },
      { word: 'PANCASILA', clue: 'Dasar falsafah dan ideologi ini menjadi pedoman bagi bangsa Indonesia.' },
      { word: 'BALI', clue: 'Pulau di Indonesia ini terkenal sebagai tujuan wisata dan kerap dijuluki Pulau Dewata.' }
    ],
    ipa: [
      { word: 'OKSIGEN', clue: 'Gas yang terdapat di udara ini dihirup oleh manusia saat bernapas.' },
      { word: 'ATOM', clue: 'Partikel sangat kecil ini merupakan salah satu penyusun materi.' },
      { word: 'ENERGI', clue: 'Kemampuan atau daya ini diperlukan untuk melakukan suatu usaha.' },
      { word: 'MAGMA', clue: 'Cairan batuan pijar bersuhu tinggi ini berada di dalam Bumi.' },
      { word: 'FOSIL', clue: 'Sisa atau jejak makhluk purba ini terawetkan dalam batuan.' },
      { word: 'NEURON', clue: 'Sel saraf ini mengirimkan impuls listrik di dalam sistem saraf.' },
      { word: 'PLANET', clue: 'Benda langit ini mengorbit sebuah bintang.' },
      { word: 'MAMALIA', clue: 'Hewan ini berdarah panas dan menyusui anaknya.' },
      { word: 'BAKTERI', clue: 'Mikroorganisme bersel satu ini hanya dapat dilihat dengan bantuan mikroskop.' },
      { word: 'HABITAT', clue: 'Lingkungan alami ini menjadi tempat tinggal bagi suatu makhluk hidup.' },
      { word: 'JANTUNG', clue: 'Organ vital ini memompa darah agar mengalir ke seluruh tubuh.' },
      { word: 'LAMBUNG', clue: 'Organ pencernaan ini mengolah makanan dengan bantuan asam.' }
    ],
    ips: [
      { word: 'SEJARAH', clue: 'Peristiwa masa lampau ini dikaji dan disusun menurut urutan waktu.' },
      { word: 'ARTEFAK', clue: 'Benda peninggalan arkeologis ini dibuat oleh manusia pada masa lampau.' },
      { word: 'PRASASTI', clue: 'Piagam kuno ini dipahat pada permukaan batu atau logam.' },
      { word: 'KERAJAAN', clue: 'Bentuk pemerintahan ini dipimpin oleh seorang raja atau sultan.' },
      { word: 'MATARAM', clue: 'Kerajaan agraris kuno di Jawa ini dikenal sebagai pembangun candi megah.' },
      { word: 'KOLONI', clue: 'Wilayah jajahan ini berada di bawah kekuasaan bangsa asing.' },
      { word: 'BARTER', clue: 'Sistem perdagangan ini dilakukan dengan menukar barang tanpa menggunakan uang.' },
      { word: 'EKONOMI', clue: 'Ilmu ini membahas produksi, distribusi, dan konsumsi barang.' },
      { word: 'KULTUR', clue: 'Istilah ini merujuk pada adat istiadat, nilai, dan kebudayaan suatu masyarakat.' },
      { word: 'ETNIS', clue: 'Kelompok masyarakat ini memiliki kesamaan asal-usul atau garis keturunan.' },
      { word: 'PASAR', clue: 'Tempat ini menjadi lokasi bertemunya penjual dan pembeli untuk bertransaksi.' },
      { word: 'TRADISI', clue: 'Kebiasaan adat ini diwariskan secara turun-temurun dari nenek moyang.' }
    ],
    campuran: [
      { word: 'OKSIGEN', clue: 'Gas ini dihirup saat bernapas dan dipelajari dalam ilmu pengetahuan alam.' },
      { word: 'RENDANG', clue: 'Masakan daging khas Minangkabau ini kaya akan rempah.' },
      { word: 'INTERNET', clue: 'Jaringan komputer yang luas ini menghubungkan perangkat di seluruh dunia.' },
      { word: 'KOMPAS', clue: 'Alat navigasi ini membantu menentukan arah, termasuk arah utara.' },
      { word: 'JANTUNG', clue: 'Organ tubuh ini memompa darah ke seluruh tubuh.' },
      { word: 'SEJARAH', clue: 'Catatan mengenai peristiwa masa lampau manusia ini dipelajari dalam ilmu sosial.' },
      { word: 'HARIMAU', clue: 'Kucing besar pemangsa ini memiliki belang dan hidup di alam liar.' },
      { word: 'RUPIAH', clue: 'Mata uang resmi ini digunakan di Indonesia.' },
      { word: 'ATOM', clue: 'Partikel sangat kecil ini merupakan salah satu penyusun materi.' },
      { word: 'ROBOT', clue: 'Mesin otomatis ini dapat menjalankan tugas sesuai program.' },
      { word: 'KERETA', clue: 'Moda angkutan darat ini melaju di atas rel baja.' },
      { word: 'MONAS', clue: 'Tugu di Jakarta ini menjadi lambang perjuangan dan memiliki puncak berapi emas.' },
      { word: 'CATUR', clue: 'Permainan strategi ini dimainkan di papan yang terdiri atas 64 petak.' },
      { word: 'MANGGA', clue: 'Buah tropis ini terasa manis dan memiliki daging berwarna oranye.' }
    ]
  };

  const PUZZLE_HISTORY_KEY = 'silangkata_puzzle_history';
  const PUZZLE_HISTORY_LIMIT = 80;

  // ==========================================
  // 3. GAME CONTROLLER & STATE
  // ==========================================
  class SilangKataGame {
    constructor() {
      this.mode = 'solo'; // 'solo' | 'coop'
      this.role = 'solo'; // 'coop' | 'solo'
      this.partnerCursors = new Map(); // playerNum => { r, c, dir }
      this.puzzle = null;
      this.userGrid = {}; // 'r-c' => letter
      this.cellSources = {}; // 'r-c' => 'self' | 'partner'
      this.hintedCells = {}; // 'r-c' => true for letters revealed by a hint
      this.activeCell = null; // { r, c }
      this.activeDir = 'across'; // 'across' | 'down'
      this.score = 0;
      this.elapsedSeconds = 0; // Stopwatch mulai dari 00:00
      this.timerInterval = null;
      this.isGameOver = false;
      this.hintUsed = false;
      this.selectedTheme = '';
      this.selectedDiff = 'medium';
      this.selectedCount = 12;

      // Akumulasi skor & leaderboard
      this.wordsSolvedCount = 0;
      this.hintsUsedCount = 0;
      this.completionBonus = 0;
      this.coopScores = new Map(); // playerNum => { playerNum, name, score, wordsSolved, hintsUsed }
      this.isStartingCoopGame = false;
      this.playAgainVotes = new Set();
      this.hasVotedPlayAgain = false;
      this.playAgainTransitionStarted = false;

      // Profil nama pemain
      this.playerName = (typeof localStorage !== 'undefined') ? (localStorage.getItem('silangkata_player_name') || '') : '';
      this._nameOnboardingCallback = null;

      this._cacheDOM();
      this._bindEvents();
      this.checkUrlJoinParams();
    }

    _cacheDOM() {
      // Screens
      this.screenMenu = document.getElementById('screen-menu');
      this.screenLobby = document.getElementById('screen-lobby');
      this.screenRoom = document.getElementById('screen-room');
      this.screenGame = document.getElementById('screen-game');
      this.screenResult = document.getElementById('screen-result');

      // Menu Elements
      this.themeSelect = document.getElementById('theme-select');
      this.diffSelect = document.getElementById('difficulty-select');
      this.wordCountSelect = document.getElementById('word-count-select');
      this.btnMenuSolo = document.getElementById('btn-menu-solo');
      this.btnMenuCoop = document.getElementById('btn-menu-coop');

      // Lobby Elements
      this.lobbyIdentityBar = document.getElementById('lobby-identity-bar');
      this.lobbyPlayerNameDisplay = document.getElementById('lobby-player-name-display');
      this.btnEditPlayerName = document.getElementById('btn-edit-player-name');
      this.selectMaxPlayers = document.getElementById('select-max-players');
      this.btnCreateRoom = document.getElementById('btn-create-room');
      this.btnJoinRoom = document.getElementById('btn-join-room');
      this.btnLobbyBack = document.getElementById('btn-lobby-back');
      this.inputRoomCode = document.getElementById('input-room-code');

      // Room Elements
      this.displayRoomCode = document.getElementById('display-room-code');
      this.btnShareLink = document.getElementById('btn-share-link');
      this.btnCopyCode = document.getElementById('btn-copy-code');
      this.roomPlayerSlots = document.getElementById('room-player-slots');
      this.btnReadyCoop = document.getElementById('btn-ready-coop');
      this.btnStartCoop = document.getElementById('btn-start-coop');
      this.btnCancelRoom = document.getElementById('btn-cancel-room');
      this.badgeHostStatus = document.getElementById('badge-host-status');
      this.badgeGuestStatus = document.getElementById('badge-guest-status');

      // Room Settings Elements
      this.roomSettingsCard = document.getElementById('room-settings-card');
      this.roomSettingsSummary = document.getElementById('room-settings-summary');
      this.btnEditRoomSettings = document.getElementById('btn-edit-room-settings');
      this.modalRoomSettingsOverlay = document.getElementById('modal-room-settings-overlay');
      this.roomThemeSelect = document.getElementById('room-theme-select');
      this.roomCountSelect = document.getElementById('room-count-select');
      this.roomDiffSelect = document.getElementById('room-diff-select');
      this.btnRoomSettingsSave = document.getElementById('btn-room-settings-save');
      this.btnRoomSettingsCancel = document.getElementById('btn-room-settings-cancel');

      // Player Identity in HUD
      this.hudPlayerIdentity = document.getElementById('hud-player-identity');

      // Game HUD Elements
      this.hudTimer = document.getElementById('hud-timer');
      this.hudRole = document.getElementById('hud-role');
      this.hudScore = document.getElementById('hud-score');
      this.btnAudioToggle = document.getElementById('btn-audio-toggle');
      this.btnHint = document.getElementById('btn-hint');
      this.btnHudLeaderboard = document.getElementById('btn-hud-leaderboard');
      this.btnExitGame = document.getElementById('btn-exit-game');
      this.labelTheme = document.getElementById('label-theme');
      this.labelDiff = document.getElementById('label-diff');
      this.partnerStatus = document.getElementById('partner-status');
      this.dotPartnerStatus = document.getElementById('dot-partner-status');
      this.textPartnerStatus = document.getElementById('text-partner-status');

      // Game Main Elements
      this.gridContainer = document.getElementById('crossword-grid');
      this.listAcross = document.getElementById('list-across');
      this.listDown = document.getElementById('list-down');
      this.panelAcross = document.getElementById('panel-across');
      this.panelDown = document.getElementById('panel-down');
      this.countAcross = document.getElementById('count-across');
      this.countDown = document.getElementById('count-down');
      this.virtualKeyboardInput = document.getElementById('virtual-keyboard-input');

      // Active Clue Elements
      this.badgeClueDir = document.getElementById('badge-clue-dir');
      this.labelClueNum = document.getElementById('label-clue-num');
      this.labelClueLen = document.getElementById('label-clue-len');
      this.badgeClueStatus = document.getElementById('badge-clue-status');
      this.activeClueText = document.getElementById('active-clue-text');
      this.btnCloseClues = document.getElementById('btn-close-clues');
      this.cluesModal = document.getElementById('clues-modal');

      // Result Elements & Breakdown Details
      this.resultTitle = document.getElementById('result-title');
      this.resultSummary = document.getElementById('result-summary');
      this.resultScore = document.getElementById('result-score');
      this.resultBonus = document.getElementById('result-bonus');
      this.resultTime = document.getElementById('result-time');
      this.bdWordsCount = document.getElementById('bd-words-count');
      this.bdWordsPts = document.getElementById('bd-words-pts');
      this.bdBonusRow = document.getElementById('bd-bonus-row');
      this.bdBonusPts = document.getElementById('bd-bonus-pts');
      this.bdHintsRow = document.getElementById('bd-hints-row');
      this.bdHintsCount = document.getElementById('bd-hints-count');
      this.bdHintsPts = document.getElementById('bd-hints-pts');
      this.bdTotalPts = document.getElementById('bd-total-pts');
      this.resultCoopLeaderboard = document.getElementById('result-coop-leaderboard');
      this.resultLeaderboardList = document.getElementById('result-leaderboard-list');
      this.btnPlayAgain = document.getElementById('btn-play-again');
      this.playAgainStatus = document.getElementById('play-again-status');
      this.btnShareResult = document.getElementById('btn-share-result');
      this.btnResultMenu = document.getElementById('btn-result-menu');

      // Modals
      this.modalPlayerName = document.getElementById('modal-player-name');
      this.modalNameTitle = document.getElementById('modal-name-title');
      this.modalNameDesc = document.getElementById('modal-name-desc');
      this.inputProfileName = document.getElementById('input-profile-name');
      this.btnSaveProfileName = document.getElementById('btn-save-profile-name');
      this.btnCancelProfileName = document.getElementById('btn-cancel-profile-name');

      this.modalLiveLeaderboard = document.getElementById('modal-live-leaderboard');
      this.btnCloseLiveLeaderboard = document.getElementById('btn-close-live-leaderboard');
      this.btnDismissLeaderboard = document.getElementById('btn-dismiss-leaderboard');
      this.liveLeaderboardList = document.getElementById('live-leaderboard-list');

      // Overlays & Error Modals
      this.loadingOverlay = document.getElementById('loading-overlay');
      this.loadingText = document.getElementById('loading-text');
      this.disconnectOverlay = document.getElementById('disconnect-overlay');
      this.btnDisconnectMenu = document.getElementById('btn-disconnect-menu');
      this.btnDisconnectRejoin = document.getElementById('btn-disconnect-rejoin');
      this.modalConnError = document.getElementById('modal-conn-error');
      this.modalErrorTitle = document.getElementById('modal-error-title');
      this.modalErrorCode = document.getElementById('modal-error-code');
      this.modalErrorDesc = document.getElementById('modal-error-desc');
      this.modalErrorTips = document.getElementById('modal-error-tips');
      this.btnCloseErrorModal = document.getElementById('btn-close-error-modal');
      this.toastEl = document.getElementById('toast');
    }

    _bindEvents() {
      // Menu
      this.btnMenuSolo.addEventListener('click', () => this.startSoloGame());
      this.btnMenuCoop.addEventListener('click', () => this.openCoopLobby());

      // Lobby
      this.btnLobbyBack.addEventListener('click', () => this.showScreen('screen-menu'));
      this.btnEditPlayerName?.addEventListener('click', () => this.showEditPlayerNameModal());
      this.btnCreateRoom.addEventListener('click', () => this.handleCreateRoom());
      this.btnJoinRoom.addEventListener('click', () => this.handleJoinRoom());

      // Profile Name Modal
      this.btnSaveProfileName?.addEventListener('click', () => this.savePlayerNameFromModal());
      this.btnCancelProfileName?.addEventListener('click', () => this.hidePlayerNameModal());
      this.inputProfileName?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.savePlayerNameFromModal();
      });

      // Error Modal
      if (this.btnCloseErrorModal) {
        this.btnCloseErrorModal.addEventListener('click', () => {
          if (this.modalConnError) this.modalConnError.classList.remove('active');
          this.showScreen('screen-lobby');
        });
      }

      // Room
      if (this.btnShareLink) this.btnShareLink.addEventListener('click', () => this.shareRoomLink());
      if (this.btnCopyCode) this.btnCopyCode.addEventListener('click', () => this.copyRoomCode());
      if (this.btnReadyCoop) this.btnReadyCoop.addEventListener('click', () => this.handleGuestReadyToggle());
      if (this.btnStartCoop) this.btnStartCoop.addEventListener('click', () => this.handleHostStartGame());
      this.btnCancelRoom.addEventListener('click', () => {
        window.MP.disconnect();
        this.showScreen('screen-lobby');
      });

      // Room Settings (Edit Mode)
      this.btnEditRoomSettings?.addEventListener('click', () => this.openRoomSettingsModal());
      this.btnRoomSettingsSave?.addEventListener('click', () => this.saveRoomSettings());
      this.btnRoomSettingsCancel?.addEventListener('click', () => this.closeRoomSettingsModal());

      // Game HUD
      this.btnAudioToggle.addEventListener('click', () => {
        const isSoundOn = sound.toggleMute();
        const iconName = isSoundOn ? 'volume-2' : 'volume-x';
        this.btnAudioToggle.innerHTML = `<i data-lucide="${iconName}" aria-hidden="true"></i>`;
        this.btnAudioToggle.title = isSoundOn ? 'Matikan suara' : 'Aktifkan suara';
        this.btnAudioToggle.setAttribute('aria-label', this.btnAudioToggle.title);
        if (window.lucide) window.lucide.createIcons();
        this.showToast(isSoundOn ? 'Suara Aktif' : 'Suara Dimatikan');
      });

      this.btnHint.addEventListener('click', () => this.useHint());
      this.btnHudLeaderboard?.addEventListener('click', () => this.showLiveLeaderboardModal());
      this.btnCloseLiveLeaderboard?.addEventListener('click', () => this.hideLiveLeaderboardModal());
      this.btnDismissLeaderboard?.addEventListener('click', () => this.hideLiveLeaderboardModal());

      this.btnExitGame.addEventListener('click', () => {
        if (confirm('Yakin ingin keluar dari ronde ini?')) {
          this.endGameCleanup();
          this.showScreen('screen-menu');
        }
      });

      // Result
      this.btnPlayAgain.addEventListener('click', () => this.voteToPlayAgain());
      this.btnShareResult.addEventListener('click', () => this.shareResult());
      this.btnResultMenu.addEventListener('click', () => {
        this.endGameCleanup();
        this.showScreen('screen-menu');
      });

      // Disconnect overlay
      this.btnDisconnectMenu.addEventListener('click', () => {
        this.disconnectOverlay.classList.remove('active');
        this.endGameCleanup();
        this.showScreen('screen-menu');
      });
      this.btnDisconnectRejoin?.addEventListener('click', () => {
        const roomCode = this.displayRoomCode?.textContent?.trim();
        this.disconnectOverlay.classList.remove('active');
        if (roomCode && /^[A-Z0-9]{6}$/.test(roomCode)) {
          this.joinRoomByCode(roomCode);
        } else {
          this.showToast('Kode room tidak tersedia. Kembali ke lobby untuk bergabung lagi.');
          this.showScreen('screen-lobby');
        }
      });

      // Keyboard input (Physical / Desktop)
      window.addEventListener('keydown', (e) => this.handleKeyDown(e));

      // Mobile native keyboard input (using space placeholder trick for Android Gboard Backspace support)
      if (this.virtualKeyboardInput) {
        this.virtualKeyboardInput.value = ' ';
        this.virtualKeyboardInput.addEventListener('input', () => {
          const val = this.virtualKeyboardInput.value;
          if (val.length > 1) {
            // Huruf diketik
            const char = val.slice(-1).toUpperCase();
            if (/^[A-Z]$/.test(char)) {
              this.enterLetter(char);
            }
          } else if (val.length === 0) {
            // Placeholder terhapus -> Backspace!
            this.handleBackspace();
          }
          this.virtualKeyboardInput.value = ' ';
        });

        this.virtualKeyboardInput.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace') {
            e.preventDefault();
            e.stopPropagation();
            this.handleBackspace();
          }
        });
      }

      // Active Clue Tap & Modal
      if (this.badgeClueDir) {
        this.badgeClueDir.style.cursor = 'pointer';
        this.badgeClueDir.title = 'Ketuk untuk ganti arah';
        this.badgeClueDir.addEventListener('click', () => this.toggleActiveDirection());
      }
      if (this.btnCloseClues) this.btnCloseClues.addEventListener('click', () => this.closeCluesModal());
      if (this.cluesModal) {
        this.cluesModal.addEventListener('click', (e) => {
          if (e.target === this.cluesModal) this.closeCluesModal();
        });
      }

      // Responsive grid scaling on window resize & mobile visualViewport (saat keyboard muncul)
      const onViewportResize = () => {
        if (this.puzzle && this.gridContainer) {
          this._adjustGridCellSize();
          if (this.activeCell) {
            const focusedEl = document.querySelector(`.grid-cell[data-r="${this.activeCell.r}"][data-c="${this.activeCell.c}"]`);
            if (focusedEl) {
              focusedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            }
          }
        }
      };

      window.addEventListener('resize', onViewportResize);
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onViewportResize);
      }
    }

    showScreen(screenId) {
      const screens = [
        this.screenMenu,
        this.screenLobby,
        this.screenRoom,
        this.screenGame,
        this.screenResult
      ];
      screens.forEach(s => s.classList.remove('active'));

      document.body.classList.toggle('in-game', screenId === 'screen-game');

      const target = document.getElementById(screenId);
      if (target) {
        target.classList.add('active');
        if (screenId === 'screen-game') {
          setTimeout(() => this._adjustGridCellSize(), 50);
        }
      }
    }

    showLoading(text = 'Menyiapkan puzzle...') {
      this.loadingText.textContent = text;
      this.loadingOverlay.classList.add('active');
    }

    hideLoading() {
      this.loadingOverlay.classList.remove('active');
    }

    showToast(message, duration = 2400) {
      this.toastEl.textContent = message;
      this.toastEl.classList.add('show');
      setTimeout(() => this.toastEl.classList.remove('show'), duration);
    }

    // ==========================================
    // 4. SOLO MODE
    // ==========================================
    async startSoloGame() {
      this.mode = 'solo';
      this.role = 'solo';
      this.selectedTheme = this.themeSelect.value;
      this.selectedDiff = this.diffSelect.value;
      this.selectedCount = parseInt(this.wordCountSelect?.value, 10) || 12;

      this.showLoading('Memuat puzzle dari AI...');
      try {
        const puzzleData = await this.fetchPuzzle(this.selectedTheme, this.selectedDiff, this.selectedCount);
        const generatedGrid = CrosswordGenerator.generate(puzzleData.words);

        if (!generatedGrid || generatedGrid.words.length < 3) {
          throw new Error('Gagal menyusun grid puzzle');
        }

        this.puzzle = {
          ...generatedGrid,
          theme: puzzleData.theme || 'Acak',
          difficulty: puzzleData.difficulty || 'medium',
          source: puzzleData.source
        };
        this.rememberPuzzleWords(this.selectedTheme || 'campuran', generatedGrid.words);

        this.hideLoading();
        this.initGameBoard();
        this.notifyIfFallback(puzzleData);
      } catch (err) {
        console.error('Error startSoloGame:', err);
        this.hideLoading();
        this.showToast('Gagal memuat puzzle. Coba lagi.');
      }
    }

    // ==========================================
    // 4.5 PROFIL NAMA & LEADERBOARD CO-OP
    // ==========================================
    ensurePlayerName(callback) {
      if (this.playerName && this.playerName.trim().length > 0) {
        if (this.lobbyPlayerNameDisplay) {
          this.lobbyPlayerNameDisplay.textContent = this.playerName;
        }
        if (window.MP) {
          window.MP.setPlayerName(this.playerName);
        }
        if (callback) callback();
        return;
      }

      // Tampilkan modal jika belum ada nama
      if (this.modalPlayerName) {
        this._nameOnboardingCallback = callback;
        if (this.modalNameTitle) this.modalNameTitle.textContent = 'Siapa Namamu?';
        if (this.modalNameDesc) this.modalNameDesc.textContent = 'Nama ini akan tampil di room dan papan peringkat bersama temanmu.';
        if (this.btnCancelProfileName) this.btnCancelProfileName.style.display = 'none';
        if (this.inputProfileName) this.inputProfileName.value = '';
        this.modalPlayerName.classList.add('active');
        setTimeout(() => this.inputProfileName?.focus(), 200);
      } else {
        this.playerName = 'Pemain ' + Math.floor(100 + Math.random() * 900);
        if (callback) callback();
      }
    }

    showEditPlayerNameModal() {
      if (!this.modalPlayerName) return;
      this._nameOnboardingCallback = null;
      if (this.modalNameTitle) this.modalNameTitle.textContent = 'Ubah Nama Panggilan';
      if (this.modalNameDesc) this.modalNameDesc.textContent = 'Perbarui nama yang tampil di room dan klasemen.';
      if (this.btnCancelProfileName) this.btnCancelProfileName.style.display = 'block';
      if (this.inputProfileName) {
        this.inputProfileName.value = this.playerName || '';
      }
      this.modalPlayerName.classList.add('active');
      setTimeout(() => this.inputProfileName?.focus(), 200);
    }

    savePlayerNameFromModal() {
      const input = (this.inputProfileName?.value || '').trim();
      if (!input) {
        this.showToast('Masukkan minimal 1 karakter untuk namamu!');
        return;
      }
      this.playerName = input.slice(0, 15);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('silangkata_player_name', this.playerName);
      }
      if (this.lobbyPlayerNameDisplay) {
        this.lobbyPlayerNameDisplay.textContent = this.playerName;
      }
      if (window.MP) {
        window.MP.setPlayerName(this.playerName);
      }
      this.modalPlayerName.classList.remove('active');
      this.showToast(`Halo, ${this.playerName}! Siap bermain.`);

      const cb = this._nameOnboardingCallback;
      this._nameOnboardingCallback = null;
      if (cb) cb();
    }

    hidePlayerNameModal() {
      if (this.modalPlayerName) {
        this.modalPlayerName.classList.remove('active');
      }
      this._nameOnboardingCallback = null;
    }

    openCoopLobby() {
      this.ensurePlayerName(() => {
        if (this.lobbyPlayerNameDisplay) {
          this.lobbyPlayerNameDisplay.textContent = this.playerName;
        }
        this.showScreen('screen-lobby');
      });
    }

    handleGuestReadyToggle() {
      if (!window.MP || window.MP.isHost) return;
      const nextState = !window.MP.isReady;
      window.MP.setReady(nextState);

      if (this.btnReadyCoop) {
        if (nextState) {
          this.btnReadyCoop.className = 'btn btn-secondary btn-ready-action is-ready';
          this.btnReadyCoop.textContent = 'Batalkan siap';
          this.showToast('Kamu berstatus SIAP! Menunggu Host memulai permainan.');
        } else {
          this.btnReadyCoop.className = 'btn btn-secondary btn-ready-action';
          this.btnReadyCoop.textContent = 'Saya siap bermain';
          this.showToast('Status siap dibatalkan.');
        }
      }
      sound.playPop();
    }

    renderLeaderboardList(containerEl) {
      if (!containerEl) return;
      containerEl.innerHTML = '';

      const myNum = window.MP ? window.MP.playerNum : 1;
      const list = Array.from(this.coopScores.values());
      // Urutkan berdasarkan skor tertinggi, lalu kata terbanyak
      list.sort((a, b) => (b.score - a.score) || (b.wordsSolved - a.wordsSolved));

      const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣'];

      list.forEach((player, idx) => {
        const itemEl = document.createElement('div');
        itemEl.className = `leaderboard-item rank-${idx + 1} ${player.playerNum === myNum ? 'is-me' : ''}`;

        const leftEl = document.createElement('div');
        leftEl.className = 'leaderboard-left';

        const rankEl = document.createElement('span');
        rankEl.className = 'leaderboard-rank';
        rankEl.textContent = medals[idx] || `${idx + 1}`;

        const nameBoxEl = document.createElement('div');
        nameBoxEl.className = 'leaderboard-name-box';

        const nameEl = document.createElement('span');
        nameEl.className = 'leaderboard-name';
        nameEl.textContent = (player.playerNum === myNum) ? `👤 ${player.name} (Kamu)` : `👥 ${player.name}`;

        const metaEl = document.createElement('span');
        metaEl.className = `leaderboard-meta ${player.connected === false ? 'player-offline' : ''}`;
        const presence = player.connected === false ? ' • ⚫ Terputus' : '';
        metaEl.textContent = `${player.wordsSolved || 0} Kata terjawab • ${player.hintsUsed || 0} Petunjuk${presence}`;

        nameBoxEl.appendChild(nameEl);
        nameBoxEl.appendChild(metaEl);
        leftEl.appendChild(rankEl);
        leftEl.appendChild(nameBoxEl);

        const rightEl = document.createElement('div');
        rightEl.className = 'leaderboard-right';
        rightEl.style.display = 'flex';
        rightEl.style.alignItems = 'center';
        rightEl.style.gap = '8px';

        const scoreEl = document.createElement('span');
        scoreEl.className = 'leaderboard-score';
        scoreEl.textContent = `${player.score || 0} pts`;
        rightEl.appendChild(scoreEl);

        const currentHostNum = window.MP ? (window.MP.hostPlayerNum || 1) : 1;
        const amIHost = (myNum === currentHostNum);

        if (containerEl === this.liveLeaderboardList && amIHost && player.playerNum !== myNum) {
          const btnTransfer = document.createElement('button');
          btnTransfer.className = 'btn-slot-action btn-transfer';
          btnTransfer.title = `Pindahkan Host ke ${player.name}`;
          btnTransfer.innerHTML = '👑';
          btnTransfer.onclick = (e) => {
            e.stopPropagation();
            this.confirmTransferHost(player.playerNum, player.name);
            this.hideLiveLeaderboardModal();
          };

          const btnKick = document.createElement('button');
          btnKick.className = 'btn-slot-action btn-kick';
          btnKick.title = `Keluarkan ${player.name}`;
          btnKick.innerHTML = '🚫';
          btnKick.onclick = (e) => {
            e.stopPropagation();
            this.confirmKickPlayer(player.playerNum, player.name);
            this.hideLiveLeaderboardModal();
          };

          rightEl.appendChild(btnTransfer);
          rightEl.appendChild(btnKick);
        }

        itemEl.appendChild(leftEl);
        itemEl.appendChild(rightEl);
        containerEl.appendChild(itemEl);
      });
    }

    confirmTransferHost(targetPlayerNum, targetName) {
      if (!window.MP) return;
      const ok = window.confirm(`Pindahkan kepemilikan Host room kepada ${targetName || ('Pemain ' + targetPlayerNum)}?`);
      if (ok) {
        window.MP.transferHost(targetPlayerNum);
        this.showToast(`👑 ${targetName || ('Pemain ' + targetPlayerNum)} sekarang menjadi Host room!`);
      }
    }

    confirmKickPlayer(targetPlayerNum, targetName) {
      if (!window.MP) return;
      const ok = window.confirm(`Keluarkan ${targetName || ('Pemain ' + targetPlayerNum)} dari room?`);
      if (ok) {
        window.MP.kickPlayer(targetPlayerNum);
        this.showToast(`🚫 ${targetName || ('Pemain ' + targetPlayerNum)} telah dikeluarkan dari room.`);
      }
    }

    // ==========================================
    // 4b. ROOM SETTINGS (EDIT MODE)
    // ==========================================
    _themeLabel(val) {
      const m = { '': 'Campuran', umum: 'Umum', ipa: 'IPA', ips: 'IPS', hewan: 'Hewan', buah: 'Buah', makanan: 'Makanan', transportasi: 'Transport', teknologi: 'Teknologi', olahraga: 'Olahraga' };
      return m[val] || 'Campuran';
    }
    _diffLabel(val) {
      const m = { easy: 'Mudah', medium: 'Sedang', hard: 'Sulit' };
      return m[val] || 'Sedang';
    }

    updateRoomSettingsDisplay() {
      if (!this.roomSettingsSummary) return;
      this.roomSettingsSummary.innerHTML = '';
      const tags = [
        `🏷️ ${this._themeLabel(this.selectedTheme)}`,
        `📝 ${this.selectedCount} Soal`,
        `⚡ ${this._diffLabel(this.selectedDiff)}`
      ];
      tags.forEach(t => {
        const span = document.createElement('span');
        span.className = 'setting-tag';
        span.textContent = t;
        this.roomSettingsSummary.appendChild(span);
      });

      // Tombol edit hanya tampil jika saya host
      const currentHostNum = window.MP ? (window.MP.hostPlayerNum || 1) : 1;
      const myNum = window.MP ? window.MP.playerNum : 1;
      if (this.btnEditRoomSettings) {
        this.btnEditRoomSettings.style.display = (myNum === currentHostNum) ? 'inline-block' : 'none';
      }
    }

    openRoomSettingsModal() {
      if (!this.modalRoomSettingsOverlay) return;
      if (this.roomThemeSelect) this.roomThemeSelect.value = this.selectedTheme;
      if (this.roomCountSelect) this.roomCountSelect.value = this.selectedCount;
      if (this.roomDiffSelect) this.roomDiffSelect.value = this.selectedDiff;
      this.modalRoomSettingsOverlay.classList.add('active');
    }

    closeRoomSettingsModal() {
      if (this.modalRoomSettingsOverlay) this.modalRoomSettingsOverlay.classList.remove('active');
    }

    saveRoomSettings() {
      this.selectedTheme = this.roomThemeSelect ? this.roomThemeSelect.value : '';
      this.selectedCount = parseInt(this.roomCountSelect?.value, 10) || 12;
      this.selectedDiff = this.roomDiffSelect ? this.roomDiffSelect.value : 'medium';
      this.updateRoomSettingsDisplay();
      this.closeRoomSettingsModal();
      this.showToast('✅ Pengaturan room diperbarui!');

      // Broadcast ke semua pemain
      if (window.MP) {
        window.MP.send({
          type: 'room-settings-update',
          theme: this.selectedTheme,
          count: this.selectedCount,
          diff: this.selectedDiff
        });
      }
    }

    showLiveLeaderboardModal() {
      if (!this.modalLiveLeaderboard) return;
      this.renderLeaderboardList(this.liveLeaderboardList);
      this.modalLiveLeaderboard.classList.add('active');
    }

    hideLiveLeaderboardModal() {
      if (!this.modalLiveLeaderboard) return;
      this.modalLiveLeaderboard.classList.remove('active');
    }

    // ==========================================
    // 5. CO-OP MULTIPLAYER FLOW
    // ==========================================
    async handleCreateRoom() {
      this.ensurePlayerName(async () => {
        this.mode = 'coop';
        this.role = 'coop';
        this.partnerCursors = new Map();
        this.selectedTheme = this.themeSelect.value;
        this.selectedDiff = this.diffSelect.value;
        this.selectedCount = parseInt(this.wordCountSelect?.value, 10) || 12;

        const maxPlayers = parseInt(this.selectMaxPlayers?.value, 10) || 2;
        const code = window.MP.generateRoomCode();
        this.displayRoomCode.textContent = code;
        if (this.btnShareLink) this.btnShareLink.disabled = true;
        if (this.btnCopyCode) this.btnCopyCode.disabled = true;

        if (window.MP) {
          window.MP.setPlayerName(this.playerName);
        }

        // Inisialisasi visual slot pemain di layar room
        this.renderRoomPlayerSlots([{ playerNum: 1, isHost: true, name: this.playerName, isReady: true }], maxPlayers, true);
        this.updateRoomSettingsDisplay();
        this.showScreen('screen-room');

        window.MP.initHost(
          code,
          maxPlayers,
          // onReady
          (readyCode, capacity) => {
            this.displayRoomCode.textContent = readyCode;
            if (this.btnShareLink) this.btnShareLink.disabled = false;
            if (this.btnCopyCode) this.btnCopyCode.disabled = false;
            this.renderRoomPlayerSlots(window.MP.getPlayerList(), capacity, true);
            this.showToast('Room online! Bagikan tautan ke temanmu.');
          },
          // onPlayerListUpdate
          (players, capacity) => {
            this.renderRoomPlayerSlots(players, capacity, true);
            if (players.length >= 2) {
              const lastPlayer = players[players.length - 1];
              this.showToast(`👥 ${lastPlayer.name || ('Pemain ' + lastPlayer.playerNum)} bergabung! (${players.length}/${capacity})`);
            }
          },
          // onMessage
          (data) => this.handleMultiplayerMessage(data),
          // onDisconnected
          () => this.handlePartnerDisconnected(),
          // onError
          (err) => {
            this.hideLoading();
            this.showConnectionError(err, code, true);
          },
          // onMidGameJoin (Khusus jika ada pemain masuk saat game sudah berlangsung)
          (connection, assignedNum, guestName) => {
            if (!this.puzzle || this.isGameOver) return;
            console.log(`[MP Host] Menyinkronkan game state ke Pemain ${assignedNum} (${guestName})...`);

            if (!this.coopScores.has(assignedNum)) {
              this.coopScores.set(assignedNum, {
                playerNum: assignedNum,
                name: guestName || `Pemain ${assignedNum}`,
                score: 0,
                wordsSolved: 0,
                hintsUsed: 0,
                connected: true
              });
            } else {
              const playerInfo = this.coopScores.get(assignedNum);
              playerInfo.name = guestName || playerInfo.name;
              playerInfo.connected = true;
            }

            try {
              connection.send({
                type: 'syncGameState',
                puzzle: this.puzzle,
                userGrid: this.userGrid,
                cellSources: this.cellSources,
                hintedCells: this.hintedCells,
                elapsedSeconds: this.elapsedSeconds,
                leaderboard: Array.from(this.coopScores.entries()),
                playerNum: assignedNum
              });
            } catch (e) {
              console.warn('[MP Host] Gagal sync state ke rejoining guest:', e);
            }

            this.showToast(`🎉 ${guestName || ('Pemain ' + assignedNum)} bergabung ke permainan!`);
            this.setPartnerStatus('connected');
          }
        );
      });
    }

    renderRoomPlayerSlots(players = [], maxPlayers = 2, isHost = false) {
      if (!this.roomPlayerSlots) return;
      this.roomPlayerSlots.innerHTML = '';

      const playerMap = new Map();
      players.forEach(p => playerMap.set(p.playerNum, p));

      const currentHostNum = window.MP ? (window.MP.hostPlayerNum || 1) : (isHost ? 1 : 1);
      const myPlayerNum = window.MP ? window.MP.playerNum : (isHost ? 1 : 2);
      const amIHost = (myPlayerNum === currentHostNum);

      for (let i = 1; i <= maxPlayers; i++) {
        const slotEl = document.createElement('div');
        slotEl.className = 'player-slot';

        const pData = playerMap.get(i);
        const isFilled = Boolean(pData);
        const isMe = (i === myPlayerNum);
        const isSlotHost = (i === currentHostNum);

        const leftEl = document.createElement('div');
        leftEl.className = 'player-slot-left';

        const dotEl = document.createElement('span');
        dotEl.className = `player-dot ${isFilled ? 'p' + i : 'waiting'}`;

        const nameEl = document.createElement('span');
        nameEl.className = 'player-name';

        let displayName = pData?.name || `Pemain ${i}`;
        let nameLabel = '';
        if (isSlotHost) {
          nameLabel = isMe ? `👑 ${displayName} (Host/Kamu)` : `👑 ${displayName} (Host)`;
        } else if (isFilled) {
          nameLabel = isMe ? `👤 ${displayName} (Kamu)` : `👥 ${displayName}`;
        } else {
          nameLabel = `👥 Pemain ${i}`;
        }
        nameEl.textContent = nameLabel;

        leftEl.appendChild(dotEl);
        leftEl.appendChild(nameEl);

        const rightEl = document.createElement('div');
        rightEl.className = 'player-slot-right';

        const badgeEl = document.createElement('span');
        if (!isFilled) {
          badgeEl.className = 'badge badge-waiting';
          badgeEl.textContent = 'MENUNGGU...';
        } else if (isSlotHost) {
          badgeEl.className = 'badge badge-host';
          badgeEl.textContent = '👑 HOST';
        } else if (pData.isReady) {
          badgeEl.className = 'badge badge-ready';
          badgeEl.textContent = '✅ SIAP';
        } else {
          badgeEl.className = 'badge badge-unready';
          badgeEl.textContent = '⏳ BELUM SIAP';
        }
        rightEl.appendChild(badgeEl);

        if (amIHost && isFilled && !isMe) {
          const btnTransfer = document.createElement('button');
          btnTransfer.className = 'btn-slot-action btn-transfer';
          btnTransfer.title = `Pindahkan Host ke ${displayName}`;
          btnTransfer.innerHTML = '👑';
          btnTransfer.onclick = (e) => {
            e.stopPropagation();
            this.confirmTransferHost(i, displayName);
          };

          const btnKick = document.createElement('button');
          btnKick.className = 'btn-slot-action btn-kick';
          btnKick.title = `Keluarkan ${displayName}`;
          btnKick.innerHTML = '🚫';
          btnKick.onclick = (e) => {
            e.stopPropagation();
            this.confirmKickPlayer(i, displayName);
          };

          rightEl.appendChild(btnTransfer);
          rightEl.appendChild(btnKick);
        }

        slotEl.appendChild(leftEl);
        slotEl.appendChild(rightEl);
        this.roomPlayerSlots.appendChild(slotEl);
      }

      const guests = players.filter(p => p.playerNum !== currentHostNum);
      const allGuestsReady = guests.length > 0 && guests.every(p => p.isReady);

      // Tombol Mulai Permainan (Khusus Host)
      if (this.btnStartCoop) {
        if (amIHost) {
          this.btnStartCoop.style.display = 'block';
          if (guests.length === 0) {
            this.btnStartCoop.disabled = true;
            this.btnStartCoop.textContent = `Menunggu teman bergabung (1/${maxPlayers})`;
          } else if (!allGuestsReady) {
            const readyCount = guests.filter(p => p.isReady).length;
            this.btnStartCoop.disabled = true;
            this.btnStartCoop.textContent = `Menunggu semua siap (${readyCount}/${guests.length} siap)`;
          } else {
            this.btnStartCoop.disabled = false;
            this.btnStartCoop.textContent = `Mulai permainan sekarang (${players.length}/${maxPlayers})`;
          }
        } else {
          this.btnStartCoop.style.display = 'none';
        }
      }

      // Tombol Siap (Khusus Guest)
      if (this.btnReadyCoop) {
        if (!amIHost) {
          this.btnReadyCoop.style.display = 'block';
          const myData = playerMap.get(myPlayerNum);
          const isMyReady = myData ? myData.isReady : (window.MP ? window.MP.isReady : false);
          if (isMyReady) {
            this.btnReadyCoop.className = 'btn btn-secondary btn-ready-action is-ready';
            this.btnReadyCoop.textContent = 'Batalkan siap';
          } else {
            this.btnReadyCoop.className = 'btn btn-secondary btn-ready-action';
            this.btnReadyCoop.textContent = 'Saya siap bermain';
          }
        } else {
          this.btnReadyCoop.style.display = 'none';
        }
      }

      this.updateRoomSettingsDisplay();
    }

    async handleHostStartGame() {
      if (this.isStartingCoopGame ||
          (this.screenGame?.classList.contains('active') && !this.isGameOver)) return;

      const players = window.MP ? window.MP.getPlayerList() : [];
      if (players.length < 2) {
        this.showToast('Tunggu minimal 1 pemain lain bergabung!');
        return;
      }

      const currentHost = window.MP ? (window.MP.hostPlayerNum || 1) : 1;
      const guests = players.filter(p => p.playerNum !== currentHost);
      const allReady = guests.length > 0 && guests.every(p => p.isReady);
      if (!allReady) {
        const readyCount = guests.filter(p => p.isReady).length;
        this.showToast(`Tunggu semua pemain siap (${readyCount}/${guests.length} Siap)!`);
        return;
      }

      this.isStartingCoopGame = true;
      if (this.btnPlayAgain) this.btnPlayAgain.disabled = true;
      try {
        // Jika pemain ini adalah Host ruangan tetapi bukan Host jaringan (Network Host/Peer P1)
        if (window.MP && !window.MP.isHost) {
          window.MP.send({ type: 'request-start-game' });
          this.showLoading('Meminta room memulai permainan...');
          return;
        }

        this.showLoading('Menyiapkan puzzle kolaboratif...');
        const puzzleData = await this.fetchPuzzle(this.selectedTheme, this.selectedDiff, this.selectedCount);
        const generatedGrid = CrosswordGenerator.generate(puzzleData.words);

        this.puzzle = {
          ...generatedGrid,
          theme: puzzleData.theme || 'Acak',
          difficulty: puzzleData.difficulty || 'medium',
          source: puzzleData.source
        };
        this.rememberPuzzleWords(this.selectedTheme || 'campuran', generatedGrid.words);

        if (window.MP) {
          window.MP.isGameInProgress = true;
        }

        // Inisialisasi coopScores
        this.coopScores.clear();
        players.forEach(p => {
          this.coopScores.set(p.playerNum, {
            playerNum: p.playerNum,
            name: p.name || `Pemain ${p.playerNum}`,
            score: 0,
            wordsSolved: 0,
            hintsUsed: 0,
            connected: true
          });
        });

        // Kirim puzzle baru ke room yang sama untuk memulai ronde dari awal.
        window.MP.send({
          type: 'init',
          puzzle: this.puzzle,
          players: players
        });

        this.hideLoading();
        this.initGameBoard();
        this.notifyIfFallback(puzzleData);
      } catch (err) {
        console.error('Gagal memulai ronde co-op baru:', err);
        if (window.MP) {
          window.MP.isGameInProgress = false;
        }
        this.hideLoading();
        this.showToast('Gagal menyiapkan ronde baru. Coba lagi.');
      } finally {
        this.isStartingCoopGame = false;
        if (this.btnPlayAgain) this.btnPlayAgain.disabled = false;
      }
    }

    voteToPlayAgain() {
      if (this.mode !== 'coop' || !window.MP || this.hasVotedPlayAgain || this.playAgainTransitionStarted) return;
      if (!window.MP.isConnected) {
        this.showToast('Koneksi room terputus. Tidak dapat meminta main lagi.');
        return;
      }

      this.hasVotedPlayAgain = true;
      const myNum = window.MP.playerNum;
      this.playAgainVotes.add(myNum);
      this.updatePlayAgainStatus();
      if (this.btnPlayAgain) this.btnPlayAgain.disabled = true;

      if (window.MP.isHost) {
        this.registerPlayAgainVote(myNum);
      } else {
        window.MP.send({ type: 'play-again-vote' });
      }
    }

    updatePlayAgainStatus(votes = this.playAgainVotes) {
      const players = window.MP ? window.MP.getPlayerList() : [];
      const connectedPlayerNums = new Set(players.map(player => player.playerNum));
      this.playAgainVotes = new Set([...votes].filter(playerNum => connectedPlayerNums.has(playerNum)));
      const total = players.length;
      const count = this.playAgainVotes.size;
      if (this.playAgainStatus) {
        this.playAgainStatus.textContent = `${count}/${total} orang ingin main lagi!`;
        this.playAgainStatus.style.display = this.mode === 'coop' ? 'block' : 'none';
      }
      if (this.btnPlayAgain) {
        this.btnPlayAgain.disabled = this.hasVotedPlayAgain || this.playAgainTransitionStarted;
      }
    }

    registerPlayAgainVote(playerNum) {
      if (!window.MP?.isHost || this.playAgainTransitionStarted) return;
      const connectedPlayerNums = new Set(window.MP.getPlayerList().map(player => player.playerNum));
      if (!connectedPlayerNums.has(playerNum)) return;

      this.playAgainVotes.add(playerNum);
      this.updatePlayAgainStatus();
      const votes = [...this.playAgainVotes];
      window.MP.send({ type: 'play-again-status', votes });

      if (votes.length === connectedPlayerNums.size) {
        this.playAgainTransitionStarted = true;
        window.MP.resetReadyStates();
        window.MP.isGameInProgress = false;
        window.MP.send({ type: 'play-again-approved' });
        this.enterRoomAfterPlayAgain();
      }
    }

    enterRoomAfterPlayAgain() {
      if (this.playAgainTransitionStarted && this.screenRoom?.classList.contains('active')) return;
      this.playAgainTransitionStarted = true;
      this.isGameOver = true;
      this.stopTimer();
      this.hasVotedPlayAgain = false;
      this.playAgainVotes.clear();
      if (this.btnPlayAgain) this.btnPlayAgain.disabled = false;
      if (this.playAgainStatus) this.playAgainStatus.style.display = 'none';
      if (window.MP) window.MP.isGameInProgress = false;
      this.renderRoomPlayerSlots(
        window.MP ? window.MP.getPlayerList() : [],
        window.MP ? window.MP.maxPlayers : 2,
        window.MP?.isCurrentHost()
      );
      this.showScreen('screen-room');
    }

    handleJoinRoom() {
      let raw = (this.inputRoomCode?.value || '').trim();
      // Ekstrak 6 karakter kode room jika user menempelkan (paste) seluruh tautan/URL
      const match = raw.match(/[?#&](?:room|join)=([A-Za-z0-9]{6})/i) || raw.match(/([A-Za-z0-9]{6})/);
      const code = match ? match[1].toUpperCase() : raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

      if (code.length !== 6) {
        this.showToast('Masukkan 6 karakter kode room');
        return;
      }
      if (this.inputRoomCode) this.inputRoomCode.value = code;
      this.ensurePlayerName(() => this.joinRoomByCode(code));
    }

    joinRoomByCode(code) {
      const cleanCode = (code || '').toUpperCase().trim();
      if (!cleanCode || cleanCode.length !== 6) return;

      this.mode = 'coop';
      this.role = 'coop';
      this.partnerCursors = new Map();
      this.showLoading('Menghubungi room ' + cleanCode + '...');

      if (window.MP) {
        window.MP.setPlayerName(this.playerName);
      }

      window.MP.initGuest(
        cleanCode,
        // onConnected
        (welcomeData) => {
          this.hideLoading();
          this.displayRoomCode.textContent = cleanCode;
          if (this.btnShareLink) this.btnShareLink.disabled = false;
          if (this.btnCopyCode) this.btnCopyCode.disabled = false;
          if (welcomeData && welcomeData.roomSettings) {
            this.selectedTheme = welcomeData.roomSettings.theme !== undefined ? welcomeData.roomSettings.theme : '';
            this.selectedCount = welcomeData.roomSettings.count || 12;
            this.selectedDiff = welcomeData.roomSettings.diff || 'medium';
          }
          this.updateRoomSettingsDisplay();
          this.renderRoomPlayerSlots(welcomeData.players, welcomeData.maxPlayers, false);
          this.showScreen('screen-room');
          this.showToast(`Berhasil gabung sebagai ${this.playerName || ('Pemain ' + welcomeData.playerNum)}! Klik SIAP untuk bermain.`);
        },
        // onPlayerListUpdate
        (players, capacity) => {
          this.renderRoomPlayerSlots(players, capacity, false);
        },
        // onMessage
        (data) => this.handleMultiplayerMessage(data),
        // onDisconnected
        () => this.handlePartnerDisconnected(),
        // onError
        (err) => {
          this.hideLoading();
          this.showConnectionError(err, cleanCode, false);
        }
      );
    }

    showConnectionError(err, cleanCode = '', isHost = false) {
      this.hideLoading();

      const errType = (err && err.type) ? String(err.type).toLowerCase() : 'unknown';
      let title = isHost ? 'Gagal Membuat Room' : 'Gagal Bergabung ke Room';
      let codeLabel = `ERR_${errType.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
      let description = '';
      let tips = [];

      switch (errType) {
        case 'peer-unavailable':
          title = 'Room Tidak Ditemukan';
          codeLabel = 'ERR_ROOM_NOT_FOUND';
          description = `Room dengan kode "${cleanCode || '------'}" tidak ditemukan di server atau Host telah keluar/menutup browser.`;
          tips = [
            'Pastikan kode room yang dimasukkan persis sama (6 karakter huruf & angka).',
            'Pastikan Host (temanmu) masih membuka layar room dan berstatus ONLINE.',
            'Jika Host baru saja membuat room, tunggu 2–3 detik lalu coba tekan "GABUNG ROOM" kembali.'
          ];
          break;

        case 'room-full':
          title = 'Kapasitas Room Sudah Penuh';
          codeLabel = 'ERR_ROOM_CAPACITY_FULL';
          description = `Room "${cleanCode}" sudah mencapai batas maksimal pemain yang ditentukan oleh Host.`;
          tips = [
            'Minta Host membuat room baru dengan kapasitas yang lebih besar (hingga 6 pemain).',
            'Tunggu hingga salah satu pemain meninggalkan room.'
          ];
          break;

        case 'ice-failed':
        case 'webrtc':
          title = 'Koneksi P2P Diblokir Jaringan';
          codeLabel = 'ERR_WEBRTC_ICE_BLOCKED';
          description = 'Jaringan internet yang kamu gunakan memblokir jalur komunikasi langsung (WebRTC/P2P) antar perangkat.';
          tips = [
            'Jika menggunakan WiFi kantor, kampus, atau sekolah, coba beralih ke paket data seluler.',
            'Nonaktifkan sementara VPN, AdBlocker, atau firewall ketat di HP/komputer.',
            'Gunakan browser standar (Chrome, Edge, Safari, Firefox) dan hindari peramban in-app medsos.'
          ];
          break;

        case 'offline':
          title = 'Perangkat Sedang Offline';
          codeLabel = 'ERR_NETWORK_OFFLINE';
          description = 'Tidak ada sambungan internet aktif yang terdeteksi di perangkatmu.';
          tips = [
            'Periksa kuota data seluler atau koneksi WiFi kamu.',
            'Coba matikan lalu nyalakan kembali Mode Pesawat (Airplane Mode) untuk menyegarkan sinyal.'
          ];
          break;

        case 'timeout':
          title = 'Waktu Tunggu Habis (Timeout)';
          codeLabel = 'ERR_CONNECTION_TIMEOUT';
          description = 'Waktu tunggu negosiasi room habis karena server lambat merespons atau sinyal lemah.';
          tips = [
            'Sinyal internet salah satu pemain mungkin sedang tidak stabil.',
            'Pastikan layar HP Host menyala dan tidak dalam mode sleep/background.',
            'Coba tekan tombol "GABUNG ROOM" sekali lagi.'
          ];
          break;

        case 'unavailable-id':
          title = 'Kode Room Bertabrakan';
          codeLabel = 'ERR_ROOM_ID_IN_USE';
          description = 'Kode room ini secara kebetulan sedang aktif digunakan oleh sesi lain.';
          tips = [
            'Kembali ke menu dan buat room baru untuk menghasilkan kode room acak yang baru.'
          ];
          break;

        default:
          title = isHost ? 'Gagal Membuka Room' : 'Kendala Koneksi Room';
          codeLabel = `ERR_${errType.toUpperCase()}`;
          description = (err && err.message)
            ? err.message
            : 'Terjadi kendala saat menghubungkan komunikasi antar pemain.';
          tips = [
            'Muat ulang (refresh) halaman lalu coba lagi.',
            'Gunakan tautan langsung (klik link share) daripada mengetik kode manual.',
            'Pastikan kedua perangkat memiliki koneksi internet aktif.'
          ];
      }

      this._renderErrorModal({ title, codeLabel, description, tips });
    }

    _renderErrorModal({ title, codeLabel, description, tips }) {
      if (this.modalErrorTitle) this.modalErrorTitle.textContent = title;
      if (this.modalErrorCode) this.modalErrorCode.textContent = `KODE: ${codeLabel}`;
      if (this.modalErrorDesc) this.modalErrorDesc.textContent = description;

      if (this.modalErrorTips) {
        this.modalErrorTips.innerHTML = '';
        tips.forEach(t => {
          const li = document.createElement('li');
          li.textContent = t;
          this.modalErrorTips.appendChild(li);
        });
      }

      if (this.modalConnError) {
        this.modalConnError.classList.add('active');
      } else {
        this.showToast(`${title}: ${description}`, 5000);
      }
    }

    checkUrlJoinParams() {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        let roomCode = (urlParams.get('room') || urlParams.get('join') || '').toUpperCase().trim();

        if (!roomCode && window.location.hash) {
          const hashMatch = window.location.hash.match(/[#&](?:room|join)=([A-Za-z0-9]{6})/i)
            || window.location.hash.match(/^#([A-Za-z0-9]{6})$/i);
          if (hashMatch) {
            roomCode = hashMatch[1].toUpperCase();
          }
        }

        if (roomCode && /^[A-Z0-9]{6}$/.test(roomCode)) {
          // Bersihkan URL bar tanpa reload agar tidak re-trigger saat halaman di-refresh
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);

          if (this.inputRoomCode) {
            this.inputRoomCode.value = roomCode;
          }

          // Otomatis langsung join ke room setelah memastikan nama pemain
          this.ensurePlayerName(() => this.joinRoomByCode(roomCode));
        }
      } catch (err) {
        console.warn('Error membaca parameter URL join room:', err);
      }
    }

    shareRoomLink() {
      const code = (this.displayRoomCode?.textContent || '').trim();
      if (!code || code === '------') {
        this.showToast('Kode room belum siap');
        return;
      }

      const shareUrl = new URL(window.location.href);
      shareUrl.searchParams.set('room', code);
      shareUrl.hash = '';
      const url = shareUrl.toString();
      const title = 'SilangKata — Main TTS Bareng!';
      const text = `Yuk main Teka-Teki Silang bareng aku di SilangKata! Klik tautan ini untuk langsung bergabung:`;

      if (navigator.share) {
        navigator.share({
          title,
          text,
          url
        }).catch((err) => {
          if (err && err.name !== 'AbortError') {
            this._copyTextToClipboard(url, 'Tautan room disalin ke clipboard!');
          }
        });
      } else {
        this._copyTextToClipboard(url, 'Tautan room disalin ke clipboard!');
      }
    }

    copyRoomCode() {
      const code = (this.displayRoomCode?.textContent || '').trim();
      if (!code || code === '------') return;
      this._copyTextToClipboard(code, 'Kode room disalin ke clipboard: ' + code);
    }

    _copyTextToClipboard(text, successMsg) {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
          this.showToast(successMsg);
        }).catch(() => {
          this._fallbackCopyText(text, successMsg);
        });
      } else {
        this._fallbackCopyText(text, successMsg);
      }
    }

    _fallbackCopyText(text, successMsg) {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        this.showToast(successMsg);
      } catch (_) {
        this.showToast('Gagal menyalin. Silakan salin manual.');
      }
      document.body.removeChild(textArea);
    }

    handleMultiplayerMessage(msg) {
      if (!msg || !msg.type) return;

      const pNum = msg.playerNum || 2;

      switch (msg.type) {
        case 'room-settings-update':
          if (msg.theme !== undefined) this.selectedTheme = msg.theme;
          if (msg.count !== undefined) this.selectedCount = msg.count;
          if (msg.diff !== undefined) this.selectedDiff = msg.diff;
          this.updateRoomSettingsDisplay();
          this.showToast(`⚙️ Pengaturan diubah: ${this._themeLabel(this.selectedTheme)} • ${this.selectedCount} Soal • ${this._diffLabel(this.selectedDiff)}`);
          break;

        case 'play-again-vote':
          if (window.MP?.isHost) {
            this.registerPlayAgainVote(pNum);
          }
          break;

        case 'play-again-status':
          if (!window.MP?.isHost) {
            this.updatePlayAgainStatus(Array.isArray(msg.votes) ? msg.votes : []);
          }
          break;

        case 'play-again-approved':
          if (window.MP && !window.MP.isHost) {
            window.MP.resetReadyStates();
            this.enterRoomAfterPlayAgain();
          }
          break;

        case 'init':
          // Diterima guest saat puzzle siap
          this.puzzle = msg.puzzle;
          this.rememberPuzzleWords(this.puzzle.theme || this.selectedTheme || 'campuran', this.puzzle.words);
          this.hideLoading();
          this.coopScores.clear();
          if (msg.players && Array.isArray(msg.players)) {
            msg.players.forEach(p => {
              this.coopScores.set(p.playerNum, {
                playerNum: p.playerNum,
                name: p.name || `Pemain ${p.playerNum}`,
                score: 0,
                wordsSolved: 0,
                hintsUsed: 0
              });
            });
          }
          this.initGameBoard();
          this.notifyIfFallback(this.puzzle);
          break;

        case 'syncGameState':
          // Rejoin / Mid-game join synchronization
          this.puzzle = msg.puzzle;
          this.rememberPuzzleWords(this.puzzle.theme || this.selectedTheme || 'campuran', this.puzzle.words);
          this.hideLoading();
          this.userGrid = msg.userGrid || {};
          this.cellSources = msg.cellSources || {};
          this.hintedCells = msg.hintedCells || {};
          this.elapsedSeconds = msg.elapsedSeconds || 0;
          this.coopScores.clear();
          if (msg.leaderboard && Array.isArray(msg.leaderboard)) {
            msg.leaderboard.forEach(([k, v]) => this.coopScores.set(Number(k), v));
          }
          this.initGameBoard(true); // true = restore state
          this.showToast('🚀 Terhubung ke permainan yang sedang berlangsung!');
          break;

        case 'letter': {
          // Update huruf dari partner
          const key = `${msg.r}-${msg.c}`;
          if (this.isCellHinted(msg.r, msg.c) && !msg.isHint) break;
          this.userGrid[key] = msg.letter;
          const senderNum = msg.playerNum || pNum;
          if (msg.letter) {
            this.cellSources[key] = senderNum;
          } else {
            delete this.cellSources[key];
          }
          if (msg.isHint) {
            this.hintedCells[key] = true;
          }
          this.updateCellVisual(msg.r, msg.c);
          // Tidak memanggil checkWordsStatus(true): penilaian kata hanya via 'wordSolved'
          const currentCursor = this.partnerCursors.get(pNum) || {};
          this.partnerCursors.set(pNum, {
            r: msg.r,
            c: msg.c,
            dir: msg.dir || currentCursor.dir || 'across'
          });
          this.renderPartnerCursors();
          this.setPartnerStatus('typing', pNum);
          setTimeout(() => this.setPartnerStatus('connected'), 1200);
          break;
        }

        case 'cursor':
          // Update posisi kursor dan kata yang sedang diisi partner
          this.partnerCursors.set(pNum, { r: msg.r, c: msg.c, dir: msg.dir });
          this.renderPartnerCursors();
          break;

        case 'player-disconnected': {
          this.partnerCursors.delete(pNum);
          this.renderPartnerCursors();
          const dName = msg.name || `Pemain ${pNum}`;
          const playerInfo = this.coopScores.get(pNum) || {
            playerNum: pNum,
            name: dName,
            score: 0,
            wordsSolved: 0,
            hintsUsed: 0
          };
          playerInfo.name = dName;
          playerInfo.connected = false;
          this.coopScores.set(pNum, playerInfo);
          if (window.MP?.isHost) {
            this.updatePlayAgainStatus();
            window.MP.send({ type: 'play-again-status', votes: [...this.playAgainVotes] });
            const connectedPlayers = window.MP.getPlayerList();
            if (this.playAgainVotes.size === connectedPlayers.length && connectedPlayers.length > 0) {
              this.registerPlayAgainVote(connectedPlayers[0].playerNum);
            }
          }
          this.showToast(`⚠️ ${dName} terputus dari permainan. Ia dapat bergabung kembali dengan kode room.`);
          this.setPartnerStatus('connected');
          if (this.modalLiveLeaderboard?.classList.contains('active')) {
            this.renderLeaderboardList(this.liveLeaderboardList);
          }
          if (this.resultCoopLeaderboard?.style.display !== 'none') {
            this.renderLeaderboardList(this.resultLeaderboardList);
          }
          break;
        }

        case 'player-reconnected': {
          this.partnerCursors.delete(pNum);
          this.renderPartnerCursors();
          const rName = msg.name || `Pemain ${pNum}`;
          const playerInfo = this.coopScores.get(pNum) || {
            playerNum: pNum,
            name: rName,
            score: 0,
            wordsSolved: 0,
            hintsUsed: 0
          };
          playerInfo.name = rName;
          playerInfo.connected = true;
          this.coopScores.set(pNum, playerInfo);
          this.showToast(`✅ ${rName} bergabung kembali ke permainan.`);
          this.setPartnerStatus('connected');
          if (this.modalLiveLeaderboard?.classList.contains('active')) {
            this.renderLeaderboardList(this.liveLeaderboardList);
          }
          break;
        }

        case 'wordSolved': {
          // Update kata yang dipecahkan partner
          if (this.puzzle && this.puzzle.words[msg.wordIdx]) {
            const solvedWord = this.puzzle.words[msg.wordIdx];
            const solverNum = msg.solverNum || pNum;
            const solverName = msg.solverName || `Pemain ${solverNum}`;

            // Pastikan semua huruf kata yang terpecahkan langsung terisi di userGrid
            for (let i = 0; i < solvedWord.word.length; i++) {
              const r = solvedWord.dir === 'across' ? solvedWord.row : solvedWord.row + i;
              const c = solvedWord.dir === 'across' ? solvedWord.col + i : solvedWord.col;
              const wKey = `${r}-${c}`;
              this.userGrid[wKey] = solvedWord.word[i];
              this.cellSources[wKey] = solverNum;
              this.updateCellVisual(r, c);
            }

            if (!solvedWord.solved) {
              solvedWord.solved = true;
              const sInfo = this.coopScores.get(solverNum) || {
                playerNum: solverNum,
                name: solverName,
                score: 0,
                wordsSolved: 0,
                hintsUsed: 0
              };
              const completionBonus = Number(msg.completionBonus) || 0;
              sInfo.score += 100 + completionBonus;
              sInfo.wordsSolved += 1;
              this.coopScores.set(solverNum, sInfo);

              const myNum = window.MP ? window.MP.playerNum : 1;
              if (solverNum === myNum) {
                this.score = sInfo.score;
                this.wordsSolvedCount = sInfo.wordsSolved;
                this.completionBonus = completionBonus;
                this.hudScore.textContent = this.score;
              }
            }

            this.showToast(`✨ ${solverName} berhasil menjawab "${solvedWord.word}"! (+100)`);
          }
          sound.playCorrect();
          triggerHaptic([40, 40, 80]);
          this.refreshSolvedVisuals();
          if (this.modalLiveLeaderboard?.classList.contains('active')) {
            this.renderLeaderboardList(this.liveLeaderboardList);
          }

          // Cek apakah semua kata sudah tuntas
          if (this.puzzle && this.puzzle.words.every(w => w.solved) && !this.isGameOver) {
            this.showResult(true);
          }
          break;
        }

        case 'hintUsed': {
          const hNum = msg.playerNum || pNum;
          const hName = msg.playerName || `Pemain ${hNum}`;
          const hInfo = this.coopScores.get(hNum) || {
            playerNum: hNum,
            name: hName,
            score: 0,
            wordsSolved: 0,
            hintsUsed: 0
          };
          hInfo.score = Math.max(0, hInfo.score - 50);
          hInfo.hintsUsed += 1;
          this.coopScores.set(hNum, hInfo);
          this.showToast(`💡 ${hName} menggunakan petunjuk (-50)`);
          if (this.modalLiveLeaderboard?.classList.contains('active')) {
            this.renderLeaderboardList(this.liveLeaderboardList);
          }
          break;
        }

        case 'scoreUpdate':
          // Di mode co-op akumulasi individu, skor dilacak terpisah per pemain via coopScores
          break;

        case 'request-start-game':
          if (window.MP && window.MP.isHost) {
            this.handleHostStartGame();
          }
          break;

        case 'kicked':
          this.hideLoading();
          if (this.timerInterval) clearInterval(this.timerInterval);
          this.isGameOver = true;
          if (this.disconnectOverlay) {
            this.disconnectOverlay.classList.remove('active');
          }
          if (this.modalLiveLeaderboard) {
            this.modalLiveLeaderboard.classList.remove('active');
          }
          this.showScreen('screen-lobby');
          this.showToast(msg.reason || '🚫 Kamu telah dikeluarkan dari room oleh Host.', 5000);
          break;

        case 'player-kicked-notice':
          if (msg.playerNum) {
            this.partnerCursors.delete(msg.playerNum);
            this.renderPartnerCursors();
            const kName = msg.name || `Pemain ${msg.playerNum}`;
            this.showToast(`🚫 ${kName} telah dikeluarkan oleh Host.`, 4000);
            if (this.modalLiveLeaderboard?.classList.contains('active')) {
              this.renderLeaderboardList(this.liveLeaderboardList);
            }
          }
          break;

        case 'host-transferred': {
          const newHostNum = msg.newHostPlayerNum;
          const newHostName = msg.newHostName || `Pemain ${newHostNum}`;
          const amINewHost = window.MP && (window.MP.playerNum === newHostNum);
          if (amINewHost) {
            this.showToast(`👑 Kamu sekarang adalah Host room!`, 4500);
          } else {
            this.showToast(`👑 ${newHostName} sekarang menjadi Host room.`, 3500);
          }
          if (this.screenRoom && this.screenRoom.classList.contains('active')) {
            const list = window.MP ? window.MP.getPlayerList() : [];
            this.renderRoomPlayerSlots(list, window.MP ? window.MP.maxPlayers : 2, amINewHost);
          }
          if (this.modalLiveLeaderboard?.classList.contains('active')) {
            this.renderLeaderboardList(this.liveLeaderboardList);
          }
          break;
        }

        case 'finish':
          if (msg.elapsedSeconds !== undefined) {
            this.elapsedSeconds = msg.elapsedSeconds;
          }
          if (!this.isGameOver) {
            this.showResult(true);
          }
          break;
      }
    }

    handlePartnerDisconnected() {
      this.hideLoading();
      this.partnerCursors.clear();
      this.renderPartnerCursors();

      const isInGame = this.puzzle && this.screenGame && this.screenGame.classList.contains('active');

      if (!isInGame || this.isGameOver) {
        this.showToast('Koneksi terputus dari room.', 3500);
        if (this.disconnectOverlay) {
          this.disconnectOverlay.classList.remove('active');
        }
        if (!isInGame) {
          this.showScreen('screen-lobby');
        }
        return;
      }

      // Jika game sedang aktif:
      // Host tidak memblokir layar jika guest terputus (guest bisa reconnect kapan saja)
      if (window.MP && window.MP.isHost) {
        this.showToast('⚠️ Seorang pemain terputus dari room. Permainan tetap berlanjut...', 4000);
        this.setPartnerStatus('connected');
        return;
      }

      // Jika guest kehilangan koneksi ke Host:
      this.showToast('⚠️ Koneksi ke Host terputus.', 4000);
      if (this.disconnectOverlay) {
        this.disconnectOverlay.classList.add('active');
      }
    }

    setPartnerStatus(state, pNum = 2) {
      if (this.mode !== 'coop') {
        this.partnerStatus.style.display = 'none';
        return;
      }
      this.partnerStatus.style.display = 'flex';
      this.dotPartnerStatus.className = 'dot-status';

      if (state === 'connected') {
        this.dotPartnerStatus.classList.add('dot-connected');
        const count = window.MP ? window.MP.getPlayerList().length : 2;
        this.textPartnerStatus.textContent = `Co-op: ${count} Pemain`;
      } else if (state === 'typing') {
        this.dotPartnerStatus.classList.add('dot-typing');
        this.textPartnerStatus.textContent = `✏️ P${pNum} mengisi...`;
      } else {
        this.dotPartnerStatus.classList.add('dot-disconnected');
        this.textPartnerStatus.textContent = 'Room: Terputus';
      }
    }

    // ==========================================
    // 6. API FETCH PUZZLE
    // ==========================================
    async fetchPuzzle(theme, difficulty, count = 12) {
      const isMixed = !theme || theme === 'acak' || theme === 'campuran';
      const themeKey = isMixed ? 'campuran' : theme;
      const history = this.getRecentPuzzleHistory(themeKey);
      const payload = {
        theme: themeKey,
        difficulty,
        count,
        avoidWords: history.map(item => item.word),
        avoidClues: history.map(item => item.clue)
      };
      try {
        const res = await fetch('/api/generate-puzzle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('API Respon status ' + res.status);
        const puzzleData = await res.json();
        if (!Array.isArray(puzzleData.words)) {
          throw new Error('API tidak mengembalikan daftar kata');
        }
        return puzzleData;
      } catch (err) {
        console.warn('Gagal fetch /api/generate-puzzle, fallback offline aktif:', err);
        const fallbackTheme = CLIENT_FALLBACKS[themeKey] ? themeKey : 'campuran';
        const pool = CLIENT_FALLBACKS[fallbackTheme] || CLIENT_FALLBACKS.campuran;
        const allFallbackWords = [...pool, ...Object.values(CLIENT_FALLBACKS).flat()];
        const fallbackPool = [...new Map(
          allFallbackWords.map(item => [item.word.toUpperCase(), item])
        ).values()];
        const usedWords = new Set(history.map(item => item.word));
        const usedClues = new Set(history.map(item => this.normalizePuzzleClue(item.clue)));
        const freshWords = fallbackPool.filter(item =>
          !usedWords.has(item.word.toUpperCase()) &&
          !usedClues.has(this.normalizePuzzleClue(item.clue))
        );
        const freshSelection = this.shufflePuzzleWords(freshWords).slice(0, count);
        if (freshSelection.length < count) {
          const freshSet = new Set(freshWords);
          const previouslyUsed = this.shufflePuzzleWords(fallbackPool.filter(item => !freshSet.has(item)));
          freshSelection.push(...previouslyUsed.slice(0, count - freshSelection.length));
        }
        const fallbackData = {
          theme: isMixed ? 'campuran' : themeKey,
          difficulty: difficulty || 'medium',
          words: freshSelection,
          source: 'client-fallback'
        };
        return fallbackData;
      }
    }

    notifyIfFallback(puzzleData) {
      if (puzzleData.source === 'fallback' || puzzleData.source === 'client-fallback' || puzzleData.source === 'mixed') {
        this.showToast('Sebagian soal memakai bank offline karena AI tidak memberi cukup jawaban baru.', 4000);
      }
    }

    normalizePuzzleClue(clue) {
      return String(clue || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    }

    shufflePuzzleWords(words) {
      const shuffled = [...words];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }

    readPuzzleHistory() {
      if (typeof localStorage === 'undefined') return {};
      try {
        const savedHistory = localStorage.getItem(PUZZLE_HISTORY_KEY);
        if (!savedHistory) return {};
        const history = JSON.parse(savedHistory);
        return history && typeof history === 'object' && !Array.isArray(history) ? history : {};
      } catch (err) {
        console.warn('Riwayat puzzle lokal tidak dapat dibaca; riwayat akan dibuat ulang.', err);
        return {};
      }
    }

    getRecentPuzzleHistory(theme) {
      const history = this.readPuzzleHistory();
      const keys = theme === 'campuran' ? ['campuran'] : [theme, 'campuran'];
      const entries = keys.flatMap(key => Array.isArray(history[key]) ? history[key] : []);
      const seen = new Set();
      return entries.filter(item => {
        if (!item || typeof item.word !== 'string' || typeof item.clue !== 'string') return false;
        const word = item.word.toUpperCase().replace(/[^A-Z]/g, '');
        const clue = this.normalizePuzzleClue(item.clue);
        if (!word || !clue) return false;
        const key = `${word}|${clue}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(-PUZZLE_HISTORY_LIMIT * keys.length);
    }

    rememberPuzzleWords(theme, words) {
      if (typeof localStorage === 'undefined' || !Array.isArray(words)) return;
      const history = this.readPuzzleHistory();
      const previous = Array.isArray(history[theme]) ? history[theme] : [];
      const additions = words
        .filter(item => item && typeof item.word === 'string' && typeof item.clue === 'string')
        .map(item => ({
          word: item.word.toUpperCase().replace(/[^A-Z]/g, ''),
          clue: item.clue.trim()
        }))
        .filter(item => item.word && item.clue);
      const uniqueEntries = new Map();
      [...previous, ...additions].forEach(item => {
        if (item && typeof item.word === 'string' && typeof item.clue === 'string') {
          uniqueEntries.set(`${item.word}|${this.normalizePuzzleClue(item.clue)}`, item);
        }
      });
      history[theme] = [...uniqueEntries.values()].slice(-PUZZLE_HISTORY_LIMIT);
      try {
        localStorage.setItem(PUZZLE_HISTORY_KEY, JSON.stringify(history));
      } catch (err) {
        console.warn('Riwayat puzzle tidak dapat disimpan di penyimpanan browser.', err);
      }
    }

    // ==========================================
    // 7. BOARD RENDERING & INITIALIZATION
    // ==========================================
    initGameBoard(isRestore = false) {
      this.isGameOver = false;
      this.hintUsed = false;

      if (!isRestore) {
        this.score = 0;
        this.elapsedSeconds = 0;
        this.userGrid = {};
        this.cellSources = {};
        this.hintedCells = {};
        this.activeCell = null;
        this.wordsSolvedCount = 0;
        this.hintsUsedCount = 0;
        this.completionBonus = 0;
      }

      // Leaderboard Button in HUD
      if (this.btnHudLeaderboard) {
        this.btnHudLeaderboard.style.display = (this.mode === 'coop') ? 'flex' : 'none';
      }

      // Setup HUD
      this.hudScore.textContent = this.score;
      const m = Math.floor(this.elapsedSeconds / 60).toString().padStart(2, '0');
      const s = (this.elapsedSeconds % 60).toString().padStart(2, '0');
      this.hudTimer.textContent = `${m}:${s}`;
      const rawTheme = (this.puzzle.theme || '').toLowerCase();
      const isMixed = !rawTheme || rawTheme === 'acak' || rawTheme === 'campuran';
      this.labelTheme.textContent = isMixed ? 'CAMPURAN' : rawTheme.toUpperCase();

      if (this.labelDiff) {
        const diff = (this.puzzle.difficulty || 'medium').toLowerCase();
        const diffNames = { easy: 'MUDAH', medium: 'SEDANG', hard: 'SULIT' };
        this.labelDiff.textContent = diffNames[diff] || 'SEDANG';
        this.labelDiff.className = 'diff-tag ' + diff;
      }

      this.hudRole.className = 'role-badge ' + (this.mode === 'coop' ? 'coop' : 'solo');
      if (this.mode === 'coop') {
        this.hudRole.textContent = 'CO-OP 🤝';
      } else {
        this.hudRole.textContent = 'SOLO';
      }

      // Player identity badge (P1–P6)
      if (this.hudPlayerIdentity) {
        if (this.mode === 'coop') {
          const myNum = window.MP ? window.MP.playerNum : 1;
          const colors = { 1: '#38bdf8', 2: '#f43f5e', 3: '#f59e0b', 4: '#10b981', 5: '#a855f7', 6: '#ec4899' };
          this.hudPlayerIdentity.style.display = 'inline-flex';
          const dot = this.hudPlayerIdentity.querySelector('.pi-dot');
          const label = this.hudPlayerIdentity.querySelector('.pi-label');
          if (dot) dot.style.background = colors[myNum] || '#38bdf8';
          if (label) label.textContent = `Kamu (P${myNum})`;
        } else {
          this.hudPlayerIdentity.style.display = 'none';
        }
      }

      this.setPartnerStatus(this.mode === 'coop' ? 'connected' : null);

      // Render Clues
      this.renderClues();

      // Render Grid
      this.renderGrid();

      // If restoring, populate cells from userGrid and check status
      if (isRestore) {
        for (const [key, char] of Object.entries(this.userGrid)) {
          const [r, c] = key.split('-').map(Number);
          this.updateCellVisual(r, c);
        }
        this.checkWordsStatus(false);
      }

      // Mulai Timer
      this.startTimer(!isRestore);

      // Pilih kata pertama secara otomatis
      const firstPlayableWord = this.puzzle.words.find(w => !w.solved) || this.puzzle.words[0];

      if (firstPlayableWord) {
        this.selectWord(firstPlayableWord);
      }

      this.showScreen('screen-game');
    }

    _adjustGridCellSize() {
      if (!this.puzzle || !this.gridContainer) return;
      const { rows, cols } = this.puzzle;
      const arenaEl = document.querySelector('.grid-arena') || this.gridContainer.parentElement;
      const availableW = arenaEl && arenaEl.clientWidth > 50 ? (arenaEl.clientWidth - 12) : (window.innerWidth - 16);
      const availableH = arenaEl && arenaEl.clientHeight > 50 ? (arenaEl.clientHeight - 12) : (window.innerHeight - 100);

      const maxW = Math.max(180, availableW);
      const maxH = Math.max(180, availableH);

      const cellFromW = Math.floor((maxW - (cols * 3)) / cols);
      const cellFromH = Math.floor((maxH - (rows * 3)) / rows);

      // Skala maksimal agar layar terisi penuh tanpa terpotong, minimal 26px agar nyaman di mobile
      const optimalCellSize = Math.floor(Math.min(70, Math.max(26, Math.min(cellFromW, cellFromH))));
      this.gridContainer.style.setProperty('--cell-size', `${optimalCellSize}px`);
    }

    renderGrid() {
      const { rows, cols, cells } = this.puzzle;
      this.gridContainer.innerHTML = '';
      this.gridContainer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      this._adjustGridCellSize();

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const key = `${r}-${c}`;
          const cellData = cells[key];
          const cellEl = document.createElement('div');
          cellEl.className = 'grid-cell';
          cellEl.dataset.r = r;
          cellEl.dataset.c = c;

          if (cellData) {
            cellEl.classList.add('playable');

            // Nomor kotak
            if (cellData.num) {
              const numSpan = document.createElement('span');
              numSpan.className = 'cell-num';
              numSpan.textContent = cellData.num;
              cellEl.appendChild(numSpan);
            }

            // Huruf
            const charSpan = document.createElement('span');
            charSpan.className = 'cell-char';
            charSpan.textContent = '';
            cellEl.appendChild(charSpan);

            // Click listener
            cellEl.addEventListener('click', () => this.handleCellClick(r, c));
          } else {
            cellEl.classList.add('empty');
          }

          this.gridContainer.appendChild(cellEl);
        }
      }
      this.renderPartnerCursors();
    }

    _canRoleEditCell() {
      return true; // Semua sel bisa diisi bersama di mode co-op maupun solo
    }

    renderClues() {
      const acrossWords = this.puzzle.words.filter(w => w.dir === 'across');
      const downWords = this.puzzle.words.filter(w => w.dir === 'down');

      this.countAcross.textContent = acrossWords.length;
      this.countDown.textContent = downWords.length;

      this.panelAcross.classList.remove('panel-dimmed');
      this.panelDown.classList.remove('panel-dimmed');

      this._populateClueList(this.listAcross, acrossWords, 'across');
      this._populateClueList(this.listDown, downWords, 'down');
    }

    _populateClueList(ulEl, words, dir) {
      ulEl.innerHTML = '';
      words.forEach(w => {
        const li = document.createElement('li');
        li.className = `clue-item ${dir}-item`;
        li.dataset.wordIdx = this.puzzle.words.indexOf(w);
        li.innerHTML = `<span class="clue-num">${w.num}.</span> <span class="clue-text">${w.clue}</span>`;

        li.addEventListener('click', () => {
          this.selectWord(w);
          this.closeCluesModal();
        });

        ulEl.appendChild(li);
      });
    }

    // ==========================================
    // 8. INTERACTION & NAVIGATION
    // ==========================================
    handleCellClick(r, c) {
      const key = `${r}-${c}`;
      const cellData = this.puzzle.cells[key];
      if (!cellData) return;

      // Jika mengklik sel yang sama, ganti arah (across <-> down) jika sel persilangan
      if (this.activeCell && this.activeCell.r === r && this.activeCell.c === c) {
        if (cellData.acrossWordIdx !== null && cellData.downWordIdx !== null) {
          this.activeDir = this.activeDir === 'across' ? 'down' : 'across';
        }
      } else {
        if (this.activeDir === 'across' && cellData.acrossWordIdx === null) {
          this.activeDir = 'down';
        } else if (this.activeDir === 'down' && cellData.downWordIdx === null) {
          this.activeDir = 'across';
        }
      }

      this.activeCell = { r, c };
      this.highlightActiveWord();
      this.focusVirtualInput();
    }

    selectWord(word) {
      if (!word) return;
      this.activeDir = word.dir;

      // Cari sel kosong pertama di kata tersebut, atau sel pertama jika semua sudah terisi
      let targetCell = { r: word.row, c: word.col };
      for (let i = 0; i < word.word.length; i++) {
        const r = word.dir === 'across' ? word.row : word.row + i;
        const c = word.dir === 'across' ? word.col + i : word.col;
        const key = `${r}-${c}`;
        if (!this.userGrid[key]) {
          targetCell = { r, c };
          break;
        }
      }

      this.activeCell = targetCell;
      this.highlightActiveWord();
      this.focusVirtualInput();
    }

    highlightActiveWord() {
      if (!this.activeCell) return;
      const key = `${this.activeCell.r}-${this.activeCell.c}`;
      const cellData = this.puzzle.cells[key];
      if (!cellData) return;

      const wordIdx = this.activeDir === 'across' ? cellData.acrossWordIdx : cellData.downWordIdx;
      const word = wordIdx !== null ? this.puzzle.words[wordIdx] : null;

      const myPlayerNum = (this.mode === 'coop' && window.MP) ? window.MP.playerNum : 1;
      const playerColorClass = `active-p${myPlayerNum}`;

      // Hapus highlight aktif lokal sebelumnya
      document.querySelectorAll('.grid-cell.cell-focused, .grid-cell.cell-word-active').forEach(el => {
        el.classList.remove(
          'cell-focused', 'cell-word-active',
          'active-p1', 'active-p2', 'active-p3',
          'active-p4', 'active-p5', 'active-p6'
        );
      });
      document.querySelectorAll('.clue-item').forEach(el => el.classList.remove('active-clue'));

      if (word) {
        // Highlight semua sel dalam kata aktif
        for (let i = 0; i < word.word.length; i++) {
          const r = word.dir === 'across' ? word.row : word.row + i;
          const c = word.dir === 'across' ? word.col + i : word.col;
          const cellEl = document.querySelector(`.grid-cell[data-r="${r}"][data-c="${c}"]`);
          if (cellEl) cellEl.classList.add('cell-word-active', playerColorClass);
        }

        // Highlight petunjuk di panel
        const clueEl = document.querySelector(`.clue-item[data-word-idx="${wordIdx}"]`);
        if (clueEl) {
          clueEl.classList.add('active-clue');
          clueEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }

      // Highlight sel aktif yang sedang difokuskan
      const focusedEl = document.querySelector(`.grid-cell[data-r="${this.activeCell.r}"][data-c="${this.activeCell.c}"]`);
      if (focusedEl) {
        focusedEl.classList.add('cell-focused', playerColorClass);
        focusedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }

      // Pastikan highlight kursor partner tetap tergambar jika bertubrukan
      if (this.mode === 'coop') {
        this.renderPartnerCursors();
      }

      // Update tampilan kartu petunjuk aktif
      this.updateActiveClueDisplay();

      // Kirim posisi kursor ke partner di mode co-op
      if (this.mode === 'coop' && window.MP && window.MP.isConnected) {
        window.MP.send({
          type: 'cursor',
          r: this.activeCell.r,
          c: this.activeCell.c,
          dir: this.activeDir,
          playerNum: myPlayerNum
        });
      }
    }

    renderPartnerCursors() {
      // 1. Bersihkan highlight partner sebelumnya
      document.querySelectorAll('.grid-cell').forEach(el => {
        el.classList.remove(
          'cell-partner-focused', 'cell-partner-word',
          'p1', 'p2', 'p3', 'p4', 'p5', 'p6'
        );
        const oldTags = el.querySelectorAll('.partner-tag-pill');
        oldTags.forEach(t => t.remove());
      });
      document.querySelectorAll('.clue-item').forEach(el => {
        el.classList.remove(
          'partner-active-clue',
          'p1', 'p2', 'p3', 'p4', 'p5', 'p6'
        );
      });

      if (!this.partnerCursors || this.partnerCursors.size === 0 || !this.puzzle) return;

      const myPlayerNum = window.MP ? window.MP.playerNum : 1;

      for (const [pNum, cursor] of this.partnerCursors) {
        if (!cursor || pNum === myPlayerNum) continue;
        const { r, c, dir } = cursor;
        const key = `${r}-${c}`;
        const cellData = this.puzzle.cells[key];
        if (!cellData) continue;

        const colorClass = `p${pNum}`;
        const wordIdx = dir === 'across' ? cellData.acrossWordIdx : cellData.downWordIdx;
        const word = wordIdx !== null && wordIdx !== undefined ? this.puzzle.words[wordIdx] : null;

        if (word) {
          // Highlight kata yang sedang diisi partner
          for (let i = 0; i < word.word.length; i++) {
            const wr = word.dir === 'across' ? word.row : word.row + i;
            const wc = word.dir === 'across' ? word.col + i : word.col;
            const cellEl = document.querySelector(`.grid-cell[data-r="${wr}"][data-c="${wc}"]`);
            if (cellEl) {
              cellEl.classList.add('cell-partner-word', colorClass);
            }
          }

          // Tandai petunjuk di panel yang sedang dilihat partner
          const clueEl = document.querySelector(`.clue-item[data-word-idx="${wordIdx}"]`);
          if (clueEl) {
            clueEl.classList.add('partner-active-clue', colorClass);
          }
        }

        // Highlight sel spesifik yang sedang difokuskan partner
        const focusedEl = document.querySelector(`.grid-cell[data-r="${r}"][data-c="${c}"]`);
        if (focusedEl) {
          focusedEl.classList.add('cell-partner-focused', colorClass);
          const tag = document.createElement('span');
          tag.className = `partner-tag-pill ${colorClass}`;
          tag.textContent = `P${pNum}`;
          focusedEl.appendChild(tag);
        }
      }
    }

    isCellLocked(r, c) {
      if (!this.puzzle) return false;
      const key = `${r}-${c}`;
      const cellData = this.puzzle.cells[key];
      if (!cellData) return false;

      if (cellData.acrossWordIdx !== null && this.puzzle.words[cellData.acrossWordIdx]?.solved) {
        return true;
      }
      if (cellData.downWordIdx !== null && this.puzzle.words[cellData.downWordIdx]?.solved) {
        return true;
      }
      return false;
    }

    isCellHinted(r, c) {
      return Boolean(this.hintedCells[`${r}-${c}`]);
    }

    isCellUnavailable(r, c) {
      return this.isCellLocked(r, c) || this.isCellHinted(r, c);
    }

    _findNextUnlockedInWord(startR, startC) {
      const key = `${startR}-${startC}`;
      const cellData = this.puzzle.cells[key];
      if (!cellData) return null;
      const wordIdx = this.activeDir === 'across' ? cellData.acrossWordIdx : cellData.downWordIdx;
      if (wordIdx === null) return null;
      const word = this.puzzle.words[wordIdx];

      for (let i = 0; i < word.word.length; i++) {
        const r = word.dir === 'across' ? word.row : word.row + i;
        const c = word.dir === 'across' ? word.col + i : word.col;
        if (!this.isCellUnavailable(r, c)) {
          return { r, c };
        }
      }
      return null;
    }

    _findPrevUnlockedInWord(startR, startC) {
      const key = `${startR}-${startC}`;
      const cellData = this.puzzle.cells[key];
      if (!cellData) return null;
      const wordIdx = this.activeDir === 'across' ? cellData.acrossWordIdx : cellData.downWordIdx;
      if (wordIdx === null) return null;
      const word = this.puzzle.words[wordIdx];

      const currentIndex = this.activeDir === 'across'
        ? (startC - word.col)
        : (startR - word.row);

      for (let i = currentIndex - 1; i >= 0; i--) {
        const r = word.dir === 'across' ? word.row : word.row + i;
        const c = word.dir === 'across' ? word.col + i : word.col;
        if (!this.isCellUnavailable(r, c)) {
          return { r, c };
        }
      }
      return null;
    }

    updateActiveClueDisplay() {
      if (!this.puzzle || !this.activeCell || !this.activeClueText) return;
      const key = `${this.activeCell.r}-${this.activeCell.c}`;
      const cellData = this.puzzle.cells[key];
      if (!cellData) return;

      const wordIdx = this.activeDir === 'across' ? cellData.acrossWordIdx : cellData.downWordIdx;
      const word = wordIdx !== null ? this.puzzle.words[wordIdx] : null;

      if (!word) {
        this.activeClueText.textContent = 'Ketuk kotak untuk melihat petunjuk';
        return;
      }

      if (this.badgeClueDir) {
        this.badgeClueDir.textContent = word.dir === 'across' ? 'MENDATAR' : 'MENURUN';
        this.badgeClueDir.className = `clue-dir-badge ${word.dir}`;
      }
      if (this.labelClueNum) {
        this.labelClueNum.textContent = `#${word.num}`;
      }
      if (this.labelClueLen) {
        this.labelClueLen.textContent = `(${word.word.length} huruf)`;
      }
      this.activeClueText.textContent = word.clue;

      if (this.badgeClueStatus) {
        this.badgeClueStatus.style.display = word.solved ? 'inline-block' : 'none';
      }
    }

    goToPrevClue() {
      if (!this.puzzle || !this.puzzle.words.length) return;
      const words = this.puzzle.words;
      const curKey = `${this.activeCell.r}-${this.activeCell.c}`;
      const curData = this.puzzle.cells[curKey];
      const curIdx = this.activeDir === 'across' ? curData.acrossWordIdx : curData.downWordIdx;
      const prevIdx = (curIdx - 1 + words.length) % words.length;
      this.selectWord(words[prevIdx]);
    }

    goToNextClue() {
      if (!this.puzzle || !this.puzzle.words.length) return;
      const words = this.puzzle.words;
      const curKey = `${this.activeCell.r}-${this.activeCell.c}`;
      const curData = this.puzzle.cells[curKey];
      const curIdx = this.activeDir === 'across' ? curData.acrossWordIdx : curData.downWordIdx;
      const nextIdx = (curIdx + 1) % words.length;
      this.selectWord(words[nextIdx]);
    }

    toggleActiveDirection() {
      if (!this.activeCell || !this.puzzle) return;
      const key = `${this.activeCell.r}-${this.activeCell.c}`;
      const cellData = this.puzzle.cells[key];
      if (!cellData) return;

      if (cellData.acrossWordIdx !== null && cellData.downWordIdx !== null) {
        this.activeDir = this.activeDir === 'across' ? 'down' : 'across';
      } else {
        this.activeDir = this.activeDir === 'across' ? 'down' : 'across';
        const alternateWord = this.puzzle.words.find(w => w.dir === this.activeDir);
        if (alternateWord) {
          this.selectWord(alternateWord);
          return;
        }
      }
      this.highlightActiveWord();
    }

    openCluesModal() {
      if (this.cluesModal) {
        this.cluesModal.classList.add('active');
      }
    }

    closeCluesModal() {
      if (this.cluesModal) {
        this.cluesModal.classList.remove('active');
      }
    }

    focusVirtualInput() {
      if (this.virtualKeyboardInput) {
        this.virtualKeyboardInput.value = ' ';
        this.virtualKeyboardInput.focus({ preventScroll: true });
      }
    }

    handleKeyDown(e) {
      if (this.screenGame.style.display === 'none' && !this.screenGame.classList.contains('active')) return;
      if (!this.activeCell || this.isGameOver) return;

      const key = e.key.toUpperCase();

      if (/^[A-Z]$/.test(key)) {
        e.preventDefault();
        this.enterLetter(key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        this.handleBackspace();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.moveCursor(0, 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.moveCursor(0, -1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.moveCursor(1, 0);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.moveCursor(-1, 0);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        this.moveToNextWord();
      }
    }

    enterLetter(char) {
      if (!this.activeCell || this.isGameOver) return;
      let { r, c } = this.activeCell;
      let key = `${r}-${c}`;
      let cellData = this.puzzle.cells[key];
      if (!cellData) return;

      // Skip cells locked by a solved word or a revealed hint.
      if (this.isCellUnavailable(r, c)) {
        const nextUnlocked = this._findNextUnlockedInWord(r, c);
        if (!nextUnlocked) {
          this.showToast('Kata ini sudah selesai & benar!');
          return;
        }
        this.activeCell = nextUnlocked;
        r = nextUnlocked.r;
        c = nextUnlocked.c;
        key = `${r}-${c}`;
        cellData = this.puzzle.cells[key];
      }

      const myNum = window.MP ? window.MP.playerNum : 1;
      this.userGrid[key] = char;
      this.cellSources[key] = myNum;
      sound.playType();
      triggerHaptic([20]);

      this.updateCellVisual(r, c);

      // Sinkronkan ke partner via WebRTC DataChannel
      if (this.mode === 'coop') {
        window.MP.send({
          type: 'letter',
          r,
          c,
          letter: char,
          dir: this.activeDir,
          playerNum: myNum
        });
      }

      // Validasi kata selesai
      this.checkWordsStatus(true);

      // Otomatis geser kursor ke kotak berikutnya yang belum terkunci
      this.advanceCursor();
    }

    handleBackspace() {
      if (!this.activeCell || this.isGameOver) return;
      const { r, c } = this.activeCell;
      const key = `${r}-${c}`;

      // Jika kotak aktif tidak terkunci dan ada isinya, hapus
      if (!this.isCellUnavailable(r, c) && this.userGrid[key]) {
        delete this.userGrid[key];
        delete this.cellSources[key];
        this.updateCellVisual(r, c);
        sound.playType();
        triggerHaptic([15]);

        if (this.mode === 'coop') {
          window.MP.send({ type: 'letter', r, c, letter: '', dir: this.activeDir });
        }
      } else {
        // Mundur ke kotak sebelumnya yang tidak terkunci lalu hapus
        const prevUnlocked = this._findPrevUnlockedInWord(r, c);
        if (prevUnlocked) {
          this.activeCell = prevUnlocked;
          const prevKey = `${prevUnlocked.r}-${prevUnlocked.c}`;
          delete this.userGrid[prevKey];
          delete this.cellSources[prevKey];
          this.updateCellVisual(prevUnlocked.r, prevUnlocked.c);
          this.highlightActiveWord();
          sound.playType();
          triggerHaptic([15]);

          if (this.mode === 'coop') {
            window.MP.send({
              type: 'letter',
              r: prevUnlocked.r,
              c: prevUnlocked.c,
              letter: '',
              dir: this.activeDir
            });
          }
        }
      }
    }

    updateCellVisual(r, c) {
      const key = `${r}-${c}`;
      const cellEl = document.querySelector(`.grid-cell[data-r="${r}"][data-c="${c}"]`);
      if (!cellEl) return;

      const charSpan = cellEl.querySelector('.cell-char');
      const letter = this.userGrid[key] || '';
      if (charSpan) charSpan.textContent = letter;

      cellEl.classList.remove(
        'cell-self-input', 'cell-partner-input',
        'cell-input-p1', 'cell-input-p2', 'cell-input-p3',
        'cell-input-p4', 'cell-input-p5', 'cell-input-p6'
      );
      if (letter) {
        let sourceNum = this.cellSources[key];
        if (sourceNum === 'self' || !sourceNum) {
          sourceNum = window.MP ? window.MP.playerNum : 1;
        } else if (sourceNum === 'partner') {
          sourceNum = 2;
        }
        cellEl.classList.add(`cell-input-p${sourceNum}`);
      }

      if (this.isCellLocked(r, c)) {
        cellEl.classList.add('cell-solved');
      }
    }

    advanceCursor() {
      if (!this.activeCell || !this.puzzle) return;
      const key = `${this.activeCell.r}-${this.activeCell.c}`;
      const cellData = this.puzzle.cells[key];
      if (!cellData) return;
      const wordIdx = this.activeDir === 'across' ? cellData.acrossWordIdx : cellData.downWordIdx;
      if (wordIdx === null) return;
      const word = this.puzzle.words[wordIdx];

      const currentIndex = this.activeDir === 'across'
        ? (this.activeCell.c - word.col)
        : (this.activeCell.r - word.row);

      for (let i = currentIndex + 1; i < word.word.length; i++) {
        const r = word.dir === 'across' ? word.row : word.row + i;
        const c = word.dir === 'across' ? word.col + i : word.col;
        if (!this.isCellUnavailable(r, c)) {
          this.activeCell = { r, c };
          this.highlightActiveWord();
          return;
        }
      }
    }

    retreatCursor() {
      if (!this.activeCell || !this.puzzle) return;
      const key = `${this.activeCell.r}-${this.activeCell.c}`;
      const cellData = this.puzzle.cells[key];
      if (!cellData) return;
      const wordIdx = this.activeDir === 'across' ? cellData.acrossWordIdx : cellData.downWordIdx;
      if (wordIdx === null) return;
      const word = this.puzzle.words[wordIdx];

      const currentIndex = this.activeDir === 'across'
        ? (this.activeCell.c - word.col)
        : (this.activeCell.r - word.row);

      for (let i = currentIndex - 1; i >= 0; i--) {
        const r = word.dir === 'across' ? word.row : word.row + i;
        const c = word.dir === 'across' ? word.col + i : word.col;
        if (!this.isCellUnavailable(r, c)) {
          this.activeCell = { r, c };
          this.highlightActiveWord();
          return;
        }
      }
    }

    moveCursor(dr, dc) {
      if (!this.activeCell) return;
      const nextR = this.activeCell.r + dr;
      const nextC = this.activeCell.c + dc;
      const key = `${nextR}-${nextC}`;
      if (this.puzzle.cells[key]) {
        this.activeCell = { r: nextR, c: nextC };
        this.highlightActiveWord();
      }
    }

    moveToNextWord() {
      const words = this.puzzle.words;
      const curKey = `${this.activeCell.r}-${this.activeCell.c}`;
      const curData = this.puzzle.cells[curKey];
      const curIdx = this.activeDir === 'across' ? curData.acrossWordIdx : curData.downWordIdx;
      const nextIdx = (curIdx + 1) % words.length;
      this.selectWord(words[nextIdx]);
    }

    // ==========================================
    // 9. VALIDATION, SCORE & RESULT
    // ==========================================
    checkWordsStatus(triggerFeedback = true) {
      let newlySolved = false;
      const newlySolvedWordIndices = [];

      this.puzzle.words.forEach((w, idx) => {
        if (w.solved) return;

        let isComplete = true;
        let isCorrect = true;

        for (let i = 0; i < w.word.length; i++) {
          const r = w.dir === 'across' ? w.row : w.row + i;
          const c = w.dir === 'across' ? w.col + i : w.col;
          const key = `${r}-${c}`;
          const inputChar = this.userGrid[key];

          if (!inputChar) {
            isComplete = false;
            break;
          }
          if (inputChar !== w.word[i]) {
            isCorrect = false;
          }
        }

        if (isComplete && isCorrect) {
          w.solved = true;
          newlySolved = true;
          newlySolvedWordIndices.push(idx);
          this.wordsSolvedCount++;
          this.score += 100;
          this.hudScore.textContent = this.score;

          if (triggerFeedback) {
            sound.playCorrect();
            triggerHaptic([50, 50, 100]);
            this.showToast(`✨ Kata "${w.word}" benar! (+100)`);
          }

          if (this.mode === 'coop') {
            const myNum = window.MP ? window.MP.playerNum : 1;
            const myInfo = this.coopScores.get(myNum) || {
              playerNum: myNum,
              name: this.playerName || `Pemain ${myNum}`,
              score: 0,
              wordsSolved: 0,
              hintsUsed: 0
            };
            myInfo.score += 100;
            myInfo.wordsSolved += 1;
            this.coopScores.set(myNum, myInfo);
          }
        }
      });

      if (newlySolved) {
        this.refreshSolvedVisuals();
      }

      // Cek apakah semua kata sudah terpecahkan
      const allSolved = this.puzzle.words.every(w => w.solved);
      if (allSolved && !this.isGameOver) {
        this.completionBonus = 300;
        this.score += 300; // Bonus tuntas semua kata
        this.hudScore.textContent = this.score;

        if (this.mode === 'coop') {
          const myNum = window.MP ? window.MP.playerNum : 1;
          const myInfo = this.coopScores.get(myNum);
          if (myInfo) myInfo.score += this.completionBonus;
        }
      }

      if (this.mode === 'coop') {
        const myNum = window.MP ? window.MP.playerNum : 1;
        const bonusWordIdx = allSolved && !this.isGameOver
          ? newlySolvedWordIndices[newlySolvedWordIndices.length - 1]
          : null;
        newlySolvedWordIndices.forEach(wordIdx => {
          window.MP.send({
            type: 'wordSolved',
            wordIdx,
            solverNum: myNum,
            solverName: this.playerName,
            completionBonus: wordIdx === bonusWordIdx ? this.completionBonus : 0
          });
        });

        if (allSolved && !this.isGameOver) {
          window.MP.send({
            type: 'finish',
            elapsedSeconds: this.elapsedSeconds
          });
        }
      }

      if (allSolved && !this.isGameOver) {
        this.showResult(true);
      }
    }

    refreshSolvedVisuals() {
      if (!this.puzzle) return;

      // Tandai sel yang sudah tuntas dengan warna hijau
      this.puzzle.words.forEach(w => {
        if (!w.solved) return;
        for (let i = 0; i < w.word.length; i++) {
          const r = w.dir === 'across' ? w.row : w.row + i;
          const c = w.dir === 'across' ? w.col + i : w.col;
          const cellEl = document.querySelector(`.grid-cell[data-r="${r}"][data-c="${c}"]`);
          if (cellEl) {
            cellEl.classList.add('cell-solved');
            const charSpan = cellEl.querySelector('.cell-char');
            if (charSpan && w.word[i]) {
              charSpan.textContent = w.word[i];
            }
          }
        }

        // Coret clue di daftar
        const wordIdx = this.puzzle.words.indexOf(w);
        const clueEl = document.querySelector(`.clue-item[data-word-idx="${wordIdx}"]`);
        if (clueEl) clueEl.classList.add('solved');
      });

      this.updateActiveClueDisplay();
    }

    useHint() {
      if (this.isGameOver || !this.puzzle) return;

      // 1. Syarat pengurangan poin: Butuh minimal 50 poin
      if (this.score < 50) {
        sound.playError();
        triggerHaptic([60, 60]);
        this.showToast(`Poin tidak cukup! Butuh minimal 50 poin untuk memakai bantuan (Poinmu: ${this.score}).`, 3500);
        if (this.btnHint) {
          this.btnHint.classList.add('shake');
          setTimeout(() => this.btnHint.classList.remove('shake'), 400);
        }
        return;
      }

      // 2. Cari kata yang belum tuntas
      const unsolvedWords = this.puzzle.words.filter(w => !w.solved);
      if (unsolvedWords.length === 0) {
        this.showToast('Semua kata sudah terisi dengan benar!');
        return;
      }

      // Utamakan kata yang saat ini sedang aktif dipilih pemain
      let targetWord = null;
      if (this.activeCell) {
        const activeKey = `${this.activeCell.r}-${this.activeCell.c}`;
        const activeCellData = this.puzzle.cells[activeKey];
        if (activeCellData) {
          const wIdx = this.activeDir === 'across' ? activeCellData.acrossWordIdx : activeCellData.downWordIdx;
          const candidate = (wIdx !== null && wIdx !== undefined) ? this.puzzle.words[wIdx] : null;
          if (candidate && !candidate.solved) {
            const hasEmpty = Array.from(candidate.word).some((ch, i) => {
              const r = candidate.dir === 'across' ? candidate.row : candidate.row + i;
              const c = candidate.dir === 'across' ? candidate.col + i : candidate.col;
              return this.userGrid[`${r}-${c}`] !== ch;
            });
            if (hasEmpty) {
              targetWord = candidate;
            }
          }
        }
      }

      // Jika tidak ada kata aktif yang belum selesai, pilih salah satu secara acak
      if (!targetWord) {
        targetWord = unsolvedWords[Math.floor(Math.random() * unsolvedWords.length)];
      }

      // Cari kotak yang belum terisi atau salah di targetWord
      const emptyIndices = [];
      for (let i = 0; i < targetWord.word.length; i++) {
        const r = targetWord.dir === 'across' ? targetWord.row : targetWord.row + i;
        const c = targetWord.dir === 'across' ? targetWord.col + i : targetWord.col;
        const key = `${r}-${c}`;
        if (this.userGrid[key] !== targetWord.word[i]) {
          emptyIndices.push({ r, c, char: targetWord.word[i] });
        }
      }

      if (emptyIndices.length > 0) {
        const chosen = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
        const key = `${chosen.r}-${chosen.c}`;
        const myNum = window.MP ? window.MP.playerNum : 1;
        this.userGrid[key] = chosen.char;
        this.cellSources[key] = myNum;
        this.hintedCells[key] = true;

        // Pengurangan 50 poin
        this.score = Math.max(0, this.score - 50);
        this.hintsUsedCount++;
        this.hudScore.textContent = this.score;

        this.updateCellVisual(chosen.r, chosen.c);
        sound.playCorrect();
        triggerHaptic([30, 40]);
        this.showToast(`💡 Buka huruf '${chosen.char}' (-50 Poin)`);

        if (this.mode === 'coop') {
          const myInfo = this.coopScores.get(myNum) || {
            playerNum: myNum,
            name: this.playerName || `Pemain ${myNum}`,
            score: 0,
            wordsSolved: 0,
            hintsUsed: 0
          };
          myInfo.score = Math.max(0, myInfo.score - 50);
          myInfo.hintsUsed += 1;
          this.coopScores.set(myNum, myInfo);

          window.MP.send({
            type: 'letter',
            r: chosen.r,
            c: chosen.c,
            letter: chosen.char,
            role: this.role,
            playerNum: myNum,
            isHint: true
          });
          window.MP.send({
            type: 'hintUsed',
            playerNum: myNum,
            playerName: this.playerName
          });
        }

        this.checkWordsStatus(true);
      }
    }

    // ==========================================
    // 10. STOPWATCH TIMER & RESULT
    // ==========================================
    startTimer(resetSeconds = false) {
      this.stopTimer();
      if (resetSeconds) {
        this.elapsedSeconds = 0;
      }
      this.updateTimerDisplay();

      // Stopwatch: mulai dari 00:00, bertambah 1 detik, bebas main tanpa timeout
      this.timerInterval = setInterval(() => {
        this.elapsedSeconds++;
        this.updateTimerDisplay();
      }, 1000);
    }

    stopTimer() {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
    }

    updateTimerDisplay() {
      const m = Math.floor(this.elapsedSeconds / 60).toString().padStart(2, '0');
      const s = (this.elapsedSeconds % 60).toString().padStart(2, '0');
      this.hudTimer.textContent = `${m}:${s}`;
    }

    showResult(isVictory) {
      this.isGameOver = true;
      this.stopTimer();

      const solvedCount = this.puzzle.words.filter(w => w.solved).length;
      const totalCount = this.puzzle.words.length;
      const m = Math.floor(this.elapsedSeconds / 60).toString().padStart(2, '0');
      const s = (this.elapsedSeconds % 60).toString().padStart(2, '0');

      if (isVictory) {
        sound.playVictory();
        this.resultTitle.textContent = 'SELESAI!';
        this.resultTitle.className = 'result-title victory';
        this.resultBonus.style.display = 'inline-block';
      } else {
        sound.playError();
        this.resultTitle.textContent = 'GAME SELESAI';
        this.resultTitle.className = 'result-title';
        this.resultBonus.style.display = 'none';
      }

      if (window.MP) {
        window.MP.isGameInProgress = false;
      }

      this.playAgainVotes.clear();
      this.hasVotedPlayAgain = false;
      this.playAgainTransitionStarted = false;

      this.resultSummary.textContent = `Kamu menyelesaikan ${solvedCount} dari ${totalCount} kata.`;

      // Kalkulasi Akumulasi Skor Transparan
      const wordsPts = this.wordsSolvedCount * 100;
      const bonusPts = isVictory && (this.mode !== 'coop' || this.completionBonus > 0) ? 300 : 0;
      const hintPenalty = this.hintsUsedCount * 50;
      const totalAccumulated = Math.max(0, wordsPts + bonusPts - hintPenalty);
      this.score = totalAccumulated;

      this.resultScore.textContent = this.score;
      if (this.resultTime) {
        this.resultTime.innerHTML = `<i data-lucide="clock-3" aria-hidden="true"></i> ${m}:${s}`;
        if (window.lucide) window.lucide.createIcons();
      }

      // Tampilkan Breakdown Rincian
      if (this.bdWordsCount) this.bdWordsCount.textContent = this.wordsSolvedCount;
      if (this.bdWordsPts) this.bdWordsPts.textContent = `+${wordsPts} Poin`;

      if (this.bdBonusRow) this.bdBonusRow.style.display = isVictory ? 'flex' : 'none';
      if (this.bdBonusPts) this.bdBonusPts.textContent = `+${bonusPts} Poin`;

      if (this.bdHintsRow) {
        this.bdHintsRow.style.display = this.hintsUsedCount > 0 ? 'flex' : 'none';
        if (this.bdHintsCount) this.bdHintsCount.textContent = this.hintsUsedCount;
        if (this.bdHintsPts) this.bdHintsPts.textContent = `-${hintPenalty} Poin`;
      }

      if (this.bdTotalPts) this.bdTotalPts.textContent = `${this.score} Poin`;

      // Render Leaderboard jika Mode Co-op
      if (this.mode === 'coop' && this.resultCoopLeaderboard && this.resultLeaderboardList) {
        this.resultCoopLeaderboard.style.display = 'block';
        this.renderLeaderboardList(this.resultLeaderboardList);
      } else if (this.resultCoopLeaderboard) {
        this.resultCoopLeaderboard.style.display = 'none';
      }
      if (this.btnPlayAgain) {
        this.btnPlayAgain.style.display = this.mode === 'coop' ? 'inline-flex' : 'none';
        this.btnPlayAgain.disabled = false;
      }
      if (this.playAgainStatus) {
        this.playAgainStatus.style.display = this.mode === 'coop' ? 'block' : 'none';
        this.updatePlayAgainStatus();
      }

      this.showScreen('screen-result');
    }

    shareResult() {
      const m = Math.floor(this.elapsedSeconds / 60).toString().padStart(2, '0');
      const s = (this.elapsedSeconds % 60).toString().padStart(2, '0');
      const text = `Aku baru main SilangKata! Berhasil menyelesaikan TTS ${this.puzzle.words.length} kata tema ${this.puzzle.theme} dalam waktu ${m}:${s} dengan skor ${this.score}! Ayo main bareng: https://silangkata.id`;
      if (navigator.share) {
        navigator.share({
          title: 'SilangKata — Teka-Teki Silang Kolaboratif',
          text,
          url: window.location.origin
        }).catch(() => {});
      } else {
        this._copyTextToClipboard(text, 'Hasil berhasil disalin ke clipboard!');
      }
    }

    endGameCleanup() {
      this.stopTimer();
      this.isGameOver = true;
      this.partnerCursors.clear();
      if (window.MP) {
        window.MP.isGameInProgress = false;
      }
      if (this.mode === 'coop') {
        window.MP.disconnect();
      }
    }
  }

  // Inisialisasi Game saat DOM siap
  window.addEventListener('DOMContentLoaded', () => {
    window.GameAPI = new SilangKataGame();
  });
})();
