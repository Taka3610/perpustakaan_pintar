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
// SKEMA & MODEL
// ================================================================

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

const Buku    = mongoose.models.buku || mongoose.model('buku', bukuSchema);
const Riwayat = mongoose.models.riwayat || mongoose.model('riwayat', riwayatSchema);

// ================================================================
// ENDPOINTS
// ================================================================

// Endpoint 0: Fitur Seeding Data manual (Jalur cover_url sudah diperbaiki ke rute publik)
app.get('/api/seed', async (req, res) => {
    await connectToDatabase();
    try {
        const count = await Buku.countDocuments();
        if (count > 0) {
            return res.json({ message: 'Database sudah memiliki data. Proses seeding dilewati.' });
        }

        // Catatan penting: Pastikan penulisan nama file di folder frontend/img/ sama PERSIS huruf besar-kecilnya dengan teks di bawah ini!
        await Buku.insertMany([
            { _id: 'buku1', judul: 'Bulan',           penulis: 'Tere Liye',             kategori: 'Novel',     status: 'Tersedia', cover_url: '/img/bulan.png' },
            { _id: 'buku2', judul: 'Kepribadian MBTI', penulis: 'Kim Sona',             kategori: 'Psikologi', status: 'Dipinjam',  cover_url: '/img/MBTI.png'  },
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

        return res.json({ message: 'Data awal perpustakaan berhasil dimasukkan ke MongoDB.' });
    } catch (err) {
        return res.status(500).json({ error: 'Gagal melakukan seeding data: ' + err.message });
    }
});

// Endpoint Darurat: Gunakan ini untuk menghapus data lama yang salah sebelum me-seed kembali
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

// ================================================================
// ENDPOINT BARU: Ambil Spesifik 1 Buku Berdasarkan ID (Untuk QR Scan)
// ================================================================
app.get('/api/buku/:id', async (req, res) => {
    await connectToDatabase();
    try {
        const { id } = req.params;
        const buku = await Buku.findById(id).lean();

        if (!buku) {
            return res.status(404).json({ error: 'Buku tidak ditemukan. Pastikan QR Code benar.' });
        }

        // Tambahkan field id agar kompatibel dengan frontend
        const result = { ...buku, id: buku._id };
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: 'Gagal memproses scan: ' + err.message });
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
