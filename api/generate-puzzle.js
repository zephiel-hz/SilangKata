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

// Sub-topik acak untuk memperkaya ragam kosakata dan mencegah AI berputar di kata klise yang itu-itu saja
const SUBTOPIC_ANGLES = {
  hewan: [
    'Fauna endemik Nusantara, satwa langka, dan hewan hutan tropis',
    'Biota laut, pesisir terumbu karang, moluska, dan ikan laut dalam',
    'Burung eksotis, unggas pemangsa, dan satwa nokturnal malam',
    'Reptil unik, amfibi perairan, serangga bermanfaat, dan hewan padang savana'
  ],
  buah: [
    'Buah tropis lokal Nusantara, buah hutan langka, dan buah eksotis',
    'Buah sitrus beraroma segar, berry, dan tanaman budidaya perkebunan',
    'Tanaman obat herbal berbuah, buah berbiji unik, dan rempah segar'
  ],
  teknologi: [
    'Jaringan komputer, protokol internet modern, keamanan siber, dan enkripsi',
    'Perangkat keras, semikonduktor silikon, arsitektur pemrosesan, dan periferal',
    'Kecerdasan buatan, algoritma data, basis data, dan rekayasa perangkat lunak',
    'Robotika, telekomunikasi satelit, sensor cerdas, dan transmisi nirkabel'
  ],
  makanan: [
    'Kuliner tradisional khas daerah di Nusantara dari Sabang sampai Merauke',
    'Jajanan pasar, kue tradisional, kudapan gurih, dan olahan tepung ketan',
    'Hidangan rempah berkuah gurih, olahan daging panggang, dan makanan fermentasi',
    'Bumbu dapur alami, hidangan laut khas pesisir, dan sambal Nusantara'
  ],
  transportasi: [
    'Perkeretaapian, trem perkotaan, lokomotif, dan moda transportasi rel modern',
    'Dunia maritim: kapal samudra, perahu layar tradisional, dan armada penyeberangan',
    'Kedirgantaraan: pesawat terbang, balon udara, helikopter, dan armada udara',
    'Transportasi darat perkotaan, angkutan umum legendaris, dan kendaraan roda'
  ],
  olahraga: [
    'Atletik lintasan lari, lompat jauh, ketangkasan senam, dan renang',
    'Olahraga raket, bola kecil, panahan sasaran, dan ketangkasan individu',
    'Olahraga bela diri tradisional Nusantara & dunia, gulat, dan tinju',
    'Olahraga strategi papan pikir, olahraga tim beregu, dan ketahanan fisik'
  ],
  umum: [
    'Geografi dunia, kepulauan Nusantara, gunung, dan bentang alam benua',
    'Tokoh sejarah besar, peradaban kuno, candi, dan warisan kebudayaan',
    'Astronomi, rasi bintang, fenomena alam, dan kalender waktu',
    'Sistem peradilan, lembaga negara, diplomasi dunia, dan wawasan global'
  ],
  ipa: [
    'Biologi makhluk hidup, anatomi organ tubuh, jaringan sel, dan genetika',
    'Fisika partikel, hukum gerak gravitasi, medan magnet, gelombang cahaya, dan energi',
    'Kimiawi unsur periodik, reaksi molekul, asam-basa, dan gas atmosfer bumi',
    'Ekosistem biosfer, rantai makanan, iklim, dan geologi lapisan bumi'
  ],
  ips: [
    'Sejarah perjuangan bangsa, kerajaan maritim/agraris, dan peristiwa bersejarah',
    'Sistem perekonomian, perbankan, perdagangan komoditas, inflasi, dan devisa',
    'Struktur sosial masyarakat, kebudayaan suku bangsa, adat, dan norma hukum',
    'Arkeologi prasasti, dokumen arsip kuno, monumen sejarah, dan dinamika penduduk'
  ],
  campuran: [
    'Kombinasi kaya lintas bidang: Biologi/Sains, Geografi Nusantara, Sejarah & Budaya, Teknologi Modern, Kuliner Tradisional, Fauna Unik, dan Olahraga'
  ]
};

// In-memory cache selama 10 menit (600.000 ms)
const CACHE_TTL_MS = 10 * 60 * 1000;
const puzzleCache = new Map();

// Kamus fallback Bahasa Indonesia berkualitas tinggi jika API key belum ada / kuota habis
const FALLBACK_DICTIONARIES = {
  hewan: [
    { word: 'KUCING', clue: 'Hewan berkaki empat ini suka mendengkur dan sering memakan ikan.' },
    { word: 'KELINCI', clue: 'Mamalia bertelinga panjang ini dikenal suka memakan wortel.' },
    { word: 'KAMBING', clue: 'Hewan berkaki empat ini memakan rumput dan mengeluarkan suara embikan.' },
    { word: 'BURUNG', clue: 'Unggas ini memiliki sayap yang dapat membantunya terbang di angkasa.' },
    { word: 'GAJAH', clue: 'Hewan darat berukuran besar ini memiliki belalai panjang dan gading.' },
    { word: 'SINGA', clue: 'Pemangsa tangguh di savana ini dikenal sebagai raja hutan dan memiliki surai lebat.' },
    { word: 'HARIMAU', clue: 'Kucing besar ini memiliki bulu oranye dengan pola belang hitam.' },
    { word: 'ZEBRA', clue: 'Kuda liar dari Afrika ini memiliki belang hitam dan putih.' },
    { word: 'MONYET', clue: 'Primata berekor ini dikenal cerdas dan lincah saat bergelantungan di pohon.' },
    { word: 'JERAPAH', clue: 'Hewan ini dikenal sebagai yang tertinggi di dunia karena lehernya sangat panjang.' },
    { word: 'LUMBA', clue: 'Mamalia laut ini dikenal cerdas, bernapas dengan paru-paru, dan sering dianggap ramah.' },
    { word: 'BADAK', clue: 'Hewan ini memiliki satu atau dua cula keras di bagian hidungnya.' },
    { word: 'PENGUIN', clue: 'Burung yang hidup di wilayah kutub ini berbulu hitam putih dan pandai berenang.' },
    { word: 'ELANG', clue: 'Burung pemangsa ini memiliki penglihatan tajam dan cakar yang kuat.' },
    { word: 'BEBEK', clue: 'Unggas air ini memiliki paruh pipih, suka berenang, dan mengeluarkan suara kwek.' },
    { word: 'BERUANG', clue: 'Mamalia berbulu tebal ini dikenal suka mencari madu dan ikan.' },
    { word: 'LANDAK', clue: 'Hewan pengerat ini memiliki duri tajam yang digunakan untuk melindungi diri.' },
    { word: 'KANGGURU', clue: 'Marsupial khas Australia ini melompat dan memiliki kantung di bagian perut.' },
    { word: 'TUPAI', clue: 'Hewan pengerat berekor lebat ini pandai memanjat pohon dan menyukai kacang.' },
    { word: 'KOMODO', clue: 'Kadal raksasa purba ini hidup secara alami di wilayah Nusa Tenggara.' },
    { word: 'KURA', clue: 'Reptil ini memiliki cangkang keras yang melindungi tubuhnya.' },
    { word: 'PANDA', clue: 'Mamalia dari Tiongkok ini berbulu hitam putih dan banyak memakan bambu.' }
  ],
  buah: [
    { word: 'MANGGA', clue: 'Buah tropis ini terasa manis, berdaging oranye, dan memiliki biji pipih.' },
    { word: 'PISANG', clue: 'Buah berkulit kuning ini bertekstur lembut dan kaya akan kalium.' },
    { word: 'JERUK', clue: 'Buah bulat berkulit oranye ini terasa segar dan kaya akan vitamin C.' },
    { word: 'APEL', clue: 'Buah ini bertekstur renyah, dapat berwarna merah atau hijau, dan sering dianggap menyehatkan.' },
    { word: 'MELON', clue: 'Buah ini beraroma harum, terasa manis, dan memiliki pola seperti jaring pada kulitnya.' },
    { word: 'SEMANGKA', clue: 'Buah berukuran besar ini berkulit hijau, berdaging merah, dan mengandung banyak air.' },
    { word: 'DURIAN', clue: 'Buah yang dijuluki raja buah ini memiliki aroma tajam dan kulit berduri keras.' },
    { word: 'PEPAYA', clue: 'Buah lonjong ini berdaging oranye, terasa manis, dan memiliki biji hitam kecil.' },
    { word: 'ANGGUR', clue: 'Buah kecil berbentuk bulat ini tumbuh dalam tandan yang dapat berwarna ungu atau hijau.' },
    { word: 'NANAS', clue: 'Buah ini memiliki kulit kasar bersisik dan mahkota daun yang berduri.' },
    { word: 'LEMON', clue: 'Buah berbentuk lonjong dan berwarna kuning cerah ini memiliki rasa asam pekat.' },
    { word: 'SALAK', clue: 'Buah tropis ini memiliki kulit bersisik yang menyerupai kulit ular.' },
    { word: 'JAMBU', clue: 'Buah ini dapat berkulit hijau atau merah dan dikenal kaya vitamin C.' },
    { word: 'ALPUKAT', clue: 'Buah ini berdaging hijau lembut dan mengandung lemak sehat.' },
    { word: 'LECI', clue: 'Buah kecil berbentuk bulat ini berkulit merah berbintik dan berdaging putih bening.' },
    { word: 'RAMBUTAN', clue: 'Buah berkulit merah ini memiliki rambut lebat serta daging yang manis dan berair.' },
    { word: 'MANGGIS', clue: 'Buah yang dijuluki ratu buah ini berkulit ungu tebal dan berdaging putih bersegmen.' },
    { word: 'SIRSAK', clue: 'Buah ini memiliki kulit berduri lembut, daging putih, dan rasa asam yang segar.' },
    { word: 'KELENGKENG', clue: 'Buah bulat ini berkulit cokelat tipis, terasa manis, dan memiliki biji hitam mengilat.' },
    { word: 'BELIMBING', clue: 'Buah ini tampak seperti bintang saat diiris melintang serta terasa segar dan berair.' },
    { word: 'KEDONDONG', clue: 'Buah hijau ini terasa asam dan renyah serta memiliki biji berserat.' },
    { word: 'MARKISA', clue: 'Buah ini memiliki bulir kuning, rasa asam segar, dan aroma yang tajam.' }
  ],
  teknologi: [
    { word: 'KOMPUTER', clue: 'Perangkat elektronik ini memproses data dalam bentuk digital.' },
    { word: 'INTERNET', clue: 'Jaringan global ini menghubungkan komputer di berbagai penjuru dunia.' },
    { word: 'ROBOT', clue: 'Mesin otomatis ini dapat menjalankan perintah yang sudah diprogram.' },
    { word: 'SATELIT', clue: 'Benda yang mengorbit Bumi ini dapat membantu mengirimkan sinyal dan memantau cuaca.' },
    { word: 'SERVER', clue: 'Komputer pusat ini menyediakan layanan dan data bagi perangkat lain.' },
    { word: 'KAMERA', clue: 'Alat optik ini digunakan untuk merekam gambar diam maupun bergerak.' },
    { word: 'MONITOR', clue: 'Layar ini menampilkan keluaran visual dari sebuah komputer.' },
    { word: 'KEYBOARD', clue: 'Papan tombol ini digunakan untuk mengetik huruf dan angka.' },
    { word: 'KODING', clue: 'Kegiatan ini melibatkan penulisan instruksi untuk membuat perangkat lunak.' },
    { word: 'DATA', clue: 'Kumpulan fakta atau angka ini disusun agar dapat diolah oleh sebuah sistem.' },
    { word: 'SENSOR', clue: 'Komponen ini mendeteksi perubahan fisik atau sinyal di sekitarnya.' },
    { word: 'SINYAL', clue: 'Gelombang elektromagnetik ini dapat membawa informasi tanpa kabel.' },
    { word: 'MODEM', clue: 'Alat ini mengubah sinyal analog menjadi digital agar perangkat dapat terhubung ke jaringan.' },
    { word: 'MOUSE', clue: 'Alat ini menggerakkan penunjuk pada layar dan biasanya dilengkapi roda gulir.' },
    { word: 'KABEL', clue: 'Penghantar ini membawa listrik atau data melalui serat optik.' },
    { word: 'LAPTOP', clue: 'Komputer portabel ini memiliki layar yang dapat dilipat.' },
    { word: 'DATABASE', clue: 'Kumpulan rekaman ini disimpan secara terpusat agar mudah dikelola.' },
    { word: 'PROGRAM', clue: 'Rangkaian instruksi terstruktur ini dibuat agar dapat dijalankan oleh mesin.' },
    { word: 'SISTEM', clue: 'Kumpulan elemen yang saling terhubung ini bekerja untuk mencapai suatu tujuan.' },
    { word: 'APLIKASI', clue: 'Perangkat lunak ini dirancang untuk menjalankan fungsi yang digunakan oleh pengguna.' },
    { word: 'CHIP', clue: 'Sirkuit terpadu berukuran kecil ini dibuat dari silikon untuk mengendalikan perangkat.' },
    { word: 'PIXEL', clue: 'Titik terkecil ini membentuk gambar digital yang terlihat pada layar.' }
  ],
  makanan: [
    { word: 'RENDANG', clue: 'Masakan khas Minangkabau ini dimasak lama dengan santan dan rempah.' },
    { word: 'BAKSO', clue: 'Bola daging ini disajikan dalam kuah kaldu yang hangat.' },
    { word: 'SATE', clue: 'Potongan daging ini ditusuk, dibakar, lalu disajikan dengan bumbu kacang.' },
    { word: 'SOTO', clue: 'Hidangan berkuah ini biasanya berisi daging, tauge, dan rempah.' },
    { word: 'GADO', clue: 'Salad sayuran khas Betawi ini disajikan dengan saus kacang.' },
    { word: 'NASI', clue: 'Beras yang dimasak hingga lunak ini menjadi makanan pokok banyak orang.' },
    { word: 'GORENGAN', clue: 'Camilan ini dimasak dalam minyak panas hingga renyah dan keemasan.' },
    { word: 'PEMPEK', clue: 'Makanan khas Palembang ini dibuat dari ikan dan tepung sagu.' },
    { word: 'RAWON', clue: 'Sup daging sapi khas Jawa Timur ini berwarna hitam karena kluwek.' },
    { word: 'LONTONG', clue: 'Beras yang dibungkus daun pisang ini direbus hingga padat dan empuk.' },
    { word: 'MARTABAK', clue: 'Hidangan ini tersedia dalam varian manis dan varian asin yang berisi telur.' },
    { word: 'KERUPUK', clue: 'Adonan berbahan tepung ini digoreng hingga mengembang dan renyah.' },
    { word: 'TEMPE', clue: 'Kedelai ini difermentasi dengan kapang hingga menyatu menjadi satu keping.' },
    { word: 'TAHU', clue: 'Olahan kedelai ini dibuat dengan menggumpalkan sari kedelai.' },
    { word: 'SAMBAL', clue: 'Bumbu ini dibuat dari cabai yang diulek bersama bahan lain.' },
    { word: 'GUDEG', clue: 'Masakan khas Yogyakarta ini dibuat dari nangka muda dan santan.' },
    { word: 'RUJAK', clue: 'Potongan buah ini disantap dengan bumbu yang bercita rasa pedas dan manis.' },
    { word: 'KLEPON', clue: 'Kue berbentuk bulat ini berisi gula merah dan berbalut kelapa parut.' },
    { word: 'SIOMAY', clue: 'Makanan kukus ini biasanya disajikan dengan saus kacang dan kecap.' },
    { word: 'BATAGOR', clue: 'Tahu dan adonan ikan ini digoreng, lalu disajikan dengan saus kacang.' },
    { word: 'SERABI', clue: 'Kue berbahan tepung beras ini dimasak di cetakan dan disajikan dengan kinca.' },
    { word: 'KOLAK', clue: 'Pisang dan ubi dimasak dalam kuah santan yang diberi gula merah.' }
  ],
  transportasi: [
    { word: 'PESAWAT', clue: 'Kendaraan udara bermesin jet ini digunakan untuk mengangkut penumpang antarpulau.' },
    { word: 'KERETA', clue: 'Rangkaian gerbong ini melaju di atas rel baja.' },
    { word: 'KAPAL', clue: 'Kendaraan air ini dapat mengarungi samudra yang luas.' },
    { word: 'SEPEDA', clue: 'Kendaraan beroda dua ini bergerak saat pengendaranya mengayuh pedal.' },
    { word: 'MOTOR', clue: 'Kendaraan beroda dua ini digerakkan oleh mesin berbahan bakar.' },
    { word: 'MOBIL', clue: 'Kendaraan bermotor beroda empat ini digunakan untuk bepergian melalui jalan raya.' },
    { word: 'BUS', clue: 'Kendaraan umum ini dirancang untuk mengangkut banyak penumpang.' },
    { word: 'PERAHU', clue: 'Wahana air tradisional ini digerakkan dengan dayung atau layar.' },
    { word: 'BECAK', clue: 'Kendaraan tradisional perkotaan beroda tiga ini bergerak dengan kayuhan.' },
    { word: 'DELMAN', clue: 'Kereta tradisional beroda dua atau empat ini ditarik oleh kuda.' },
    { word: 'TRUK', clue: 'Kendaraan darat ini digunakan untuk mengangkut muatan berat dan barang logistik.' },
    { word: 'HELIKOPTER', clue: 'Kendaraan udara ini terbang dengan bantuan baling-baling yang berputar cepat di atasnya.' },
    { word: 'METRO', clue: 'Kereta listrik ini melaju di jalur bawah tanah perkotaan.' },
    { word: 'SKUTER', clue: 'Kendaraan ini dapat berupa sepeda motor kecil atau papan luncur bertangkai.' },
    { word: 'KANO', clue: 'Perahu ramping ini digerakkan dengan satu dayung.' },
    { word: 'FERI', clue: 'Kapal penyeberangan ini mengangkut penumpang dan kendaraan antarpulau.' },
    { word: 'ANGKOT', clue: 'Mobil van ini melayani angkutan kota dengan rute tetap.' },
    { word: 'BAJAJ', clue: 'Kendaraan bermesin beroda tiga ini dikenal sebagai angkutan khas ibu kota.' },
    { word: 'DOKAR', clue: 'Kereta tradisional beroda dua ini ditarik kuda dan memiliki tempat duduk untuk penumpang.' },
    { word: 'RAKIT', clue: 'Wahana apung ini dibuat dari batang bambu yang disusun dan dapat digunakan di sungai.' },
    { word: 'SPEEDBOAT', clue: 'Perahu bermotor ini melaju cepat di perairan laut maupun danau.' },
    { word: 'TRAM', clue: 'Kereta ini melaju di rel yang berada di jalan raya dan berbagi ruang dengan pengguna jalan lain.' }
  ],
  olahraga: [
    { word: 'FUTSAL', clue: 'Permainan bola ini dilakukan di lapangan tertutup oleh dua tim yang masing-masing terdiri atas lima orang.' },
    { word: 'SENAM', clue: 'Latihan olah tubuh ini membantu meningkatkan kebugaran dan kelenturan.' },
    { word: 'RENANG', clue: 'Olahraga air ini dilakukan dengan menggerakkan tubuh di dalam kolam.' },
    { word: 'LARI', clue: 'Aktivitas ini dilakukan dengan melangkahkan kaki secara cepat untuk menguji kecepatan.' },
    { word: 'TINJU', clue: 'Olahraga adu pukulan ini dilakukan dengan sarung tangan di atas ring.' },
    { word: 'PANAHAN', clue: 'Dalam olahraga ini, peserta membidik sasaran menggunakan busur dan anak panah.' },
    { word: 'BASKET', clue: 'Dalam permainan bola ini, para pemain berusaha memasukkan bola ke keranjang.' },
    { word: 'VOLI', clue: 'Dalam permainan ini, para pemain memukul bola melewati net tanpa membiarkannya jatuh.' },
    { word: 'TENIS', clue: 'Olahraga lapangan ini dimainkan dengan bola lentur dan alat pemukul berjaring.' },
    { word: 'CATUR', clue: 'Permainan asah otak ini mengandalkan strategi untuk menggerakkan bidak di papan kotak.' },
    { word: 'SEPATU', clue: 'Alas kaki ini melindungi kaki atlet saat berlatih atau bertanding.' },
    { word: 'GOLF', clue: 'Dalam permainan ini, peserta memukul bola kecil agar masuk ke lubang di padang rumput.' },
    { word: 'DAYUNG', clue: 'Olahraga ini mengharuskan peserta menggerakkan perahu di danau atau sungai.' },
    { word: 'SILAT', clue: 'Seni bela diri ini diwariskan sebagai bagian dari budaya leluhur Nusantara.' },
    { word: 'BOWLING', clue: 'Dalam olahraga ini, peserta menggelindingkan bola berat ke arah deretan pin.' },
    { word: 'KARATE', clue: 'Seni bela diri tangan kosong ini berasal dari Jepang.' },
    { word: 'JUDO', clue: 'Bela diri ini menggunakan teknik bantingan dan kuncian di atas matras.' },
    { word: 'MARATON', clue: 'Lomba lari jarak jauh ini menempuh jarak sekitar 42 kilometer.' },
    { word: 'JOGING', clue: 'Lari santai dengan irama teratur ini dapat membantu menjaga kesehatan jantung.' },
    { word: 'GULAT', clue: 'Olahraga kontak fisik ini melibatkan upaya mengunci lawan hingga menyentuh matras.' },
    { word: 'SKI', clue: 'Dalam olahraga ini, peserta meluncur di atas salju menggunakan papan khusus.' },
    { word: 'SURFING', clue: 'Olahraga ini dilakukan dengan menunggangi ombak laut menggunakan papan selancar.' }
  ],
  umum: [
    { word: 'IBUKOTA', clue: 'Kota ini menjadi pusat administrasi pemerintahan suatu negara.' },
    { word: 'KOMPAS', clue: 'Alat navigasi ini membantu menunjukkan arah mata angin.' },
    { word: 'SAMUDRA', clue: 'Lautan yang sangat luas ini membentang dan mengelilingi benua.' },
    { word: 'BENDERA', clue: 'Kain yang dikibarkan ini menjadi lambang kedaulatan suatu negara.' },
    { word: 'RUPIAH', clue: 'Mata uang ini digunakan secara resmi di Negara Kesatuan Republik Indonesia.' },
    { word: 'MONAS', clue: 'Monumen di Jakarta ini memiliki puncak berbentuk lidah api berwarna emas.' },
    { word: 'GARUDA', clue: 'Lambang negara Indonesia ini digambarkan mencengkeram pita yang memuat semboyan.' },
    { word: 'MUSEUM', clue: 'Gedung ini menyimpan dan memamerkan berbagai benda bersejarah.' },
    { word: 'PASPOR', clue: 'Dokumen identitas resmi ini diperlukan warga saat bepergian ke negara lain.' },
    { word: 'KARTINI', clue: 'Tokoh pahlawan ini dikenal karena perjuangannya untuk pendidikan dan emansipasi perempuan.' },
    { word: 'PANCASILA', clue: 'Dasar falsafah dan ideologi ini menjadi pedoman bagi bangsa Indonesia.' },
    { word: 'BOROBUDUR', clue: 'Candi Buddha megah ini dibangun pada masa Dinasti Syailendra.' },
    { word: 'BALI', clue: 'Pulau di Indonesia ini terkenal sebagai tujuan wisata dan kerap dijuluki Pulau Dewata.' },
    { word: 'SABANG', clue: 'Kota kepulauan ini terletak di ujung paling barat wilayah Indonesia.' },
    { word: 'MERAUKE', clue: 'Kota ini berada di wilayah Papua dan dikenal sebagai salah satu titik paling timur Indonesia.' },
    { word: 'BAHASA', clue: 'Sistem komunikasi ini menggunakan bunyi atau lambang untuk menyampaikan pesan antarmanusia.' }
  ],
  ipa: [
    { word: 'OKSIGEN', clue: 'Gas yang terdapat di udara ini dihirup manusia saat bernapas.' },
    { word: 'ATOM', clue: 'Partikel yang sangat kecil ini merupakan salah satu penyusun materi.' },
    { word: 'ENERGI', clue: 'Kemampuan atau daya ini diperlukan untuk melakukan suatu usaha.' },
    { word: 'MAGMA', clue: 'Cairan batuan pijar bersuhu tinggi ini berada di dalam Bumi.' },
    { word: 'FOSIL', clue: 'Sisa atau jejak makhluk hidup purba ini terawetkan dalam batuan.' },
    { word: 'NEURON', clue: 'Sel saraf ini mengirimkan impuls listrik di dalam sistem saraf.' },
    { word: 'PLANET', clue: 'Benda langit ini mengorbit sebuah bintang.' },
    { word: 'MAMALIA', clue: 'Hewan berdarah panas dalam kelompok ini menyusui anaknya.' },
    { word: 'BAKTERI', clue: 'Mikroorganisme bersel satu ini hanya dapat dilihat dengan bantuan mikroskop.' },
    { word: 'HABITAT', clue: 'Lingkungan alami ini menjadi tempat tinggal bagi suatu makhluk hidup.' },
    { word: 'RADIASI', clue: 'Pancaran energi ini merambat melalui gelombang elektromagnetik.' },
    { word: 'PUPIL', clue: 'Celah bundar di tengah bola mata ini mengatur banyaknya cahaya yang masuk.' },
    { word: 'LAMBUNG', clue: 'Organ pencernaan ini mengolah makanan dengan bantuan asam.' },
    { word: 'JANTUNG', clue: 'Organ berotot ini memompa darah agar mengalir ke seluruh tubuh.' },
    { word: 'GENETIKA', clue: 'Cabang ilmu biologi ini mempelajari pewarisan sifat keturunan.' },
    { word: 'ANATOMI', clue: 'Bidang studi ilmiah ini membahas struktur tubuh makhluk hidup.' }
  ],
  ips: [
    { word: 'SEJARAH', clue: 'Peristiwa masa lampau ini dikaji dan disusun menurut urutan waktu.' },
    { word: 'ARTEFAK', clue: 'Benda peninggalan arkeologis ini dibuat oleh manusia pada masa lampau.' },
    { word: 'PRASASTI', clue: 'Piagam kuno ini dipahat pada permukaan batu atau logam.' },
    { word: 'KERAJAAN', clue: 'Bentuk pemerintahan ini dipimpin oleh seorang raja atau sultan.' },
    { word: 'MATARAM', clue: 'Kerajaan agraris kuno di Jawa ini dikenal sebagai pembangun candi megah.' },
    { word: 'KOLONI', clue: 'Wilayah jajahan ini berada di bawah kekuasaan bangsa asing.' },
    { word: 'BARTER', clue: 'Sistem perdagangan ini dilakukan dengan menukar barang tanpa menggunakan uang.' },
    { word: 'EKONOMI', clue: 'Ilmu ini membahas pengelolaan sumber daya, produksi, dan konsumsi.' },
    { word: 'KULTUR', clue: 'Istilah ini merujuk pada adat istiadat, nilai, dan kebiasaan suatu masyarakat.' },
    { word: 'ETNIS', clue: 'Kelompok masyarakat ini memiliki kesamaan asal-usul atau garis keturunan.' },
    { word: 'PASAR', clue: 'Tempat ini menjadi lokasi bertemunya penjual dan pembeli untuk bertransaksi.' },
    { word: 'SOSIAL', clue: 'Istilah ini berkaitan dengan pergaulan dan tatanan dalam masyarakat.' },
    { word: 'INFLASI', clue: 'Kondisi ini ditandai dengan kenaikan harga barang secara umum dan terus-menerus.' },
    { word: 'SUKU', clue: 'Golongan masyarakat ini merupakan bagian dari suatu kesatuan bangsa.' },
    { word: 'TRADISI', clue: 'Kebiasaan adat ini diwariskan secara turun-temurun dari nenek moyang.' },
    { word: 'ARSIP', clue: 'Kumpulan dokumen dan rekaman sejarah ini disimpan dengan teratur.' }
  ],
  campuran: [
    { word: 'OKSIGEN', clue: 'Gas ini dihirup manusia saat bernapas dan dipelajari dalam ilmu sains.' },
    { word: 'RENDANG', clue: 'Masakan daging khas Minangkabau ini kaya akan rempah dan cita rasa gurih.' },
    { word: 'INTERNET', clue: 'Jaringan komputer yang luas ini menghubungkan perangkat di seluruh dunia.' },
    { word: 'KOMPAS', clue: 'Alat navigasi ini membantu menentukan arah, termasuk arah utara magnetis.' },
    { word: 'JANTUNG', clue: 'Organ vital ini memompa darah agar mengalir ke seluruh tubuh.' },
    { word: 'SEJARAH', clue: 'Catatan mengenai peristiwa masa lampau umat manusia ini dipelajari dalam ilmu sosial.' },
    { word: 'HARIMAU', clue: 'Kucing besar pemangsa ini memiliki belang dan hidup di alam liar.' },
    { word: 'MANGGA', clue: 'Buah tropis ini terasa manis dan memiliki biji pipih.' },
    { word: 'RUPIAH', clue: 'Mata uang resmi ini digunakan di Negara Republik Indonesia.' },
    { word: 'ATOM', clue: 'Partikel sangat kecil ini merupakan salah satu penyusun materi.' },
    { word: 'ROBOT', clue: 'Mesin otomatis ini dapat bekerja sesuai instruksi yang diberikan.' },
    { word: 'KERETA', clue: 'Moda angkutan darat ini melaju di atas rel.' },
    { word: 'MONAS', clue: 'Tugu di Jakarta ini menjadi lambang perjuangan dan memiliki puncak berbentuk api emas.' },
    { word: 'CATUR', clue: 'Permainan strategi ini mengasah pikiran dan dimainkan di papan berisi 64 petak.' },
    { word: 'BAKTERI', clue: 'Organisme mikroskopis bersel tunggal ini hanya dapat dilihat dengan bantuan alat khusus.' },
    { word: 'PASAR', clue: 'Tempat ini menjadi lokasi transaksi jual beli barang dan jasa.' },
    { word: 'KELINCI', clue: 'Mamalia berbulu halus ini memiliki telinga panjang.' },
    { word: 'PRASASTI', clue: 'Tulisan kuno ini dipahat pada batu dan menjadi peninggalan masa kerajaan.' },
    { word: 'LAPTOP', clue: 'Komputer portabel ini memiliki baterai dan layar yang dapat dilipat.' },
    { word: 'PISANG', clue: 'Buah berkulit kuning ini kaya akan kalium.' },
    { word: 'ENERGI', clue: 'Daya ini diperlukan untuk melakukan kerja atau menghasilkan panas.' },
    { word: 'MUSEUM', clue: 'Gedung ini menyimpan dan memamerkan benda bersejarah yang bernilai.' },
    { word: 'FUTSAL', clue: 'Permainan bola di lapangan tertutup ini melibatkan dua tim yang masing-masing terdiri atas lima orang.' },
    { word: 'PESAWAT', clue: 'Kendaraan bersayap ini digunakan untuk bepergian melalui udara antarkota.' }
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
function isNaturalIndonesianClue(clue, word) {
  const tokens = clue.match(/[A-Za-zÀ-ÿ]+/g) || [];
  const answerPattern = new RegExp(
    `(^|[^A-Za-z])${word}(?:nya|an|kan|i)?([^A-Za-z]|$)`,
    'i'
  );
  const hasPredicate = /\b(?:adalah|merupakan|dapat|bisa|digunakan|berfungsi|berasal|terletak|hidup|memiliki|mempunyai|dikenal|terkenal|termasuk|berbentuk|terbuat|terdiri|menjadi|membantu|menghasilkan|menyebabkan|menyimpan|menyampaikan|menghubungkan|membawa|menandai|mengukur|mengatur|menjaga|terbentuk|tumbuh|bergerak|mengalir|berlangsung|bernapas|dipakai|ditemukan|disebut|membuat|melindungi|berperan|ditulis|dibuat|diolah|dimakan|memakan|makan|dibudidayakan|menyusun|mengandung|terdapat|memengaruhi|mempengaruhi|menentukan|memberi|menunjukkan|memproduksi|meningkat|menurun|menyebar|terjadi|mengalami|memerlukan|dihasilkan|ditandai|menempati|berkembang|menyukai|menyajikan|menyusui|menunjuk|mengangkut|menggunakan|menggerakkan|mengelilingi|menyediakan|mencakup|memancarkan|menyerap|terbuka|tertutup|berwarna|berukuran|berisi|berbahan|berciri|berada|memasuki|memasak|direbus|dipanggang|ditusuk|dimasak|ditempuh|berjalan|berlari|berenang|bertelur|menetas|mengubah|terbagi|bersifat|mencapai|menempuh|menciptakan|membeli|menjual|bertukar|mendukung|menyebut|tercatat|berkaitan|menyelesaikan|bertekstur|kaya|terasa|manis|hangat|lembut|keras|kecil|besar|luas|panjang|pendek|kuat|tipis|tebal|tajam|renyah|empuk|asam|gurih|pedas|padat|segar|hitam|putih|merah|hijau|oranye|kuning|berat|ringan|ramping|cepat|lambat)\b/i.test(clue);

  return clue.length >= 24 &&
    clue.length <= 110 &&
    tokens.length >= 5 &&
    tokens.length <= 20 &&
    /[.!?]$/.test(clue) &&
    hasPredicate &&
    !answerPattern.test(clue) &&
    !/[()[\]{}:;]/.test(clue);
}

function validateAndFilterWords(words, minLen, maxLen, targetCount) {
  if (!Array.isArray(words)) return [];

  const seen = new Set();
  const validWords = [];

  for (const item of words) {
    if (!item || typeof item.word !== 'string' || typeof item.clue !== 'string') continue;
    const cleanWord = item.word.toUpperCase().replace(/[^A-Z]/g, '');
    const cleanClue = item.clue.replace(/\s+/g, ' ').trim();

    if (
      cleanWord.length >= minLen &&
      cleanWord.length <= maxLen &&
      isNaturalIndonesianClue(cleanClue, cleanWord)
    ) {
      if (!seen.has(cleanWord)) {
        seen.add(cleanWord);
        validWords.push({
          word: cleanWord,
          clue: cleanClue
        });
      }
    }
  }

  return validWords.slice(0, targetCount);
}

function normalizeAvoidWords(words) {
  if (!Array.isArray(words)) return new Set();
  return new Set(
    words
      .filter(word => typeof word === 'string')
      .map(word => word.toUpperCase().replace(/[^A-Z]/g, ''))
      .filter(word => word.length >= 4 && word.length <= 8)
      .slice(0, 120)
  );
}

function normalizeClue(clue) {
  return clue.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeAvoidClues(clues) {
  if (!Array.isArray(clues)) return new Set();
  return new Set(
    clues
      .filter(clue => typeof clue === 'string')
      .map(normalizeClue)
      .filter(Boolean)
      .slice(0, 80)
  );
}

function shuffle(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
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
            content: 'Kamu adalah master penyusun teka-teki silang Bahasa Indonesia untuk SilangKata. Berikan daftar kata variatif, edukatif, dan cerdas dalam format STRICT JSON tanpa markdown.'
          },
          { role: 'user', content: promptText }
        ],
        temperature: 0.88,
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
function getFallbackPuzzle(theme, difficulty, targetCount = 12, avoidWords = new Set(), avoidClues = new Set()) {
  const isMixed = !theme || theme === 'acak' || theme === 'campuran';
  const diffConfig = DIFFICULTY_MAP[difficulty] || DIFFICULTY_MAP.medium;
  const themeKey = isMixed ? 'campuran' : (FALLBACK_DICTIONARIES[theme] ? theme : 'campuran');
  const source = FALLBACK_DICTIONARIES[themeKey] || FALLBACK_DICTIONARIES.campuran;

  const allWords = [...source, ...Object.values(FALLBACK_DICTIONARIES).flat()];
  const seenWords = new Set();
  const freshPool = [];
  const usedBeforePool = [];
  for (const item of allWords) {
    const word = (item.word || '').toUpperCase();
    if (
      word.length < diffConfig.minLen ||
      word.length > diffConfig.maxLen ||
      seenWords.has(word)
    ) continue;

    seenWords.add(word);
    if (avoidWords.has(word) || avoidClues.has(normalizeClue(item.clue || ''))) {
      usedBeforePool.push(item);
    } else {
      freshPool.push(item);
    }
  }

  const pool = freshPool.length >= targetCount
    ? freshPool
    : [...freshPool, ...usedBeforePool];
  const shuffled = shuffle(pool);

  return {
    theme: isMixed ? 'campuran' : themeKey,
    difficulty,
    words: shuffled.slice(0, targetCount),
    source: 'fallback',
    freshWordCount: Math.min(freshPool.length, targetCount)
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

  const avoidWords = normalizeAvoidWords(body.avoidWords);
  const avoidClues = normalizeAvoidClues(body.avoidClues);
  const generationCount = Math.min(60, targetCount + Math.min(10, Math.ceil(targetCount * 0.25)));
  const useCache = body.useCache === true;
  const cacheKey = `${theme}_${difficulty}_${targetCount}`;
  const now = Date.now();

  // Hanya gunakan cache jika diminta eksplisit (misal untuk sinkronisasi room pemain bersama)
  if (useCache && avoidWords.size === 0 && avoidClues.size === 0) {
    const cached = puzzleCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return res.status(200).json({
        theme: cached.data.theme,
        difficulty: cached.data.difficulty,
        words: cached.data.words,
        cached: true,
        source: cached.data.source
      });
    }
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
    const fallbackData = getFallbackPuzzle(theme, difficulty, targetCount, avoidWords, avoidClues);
    return res.status(200).json(fallbackData);
  }

  // Pilih sudut pandang/inspirasi acak untuk menghindari pengulangan kata klise
  const angleList = SUBTOPIC_ANGLES[theme] || SUBTOPIC_ANGLES.campuran;
  const randomAngle = angleList[Math.floor(Math.random() * angleList.length)];
  const randomEntropy = Math.floor(Math.random() * 999999);

  const themeInstruction = isMixedTheme
    ? `Tema: CAMPURAN ANEKA BIDANG.
PENTING: Setiap kata HARUS berasal dari bidang yang BERBEDA-BEDA (kombinasi Sains, Geografi Nusantara, Sejarah, Fauna/Flora, Teknologi, Kuliner Tradisional, Olahraga). Hindari fokus pada satu topik saja.`
    : `Tema: ${theme.toUpperCase()} (Fokus inspirasi topik: ${randomAngle})`;

  const promptText = `Kamu adalah penyunting soal TTS berbahasa Indonesia untuk game "SilangKata". Utamakan kejelasan, ketepatan fakta, dan kalimat yang terdengar wajar bagi penutur asli.

${themeInstruction}
Tingkat kesulitan: ${diffConfig.label} (${difficulty})
Kriteria kesulitan: ${diffConfig.desc}
Panjang kata: 4 sampai 8 huruf (fleksibel agar mudah berpotongan di papan TTS)
Jumlah kata final: ${targetCount} kata. Buat ${generationCount} kandidat agar jawaban lama bisa diganti.
ID Sesi Acak: #${randomEntropy}

HINDARI PENGULANGAN DARI PERMAINAN PEMAIN INI:
- Jangan gunakan jawaban berikut: ${[...avoidWords].join(', ') || '(belum ada riwayat)'}
- Jangan ulangi petunjuk berikut (meski dengan sedikit perubahan kata): ${[...avoidClues].slice(0, 40).join(' | ') || '(belum ada riwayat)'}
- Pilih subtopik, kosakata, dan gaya petunjuk yang berbeda dari daftar tersebut. Jika daftar panjang, utamakan kata baru.

ATURAN MUTU BAHASA DAN SOAL (WAJIB):
1. Gunakan Bahasa Indonesia baku yang sederhana dan alami. Susun kalimat seperti yang biasa ditulis penyunting soal Indonesia; jangan menerjemahkan pola kalimat bahasa Inggris secara harfiah.
2. Setiap clue harus berupa satu kalimat utuh yang lancar, terdiri dari 5–20 kata dan 24–110 karakter, serta diakhiri tanda titik. Gunakan subjek dan predikat yang jelas. Jangan kirim frasa definisi yang terpotong.
3. Buat clue spesifik sehingga satu jawaban paling masuk akal. Sertakan ciri pembeda, fungsi, konteks, atau fakta yang tepat; hindari petunjuk umum yang bisa cocok dengan banyak jawaban.
4. Kesulitan berasal dari pengetahuan yang diuji, bukan dari susunan kalimat yang rumit. Jangan memakai teka-teki samar, kiasan yang membingungkan, istilah langka tanpa konteks, atau fakta yang meragukan.
5. Pakai kosakata Indonesia yang lazim dan ejaan baku. Hindari istilah Inggris jika ada padanan Indonesia yang umum. Nama serapan yang sudah lazim boleh digunakan.
6. Jangan menyebut jawaban, bentuk berimbuhannya, label kategori, tanda kurung, atau keterangan tambahan di dalam clue.
7. Jawaban harus kata Indonesia atau nama diri yang dikenal, ditulis dengan huruf Latin tanpa spasi/tanda baca, panjang 4–8 huruf. Jangan mengarang kata atau memakai ejaan yang dipaksakan agar cocok.

CONTOH GAYA YANG DIHARAPKAN:
- { "word": "BADAK", "clue": "Mamalia ini memiliki cula dan hidup di Asia atau Afrika." }
- { "word": "PEMPEK", "clue": "Makanan khas Palembang ini dibuat dari ikan dan tepung sagu." }
- { "word": "NEURON", "clue": "Sel ini menyampaikan pesan dari otak ke seluruh tubuh." }
- { "word": "PRASASTI", "clue": "Tulisan pada batu ini menjadi bukti kehidupan masa lampau." }
Hindari gaya seperti "Mamalia cula keras Afrika", "Olahan ikan khas Palembang dengan cuko", atau "Alat penunjuk arah utara magnetik". Kalimat harus jelas tanpa perlu menebak maksudnya.

Format output STRICT JSON (tanpa markdown, tanpa teks pengantar):
{
  "theme": "${isMixedTheme ? 'campuran' : theme}",
  "words": [
    { "word": "JAWABAN", "clue": "Satu kalimat petunjuk yang jelas dan alami." }
  ]
}`;

  let parsed = null;
  let activeSource = 'fallback';

  // 1. PRIORITAS 1: GROQ CLOUD (Super cepat ~500ms - 1 detik, free tier)
  if (!parsed && process.env.GROQ_API_KEY) {
    const groqCandidateModels = process.env.GROQ_MODEL
      ? [process.env.GROQ_MODEL]
      : ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

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
      const fallbackData = getFallbackPuzzle(theme, difficulty, targetCount, avoidWords, avoidClues);
      return res.status(200).json(fallbackData);
    }

    const validCandidates = validateAndFilterWords(
      parsed.words,
      diffConfig.minLen,
      diffConfig.maxLen,
      generationCount
    );
    let validWords = validCandidates
      .filter(item => !avoidWords.has(item.word) && !avoidClues.has(normalizeClue(item.clue)))
      .slice(0, targetCount);

    if (validWords.length >= 5 && validWords.length < targetCount) {
      const fillerAvoidWords = new Set([...avoidWords, ...validWords.map(item => item.word)]);
      const fillerAvoidClues = new Set([...avoidClues, ...validWords.map(item => normalizeClue(item.clue))]);
      const missingCount = targetCount - validWords.length;
      const fallbackWords = getFallbackPuzzle(
        theme,
        difficulty,
        missingCount,
        fillerAvoidWords,
        fillerAvoidClues
      ).words;
      if (fallbackWords.length) {
        validWords = [...validWords, ...fallbackWords];
        activeSource = 'mixed';
      }
    }

    if (validWords.length < 5) {
      console.warn('[AI] Kata baru dari AI kurang dari minimal. Menggunakan kamus offline.');
      const fallbackData = getFallbackPuzzle(theme, difficulty, targetCount, avoidWords, avoidClues);
      return res.status(200).json(fallbackData);
    }

    const result = {
      theme: parsed.theme || theme,
      difficulty,
      words: validWords,
      source: activeSource
    };

    // Cache only results that were not generated against a player's history.
    if (avoidWords.size === 0 && avoidClues.size === 0) {
      puzzleCache.set(cacheKey, { timestamp: now, data: result });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('Error saat menghubungi Gemini:', err.message);
    const fallbackData = getFallbackPuzzle(theme, difficulty, targetCount, avoidWords, avoidClues);
    return res.status(200).json(fallbackData);
  }
}
