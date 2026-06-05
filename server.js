const express  = require('express');
const cors     = require('cors');
const mongoose = require('mongoose');

const app  = express();
const PORT = process.env.PORT || 5000;

// ================================================================
// KONEKSI MONGODB
// Ganti nilai di bawah, atau set env variable MONGODB_URI
//   Lokal  : 'mongodb://localhost:27017/perpustakaan'
//   Atlas  : 'mongodb+srv://<user>:<password>@cluster.mongodb.net/perpustakaan'
// ================================================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/perpustakaan';

mongoose
    .connect(MONGODB_URI)
    .then(() => {
        console.log('Terhubung ke MongoDB.');
        seedData();
    })
    .catch((err) => console.error('Gagal terhubung ke MongoDB:', err.message));

// ================================================================
// SKEMA & MODEL
// ================================================================

// Buku: _id berupa string custom ("buku1", "buku2", dst.)
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

// Riwayat: _id berupa ObjectId default MongoDB
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

const Buku    = mongoose.model('buku',    bukuSchema);
const Riwayat = mongoose.model('riwayat', riwayatSchema);

// ================================================================
// SEED DATA  (berjalan otomatis sekali saat koneksi berhasil)
// ================================================================
async function seedData() {
    try {
        const count = await Buku.countDocuments();
        if (count > 0) return; // Data sudah ada, lewati

        // Ganti bagian seedData() pada model Buku menjadi seperti ini:
        await Buku.insertMany([
            { _id: 'buku1', judul: 'Bulan',           penulis: 'Tere Liye',             kategori: 'Novel',     status: 'Tersedia', cover_url: '/img/bulan.png' },
            { _id: 'buku2', judul: 'Kepribadian MBTI', penulis: 'Yuval Noah Harari',     kategori: 'Psikologi', status: 'Dipinjam',  cover_url: '/img/MBTI.png'  },
            { _id: 'buku3', judul: 'Bumi Manusia',     penulis: 'Pramoedya Ananta Toer', kategori: 'Fiksi',     status: 'Tersedia', cover_url: '/img/bumi_manusia.png'},
            { _id: 'buku4', judul: 'Filosofi Teras',   penulis: 'Henry Manampiring',     kategori: 'Filsafat',  status: 'Tersedia', cover_url: '/img/filosofi_teras.png'},
        ]);

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

        console.log('Data berhasil dimasukkan ke MongoDB.');
    } catch (err) {
        console.error('Gagal send data:', err.message);
    }
}

// ================================================================
// MIDDLEWARE
// ================================================================
app.use(cors());
app.use(express.json());

// ================================================================
// ENDPOINTS
// ================================================================

// Endpoint 1: Ambil semua koleksi buku (GET)
app.get('/api/buku', async (req, res) => {
    try {
        const buku = await Buku.find().sort({ _id: 1 }).lean();

        // Tambahkan field `id` agar kompatibel dengan frontend yang pakai buku.id
        const result = buku.map((b) => ({ ...b, id: b._id }));
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: 'Gagal mengambil data buku: ' + err.message });
    }
});

// Endpoint 2: Ambil riwayat transaksi berdasarkan ID Buku (GET)
app.get('/api/riwayat/:bukuId', async (req, res) => {
    try {
        const { bukuId } = req.params;
        const riwayat = await Riwayat.find({ buku_id: bukuId }).sort({ _id: -1 }).lean();

        // Ubah ObjectId ke string pada field `id` agar frontend bisa pakai untuk DELETE
        const result = riwayat.map((r) => ({ ...r, id: r._id.toString() }));
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: 'Gagal mengambil riwayat: ' + err.message });
    }
});

// Endpoint 3: Tambah transaksi baru (POST) — DIKUNCI HANYA UNTUK ADMIN
app.post('/api/transaksi', async (req, res) => {
    // 1. Validasi Role Admin dari Header
    //    Frontend harus kirim header: { 'x-role': 'admin' }
    const userRole = req.headers['x-role'];
    if (userRole !== 'admin') {
        return res.status(403).json({ error: 'Akses Ditolak. Hanya admin yang diizinkan untuk menambah transaksi.' });
    }

    const { buku_id, nama, aksi, tanggal, tipe } = req.body;

    // 2. Validasi Kelengkapan Data
    if (!buku_id || !nama || !aksi || !tanggal || !tipe) {
        return res.status(400).json({ error: 'Semua data field harus diisi.' });
    }

    const statusBaru = tipe === 'pinjam' ? 'Dipinjam' : 'Tersedia';

    try {
        // 3. Update Status Buku
        const updatedBuku = await Buku.findByIdAndUpdate(
            buku_id,
            { status: statusBaru },
            { new: true }
        );

        if (!updatedBuku) {
            return res.status(404).json({ error: 'Buku dengan ID tersebut tidak ditemukan.' });
        }

        // 4. Insert Riwayat Baru
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
    const { id } = req.params;

    // MongoDB pakai ObjectId (string 24 karakter hex), bukan parseInt seperti SQLite
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

// ================================================================
// JALANKAN SERVER
// ================================================================
app.listen(PORT, () => {
    console.log(`Backend berjalan di http://localhost:${PORT}`);
});

module.exports = app;
