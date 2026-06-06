const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// ================================================================
// MIDDLEWARE
// ================================================================
app.use(cors());
app.use(express.json());

// Melayani file gambar statis jika folder 'img' ditaruh di backend (Opsional untuk Lokal)
app.use('/img', express.static(path.join(__dirname, '../img')));

// ================================================================
// KONEKSI MONGODB (OPTIMASI SERVERLESS VERCEL)
// ================================================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/perpustakaan';

let cachedConnection = global.mongoose;

if (!cachedConnection) {
    cachedConnection = global.mongoose = { conn: null, promise: null };
}

async function connectToDatabase() {
    if (cachedConnection.conn) {
        return cachedConnection.conn;
    }

    if (!cachedConnection.promise) {
        cachedConnection.promise = mongoose.connect(MONGODB_URI, {
            bufferCommands: false,
        }).then((mongooseInstance) => {
            console.log('Terhubung ke MongoDB.');
            return mongooseInstance;
        });
    }

    try {
        cachedConnection.conn = await cachedConnection.promise;
    } catch (e) {
        cachedConnection.promise = null;
        throw e;
    }

    return cachedConnection.conn;
}

// ================================================================
// SKEMA & MODEL (STRUKTUR DATABASE)
// ================================================================

// Skema Baru: Menampung data relasi Kartu RFID ke Nama Anggota/Siswa
const anggotaSchema = new mongoose.Schema(
    {
        rfid_uid: { type: String, required: true, unique: true },
        nama:     { type: String, required: true },
        kelas:    { type: String, default: '' }
    },
    { versionKey: false }
);

const bukuSchema = new mongoose.Schema(
    {
        _id:       { type: String },
        judul:     { type: String, required: true },
        penulis:   { type: String, required: true },
        kategori:  { type: String, required: true },
        status:    { type: String, default: 'Tersedia' },
        cover_url: { type: String, default: '' },
    },
    { versionKey: false }
);

const riwayatSchema = new mongoose.Schema(
    {
        buku_id: { type: String, required: true, ref: 'buku' },
        nama:    { type: String, required: true },
        aksi:    { type: String, required: true },
        tanggal: { type: String, required: true },
        tipe:    { type: String, required: true },
    },
    { versionKey: false }
);

const Anggota = mongoose.models.anggota || mongoose.model('anggota', anggotaSchema);
const Buku    = mongoose.models.buku || mongoose.model('buku', bukuSchema);
const Riwayat = mongoose.models.riwayat || mongoose.model('riwayat', riwayatSchema);

// Variabel Global Sementara untuk menyimpan ID Buku yang sedang di-scan QR/diklik di Web
let idBukuAktifAntrean = null;

// ================================================================
// ENDPOINTS BARU (INTEGRASI ESP32 & REFRESH RFID)
// ================================================================

// Endpoint Baru 1: Menerima info Buku Aktif yang di-scan QR atau diklik dari web
app.post('/api/set-buku-aktif', (req, res) => {
    const { buku_id_aktif } = req.body;
    idBukuAktifAntrean = buku_id_aktif;
    console.log(`Buku aktif antrean RFID diatur ke ID: ${idBukuAktifAntrean}`);
    return res.json({ message: "Antrean buku aktif berhasil diperbarui di server.", buku_id_aktif: idBukuAktifAntrean });
});

// Endpoint Baru 2: Endpoint Utama Penangkap Sinyal dari ESP32 RFID
app.post('/api/transaksi-rfid', async (req, res) => {
    await connectToDatabase();
    const { rfid_uid, tipe_aksi } = req.body;

    if (!rfid_uid || !tipe_aksi) {
        return res.status(400).json({ error: "Data kiriman dari ESP32 tidak lengkap." });
    }

    if (!idBukuAktifAntrean) {
        return res.status(400).json({ error: "Siswa menempelkan kartu, tetapi belum ada buku yang dipilih atau di-scan QR di monitor web." });
    }

    try {
        // A. Komunikasi Antar Tabel: Cari pemilik RFID di tabel anggotas
        const dataSiswa = await Anggota.findOne({ rfid_uid: rfid_uid.toLowerCase().trim() });
        if (!dataSiswa) {
            return res.status(44).json({ error: "Kartu RFID tidak terdaftar sebagai anggota perpustakaan." });
        }

        // B. Cari data buku yang masuk antrean di tabel bukus
        const dataBuku = await Buku.findById(idBukuAktifAntrean);
        if (!dataBuku) {
            return res.status(404).json({ error: "Buku dalam antrean tidak ditemukan di database." });
        }

        // C. Tentukan teks aksi dan status buku baru
        const statusBaru = tipe_aksi === 'pinjam' ? 'Dipinjam' : 'Tersedia';
        const teksAksi = tipe_aksi === 'pinjam' ? 'Pinjam' : 'Kembali';

        // D. Perbarui status buku tersebut di tabel bukus
        dataBuku.status = statusBaru;
        await dataBuku.save();

        // E. Catat data gabungan ke tabel riwayats secara otomatis
        const formatTanggal = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
        
        const logBaru = await Riwayat.create({
            buku_id: idBukuAktifAntrean,
            nama: `${dataSiswa.nama} (${dataSiswa.kelas || 'Siswa'})`,
            aksi: teksAksi,
            tanggal: formatTanggal,
            tipe: tipe_aksi
        });

        return res.json({
            message: `Sukses! ${dataSiswa.nama} berhasil melakukan ${teksAksi} buku ${dataBuku.judul}`,
            transaksiId: logBaru._id.toString()
        });

    } catch (err) {
        return res.status(500).json({ error: 'Terjadi kesalahan sistem: ' + err.message });
    }
});


// ================================================================
// ENDPOINTS ASLI (KATA-KATA & DATA SEED TIDAK DIUBAH)
// ================================================================

// Endpoint 0: Fitur Seeding Data otomatis/manual dengan Auto-Refresh
app.get('/api/seed', async (req, res) => {
    await connectToDatabase();
    try {
        // PERBAIKAN: Hapus data lama terlebih dahulu agar database "merefresh" dirinya sendiri
        await Buku.deleteMany({});
        await Riwayat.deleteMany({});
        console.log('Database berhasil dibersihkan untuk refresh data.');

        // Masukkan kembali data buku yang segar
        await Buku.insertMany([
            { _id: 'buku1', judul: 'Bulan',           penulis: 'Tere Liye',             kategori: 'Novel',     status: 'Tersedia', cover_url: '/img/BULAN.png' },
            { _id: 'buku2', judul: 'Kepribadian MBTI', penulis: 'Kim Sona',             kategori: 'Psikologi', status: 'Dipinjam',  cover_url: '/img/MBTI.png'  },
            { _id: 'buku3', judul: 'Bumi Manusia',     penulis: 'Pramoedya Ananta Toer', kategori: 'Fiksi',     status: 'Tersedia', cover_url: '/img/BUMI.png'},
            { _id: 'buku4', judul: 'Filosofi Teras',   penulis: 'Henry Manampiring',      kategori: 'Filsafat',  status: 'Tersedia', cover_url: '/img/FILOSOFI.png'},
        ]);

        // Masukkan kembali data riwayat yang segar
        await Riwayat.insertMany([
            { buku_id: 'buku1', nama: 'Andi Wijaya',   aksi: 'Kembali', tanggal: '20 Mei 2026',   tipe: 'kembali' },
            { buku_id: 'buku1', nama: 'Andi Wijaya',   aksi: 'Pinjam',  tanggal: '13 Mei 2026',   tipe: 'pinjam'  },
            { buku_id: 'buku1', nama: 'Siti Rahma',    aksi: 'Kembali', tanggal: '05 Mei 2026',   tipe: 'kembali' },
            { buku_id: 'buku2', nama: 'Budi Santoso',  aksi: 'Pinjam',  tanggal: '25 Mei 2026',   tipe: 'pinjam'  },
            { buku_id: 'buku2', nama: 'Rian Hidayat',  aksi: 'Kembali', tanggal: '10 April 2026', tipe: 'kembali' },
            { buku_id: 'buku3', nama: 'Citra Lestari', aksi: 'Kembali', tanggal: '18 Mei 2026',   tipe: 'kembali' },
            { buku_id: 'buku3', nama: 'Citra Lestari', aksi: 'Pinjam',  tanggal: '11 Mei 2026',   tipe: 'pinjam'  },
            { buku_id: 'buku4', nama: 'Dewi Sartika',  aksi: 'Kembali', tanggal: '01 Mei 2026',   tipe: 'kembali' },
            { buku_id: 'buku4', nama: 'Eko Prasetyo',  aksi: 'Kembali', tanggal: '15 April 2026', tipe: 'kembali' },
        ]);

        return res.json({ message: 'Database berhasil direfresh! Data lama dihapus dan data awal berhasil dimasukkan kembali.' });
    } catch (err) {
        return res.status(500).json({ error: 'Gagal melakukan refresh data: ' + err.message });
    }
});

// Endpoint Darurat: Mengosongkan Database
app.get('/api/reset-buku', async (req, res) => {
    await connectToDatabase();
    try {
        await Buku.deleteMany({});
        await Riwayat.deleteMany({});
        return res.json({ message: 'Database berhasil dikosongkan. Silakan buka rute /api/seed kembali.' });
    } catch (err) {
        return res.status(500).json({ error: 'Gagal mereset database: ' + err.message });
    }
});

// Endpoint 1: Ambil semua koleksi buku (GET)
app.get('/api/buku', async (req, res) => {
    await connectToDatabase();
    try {
        const buku = await Buku.find().sort({ _id: 1 }).lean();
        const result = buku.map((b) => ({ ...b, id: b._id }));
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: 'Gagal mengambil data buku: ' + err.message });
    }
});

// Endpoint 2: Ambil riwayat transaksi berdasarkan ID Buku (GET)
app.get('/api/riwayat/:bukuId', async (req, res) => {
    await connectToDatabase();
    try {
        const { bukuId } = req.params;
        const riwayat = await Riwayat.find({ buku_id: bukuId }).sort({ _id: -1 }).lean();
        const result = riwayat.map((r) => ({ ...r, id: r._id.toString() }));
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: 'Gagal mengambil riwayat: ' + err.message });
    }
});

// Endpoint 3: Tambah transaksi baru (POST)
app.post('/api/transaksi', async (req, res) => {
    await connectToDatabase();
    const userRole = req.headers['x-role'];
    if (userRole !== 'admin') {
        return res.status(403).json({ error: 'Akses Ditolak. Hanya admin yang diizinkan untuk menambah transaksi.' });
    }

    const { buku_id, nama, aksi, tanggal, tipe } = req.body;
    if (!buku_id || !nama || !aksi || !tanggal || !tipe) {
        return res.status(400).json({ error: 'Semua data field harus diisi.' });
    }

    const statusBaru = tipe === 'pinjam' ? 'Dipinjam' : 'Tersedia';

    try {
        // Karena _id buku berupa String biasa (buku1, buku2), kita langsung cari pakai string id nya
        const updatedBuku = await Buku.findByIdAndUpdate(
            buku_id,
            { status: statusBaru },
            { new: true }
        );

        if (!updatedBuku) {
            return res.status(404).json({ error: 'Buku dengan ID tersebut tidak ditemukan.' });
        }

        const newRiwayat = await Riwayat.create({ buku_id, nama, aksi, tanggal, tipe });

        return res.json({
            message:        'Transaksi berhasil dicatat dan status buku diperbarui.',
            transaksiId:    newRiwayat._id.toString(),
            statusBukuBaru: statusBaru,
        });
    } catch (err) {
        return res.status(500).json({ error: 'Terjadi kesalahan: ' + err.message });
    }
});

// Endpoint 4: Hapus riwayat transaksi berdasarkan ID Riwayat (DELETE)
app.delete('/api/riwayat/:id', async (req, res) => {
    await connectToDatabase();
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Format ID riwayat tidak valid.' });
    }

    try {
        const deleted = await Riwayat.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ message: 'Data transaksi tidak ditemukan di database.' });
        }
        return res.json({ message: 'Riwayat transaksi berhasil dihapus dari database.' });
    } catch (err) {
        return res.status(500).json({ error: 'Gagal menghapus riwayat: ' + err.message });
    }
});

app.get('/api', (req, res) => {
    res.send('Backend Perpustakaan MongoDB Mongoose siap digunakan.');
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Backend berjalan di http://localhost:${PORT}`);
    });
}

module.exports = app;
