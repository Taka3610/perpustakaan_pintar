const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Koneksi ke Database SQLite
const db = new sqlite3.Database('./library.db', (err) => {
    if (err) {
        console.error('Gagal mengoneksikan database:', err.message);
    } else {
        console.log('Terhubung ke database SQLite.');
    }
});

// Membuat Tabel dan Memasukkan Data 
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS buku (
        id TEXT PRIMARY KEY,
        judul TEXT NOT NULL,
        penulis TEXT NOT NULL,
        kategori TEXT NOT NULL,
        status TEXT DEFAULT 'Tersedia',
        cover_url TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS riwayat (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        buku_id TEXT,
        nama TEXT NOT NULL,
        aksi TEXT NOT NULL,
        tanggal TEXT NOT NULL,
        tipe TEXT NOT NULL,
        FOREIGN KEY (buku_id) REFERENCES buku (id)
    )`);

    db.get("SELECT COUNT(*) AS count FROM buku", [], (err, row) => {
        if (err) {
            console.error('Gagal memeriksa data:', err.message);
            return;
        }
        
        if (row && row.count === 0) {
            const stmtBuku = db.prepare("INSERT INTO buku (id, judul, penulis, kategori, status, cover_url) VALUES (?, ?, ?, ?, ?, ?)");
            stmtBuku.run("buku1", "Bulan", "Tere Liye", "Fiksi", "Tersedia", "img/bulan.png");
            stmtBuku.run("buku2", "Kepribadian MBTI", "Yuval Noah Harari", "Psikologi", "Dipinjam", "img/MBTI.png");
            stmtBuku.run("buku3", "Bumi Manusia", "Pramoedya Ananta Toer", "Fiksi", "Tersedia", "img/bumi_manusia.png");
            stmtBuku.run("buku4", "Filosofi Teras", "Henry Manampiring", "Filsafat", "Tersedia", "img/filosofi_teras.png");
            stmtBuku.finalize();

            const stmtRiwayat = db.prepare("INSERT INTO riwayat (buku_id, nama, aksi, tanggal, tipe) VALUES (?, ?, ?, ?, ?)");
            stmtRiwayat.run("buku1", "Andi Wijaya", "Kembali", "20 Mei 2026", "kembali");
            stmtRiwayat.run("buku1", "Andi Wijaya", "Pinjam", "13 Mei 2026", "pinjam");
            stmtRiwayat.run("buku1", "Siti Rahma", "Kembali", "05 Mei 2026", "kembali");
            stmtRiwayat.run("buku2", "Budi Santoso", "Pinjam", "25 Mei 2026", "pinjam");
            stmtRiwayat.run("buku2", "Rian Hidayat", "Kembali", "10 April 2026", "kembali");
            stmtRiwayat.run("buku3", "Citra Lestari", "Kembali", "18 Mei 2026", "kembali");
            stmtRiwayat.run("buku3", "Citra Lestari", "Pinjam", "11 Mei 2026", "pinjam");
            stmtRiwayat.run("buku4", "Dewi Sartika", "Kembali", "01 Mei 2026", "kembali");
            stmtRiwayat.run("buku4", "Eko Prasetyo", "Kembali", "15 April 2026", "kembali");
            stmtRiwayat.finalize();
            
            console.log('Data berhasil dicatat ke database.');
        }
    });
});

// Endpoint 1: Ambil semua koleksi buku (GET)
app.get('/api/buku', (req, res) => {
    db.all("SELECT * FROM buku", [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Endpoint 2: Ambil riwayat transaksi berdasarkan ID Buku (GET)
app.get('/api/riwayat/:bukuId', (req, res) => {
    const { bukuId } = req.params;
    db.all("SELECT * FROM riwayat WHERE buku_id = ? ORDER BY id DESC", [bukuId], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Endpoint 3: Tambah transaksi baru (POST) - DIKUNCI HANYA UNTUK ADMIN
app.post('/api/transaksi', (req, res) => {
    // 1. Validasi Role Admin dari Header Request
    const userRole = req.headers['x-role'];
    if (userRole !== 'admin') {
        return res.status(403).json({ error: "Akses Ditolak. Hanya admin yang diizinkan untuk menambah transaksi." });
    }

    const { buku_id, nama, aksi, tanggal, tipe } = req.body;

    // 2. Validasi Kelengkapan Data
    if (!buku_id || !nama || !aksi || !tanggal || !tipe) {
        return res.status(400).json({ error: "Semua data field harus diisi." });
    }

    const statusBaru = (tipe === 'pinjam') ? 'Dipinjam' : 'Tersedia';

    // 3. Proses Database jika Validasi Lolos
    db.serialize(() => {
        db.run("UPDATE buku SET status = ? WHERE id = ?", [statusBaru, buku_id], (err) => {
            if (err) {
                return res.status(500).json({ error: "Gagal memperbarui status buku: " + err.message });
            }
        });

        db.run(`INSERT INTO riwayat (buku_id, nama, aksi, tanggal, tipe) VALUES (?, ?, ?, ?, ?)`,
            [buku_id, nama, aksi, tanggal, tipe],
            function(err) {
                if (err) {
                    return res.status(500).json({ error: "Gagal mencatat riwayat: " + err.message });
                }
                res.json({
                    message: "Transaksi berhasil dicatat dan status buku diperbarui.",
                    transaksiId: this.lastID,
                    statusBukuBaru: statusBaru
                });
            }
        );
    });
});

// Endpoint 4: Hapus riwayat transaksi berdasarkan ID Riwayat (DELETE)
app.delete('/api/riwayat/:id', (req, res) => {
    const idRiwayat = parseInt(req.params.id, 10);

    if (isNaN(idRiwayat)) {
        return res.status(400).json({ error: "Format ID riwayat tidak valid (Harus berupa angka)." });
    }

    db.run("DELETE FROM riwayat WHERE id = ?", [idRiwayat], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: "Data transaksi tidak ditemukan di database." });
        }
        res.json({ message: "Riwayat transaksi berhasil dihapus dari database." });
    });
});

// Jalankan Server
app.listen(PORT, () => {
    console.log(`Backend berjalan di http://localhost:${PORT}`);
});