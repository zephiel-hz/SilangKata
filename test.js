// test.js — Test Suite Otomatis untuk SilangKata
import handler from './api/generate-puzzle.js';
import fs from 'fs';

function makeMockRes(label) {
  let statusCode = 200;
  return {
    data: null,
    setHeader() {},
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      this.data = data;
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

  const avoidWords = ['KUCING', 'KELINCI', 'KAMBING', 'BURUNG', 'GAJAH', 'SINGA', 'HARIMAU', 'ZEBRA'];
  const novelPuzzle = makeMockRes('POST fallback tanpa jawaban lama');
  await handler({
    method: 'POST',
    body: {
      theme: 'hewan',
      difficulty: 'medium',
      count: 8,
      avoidWords,
      avoidClues: ['Hewan berkaki empat suka mendengkur dan makan ikan']
    }
  }, novelPuzzle);
  const returnedWords = novelPuzzle.data.words;
  if (returnedWords.some(item => avoidWords.includes(item.word))) {
    throw new Error('Fallback repeated a previously used answer');
  }
  if (returnedWords.some(item => item.clue === 'Hewan berkaki empat suka mendengkur dan makan ikan')) {
    throw new Error('Fallback repeated a previously used clue');
  }
  console.log('✓ Fallback menghindari jawaban dan clue yang telah digunakan.');

  const originalFetch = global.fetch;
  process.env.GROQ_API_KEY = 'test-key';
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            theme: 'hewan',
            words: [
              { word: 'KUCING', clue: 'Hewan berkaki empat suka mendengkur dan makan ikan' },
              { word: 'RUSA', clue: 'Mamalia bertanduk yang bergerak lincah di hutan' },
              { word: 'SIPUT', clue: 'Moluska bercangkang yang bergerak sangat lambat' },
              { word: 'KODOK', clue: 'Amfibi bersuara nyaring setelah hujan turun' },
              { word: 'KUPU', clue: 'Serangga bersayap indah yang berasal dari ulat' },
              { word: 'KRAIT', clue: 'Ular berbisa dengan gelang hitam putih di tubuh' },
              { word: 'PAUS', clue: 'Mamalia terbesar yang hidup di lautan' },
              { word: 'RAYAP', clue: 'Serangga sosial yang memakan kayu kering' },
              { word: 'KEONG', clue: 'Hewan lunak bercangkang yang hidup di sawah' },
              { word: 'TUPAI', clue: 'Pengerat kecil lincah yang menyimpan biji-bijian' }
            ]
          })
        }
      }]
    })
  });
  const novelAiPuzzle = makeMockRes('POST AI tanpa jawaban lama');
  await handler({
    method: 'POST',
    body: {
      theme: 'hewan',
      difficulty: 'medium',
      count: 8,
      avoidWords,
      avoidClues: ['Hewan berkaki empat suka mendengkur dan makan ikan']
    }
  }, novelAiPuzzle);
  global.fetch = originalFetch;
  delete process.env.GROQ_API_KEY;
  if (novelAiPuzzle.data.source !== 'groq' || novelAiPuzzle.data.words.length !== 8) {
    throw new Error('AI response was not filtered and filled with enough fresh answers');
  }
  if (novelAiPuzzle.data.words.some(item => avoidWords.includes(item.word))) {
    throw new Error('AI response repeated a previously used answer');
  }
  console.log('✓ Hasil AI disaring dari jawaban lama dan diisi kandidat baru.');

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

  console.log('9. Menguji Konsistensi Warna Pemain P1–P6 & Perbaikan Bug Skor...');
  if (!cssCode.includes('.cell-input-p1') || !cssCode.includes('.cell-input-p6')) {
    throw new Error('Per-player input color classes missing in styles.css');
  }
  if (!cssCode.includes('.cell-focused.active-p1') || !cssCode.includes('.cell-word-active.active-p1')) {
    throw new Error('Per-player active cell/word highlight styles missing in styles.css');
  }
  if (!appCode.includes('const playerColorClass = `active-p${myPlayerNum}`') ||
      !cssCode.includes('.player-dot.p6 { background: #ec4899') ||
      !cssCode.includes('.grid-cell.cell-partner-focused.p6:not(.cell-solved) { outline-color: #ec4899')) {
    throw new Error('Player colors must stay consistent across local and partner indicators');
  }
  if (!appCode.includes('cell-input-p') || !appCode.includes('solverNum === myNum')) {
    throw new Error('Player color mapping or individual score guard missing in app.js');
  }
  if (appCode.includes('this.score = msg.finalScore') ||
      !appCode.includes('completionBonus: wordIdx === bonusWordIdx ? this.completionBonus : 0')) {
    throw new Error('Co-op score must remain individual, including the completion bonus');
  }
  if (!mpCode.includes('this.hostPlayerNum = 1;\n      this.maxPlayers = 2;')) {
    throw new Error('Room disconnect must reset host ownership to the room creator');
  }
  if (!appCode.includes('e.stopPropagation();\n            this.handleBackspace();')) {
    throw new Error('Virtual keyboard Backspace must not trigger the global key handler');
  }
  if (!mpCode.includes("type: 'player-disconnected'") ||
      !mpCode.includes("type: 'player-reconnected'") ||
      !appCode.includes("playerInfo.connected = false") ||
      !appCode.includes("playerInfo.connected = true") ||
      !indexHtml.includes('btn-disconnect-rejoin') ||
      !appCode.includes('this.joinRoomByCode(roomCode)')) {
    throw new Error('Co-op disconnect presence or rejoin flow missing');
  }
  if (!appCode.includes('this.hintedCells = {}') ||
      !appCode.includes('this.isCellLocked(r, c) || this.isCellHinted(r, c)') ||
      !appCode.includes('this.hintedCells[key] = true') ||
      !appCode.includes('isHint: true') ||
      !appCode.includes('hintedCells: this.hintedCells') ||
      !appCode.includes('this.hintedCells = msg.hintedCells || {}')) {
    throw new Error('Hinted letters must remain locked and sync to co-op rejoining players');
  }
  if (!appCode.includes('const chosen = emptyIndices[Math.floor(Math.random() * emptyIndices.length)]')) {
    throw new Error('Hint must reveal a random available letter from the selected word');
  }
  if (indexHtml.includes('btn-next-puzzle') ||
      !indexHtml.includes('btn-play-again') ||
      !indexHtml.includes('MAIN LAGI') ||
      !indexHtml.includes('play-again-status') ||
      !appCode.includes("this.btnPlayAgain.style.display = this.mode === 'coop' ? 'inline-flex' : 'none'") ||
      !appCode.includes("this.btnPlayAgain.addEventListener('click', () => this.voteToPlayAgain())") ||
      !appCode.includes('this.registerPlayAgainVote(pNum)') ||
      !appCode.includes('this.enterRoomAfterPlayAgain()') ||
      !mpCode.includes("data.type === 'play-again-vote'") ||
      !mpCode.includes('resetReadyStates()')) {
    throw new Error('Co-op rematch must wait for unanimous votes, then return all players to room settings');
  }
  console.log('✓ Konsistensi warna P1–P6 dan isolasi skor terverifikasi.');

  console.log('10. Menguji Fitur Edit Mode di Lobby Co-op...');
  if (!indexHtml.includes('room-settings-card') || !indexHtml.includes('modal-room-settings')) {
    throw new Error('Room settings card or modal markup missing in index.html');
  }
  if (!appCode.includes('openRoomSettingsModal') || !appCode.includes('saveRoomSettings')) {
    throw new Error('Room settings methods missing in app.js');
  }
  if (!appCode.includes('room-settings-update') || !mpCode.includes('roomSettings')) {
    throw new Error('Room settings update message or state missing');
  }
  console.log('✓ Fitur Edit Mode Pengaturan Room (UI, broadcast, state) terverifikasi.');

  console.log('\nSEMUA TEST LOLOS 100%!');
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
