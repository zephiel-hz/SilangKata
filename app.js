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
      { word: 'KUCING', clue: 'Hewan berkaki empat suka mendengkur dan makan ikan' },
      { word: 'KELINCI', clue: 'Mamalia bertelinga panjang yang suka wortel' },
      { word: 'KAMBING', clue: 'Hewan berkaki empat yang suka makan rumput' },
      { word: 'BURUNG', clue: 'Unggas bersayap yang dapat terbang di angkasa' },
      { word: 'GAJAH', clue: 'Hewan darat raksasa berbelalai panjang' },
      { word: 'SINGA', clue: 'Raja hutan bersurai lebat pemangsa savana' },
      { word: 'HARIMAU', clue: 'Kucing besar bermotif loreng oranye dan hitam' },
      { word: 'ZEBRA', clue: 'Kuda liar afrika berbelang hitam putih' },
      { word: 'MONYET', clue: 'Primata cerdas di pepohonan' },
      { word: 'JERAPAH', clue: 'Hewan tertinggi di dunia berleher panjang' },
      { word: 'LUMBA', clue: 'Mamalia air yang cerdas dan ramah' },
      { word: 'BADAK', clue: 'Hewan bercula satu atau dua di hidung' },
      { word: 'PENGUIN', clue: 'Burung kutub berbulu hitam putih penyelam' },
      { word: 'ELANG', clue: 'Burung pemangsa dengan penglihatan tajam' },
      { word: 'BEBEK', clue: 'Unggas air paruh pipih yang suka berenang' },
      { word: 'BERUANG', clue: 'Mamalia pemakan madu dan ikan' },
      { word: 'KOMODO', clue: 'Kadal raksasa purba Nusa Tenggara' },
      { word: 'TUPAI', clue: 'Hewan pengerat berekor lebat suka kacang' }
    ],
    buah: [
      { word: 'MANGGA', clue: 'Buah tropis manis dengan daging oranye' },
      { word: 'PISANG', clue: 'Buah berkulit kuning kaya kalium' },
      { word: 'JERUK', clue: 'Buah bulat berkulit oranye kaya vitamin C' },
      { word: 'APEL', clue: 'Buah renyah berwarna merah atau hijau' },
      { word: 'MELON', clue: 'Buah beraroma wangi manis berserat jaring' },
      { word: 'SEMANGKA', clue: 'Buah besar hijau berair banyak daging merah' },
      { word: 'DURIAN', clue: 'Raja buah beraroma tajam berduri keras' },
      { word: 'PEPAYA', clue: 'Buah lonjong oranye manis dengan biji bulat' },
      { word: 'ANGGUR', clue: 'Buah bulat kecil dalam tandan manis' },
      { word: 'NANAS', clue: 'Buah bersisik kasar bermahkota duri' },
      { word: 'ALPUKAT', clue: 'Buah mentega hijau lembut berlemak sehat' },
      { word: 'RAMBUTAN', clue: 'Buah berkulit merah berbulu lebat berair' }
    ],
    transportasi: [
      { word: 'PESAWAT', clue: 'Kendaraan udara bermesin jet antar pulau' },
      { word: 'KERETA', clue: 'Rangkaian gerbong melaju di atas rel baja' },
      { word: 'KAPAL', clue: 'Kendaraan air pengarung samudra luas' },
      { word: 'SEPEDA', clue: 'Kendaraan roda dua digerakkan kayuhan pedal' },
      { word: 'MOTOR', clue: 'Kendaraan roda dua bermesin bahan bakar' },
      { word: 'MOBIL', clue: 'Kendaraan bermotor roda empat penjelajah jalan' },
      { word: 'BUS', clue: 'Kendaraan umum berdaya angkut banyak penumpang' },
      { word: 'PERAHU', clue: 'Wahana air tradisional dengan dayung atau layar' },
      { word: 'BECAK', clue: 'Kendaraan roda tiga kayuh tradisional' },
      { word: 'DELMAN', clue: 'Kereta beroda ditarik tenaga kuda' },
      { word: 'TRUK', clue: 'Kendaraan muatan berat pengangkut logistik' },
      { word: 'HELIKOPTER', clue: 'Kendaraan udara berbaling-baling atas berputar' },
      { word: 'FERI', clue: 'Kapal penyeberangan antar pulau' },
      { word: 'ANGKOT', clue: 'Mobil van angkutan kota bertrayek' },
      { word: 'BAJAJ', clue: 'Kendaraan roda tiga bermesin khas ibukota' },
      { word: 'RAKIT', clue: 'Susunan batang bambu apung di sungai' }
    ],
    makanan: [
      { word: 'RENDANG', clue: 'Masakan daging khas Minang rempah pekat' },
      { word: 'BAKSO', clue: 'Bola daging kenyal kuah kaldu hangat' },
      { word: 'SATE', clue: 'Daging tusuk bakar bumbu kacang' },
      { word: 'SOTO', clue: 'Sup kuning kunyit daging dan tauge' },
      { word: 'GADO', clue: 'Salad sayuran rebus berlumur bumbu kacang' },
      { word: 'NASI', clue: 'Beras yang telah dimasak jadi makanan pokok' },
      { word: 'PEMPEK', clue: 'Olahan ikan khas Palembang kuah cuko pedas' },
      { word: 'RAWON', clue: 'Sup daging sapi Jawa Timur berkuah kluwek' },
      { word: 'MARTABAK', clue: 'Kue tebal manis bersarang atau telur gurih' },
      { word: 'TEMPE', clue: 'Kedelai fermentasi kaya protein khas Nusantara' },
      { word: 'TAHU', clue: 'Endapan kedelai putih bertekstur lembut' },
      { word: 'GUDEG', clue: 'Nangka muda manis gurih khas Yogyakarta' }
    ],
    teknologi: [
      { word: 'KOMPUTER', clue: 'Perangkat elektronik pemroses data digital' },
      { word: 'INTERNET', clue: 'Jaringan global penghubung komputer dunia' },
      { word: 'ROBOT', clue: 'Mesin otomatis yang menjalankan program' },
      { word: 'SATELIT', clue: 'Benda pengorbit bumi untuk transmisi sinyal' },
      { word: 'SERVER', clue: 'Komputer pusat penyedia layanan data' },
      { word: 'KAMERA', clue: 'Alat optik perekam gambar digital' },
      { word: 'MONITOR', clue: 'Layar penampil visual output sistem' },
      { word: 'KEYBOARD', clue: 'Papan tombol ketik input huruf dan angka' },
      { word: 'KODING', clue: 'Aktivitas menulis baris perintah kode program' },
      { word: 'DATA', clue: 'Kumpulan fakta dan angka terstruktur' },
      { word: 'SENSOR', clue: 'Komponen pendeteksi perubahan sinyal fisik' },
      { word: 'LAPTOP', clue: 'Komputer jinjing portabel berlayar lipat' }
    ],
    olahraga: [
      { word: 'FUTSAL', clue: 'Permainan bola lapangan tertutup 5 orang' },
      { word: 'SENAM', clue: 'Latihan olah tubuh kebugaran dan kelenturan' },
      { word: 'RENANG', clue: 'Olahraga meluncur di kolam air' },
      { word: 'LARI', clue: 'Aktivitas langkah kaki cepat pacu kecepatan' },
      { word: 'TINJU', clue: 'Olahraga adu pukulan bersarung di ring' },
      { word: 'BASKET', clue: 'Permainan bola memasukkan ke keranjang' },
      { word: 'VOLI', clue: 'Permainan memukul bola melewati net tinggi' },
      { word: 'TENIS', clue: 'Olahraga bola lentur dengan raket di lapangan' },
      { word: 'CATUR', clue: 'Olahraga asah otak mengatur strategi bidak' },
      { word: 'SILAT', clue: 'Seni bela diri warisan budaya leluhur' }
    ],
    umum: [
      { word: 'IBUKOTA', clue: 'Pusat administrasi pemerintahan suatu negara' },
      { word: 'KOMPAS', clue: 'Alat navigasi penunjuk empat arah mata angin' },
      { word: 'SAMUDRA', clue: 'Lautan luas membentang yang mengelilingi benua' },
      { word: 'BENDERA', clue: 'Secarik kain berkibar lambang kedaulatan negara' },
      { word: 'RUPIAH', clue: 'Mata uang resmi Negara Republik Indonesia' },
      { word: 'MONAS', clue: 'Monumen tugu dengan lidah api emas di Jakarta' },
      { word: 'GARUDA', clue: 'Lambang negara Indonesia yang mencengkeram pita' },
      { word: 'MUSEUM', clue: 'Gedung penyimpanan dan pameran benda bersejarah' },
      { word: 'PASPOR', clue: 'Dokumen resmi identitas untuk bepergian ke luar negeri' },
      { word: 'KARTINI', clue: 'Pahlawan emansipasi perempuan pejuang pendidikan' },
      { word: 'PANCASILA', clue: 'Dasar falsafah dan ideologi bangsa Indonesia' },
      { word: 'BALI', clue: 'Pulau dewata tujuan wisata tersohor di Indonesia' }
    ],
    ipa: [
      { word: 'OKSIGEN', clue: 'Gas penyusun udara yang dihirup saat bernapas' },
      { word: 'ATOM', clue: 'Partikel materi terkecil penyusun alam' },
      { word: 'ENERGI', clue: 'Kemampuan atau daya untuk melakukan usaha fisik' },
      { word: 'MAGMA', clue: 'Cairan batuan pijar bersuhu tinggi di perut bumi' },
      { word: 'FOSIL', clue: 'Sisa atau jejak makhluk purba yang membatu' },
      { word: 'NEURON', clue: 'Sel saraf pengirim impuls listrik dalam otak' },
      { word: 'PLANET', clue: 'Benda langit pengorbit bintang induknya' },
      { word: 'MAMALIA', clue: 'Hewan berdarah panas yang menyusui anaknya' },
      { word: 'BAKTERI', clue: 'Mikroorganisme sel tunggal mikroskopis' },
      { word: 'HABITAT', clue: 'Lingkungan alami tempat tinggal suatu makhluk' },
      { word: 'JANTUNG', clue: 'Organ vital pemompa aliran darah tubuh' },
      { word: 'LAMBUNG', clue: 'Organ pencernaan pengolah makanan asam' }
    ],
    ips: [
      { word: 'SEJARAH', clue: 'Peristiwa masa lampau yang tersusun kronologis' },
      { word: 'ARTEFAK', clue: 'Benda peninggalan arkeologis buatan manusia purba' },
      { word: 'PRASASTI', clue: 'Piagam kuno terpahat pada permukaan batu/logam' },
      { word: 'KERAJAAN', clue: 'Bentuk pemerintahan berpuncak pada raja atau sultan' },
      { word: 'MATARAM', clue: 'Kerajaan agraris kuno di Jawa pembangun candi megah' },
      { word: 'KOLONI', clue: 'Negeri jajahan yang dikuasai oleh kekuasaan asing' },
      { word: 'BARTER', clue: 'Sistem perdagangan tukar menukar barang tanpa uang' },
      { word: 'EKONOMI', clue: 'Ilmu produksi, distribusi, dan konsumsi barang' },
      { word: 'KULTUR', clue: 'Adat istiadat, nilai budi daya, dan kebudayaan' },
      { word: 'ETNIS', clue: 'Kelompok masyarakat dengan kesamaan garis keturunan' },
      { word: 'PASAR', clue: 'Pusat transaksi bertemunya penjual dan pembeli' },
      { word: 'TRADISI', clue: 'Kebiasaan adat turun-temurun dari nenek moyang' }
    ],
    campuran: [
      { word: 'OKSIGEN', clue: 'Gas yang dihirup saat bernapas (IPA)' },
      { word: 'RENDANG', clue: 'Masakan daging Minangkabau kaya rempah (Kuliner)' },
      { word: 'INTERNET', clue: 'Jaringan raksasa komputer di dunia (Teknologi)' },
      { word: 'KOMPAS', clue: 'Alat navigasi penunjuk arah utara (Umum)' },
      { word: 'JANTUNG', clue: 'Organ pemompa aliran darah tubuh (Biologi)' },
      { word: 'SEJARAH', clue: 'Catatan peristiwa masa lampau manusia (IPS)' },
      { word: 'HARIMAU', clue: 'Kucing besar pemangsa loreng di rimba (Fauna)' },
      { word: 'RUPIAH', clue: 'Mata uang sah Negara Indonesia (Ekonomi)' },
      { word: 'ATOM', clue: 'Partikel dasar penyusun materi (Fisika)' },
      { word: 'ROBOT', clue: 'Mesin otomatis yang dapat diprogram (Teknologi)' },
      { word: 'KERETA', clue: 'Moda angkutan darat di atas rel baja (Transportasi)' },
      { word: 'MONAS', clue: 'Tugu lambang perjuangan dengan api emas (Sejarah)' },
      { word: 'CATUR', clue: 'Permainan strategi asah otak 64 petak (Olahraga)' },
      { word: 'MANGGA', clue: 'Buah tropis manis berdaging oranye (Flora)' }
    ]
  };

  // ==========================================
  // 3. GAME CONTROLLER & STATE
  // ==========================================
  class SilangKataGame {
    constructor() {
      this.mode = 'solo'; // 'solo' | 'coop'
      this.role = 'solo'; // 'coop' | 'solo'
      this.partnerCursor = null; // { r, c, dir }
      this.puzzle = null;
      this.userGrid = {}; // 'r-c' => letter
      this.cellSources = {}; // 'r-c' => 'self' | 'partner'
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
      this.btnCreateRoom = document.getElementById('btn-create-room');
      this.btnJoinRoom = document.getElementById('btn-join-room');
      this.btnLobbyBack = document.getElementById('btn-lobby-back');
      this.inputRoomCode = document.getElementById('input-room-code');

      // Room Elements
      this.displayRoomCode = document.getElementById('display-room-code');
      this.btnShareLink = document.getElementById('btn-share-link');
      this.btnCopyCode = document.getElementById('btn-copy-code');
      this.btnCancelRoom = document.getElementById('btn-cancel-room');
      this.badgeHostStatus = document.getElementById('badge-host-status');
      this.badgeGuestStatus = document.getElementById('badge-guest-status');

      // Game HUD Elements
      this.hudTimer = document.getElementById('hud-timer');
      this.hudRole = document.getElementById('hud-role');
      this.hudScore = document.getElementById('hud-score');
      this.btnAudioToggle = document.getElementById('btn-audio-toggle');
      this.btnHint = document.getElementById('btn-hint');
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

      // Result Elements
      this.resultTitle = document.getElementById('result-title');
      this.resultSummary = document.getElementById('result-summary');
      this.resultScore = document.getElementById('result-score');
      this.resultBonus = document.getElementById('result-bonus');
      this.resultTime = document.getElementById('result-time');
      this.btnNextPuzzle = document.getElementById('btn-next-puzzle');
      this.btnShareResult = document.getElementById('btn-share-result');
      this.btnResultMenu = document.getElementById('btn-result-menu');

      // Overlays
      this.loadingOverlay = document.getElementById('loading-overlay');
      this.loadingText = document.getElementById('loading-text');
      this.disconnectOverlay = document.getElementById('disconnect-overlay');
      this.btnDisconnectMenu = document.getElementById('btn-disconnect-menu');
      this.toastEl = document.getElementById('toast');
    }

    _bindEvents() {
      // Menu
      this.btnMenuSolo.addEventListener('click', () => this.startSoloGame());
      this.btnMenuCoop.addEventListener('click', () => this.showScreen('screen-lobby'));

      // Lobby
      this.btnLobbyBack.addEventListener('click', () => this.showScreen('screen-menu'));
      this.btnCreateRoom.addEventListener('click', () => this.handleCreateRoom());
      this.btnJoinRoom.addEventListener('click', () => this.handleJoinRoom());

      // Room
      if (this.btnShareLink) this.btnShareLink.addEventListener('click', () => this.shareRoomLink());
      this.btnCopyCode.addEventListener('click', () => this.copyRoomCode());
      this.btnCancelRoom.addEventListener('click', () => {
        window.MP.disconnect();
        this.showScreen('screen-lobby');
      });

      // Game HUD
      this.btnAudioToggle.addEventListener('click', () => {
        const isSoundOn = sound.toggleMute();
        this.btnAudioToggle.textContent = isSoundOn ? '🔊' : '🔇';
        this.showToast(isSoundOn ? 'Suara Aktif' : 'Suara Dimatikan');
      });

      this.btnHint.addEventListener('click', () => this.useHint());
      this.btnExitGame.addEventListener('click', () => {
        if (confirm('Yakin ingin keluar dari ronde ini?')) {
          this.endGameCleanup();
          this.showScreen('screen-menu');
        }
      });

      // Result
      this.btnNextPuzzle.addEventListener('click', () => {
        if (this.mode === 'coop') {
          this.showToast('Kembali ke lobby untuk room berikutnya');
          this.showScreen('screen-lobby');
        } else {
          this.startSoloGame();
        }
      });
      this.btnShareResult.addEventListener('click', () => this.shareResult());
      this.btnResultMenu.addEventListener('click', () => this.showScreen('screen-menu'));

      // Disconnect overlay
      this.btnDisconnectMenu.addEventListener('click', () => {
        this.disconnectOverlay.classList.remove('active');
        this.endGameCleanup();
        this.showScreen('screen-menu');
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
          difficulty: puzzleData.difficulty || 'medium'
        };

        this.hideLoading();
        this.initGameBoard();
      } catch (err) {
        console.error('Error startSoloGame:', err);
        this.hideLoading();
        this.showToast('Gagal memuat puzzle. Coba lagi.');
      }
    }

    // ==========================================
    // 5. CO-OP MULTIPLAYER FLOW
    // ==========================================
    async handleCreateRoom() {
      this.mode = 'coop';
      this.role = 'coop';
      this.partnerCursor = null;
      this.selectedTheme = this.themeSelect.value;
      this.selectedDiff = this.diffSelect.value;
      this.selectedCount = parseInt(this.wordCountSelect?.value, 10) || 12;

      const code = window.MP.generateRoomCode();
      this.displayRoomCode.textContent = code;
      if (this.badgeHostStatus) {
        this.badgeHostStatus.textContent = 'MENGHUBUNGKAN...';
        this.badgeHostStatus.className = 'badge badge-waiting';
      }
      this.badgeGuestStatus.textContent = 'MENUNGGU...';
      this.badgeGuestStatus.className = 'badge badge-waiting';
      if (this.btnShareLink) this.btnShareLink.disabled = true;
      if (this.btnCopyCode) this.btnCopyCode.disabled = true;
      this.showScreen('screen-room');

      window.MP.initHost(
        code,
        // onReady
        (readyCode) => {
          this.displayRoomCode.textContent = readyCode;
          if (this.badgeHostStatus) {
            this.badgeHostStatus.textContent = 'ONLINE';
            this.badgeHostStatus.className = 'badge badge-ready';
          }
          this.badgeGuestStatus.textContent = 'MENUNGGU TEMAN...';
          this.badgeGuestStatus.className = 'badge badge-waiting';
          if (this.btnShareLink) this.btnShareLink.disabled = false;
          if (this.btnCopyCode) this.btnCopyCode.disabled = false;
          this.showToast('Room online! Bagikan tautan ke temanmu.');
        },
        // onGuestConnected
        async () => {
          this.badgeGuestStatus.textContent = 'TERHUBUNG!';
          this.badgeGuestStatus.className = 'badge badge-ready';
          this.showToast('Partner bergabung! Menyiapkan game...');

          this.showLoading('Menyiapkan puzzle kolaboratif...');
          const puzzleData = await this.fetchPuzzle(this.selectedTheme, this.selectedDiff, this.selectedCount);
          const generatedGrid = CrosswordGenerator.generate(puzzleData.words);

          this.puzzle = {
            ...generatedGrid,
            theme: puzzleData.theme || 'Acak',
            difficulty: puzzleData.difficulty || 'medium'
          };

          // Kirim puzzle utuh ke guest
          window.MP.send({
            type: 'init',
            puzzle: this.puzzle
          });

          this.hideLoading();
          this.initGameBoard();
        },
        // onMessage
        (data) => this.handleMultiplayerMessage(data),
        // onDisconnected
        () => this.handlePartnerDisconnected(),
        // onError
        (err) => {
          this.hideLoading();
          if (this.badgeHostStatus) {
            this.badgeHostStatus.textContent = 'OFFLINE / GAGAL';
            this.badgeHostStatus.className = 'badge badge-waiting';
          }
          this.showToast('Gagal menghubungkan room ke server: ' + (err.type || 'Error'));
        }
      );
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
      this.joinRoomByCode(code);
    }

    joinRoomByCode(code) {
      const cleanCode = (code || '').toUpperCase().trim();
      if (!cleanCode || cleanCode.length !== 6) return;

      this.mode = 'coop';
      this.role = 'coop';
      this.partnerCursor = null;
      this.showLoading('Menghubungi room ' + cleanCode + '...');

      window.MP.initGuest(
        cleanCode,
        // onConnectedToHost
        () => {
          this.showLoading('Terhubung ke host! Menunggu puzzle...');
        },
        // onMessage
        (data) => this.handleMultiplayerMessage(data),
        // onDisconnected
        () => this.handlePartnerDisconnected(),
        // onError
        (err) => {
          this.hideLoading();
          let message = 'Gagal bergabung ke room.';
          const errType = err && err.type ? err.type : '';
          if (errType === 'peer-unavailable') {
            message = `Room "${cleanCode}" tidak ditemukan atau Host sudah keluar/offline.`;
          } else if (errType === 'timeout') {
            message = 'Waktu koneksi habis. Pastikan Host masih membuka room.';
          } else if (errType === 'network') {
            message = 'Koneksi internet bermasalah. Periksa jaringanmu.';
          } else if (errType) {
            message = `Koneksi gagal (${errType}). Coba lagi.`;
          }
          this.showToast(message, 4500);
          this.showScreen('screen-lobby');
        }
      );
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

          // Otomatis langsung join ke room tanpa perlu input manual
          this.joinRoomByCode(roomCode);
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

      switch (msg.type) {
        case 'init':
          // Diterima guest saat puzzle siap
          this.puzzle = msg.puzzle;
          this.hideLoading();
          this.initGameBoard();
          break;

        case 'letter':
          // Update huruf dari partner
          const key = `${msg.r}-${msg.c}`;
          this.userGrid[key] = msg.letter;
          this.cellSources[key] = 'partner';
          this.updateCellVisual(msg.r, msg.c);
          this.checkWordsStatus(true);
          this.partnerCursor = { r: msg.r, c: msg.c, dir: msg.dir || this.partnerCursor?.dir || 'across' };
          this.renderPartnerCursor();
          this.setPartnerStatus('typing');
          setTimeout(() => this.setPartnerStatus('connected'), 1200);
          break;

        case 'cursor':
          // Update posisi kursor dan kata yang sedang diisi partner
          this.partnerCursor = { r: msg.r, c: msg.c, dir: msg.dir };
          this.renderPartnerCursor();
          break;

        case 'wordSolved':
          // Update kata yang dipecahkan partner
          if (this.puzzle && this.puzzle.words[msg.wordIdx]) {
            const solvedWord = this.puzzle.words[msg.wordIdx];
            solvedWord.solved = true;

            // Pastikan semua huruf kata yang terpecahkan langsung terisi di userGrid
            for (let i = 0; i < solvedWord.word.length; i++) {
              const r = solvedWord.dir === 'across' ? solvedWord.row : solvedWord.row + i;
              const c = solvedWord.dir === 'across' ? solvedWord.col + i : solvedWord.col;
              const wKey = `${r}-${c}`;
              this.userGrid[wKey] = solvedWord.word[i];
              this.cellSources[wKey] = 'partner';
              this.updateCellVisual(r, c);
            }

            this.showToast(`✨ Partner berhasil menjawab "${solvedWord.word}"! (+100)`);
          }
          if (msg.score !== undefined) {
            this.score = msg.score;
            this.hudScore.textContent = this.score;
          }
          sound.playCorrect();
          triggerHaptic([40, 40, 80]);
          this.refreshSolvedVisuals();
          break;

        case 'finish':
          this.score = msg.finalScore;
          if (msg.elapsedSeconds !== undefined) {
            this.elapsedSeconds = msg.elapsedSeconds;
          }
          this.showResult(true);
          break;
      }
    }

    handlePartnerDisconnected() {
      this.hideLoading();
      this.partnerCursor = null;
      this.renderPartnerCursor();
      this.setPartnerStatus('disconnected');

      // Modal "PARTNER TERPUTUS" HANYA boleh muncul jika pemain sedang berada di dalam gameplay aktif!
      const isInGame = this.puzzle && this.screenGame && this.screenGame.classList.contains('active');
      if (this.isGameOver || !isInGame) {
        this.showToast('Koneksi terputus dari partner.', 3500);
        if (this.disconnectOverlay) {
          this.disconnectOverlay.classList.remove('active');
        }
        if (!isInGame) {
          this.showScreen('screen-lobby');
        }
        return;
      }

      this.disconnectOverlay.classList.add('active');
    }

    setPartnerStatus(state) {
      if (this.mode !== 'coop') {
        this.partnerStatus.style.display = 'none';
        return;
      }
      this.partnerStatus.style.display = 'flex';
      this.dotPartnerStatus.className = 'dot-status';

      if (state === 'connected') {
        this.dotPartnerStatus.classList.add('dot-connected');
        this.textPartnerStatus.textContent = 'Partner: Terhubung';
      } else if (state === 'typing') {
        this.dotPartnerStatus.classList.add('dot-typing');
        this.textPartnerStatus.textContent = '✏️ Partner mengisi...';
      } else {
        this.dotPartnerStatus.classList.add('dot-disconnected');
        this.textPartnerStatus.textContent = 'Partner: Terputus';
      }
    }

    // ==========================================
    // 6. API FETCH PUZZLE
    // ==========================================
    async fetchPuzzle(theme, difficulty, count = 12) {
      const isMixed = !theme || theme === 'acak' || theme === 'campuran';
      const payload = { theme: isMixed ? 'campuran' : theme, difficulty, count };
      try {
        const res = await fetch('/api/generate-puzzle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('API Respon status ' + res.status);
        return await res.json();
      } catch (err) {
        console.warn('Gagal fetch /api/generate-puzzle, fallback offline aktif:', err);
        const themeKey = isMixed ? 'campuran' : (CLIENT_FALLBACKS[theme] ? theme : 'campuran');
        const pool = CLIENT_FALLBACKS[themeKey] || CLIENT_FALLBACKS.campuran;
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        return {
          theme: isMixed ? 'campuran' : themeKey,
          difficulty: difficulty || 'medium',
          words: shuffled.slice(0, count)
        };
      }
    }

    // ==========================================
    // 7. BOARD RENDERING & INITIALIZATION
    // ==========================================
    initGameBoard() {
      this.isGameOver = false;
      this.hintUsed = false;
      this.score = 0;
      this.elapsedSeconds = 0;
      this.userGrid = {};
      this.cellSources = {};
      this.activeCell = null;

      // Setup HUD
      this.hudScore.textContent = '0';
      this.hudTimer.textContent = '00:00';
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

      this.setPartnerStatus(this.mode === 'coop' ? 'connected' : null);

      // Render Clues
      this.renderClues();

      // Render Grid
      this.renderGrid();

      // Mulai Timer
      this.startTimer();

      // Pilih kata pertama secara otomatis
      const firstPlayableWord = this.puzzle.words[0];

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
      this.renderPartnerCursor();
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

      // Hapus highlight sebelumnya
      document.querySelectorAll('.grid-cell').forEach(el => {
        el.classList.remove('cell-focused', 'cell-word-active');
      });
      document.querySelectorAll('.clue-item').forEach(el => el.classList.remove('active-clue'));

      if (word) {
        // Highlight semua sel dalam kata aktif
        for (let i = 0; i < word.word.length; i++) {
          const r = word.dir === 'across' ? word.row : word.row + i;
          const c = word.dir === 'across' ? word.col + i : word.col;
          const cellEl = document.querySelector(`.grid-cell[data-r="${r}"][data-c="${c}"]`);
          if (cellEl) cellEl.classList.add('cell-word-active');
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
        focusedEl.classList.add('cell-focused');
        focusedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }

      // Update tampilan kartu petunjuk aktif
      this.updateActiveClueDisplay();

      // Kirim posisi kursor ke partner di mode co-op
      if (this.mode === 'coop' && window.MP && window.MP.isConnected) {
        window.MP.send({
          type: 'cursor',
          r: this.activeCell.r,
          c: this.activeCell.c,
          dir: this.activeDir
        });
      }
    }

    renderPartnerCursor() {
      // 1. Bersihkan highlight partner sebelumnya
      document.querySelectorAll('.grid-cell').forEach(el => {
        el.classList.remove('cell-partner-focused', 'cell-partner-word');
        const oldTag = el.querySelector('.partner-tag-pill');
        if (oldTag) oldTag.remove();
      });
      document.querySelectorAll('.clue-item').forEach(el => el.classList.remove('partner-active-clue'));

      if (!this.partnerCursor || !this.puzzle) return;
      const { r, c, dir } = this.partnerCursor;
      const key = `${r}-${c}`;
      const cellData = this.puzzle.cells[key];
      if (!cellData) return;

      const wordIdx = dir === 'across' ? cellData.acrossWordIdx : cellData.downWordIdx;
      const word = wordIdx !== null && wordIdx !== undefined ? this.puzzle.words[wordIdx] : null;

      if (word) {
        // Highlight kata yang sedang diisi partner
        for (let i = 0; i < word.word.length; i++) {
          const wr = word.dir === 'across' ? word.row : word.row + i;
          const wc = word.dir === 'across' ? word.col + i : word.col;
          const cellEl = document.querySelector(`.grid-cell[data-r="${wr}"][data-c="${wc}"]`);
          if (cellEl) cellEl.classList.add('cell-partner-word');
        }

        // Tandai petunjuk di panel yang sedang dilihat partner
        const clueEl = document.querySelector(`.clue-item[data-word-idx="${wordIdx}"]`);
        if (clueEl) {
          clueEl.classList.add('partner-active-clue');
        }
      }

      // Highlight sel spesifik yang sedang difokuskan partner
      const focusedEl = document.querySelector(`.grid-cell[data-r="${r}"][data-c="${c}"]`);
      if (focusedEl) {
        focusedEl.classList.add('cell-partner-focused');
        const tag = document.createElement('span');
        tag.className = 'partner-tag-pill';
        tag.textContent = '👥 Partner';
        focusedEl.appendChild(tag);
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
        if (!this.isCellLocked(r, c)) {
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
        if (!this.isCellLocked(r, c)) {
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

      // Jika kotak saat ini sudah terkunci karena sudah benar, lompat ke kotak berikutnya yang belum terkunci
      if (this.isCellLocked(r, c)) {
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

      this.userGrid[key] = char;
      this.cellSources[key] = 'self';
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
          dir: this.activeDir
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
      if (!this.isCellLocked(r, c) && this.userGrid[key]) {
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

      cellEl.classList.remove('cell-self-input', 'cell-partner-input');
      if (letter) {
        const source = this.cellSources[key] || 'self';
        cellEl.classList.add(source === 'partner' ? 'cell-partner-input' : 'cell-self-input');
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
        if (!this.isCellLocked(r, c)) {
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
        if (!this.isCellLocked(r, c)) {
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
          this.score += 100;
          this.hudScore.textContent = this.score;

          if (triggerFeedback) {
            sound.playCorrect();
            triggerHaptic([50, 50, 100]);
            this.showToast(`✨ Kata "${w.word}" benar! (+100)`);
          }

          if (this.mode === 'coop') {
            window.MP.send({
              type: 'wordSolved',
              wordIdx: idx,
              score: this.score
            });
          }
        }
      });

      if (newlySolved) {
        this.refreshSolvedVisuals();
      }

      // Cek apakah semua kata sudah terpecahkan
      const allSolved = this.puzzle.words.every(w => w.solved);
      if (allSolved && !this.isGameOver) {
        this.score += 300; // Bonus tuntas semua kata
        this.hudScore.textContent = this.score;

        if (this.mode === 'coop') {
          window.MP.send({
            type: 'finish',
            finalScore: this.score,
            elapsedSeconds: this.elapsedSeconds
          });
        }
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
      if (this.hintUsed) {
        this.showToast('Bantuan huruf sudah digunakan ronde ini!');
        return;
      }

      // Cari kata yang belum tuntas
      const unsolvedWords = this.puzzle.words.filter(w => !w.solved);
      if (unsolvedWords.length === 0) return;

      const randomWord = unsolvedWords[Math.floor(Math.random() * unsolvedWords.length)];
      // Cari huruf yang belum terisi atau salah
      const emptyIndices = [];
      for (let i = 0; i < randomWord.word.length; i++) {
        const r = randomWord.dir === 'across' ? randomWord.row : randomWord.row + i;
        const c = randomWord.dir === 'across' ? randomWord.col + i : randomWord.col;
        const key = `${r}-${c}`;
        if (this.userGrid[key] !== randomWord.word[i]) {
          emptyIndices.push({ r, c, char: randomWord.word[i] });
        }
      }

      if (emptyIndices.length > 0) {
        const chosen = emptyIndices[0];
        const key = `${chosen.r}-${chosen.c}`;
        this.userGrid[key] = chosen.char;
        this.cellSources[key] = 'self';
        this.hintUsed = true;
        this.score = Math.max(0, this.score - 50);
        this.hudScore.textContent = this.score;

        this.updateCellVisual(chosen.r, chosen.c);
        sound.playCorrect();
        this.showToast(`💡 Buka huruf '${chosen.char}' (-50 Poin)`);

        if (this.mode === 'coop') {
          window.MP.send({
            type: 'letter',
            r: chosen.r,
            c: chosen.c,
            letter: chosen.char,
            role: this.role
          });
        }

        this.checkWordsStatus(true);
      }
    }

    // ==========================================
    // 10. STOPWATCH TIMER & RESULT
    // ==========================================
    startTimer() {
      this.stopTimer();
      this.elapsedSeconds = 0;
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

      this.resultSummary.textContent = `Kamu menyelesaikan ${solvedCount} dari ${totalCount} kata.`;
      this.resultScore.textContent = this.score;
      if (this.resultTime) {
        this.resultTime.textContent = `⏱ ${m}:${s}`;
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
      this.partnerCursor = null;
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

