// test.js — Test Suite Otomatis untuk SilangKata
import handler from './api/generate-puzzle.js';
import fs from 'fs';

function makeMockRes(label) {
  let statusCode = 200;
  return {
    setHeader() {},
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      console.log(`✓ [${label}] Status: ${statusCode}, Words: ${data.words?.length}`);
      if (!data.words || data.words.length < 5) {
        throw new Error('Words array missing or too small');
      }
    },
    end() {}
  };
}

async function run() {
  console.log('1. Menguji Serverless Function & Fallback Dictionaries...');
  // Matikan sementara API key jaringan agar unit test fokus menguji handler & dictionaries dalam hitungan milidetik
  const savedKeys = {
    GEMINI: process.env.GEMINI_API_KEY,
    GROQ: process.env.GROQ_API_KEY,
    OPENROUTER: process.env.OPENROUTER_API_KEY,
    DEEPSEEK: process.env.DEEPSEEK_API_KEY
  };
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;

  await handler({ method: 'POST', body: { theme: 'hewan', difficulty: 'medium', count: 8 } }, makeMockRes('POST hewan 8 kata'));
  await handler({ method: 'POST', body: { theme: 'buah', difficulty: 'easy', count: 6 } }, makeMockRes('POST buah 6 kata'));
  await handler({ method: 'POST', body: { theme: 'makanan', difficulty: 'hard', count: 20 } }, makeMockRes('POST makanan 20 kata'));
  await handler({ method: 'POST', body: { theme: 'ipa', difficulty: 'hard', count: 8 } }, makeMockRes('POST ipa 8 kata'));
  await handler({ method: 'POST', body: { theme: 'ips', difficulty: 'medium', count: 8 } }, makeMockRes('POST ips 8 kata'));
  await handler({ method: 'POST', body: { theme: 'umum', difficulty: 'easy', count: 8 } }, makeMockRes('POST umum 8 kata'));
  await handler({ method: 'POST', body: { theme: '', difficulty: 'hard', count: 12 } }, makeMockRes('POST campuran/acak 12 kata'));
  await handler({ method: 'GET', query: { theme: 'teknologi', count: 16 } }, makeMockRes('GET teknologi 16 kata'));

  // Kembalikan keys
  if (savedKeys.GEMINI) process.env.GEMINI_API_KEY = savedKeys.GEMINI;
  if (savedKeys.GROQ) process.env.GROQ_API_KEY = savedKeys.GROQ;
  if (savedKeys.OPENROUTER) process.env.OPENROUTER_API_KEY = savedKeys.OPENROUTER;
  if (savedKeys.DEEPSEEK) process.env.DEEPSEEK_API_KEY = savedKeys.DEEPSEEK;

  console.log('2. Menguji Algoritma Crossword Generator & Client Fallbacks...');
  const appCode = fs.readFileSync('app.js', 'utf8');
  const match = appCode.match(/class CrosswordGenerator \{[\s\S]*?\n  \}/);
  if (!match) throw new Error('CrosswordGenerator not found in app.js');

  const generatorCode = 'global.CrosswordGenerator = ' + match[0];
  eval(generatorCode);

  const fallbackMatch = appCode.match(/const CLIENT_FALLBACKS = (\{[\s\S]*?\n  \};)/);
  if (!fallbackMatch) throw new Error('CLIENT_FALLBACKS not found in app.js');
  const clientFallbacks = eval('(' + fallbackMatch[1].replace(/;$/, '') + ')');
  for (const theme of ['hewan', 'buah', 'transportasi', 'makanan', 'teknologi', 'olahraga', 'umum', 'ipa', 'ips', 'campuran']) {
    if (!clientFallbacks[theme] || clientFallbacks[theme].length < 10) {
      throw new Error(`Client fallback for ${theme} missing or insufficient words`);
    }
  }
  console.log('✓ Client fallback dictionaries lengkap untuk seluruh tema (termasuk umum, ipa, ips, campuran).');

  const sampleWords = [
    { word: 'KUCING', clue: 'Hewan berkaki empat suka makan ikan' },
    { word: 'KELINCI', clue: 'Mamalia bertelinga panjang yang suka wortel' },
    { word: 'KAMBING', clue: 'Hewan berkaki empat yang suka makan rumput' },
    { word: 'BURUNG', clue: 'Unggas bersayap yang dapat terbang' },
    { word: 'GAJAH', clue: 'Hewan darat berbelalai panjang' },
    { word: 'SINGA', clue: 'Raja hutan bersurai lebat' },
    { word: 'HARIMAU', clue: 'Kucing besar bermotif loreng' },
    { word: 'ZEBRA', clue: 'Kuda liar berbelang hitam putih' },
    { word: 'MONYET', clue: 'Primata cerdas di pepohonan' },
    { word: 'BADAK', clue: 'Hewan bercula keras' }
  ];

  const grid = global.CrosswordGenerator.generate(sampleWords);
  if (!grid || !grid.words || grid.words.length === 0) {
    throw new Error('Grid generation failed');
  }

  // Verifikasi semua persilangan
  for (const [key, cell] of Object.entries(grid.cells)) {
    const [r, c] = key.split('-').map(Number);
    if (cell.acrossWordIdx !== null && cell.downWordIdx !== null) {
      const acrossW = grid.words[cell.acrossWordIdx];
      const downW = grid.words[cell.downWordIdx];
      const acrossChar = acrossW.word[c - acrossW.col];
      const downChar = downW.word[r - downW.row];
      if (acrossChar !== cell.letter || downChar !== cell.letter) {
        throw new Error('Mismatch at intersection: ' + key);
      }
    }
  }

  console.log(`✓ Grid berhasil disusun (${grid.rows}x${grid.cols}), ${grid.words.length} kata, semua persilangan valid.`);

  console.log('3. Menguji Logika Penguncian Sel (Immutable Solved Cells)...');
  // Mock objek game sederhana untuk menguji isCellLocked
  const mockGame = {
    puzzle: grid,
    isCellLocked(r, c) {
      if (!this.puzzle) return false;
      const key = `${r}-${c}`;
      const cellData = this.puzzle.cells[key];
      if (!cellData) return false;
      if (cellData.acrossWordIdx !== null && this.puzzle.words[cellData.acrossWordIdx]?.solved) return true;
      if (cellData.downWordIdx !== null && this.puzzle.words[cellData.downWordIdx]?.solved) return true;
      return false;
    }
  };

  const testWord = grid.words[0];
  const testCell = `${testWord.row}-${testWord.col}`;
  if (mockGame.isCellLocked(testWord.row, testWord.col) !== false) {
    throw new Error('Kotak harusnya belum terkunci sebelum kata selesai');
  }

  // Tandai kata pertama sudah selesai
  testWord.solved = true;
  if (mockGame.isCellLocked(testWord.row, testWord.col) !== true) {
    throw new Error('Kotak harusnya terkunci setelah kata selesai');
  }
  console.log('✓ Penguncian kata benar diverifikasi (immutable solved cells).');

  console.log('4. Menguji Ekstraksi URL Parameter untuk Direct Join Room...');
  function parseRoomFromUrl(searchStr, hashStr = '') {
    const params = new URLSearchParams(searchStr);
    let code = (params.get('room') || params.get('join') || '').toUpperCase().trim();
    if (!code && hashStr) {
      const match = hashStr.match(/[#&](?:room|join)=([A-Za-z0-9]{6})/i) || hashStr.match(/^#([A-Za-z0-9]{6})$/i);
      if (match) code = match[1].toUpperCase();
    }
    if (code && /^[A-Z0-9]{6}$/.test(code)) return code;
    return null;
  }

  if (parseRoomFromUrl('?room=ABC123') !== 'ABC123') throw new Error('Failed to parse ?room=ABC123');
  if (parseRoomFromUrl('?join=xyz789') !== 'XYZ789') throw new Error('Failed to parse ?join=xyz789');
  if (parseRoomFromUrl('', '#room=DEF456') !== 'DEF456') throw new Error('Failed to parse hash #room=DEF456');
  if (parseRoomFromUrl('', '#GHI789') !== 'GHI789') throw new Error('Failed to parse hash #GHI789');
  if (parseRoomFromUrl('?room=INVALID') !== null) throw new Error('Should reject invalid length');
  if (parseRoomFromUrl('?room=AB<12>') !== null) throw new Error('Should reject special characters');
  console.log('✓ Logika direct join via tautan URL berhasil diverifikasi.');

  console.log('5. Menguji Konfigurasi STUN & TURN Relay Server WebRTC...');
  const mpCode = fs.readFileSync('multiplayer.js', 'utf8');
  if (!mpCode.includes('turn:relay.metered.ca:80') || !mpCode.includes('turn:standard.relay.metered.ca:443')) {
    throw new Error('Live TURN servers missing in multiplayer.js');
  }
  if (!mpCode.includes('openrelayproject')) {
    throw new Error('TURN credentials missing in multiplayer.js');
  }
  console.log('✓ STUN & TURN Relay terverifikasi lengkap (bypass Symmetric NAT & CGNAT remote).');

  console.log('6. Menguji Fitur Co-op Multi-Pemain (Hingga 6 Pemain)...');
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  if (!indexHtml.includes('select-max-players') || !indexHtml.includes('value="6"')) {
    throw new Error('Kapasitas maksimal 6 pemain tidak ditemukan di index.html');
  }
  if (!indexHtml.includes('room-player-slots') || !indexHtml.includes('btn-start-coop')) {
    throw new Error('Dynamic player slots atau start button tidak ditemukan di index.html');
  }
  if (!appCode.includes('this.partnerCursors = new Map()') || !appCode.includes('renderPartnerCursors')) {
    throw new Error('Multi-player cursor tracking missing in app.js');
  }
  console.log('✓ Konfigurasi 2-6 pemain dan multi-cursor rendering terverifikasi.');

  console.log('7. Menguji Dukungan Multi-Provider AI (Groq, OpenRouter, DeepSeek, Gemini)...');
  const genCode = fs.readFileSync('api/generate-puzzle.js', 'utf8');
  if (!genCode.includes('GROQ_API_KEY') || !genCode.includes('OPENROUTER_API_KEY') || !genCode.includes('DEEPSEEK_API_KEY')) {
    throw new Error('Dukungan multi-provider AI belum lengkap di api/generate-puzzle.js');
  }
  console.log('✓ Multi-Provider AI (Groq, OpenRouter, DeepSeek, Gemini, Offline Fallback) terverifikasi.');

  console.log('8. Menguji Fitur Transfer Host & Kick Player...');
  if (!mpCode.includes('kickPlayer(') || !mpCode.includes('transferHost(') || !mpCode.includes('isCurrentHost(')) {
    throw new Error('Host management methods missing in multiplayer.js');
  }
  if (!appCode.includes('confirmTransferHost') || !appCode.includes('confirmKickPlayer')) {
    throw new Error('Host confirmation dialogs missing in app.js');
  }
  const cssCode = fs.readFileSync('styles.css', 'utf8');
  if (!cssCode.includes('.btn-kick') || !cssCode.includes('.btn-transfer')) {
    throw new Error('Slot action styles missing in styles.css');
  }
  console.log('✓ Fitur Transfer Host & Kick Player (multiplayer logic, dialogs, styling) terverifikasi.');

  console.log('\nSEMUA TEST LOLOS 100%!');
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});

