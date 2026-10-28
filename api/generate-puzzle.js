// api/generate-puzzle.js
// Vercel Serverless Function: Proxy Google Gemini untuk generate TTS SilangKata

if (!process.env.GEMINI_API_KEY && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile('.env.local'); } catch (_) {}
  try { process.loadEnvFile('.env'); } catch (_) {}
}

const THEMES = [
  'hewan', 'buah', 'transportasi', 'olahraga', 'makanan', 'teknologi',
  'umum', 'ipa', 'ips', 'campuran', 'acak'
];

const DIFFICULTY_MAP = {
  easy: {
    label: 'Mudah',
    minLen: 4,
    maxLen: 8,
    desc: 'Pertanyaan sangat langsung, fakta dasar yang umum diketahui, tanpa jebakan atau teka-teki rumit. Kosakata sehari-hari.'
  },
  medium: {
    label: 'Sedang',
    minLen: 4,
    maxLen: 8,
    desc: 'Pertanyaan wawasan umum standar yang membutuhkan asosiasi atau memori pengetahuan, tidak terlalu mudah tetapi tidak berbelit.'
  },
  hard: {
    label: 'Sulit',
    minLen: 4,
    maxLen: 8,
    desc: 'Pertanyaan berupa teka-teki menantang, kuis wawasan mendalam, definisi istilah ilmiah/sejarah spesifik, atau petunjuk cerdas yang menguji pengetahuan.'
  }
};

// In-memory cache selama 10 menit (600.000 ms)
const CACHE_TTL_MS = 10 * 60 * 1000;
const puzzleCache = new Map();

// Kamus fallback Bahasa Indonesia berkualitas tinggi jika API key belum ada / kuota habis
const FALLBACK_DICTIONARIES = {
  hewan: [
    { word: 'KUCING', clue: 'Hewan berkaki empat suka mendengkur dan makan ikan' },
    { word: 'KELINCI', clue: 'Mamalia bertelinga panjang yang suka wortel' },
    { word: 'KAMBING', clue: 'Hewan berkaki empat yang suka makan rumput dan bersuara mbe' },
    { word: 'BURUNG', clue: 'Unggas bersayap yang dapat terbang bebas di angkasa' },
    { word: 'GAJAH', clue: 'Hewan darat raksasa berbelalai panjang dan bertaring gading' },
    { word: 'SINGA', clue: 'Raja hutan bersurai lebat pemangsa tangguh di padang savana' },
    { word: 'HARIMAU', clue: 'Kucing besar bermotif loreng oranye dan hitam' },
    { word: 'ZEBRA', clue: 'Kuda liar afrika berbelang hitam putih khas' },
    { word: 'MONYET', clue: 'Primata cerdas berekor yang lincah bergelantungan di pohon' },
    { word: 'JERAPAH', clue: 'Hewan tertinggi di dunia dengan leher yang sangat panjang' },
    { word: 'LUMBA', clue: 'Mamalia air yang cerdas, ramah, dan bernapas dengan paru' },
    { word: 'BADAK', clue: 'Hewan bercula satu atau dua bercula keras di ujung hidung' },
    { word: 'PENGUIN', clue: 'Burung kutub berbulu hitam putih yang mahir berenang' },
    { word: 'ELANG', clue: 'Burung pemangsa dengan penglihatan tajam dan cakar kuat' },
    { word: 'BEBEK', clue: 'Unggas air paruh pipih yang suka berenang dan bersuara kwek' },
    { word: 'BERUANG', clue: 'Mamalia berbulu tebal pencinta madu dan ikan salmon' },
    { word: 'LANDAK', clue: 'Hewan pengerat bertubuh duri tajam pelindung diri' },
    { word: 'KANGGURU', clue: 'Marsupial khas Australia pelompat dengan kantung di perut' },
    { word: 'TUPAI', clue: 'Hewan pengerat berekor lebat pemanjat pohon yang suka kacang' },
    { word: 'KOMODO', clue: 'Kadal raksasa purba endemik pulau Nusa Tenggara' },
    { word: 'KURA', clue: 'Reptil bercangkang keras pembawa rumah di punggungnya' },
    { word: 'PANDA', clue: 'Mamalia berbulu hitam putih dari Tiongkok pemakan bambu' }
  ],
  buah: [
    { word: 'MANGGA', clue: 'Buah tropis manis dengan daging oranye dan biji pipih' },
    { word: 'PISANG', clue: 'Buah berkulit kuning lembut kaya kalium kesukaan monyet' },
    { word: 'JERUK', clue: 'Buah bulat berkulit oranye kaya vitamin C dengan rasa segar' },
    { word: 'APEL', clue: 'Buah renyah berwarna merah atau hijau lambang kesehatan' },
    { word: 'MELON', clue: 'Buah beraroma wangi manis dengan jaring di permukaan kulitnya' },
    { word: 'SEMANGKA', clue: 'Buah besar berkulit hijau berair banyak dengan daging merah' },
    { word: 'DURIAN', clue: 'Raja buah beraroma tajam menyengat dan berkulit duri keras' },
    { word: 'PEPAYA', clue: 'Buah lonjong oranye manis dengan biji hitam bulat kecil' },
    { word: 'ANGGUR', clue: 'Buah bulat kecil bergelantungan dalam tandan ungu atau hijau' },
    { word: 'NANAS', clue: 'Buah berkulit sisik kasar dengan mahkota daun berduri' },
    { word: 'LEMON', clue: 'Jeruk lonjong kuning cerah dengan rasa asam pekat' },
    { word: 'SALAK', clue: 'Buah tropis dengan kulit bersisik mirip kulit ular' },
    { word: 'JAMBU', clue: 'Buah biji renyah kaya vitamin C berkulit hijau atau merah' },
    { word: 'ALPUKAT', clue: 'Buah berdaging mentega hijau lembut berlemak sehat' },
    { word: 'LECI', clue: 'Buah bulat kecil kulit merah berbintik daging putih bening' },
    { word: 'RAMBUTAN', clue: 'Buah berkulit merah berbulu lebat berdaging manis berair' },
    { word: 'MANGGIS', clue: 'Ratu buah berkulit ungu tebal berdaging putih bersegmen' },
    { word: 'SIRSAK', clue: 'Buah berkulit duri lembut berdaging putih asam segar' },
    { word: 'KELENGKENG', clue: 'Buah bulat berkulit cokelat tipis manis berbiji hitam mengilat' },
    { word: 'BELIMBING', clue: 'Buah berpenampang bintang saat diiris melintang segar berair' },
    { word: 'KEDONDONG', clue: 'Buah hijau asam renyah berakar serat di bijinya' },
    { word: 'MARKISA', clue: 'Buah berbulir kuning asam segar beraroma tajam' }
  ],
  teknologi: [
    { word: 'KOMPUTER', clue: 'Perangkat elektronik pemroses data digital' },
    { word: 'INTERNET', clue: 'Jaringan global penghubung komputer di seluruh dunia' },
    { word: 'ROBOT', clue: 'Mesin otomatis yang dapat menjalankan perintah terprogram' },
    { word: 'SATELIT', clue: 'Benda pengorbit bumi untuk transmisi sinyal dan cuaca' },
    { word: 'SERVER', clue: 'Komputer pusat penyedia layanan data bagi client' },
    { word: 'KAMERA', clue: 'Alat optik perekam gambar diam atau bergerak' },
    { word: 'MONITOR', clue: 'Layar penampil visual output komputer' },
    { word: 'KEYBOARD', clue: 'Papan tombol ketik input huruf dan angka' },
    { word: 'KODING', clue: 'Aktivitas menulis baris perintah kode perangkat lunak' },
    { word: 'DATA', clue: 'Kumpulan fakta atau angka terstruktur dalam sistem' },
    { word: 'SENSOR', clue: 'Komponen pendeteksi perubahan fisik dan sinyal' },
    { word: 'SINYAL', clue: 'Gelombang elektromagnetik pembawa informasi nirkabel' },
    { word: 'MODEM', clue: 'Alat pengubah sinyal analog ke digital untuk internet' },
    { word: 'MOUSE', clue: 'Alat penunjuk kursor komputer beroda gulir' },
    { word: 'KABEL', clue: 'Penghantar listrik atau serat optik untuk arus data' },
    { word: 'LAPTOP', clue: 'Komputer jinjing portabel berlayar lipat' },
    { word: 'DATABASE', clue: 'Basis data terpusat penyimpanan rekaman sistem' },
    { word: 'PROGRAM', clue: 'Rangkaian instruksi terstruktur untuk dieksekusi mesin' },
    { word: 'SISTEM', clue: 'Kumpulan elemen saling terintegrasi mencapai satu tujuan' },
    { word: 'APLIKASI', clue: 'Perangkat lunak terapan yang dijalankan pengguna' },
    { word: 'CHIP', clue: 'Sirkuit terpadu mini silikon pengendali perangkat' },
    { word: 'PIXEL', clue: 'Titik terkecil pembentuk citra gambar digital di layar' }
  ],
  makanan: [
    { word: 'RENDANG', clue: 'Masakan daging khas Minang bercita rasa gurih rempah pekat' },
    { word: 'BAKSO', clue: 'Bola daging kenyal disajikan dalam mangkuk kuah kaldu hangat' },
    { word: 'SATE', clue: 'Daging tusuk panggang arang disiram bumbu kacang gurih' },
    { word: 'SOTO', clue: 'Sup berkuah kuning kunyit isi daging dan tauge segar' },
    { word: 'GADO', clue: 'Salad sayuran rebus khas Betawi berlumur bumbu kacang' },
    { word: 'NASI', clue: 'Beras yang telah dimasak menjadi makanan pokok utama' },
    { word: 'GORENGAN', clue: 'Camilan renyah digoreng minyak gurih seperti tempe mendoan' },
    { word: 'PEMPEK', clue: 'Olahan ikan khas Palembang berpadu kuah cuko asam pedas' },
    { word: 'RAWON', clue: 'Sup daging sapi khas Jawa Timur berkuah hitam pekat kluwek' },
    { word: 'LONTONG', clue: 'Beras padat dibungkus daun pisang direbus empuk' },
    { word: 'MARTABAK', clue: 'Kue tebal manis bersarang atau telur gurih berlipat renyah' },
    { word: 'KERUPUK', clue: 'Makanan renyah terbuat dari tapioka teman setia makan nasi' },
    { word: 'TEMPE', clue: 'Kedelai fermentasi kaya protein khas Nusantara' },
    { word: 'TAHU', clue: 'Endapan kedelai putih bertekstur lembut' },
    { word: 'SAMBAL', clue: 'Ulekan cabai pedas pembakar selera makan' },
    { word: 'GUDEG', clue: 'Nangka muda manis gurih khas Yogyakarta dengan krecek' },
    { word: 'RUJAK', clue: 'Irisan buah segar berpadu sambal gula merah pedas' },
    { word: 'KLEPON', clue: 'Kue bulat kenyal berlumur kelapa berisi gula merah cair' },
    { word: 'SIOMAY', clue: 'Olahan ikan kukus khas Bandung berteman saus kacang' },
    { word: 'BATAGOR', clue: 'Bakso tahu goreng renyah disiram kuah kacang gurih' },
    { word: 'SERABI', clue: 'Pancake tradisional tepung beras disiram kuah kinca manis' },
    { word: 'KOLAK', clue: 'Hidangan manis pisang dan ubi berkuah santan gula kelapa' }
  ],
  transportasi: [
    { word: 'PESAWAT', clue: 'Kendaraan udara bermesin jet pengangkut antar pulau' },
    { word: 'KERETA', clue: 'Rangkaian gerbong melaju di atas rel baja' },
    { word: 'KAPAL', clue: 'Kendaraan air pengarung samudra luas' },
    { word: 'SEPEDA', clue: 'Kendaraan roda dua digerakkan kayuhan pedal' },
    { word: 'MOTOR', clue: 'Kendaraan roda dua bertenaga mesin bahan bakar' },
    { word: 'MOBIL', clue: 'Kendaraan bermotor roda empat penjelajah jalan raya' },
    { word: 'BUS', clue: 'Kendaraan umum berdaya angkut banyak penumpang' },
    { word: 'PERAHU', clue: 'Wahana air tradisional dengan dayung atau layar' },
    { word: 'BECAK', clue: 'Kendaraan roda tiga kayuh tradisional perkotaan' },
    { word: 'DELMAN', clue: 'Kereta beroda dua atau empat ditarik tenaga kuda' },
    { word: 'TRUK', clue: 'Kendaraan muatan berat pengangkut logistik darat' },
    { word: 'HELIKOPTER', clue: 'Kendaraan udara berbaling-baling atas berputar cepat' },
    { word: 'METRO', clue: 'Kereta rel listrik bawah tanah perkotaan modern' },
    { word: 'SKUTER', clue: 'Sepeda motor kecil atau papan luncur bertangkal' },
    { word: 'KANO', clue: 'Perahu ramping digerakkan dengan dayung tunggal' },
    { word: 'FERI', clue: 'Kapal penyeberangan pengangkut penumpang dan kendaraan antar pulau' },
    { word: 'ANGKOT', clue: 'Mobil van angkutan kota bertrayek jalur tetap' },
    { word: 'BAJAJ', clue: 'Kendaraan roda tiga bermesin oranye khas ibukota' },
    { word: 'DOKAR', clue: 'Kereta kuda tradisional dua roda berpenumpang samping' },
    { word: 'RAKIT', clue: 'Susunan batang bambu apung di permukaan sungai' },
    { word: 'SPEEDBOAT', clue: 'Perahu motor cepat pembelah perairan laut dan danau' },
    { word: 'TRAM', clue: 'Kereta rel jalan raya yang berbagi jalan dengan pejalan kaki' }
  ],
  olahraga: [
    { word: 'FUTSAL', clue: 'Permainan bola lapangan tertutup tim 5 orang' },
    { word: 'SENAM', clue: 'Latihan olah tubuh untuk kebugaran dan kelenturan' },
    { word: 'RENANG', clue: 'Olahraga menggerakkan tubuh meluncur di kolam air' },
    { word: 'LARI', clue: 'Aktivitas melangkahkan kaki cepat menguji kecepatan' },
    { word: 'TINJU', clue: 'Olahraga adu pukulan bersarung tangan di atas ring' },
    { word: 'PANAHAN', clue: 'Olahraga membidik sasaran sasaran dengan busur panah' },
    { word: 'BASKET', clue: 'Permainan bola tangan dengan target memasukkan ke keranjang' },
    { word: 'VOLI', clue: 'Permainan memukul bola melewati net tinggi tanpa jatuh' },
    { word: 'TENIS', clue: 'Olahraga bola lentur menggunakan raket di lapangan bergaris' },
    { word: 'CATUR', clue: 'Olahraga asah otak mengatur strategi bidak di papan kotak' },
    { word: 'SEPATU', clue: 'Perlengkapan wajib atlet untuk pelindung kaki' },
    { word: 'GOLF', clue: 'Permainan memukul bola kecil masuk ke lubang di padang rumput' },
    { word: 'DAYUNG', clue: 'Olahraga memacu perahu di permukaan danau atau sungai' },
    { word: 'SILAT', clue: 'Seni bela diri warisan budaya leluhur Nusantara' },
    { word: 'BOWLING', clue: 'Olahraga melempar bola berat menggelinding ke deretan pin' },
    { word: 'KARATE', clue: 'Seni bela diri tangan kosong asal negeri Jepang' },
    { word: 'JUDO', clue: 'Bela diri bantingan dan kuncian di atas matras tatami' },
    { word: 'MARATON', clue: 'Lomba lari jarak jauh legendaris sejauh 42 kilometer' },
    { word: 'JOGING', clue: 'Lari santai ritmis untuk menjaga kesehatan kardio jantung' },
    { word: 'GULAT', clue: 'Olahraga kontak fisik mengunci lawan hingga menyentuh matras' },
    { word: 'SKI', clue: 'Meluncur di atas permukaan salju dengan papan khusus' },
    { word: 'SURFING', clue: 'Olahraga menunggangi ombak laut dengan papan selancar' }
  ],
  umum: [
    { word: 'IBUKOTA', clue: 'Pusat administrasi pemerintahan suatu negara' },
    { word: 'KOMPAS', clue: 'Alat navigasi penunjuk empat arah mata angin' },
    { word: 'SAMUDRA', clue: 'Lautan luas membentang yang mengelilingi benua' },
    { word: 'BENDERA', clue: 'Secarik kain berkibar lambang kedaulatan negara' },
    { word: 'RUPIAH', clue: 'Mata uang resmi Negara Kesatuan Republik Indonesia' },
    { word: 'MONAS', clue: 'Monumen tugu dengan lidah api emas di Jakarta' },
    { word: 'GARUDA', clue: 'Lambang negara Indonesia yang mencengkeram pita semboyan' },
    { word: 'MUSEUM', clue: 'Gedung penyimpanan dan pameran benda bersejarah' },
    { word: 'PASPOR', clue: 'Dokumen resmi identitas warga untuk lintas negara' },
    { word: 'KARTINI', clue: 'Pahlawan emansipasi perempuan pejuang pendidikan' },
    { word: 'PANCASILA', clue: 'Dasar falsafah dan ideologi bangsa Indonesia' },
    { word: 'BOROBUDUR', clue: 'Candi Buddha megah peninggalan Dinasti Syailendra' },
    { word: 'BALI', clue: 'Pulau dewata tujuan wisata dunia tersohor di Indonesia' },
    { word: 'SABANG', clue: 'Kota kepulauan paling barat di ujung nusantara' },
    { word: 'MERAUKE', clue: 'Kota paling timur wilayah perbatasan Papua Indonesia' },
    { word: 'BAHASA', clue: 'Sistem komunikasi bunyi dan lambang antar manusia' }
  ],
  ipa: [
    { word: 'OKSIGEN', clue: 'Gas penyusun udara yang dihirup saat bernapas' },
    { word: 'ATOM', clue: 'Partikel materi terkecil yang tak dapat dibagi lagi' },
    { word: 'ENERGI', clue: 'Kemampuan atau daya untuk melakukan usaha fisik' },
    { word: 'MAGMA', clue: 'Cairan batuan pijar bersuhu tinggi di perut bumi' },
    { word: 'FOSIL', clue: 'Sisa atau jejak makhluk hidup purba yang membatu' },
    { word: 'NEURON', clue: 'Sel saraf pengirim impuls listrik dalam otak' },
    { word: 'PLANET', clue: 'Benda langit pengorbit bintang induknya' },
    { word: 'MAMALIA', clue: 'Hewan berdarah panas yang menyusui anaknya' },
    { word: 'BAKTERI', clue: 'Mikroorganisme sel tunggal mikroskopis' },
    { word: 'HABITAT', clue: 'Lingkungan alami tempat tinggal suatu makhluk' },
    { word: 'RADIASI', clue: 'Pancaran energi melalui gelombang elektromagnetik' },
    { word: 'PUPIL', clue: 'Celah bundar di tengah bola mata pengatur cahaya' },
    { word: 'LAMBUNG', clue: 'Organ pencernaan pengolah makanan dengan asam kuat' },
    { word: 'JANTUNG', clue: 'Organ pemompa darah berotot ke seluruh tubuh' },
    { word: 'GENETIKA', clue: 'Cabang ilmu biologi pewarisan sifat keturunan' },
    { word: 'ANATOMI', clue: 'Studi ilmiah mengenai struktur tubuh makhluk hidup' }
  ],
  ips: [
    { word: 'SEJARAH', clue: 'Peristiwa masa lampau yang tersusun secara kronologis' },
    { word: 'ARTEFAK', clue: 'Benda peninggalan arkeologis buatan manusia purba' },
    { word: 'PRASASTI', clue: 'Piagam kuno terpahat pada permukaan batu atau logam' },
    { word: 'KERAJAAN', clue: 'Bentuk pemerintahan berpuncak pada raja atau sultan' },
    { word: 'MATARAM', clue: 'Kerajaan agraris kuno di Jawa pembangun candi megah' },
    { word: 'KOLONI', clue: 'Negeri jajahan yang dikuasai oleh kekuasaan asing' },
    { word: 'BARTER', clue: 'Sistem perdagangan tukar menukar barang tanpa uang' },
    { word: 'EKONOMI', clue: 'Ilmu pengelolaan sumber daya, produksi, dan konsumsi' },
    { word: 'KULTUR', clue: 'Adat istiadat, nilai budi daya, dan kebudayaan hidup' },
    { word: 'ETNIS', clue: 'Kelompok masyarakat dengan kesamaan garis keturunan' },
    { word: 'PASAR', clue: 'Pusat interaksi bertemunya penjual dan pembeli komoditas' },
    { word: 'SOSIAL', clue: 'Segala hal terkait pergaulan dan tatanan masyarakat' },
    { word: 'INFLASI', clue: 'Kecenderungan kenaikan harga barang umum terus menerus' },
    { word: 'SUKU', clue: 'Golongan masyarakat bagian dari satu kesatuan bangsa' },
    { word: 'TRADISI', clue: 'Kebiasaan adat turun-temurun dari nenek moyang' },
    { word: 'ARSIP', clue: 'Koleksi dokumen rekaman sejarah yang disimpan teratur' }
  ],
  campuran: [
    { word: 'OKSIGEN', clue: 'Gas esensial yang dihirup manusia saat bernapas (Sains)' },
    { word: 'RENDANG', clue: 'Masakan daging Minangkabau kaya rempah gurih (Kuliner)' },
    { word: 'INTERNET', clue: 'Jaringan raksasa penghubung komputer di dunia (Teknologi)' },
    { word: 'KOMPAS', clue: 'Alat navigasi penunjuk arah utara magnetik (Umum)' },
    { word: 'JANTUNG', clue: 'Organ vital pemompa aliran darah tubuh (Biologi)' },
    { word: 'SEJARAH', clue: 'Catatan peristiwa masa lampau umat manusia (IPS)' },
    { word: 'HARIMAU', clue: 'Kucing besar pemangsa loreng penghuni hutan (Fauna)' },
    { word: 'MANGGA', clue: 'Buah tropis manis berbiji pelok pipih (Flora)' },
    { word: 'RUPIAH', clue: 'Mata uang sah Negara Republik Indonesia (Ekonomi)' },
    { word: 'ATOM', clue: 'Partikel dasar penyusun materi di alam semesta (Fisika)' },
    { word: 'ROBOT', clue: 'Mesin pintar yang dapat beroperasi otomatis (Teknologi)' },
    { word: 'KERETA', clue: 'Moda angkutan darat yang meluncur di atas rel (Transportasi)' },
    { word: 'MONAS', clue: 'Tugu lambang perjuangan rakyat dengan api emas (Sejarah)' },
    { word: 'CATUR', clue: 'Permainan strategi asah otak di atas 64 petak (Olahraga)' },
    { word: 'BAKTERI', clue: 'Organisme mikroskopis bersel tunggal (Biologi)' },
    { word: 'PASAR', clue: 'Tempat transaksi perniagaan barang dan jasa (Ekonomi)' },
    { word: 'KELINCI', clue: 'Hewan mamalia berbulu halus bertelinga panjang (Fauna)' },
    { word: 'PRASASTI', clue: 'Tulisan kuno terpahat di batu peninggalan raja (Arkeologi)' },
    { word: 'LAPTOP', clue: 'Komputer jinjing dengan baterai dan layar lipat (Teknologi)' },
    { word: 'PISANG', clue: 'Buah berkulit kuning kaya kandungan kalium (Flora)' },
    { word: 'ENERGI', clue: 'Daya untuk melakukan kerja atau menghasilkan panas (Fisika)' },
    { word: 'MUSEUM', clue: 'Balai penyimpanan benda bersejarah bernilai tinggi (Budaya)' },
    { word: 'FUTSAL', clue: 'Sepak bola lapangan lantai tim lima orang (Olahraga)' },
    { word: 'PESAWAT', clue: 'Kendaraan bersayap penjelajah langit antarkota (Transportasi)' }
  ]
};

// Membersihkan respon teks dari Gemini menjadi JSON valid
function extractJsonFromText(rawText) {
  if (!rawText) return null;
  // Hapus markdown wrapper jika ada
  let cleaned = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('JSON parse error from Gemini text:', err.message);
    return null;
  }
}

// Validasi dan normalisasi daftar kata
function validateAndFilterWords(words, minLen, maxLen, targetCount) {
  if (!Array.isArray(words)) return [];

  const seen = new Set();
  const validWords = [];

  for (const item of words) {
    if (!item || typeof item.word !== 'string' || typeof item.clue !== 'string') continue;
    const cleanWord = item.word.toUpperCase().replace(/[^A-Z]/g, '');
    const cleanClue = item.clue.trim();

    if (cleanWord.length >= minLen && cleanWord.length <= maxLen && cleanClue.length > 0) {
      if (!seen.has(cleanWord)) {
        seen.add(cleanWord);
        validWords.push({
          word: cleanWord,
          clue: cleanClue.slice(0, 75) // Batasi clue agar pas di UI
        });
      }
    }
  }

  return validWords.slice(0, targetCount);
}

// Helper untuk memanggil API berbasis OpenAI format (Groq, OpenRouter, DeepSeek)
async function callOpenAICompatible({ url, apiKey, model, promptText, timeoutMs = 15000, extraHeaders = {} }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...extraHeaders
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'Kamu adalah generator kata untuk game teka-teki silang Bahasa Indonesia SilangKata. Berikan output STRICT JSON valid tanpa format markdown.'
          },
          { role: 'user', content: promptText }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      })
    });
    clearTimeout(timer);
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 140)}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    return extractJsonFromText(content);
  } finally {
    clearTimeout(timer);
  }
}

// Helper fallback lokal jika Gemini/AI tidak tersedia
function getFallbackPuzzle(theme, difficulty, targetCount = 12) {
  const isMixed = !theme || theme === 'acak' || theme === 'campuran';
  const diffConfig = DIFFICULTY_MAP[difficulty] || DIFFICULTY_MAP.medium;
  const themeKey = isMixed ? 'campuran' : (FALLBACK_DICTIONARIES[theme] ? theme : 'campuran');
  const source = FALLBACK_DICTIONARIES[themeKey] || FALLBACK_DICTIONARIES.campuran;

  const filtered = source.filter(
    item => item.word.length >= diffConfig.minLen && item.word.length <= diffConfig.maxLen
  );

  let pool = [...(filtered.length >= targetCount ? filtered : source)];

  // Jika targetCount melebihi isi satu kategori (misal 25, 30, 40, 50 kata),
  // tambahkan kata unik dari kategori lain agar jumlah kata selalu terpenuhi
  if (pool.length < targetCount) {
    const seenWords = new Set(pool.map(item => item.word.toUpperCase()));
    const otherWords = Object.values(FALLBACK_DICTIONARIES).flat();
    for (const item of otherWords) {
      const w = (item.word || '').toUpperCase();
      if (!seenWords.has(w) && w.length >= diffConfig.minLen && w.length <= diffConfig.maxLen) {
        seenWords.add(w);
        pool.push(item);
        if (pool.length >= targetCount) break;
      }
    }
  }

  // Acak urutan kata
  const shuffled = pool.sort(() => Math.random() - 0.5);

  return {
    theme: isMixed ? 'campuran' : themeKey,
    difficulty,
    words: shuffled.slice(0, targetCount),
    source: 'fallback'
  };
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parse body / query safely
  let body = {};
  if (req.method === 'POST') {
    try {
      if (typeof req.body === 'string') {
        body = JSON.parse(req.body);
      } else if (req.body && typeof req.body === 'object') {
        body = req.body;
      }
    } catch (_) {
      body = {};
    }
  } else if (req.method === 'GET') {
    try {
      body = req.query || {};
    } catch (_) {
      body = {};
    }
  }

  // Pilih tema dan difficulty
  const rawTheme = (body.theme || '').toLowerCase().trim();
  const isMixedTheme = !rawTheme || rawTheme === 'acak' || rawTheme === 'campuran';
  let theme = isMixedTheme ? 'campuran' : rawTheme;
  if (!THEMES.includes(theme)) {
    theme = 'campuran';
  }

  let difficulty = (body.difficulty || 'medium').toLowerCase().trim();
  if (!DIFFICULTY_MAP[difficulty]) {
    difficulty = 'medium';
  }

  const diffConfig = DIFFICULTY_MAP[difficulty];

  // Target jumlah kata (user-customizable: bertahap dari 6 hingga 50 kata)
  let targetCount = parseInt(body.count || body.wordCount, 10);
  if (!targetCount || isNaN(targetCount) || targetCount < 4) {
    targetCount = 12;
  }
  targetCount = Math.min(50, Math.max(5, targetCount));

  const cacheKey = `${theme}_${difficulty}_${targetCount}`;
  const now = Date.now();

  // Cek cache in-memory
  const cached = puzzleCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return res.status(200).json({
      theme: cached.data.theme,
      difficulty: cached.data.difficulty,
      words: cached.data.words,
      cached: true
    });
  }

  const hasAnyApiKey = Boolean(
    process.env.GROQ_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.GEMINI_API_KEY
  );

  // Jika tidak ada API key di environment, langsung gunakan kamus fallback lokal
  if (!hasAnyApiKey) {
    console.warn('[AI] Tidak ada API key AI yang disetel. Menggunakan fallback lokal.');
    const fallbackData = getFallbackPuzzle(theme, difficulty, targetCount);
    return res.status(200).json(fallbackData);
  }

  const themeInstruction = isMixedTheme
    ? `Tema: CAMPURAN ANEKA BIDANG (Kombinasi acak: Pengetahuan Umum, Sains/IPA, Sejarah/IPS, Flora/Fauna, Geografi, Kuliner, Bahasa, dan Teknologi).
PENTING: Jangan terikat pada satu topik! Setiap kata HARUS berasal dari bidang/topik yang BERBEDA-BEDA agar kuis sangat bervariasi.`
    : `Tema: ${theme.toUpperCase()}`;

  const promptText = `Kamu adalah generator kata untuk game teka-teki silang Bahasa Indonesia bernama SilangKata.

${themeInstruction}
Tingkat kesulitan: ${diffConfig.label} (${difficulty})
Kriteria kesulitan: ${diffConfig.desc}
Panjang kata: 4-8 huruf (fleksibel agar mudah berpotongan di papan TTS)
Jumlah kata: ${targetCount}

Tugas: Hasilkan ${targetCount} kata Bahasa Indonesia yang:
- Panjang 4 sampai 8 huruf (semua HURUF KAPITAL, tanpa spasi/tanda baca/diakritik)
- ${isMixedTheme ? 'Berasal dari berbagai topik campuran (sains, geografi, sejarah, umum, teknologi, hewan, kuliner, dll)' : `Sesuai tema "${theme}"`}
- Tingkat kesulitan pertanyaan/clue sesuai kriteria: "${diffConfig.desc}"
- Bukan nama merek komersial atau kata terlarang
- Clue harus padat, menarik, dan informatif (maksimal 75 karakter) tanpa menyebut kata jawabannya

Format output STRICT JSON (tanpa markdown, tanpa penjelasan tambahan):
{
  "theme": "${isMixedTheme ? 'campuran' : theme}",
  "words": [
    { "word": "KATA1", "clue": "petunjuk singkat di sini" }
  ]
}`;

  let parsed = null;
  let activeSource = 'fallback';

  // 1. PRIORITAS 1: GROQ CLOUD (Super cepat ~500ms - 1 detik, free tier)
  if (!parsed && process.env.GROQ_API_KEY) {
    const groqCandidateModels = process.env.GROQ_MODEL
      ? [process.env.GROQ_MODEL]
      : ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

    for (const groqModel of groqCandidateModels) {
      try {
        console.log(`[AI] Mencoba Groq Cloud (${groqModel})...`);
        parsed = await callOpenAICompatible({
          url: 'https://api.groq.com/openai/v1/chat/completions',
          apiKey: process.env.GROQ_API_KEY,
          model: groqModel,
          promptText,
          timeoutMs: 12000
        });
        if (parsed && Array.isArray(parsed.words) && parsed.words.length >= 4) {
          activeSource = 'groq';
          console.log(`[AI] Sukses generate dari Groq Cloud (${groqModel})!`);
          break;
        }
      } catch (err) {
        console.warn(`[AI] Groq (${groqModel}) error:`, err.message);
      }
    }
  }

  // 2. PRIORITAS 2: OPENROUTER (Bisa DeepSeek free atau Llama free)
  if (!parsed && process.env.OPENROUTER_API_KEY) {
    try {
      const orModel = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat:free';
      console.log(`[AI] Mencoba OpenRouter (${orModel})...`);
      parsed = await callOpenAICompatible({
        url: 'https://openrouter.ai/api/v1/chat/completions',
        apiKey: process.env.OPENROUTER_API_KEY,
        model: orModel,
        promptText,
        timeoutMs: 15000,
        extraHeaders: {
          'HTTP-Referer': 'https://silangkata.id',
          'X-Title': 'SilangKata'
        }
      });
      if (parsed && Array.isArray(parsed.words) && parsed.words.length >= 4) {
        activeSource = 'openrouter';
        console.log('[AI] Sukses generate dari OpenRouter!');
      }
    } catch (err) {
      console.warn('[AI] OpenRouter error:', err.message);
    }
  }

  // 3. PRIORITAS 3: DEEPSEEK RESMI
  if (!parsed && process.env.DEEPSEEK_API_KEY) {
    try {
      const dsModel = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
      console.log(`[AI] Mencoba DeepSeek API (${dsModel})...`);
      parsed = await callOpenAICompatible({
        url: 'https://api.deepseek.com/chat/completions',
        apiKey: process.env.DEEPSEEK_API_KEY,
        model: dsModel,
        promptText,
        timeoutMs: 18000
      });
      if (parsed && Array.isArray(parsed.words) && parsed.words.length >= 4) {
        activeSource = 'deepseek';
        console.log('[AI] Sukses generate dari DeepSeek API!');
      }
    } catch (err) {
      console.warn('[AI] DeepSeek error:', err.message);
    }
  }

  // 4. PRIORITAS 4: GOOGLE GEMINI API
  if (!parsed && process.env.GEMINI_API_KEY) {
    const candidateModels = process.env.GEMINI_MODEL
      ? [process.env.GEMINI_MODEL]
      : ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];

    for (const model of candidateModels) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 18000);

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptText }] }],
              generationConfig: {
                temperature: 0.85,
                maxOutputTokens: 4096,
                responseMimeType: 'application/json'
              }
            })
          }
        );

        clearTimeout(timeout);

        if (!response.ok) {
          let errDetail = '';
          try {
            const errJson = await response.json();
            errDetail = errJson.error?.message || '';
          } catch (_) {}
          console.warn(`[AI] Gemini (${model}) status ${response.status}: ${errDetail || response.statusText}`);
          continue;
        }

        const data = await response.json();
        const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        parsed = extractJsonFromText(candidateText);

        if (parsed && Array.isArray(parsed.words) && parsed.words.length >= 4) {
          activeSource = 'gemini';
          console.log(`[AI] Sukses generate dari Gemini (${model})!`);
          break;
        }
      } catch (err) {
        console.warn(`[AI] Gemini (${model}) error:`, err.message);
      }
    }
  }

  try {
    // 5. PRIORITAS 5: KAMUS FALLBACK OFFLINE LOKAL (Zero Downtime)
    if (!parsed || !Array.isArray(parsed.words)) {
      console.warn('[AI] Semua provider AI tidak tersedia / gagal. Menggunakan kamus offline fallback.');
      const fallbackData = getFallbackPuzzle(theme, difficulty, targetCount);
      return res.status(200).json(fallbackData);
    }

    const validWords = validateAndFilterWords(
      parsed.words,
      diffConfig.minLen,
      diffConfig.maxLen,
      targetCount
    );

    if (validWords.length < 5) {
      console.warn('[AI] Jumlah kata valid kurang dari minimal. Menggunakan kamus offline fallback.');
      const fallbackData = getFallbackPuzzle(theme, difficulty, targetCount);
      return res.status(200).json(fallbackData);
    }

    const result = {
      theme: parsed.theme || theme,
      difficulty,
      words: validWords,
      source: activeSource
    };

    // Simpan di cache
    puzzleCache.set(cacheKey, { timestamp: now, data: result });

    return res.status(200).json(result);
  } catch (err) {
    console.error('Error saat menghubungi Gemini:', err.message);
    const fallbackData = getFallbackPuzzle(theme, difficulty, targetCount);
    return res.status(200).json(fallbackData);
  }
}
