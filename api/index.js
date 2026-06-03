const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Konfigurasi Supabase menggunakan data milikmu
const SUPABASE_URL = 'https://mgaisophxehvxtcwfvvl.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nYWlzb3BoeGVodnh0Y3dmdnZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NjA5NTEsImV4cCI6MjA5NjAzNjk1MX0.EkdOSMjqnYqIIODOxOLMD_dd66YzpyOO8-j1D_3QVPM'; 

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Middleware
app.use(cors());
app.use(express.json());

// Endpoint 1: Ambil semua koleksi buku (GET)
app.get('/api/buku', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('buku')
            .select('*')
            .order('id', { ascending: true });

        if (error) {
            return res.status(400).json({ error: error.message });
        }
        return res.json(data || []);
    } catch (err) {
        return res.status(500).json({ error: "Gagal terhubung ke Supabase: " + err.message });
    }
});

// Endpoint 2: Ambil riwayat transaksi berdasarkan ID Buku (GET)
app.get('/api/riwayat/:bukuId', async (req, res) => {
    const { bukuId } = req.params;
    const { data, error } = await supabase
        .from('riwayat')
        .select('*')
        .eq('buku_id', bukuId)
        .order('id', { ascending: false });

    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.json(data);
});

// Endpoint 3: Tambah transaksi baru (POST) - DIKUNCI HANYA UNTUK ADMIN
app.post('/api/transaksi', async (req, res) => {
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

    // 3. Proses Update Status Buku di Supabase
    const { error: updateError } = await supabase
        .from('buku')
        .update({ status: statusBaru })
        .eq('id', buku_id);

    if (updateError) {
        return res.status(500).json({ error: "Gagal memperbarui status buku: " + updateError.message });
    }

    // 4. Proses Insert Riwayat Baru di Supabase
    const { data: riwayatData, error: insertError } = await supabase
        .from('riwayat')
        .insert([{ buku_id, nama, aksi, tanggal, tipe }])
        .select();

    if (insertError) {
        return res.status(500).json({ error: "Gagal mencatat riwayat: " + insertError.message });
    }

    res.json({
        message: "Transaksi berhasil dicatat dan status buku diperbarui.",
        transaksiId: riwayatData[0]?.id || null,
        statusBukuBaru: statusBaru
    });
});

// Endpoint 4: Hapus riwayat transaksi berdasarkan ID Riwayat (DELETE)
app.delete('/api/riwayat/:id', async (req, res) => {
    const idRiwayat = parseInt(req.params.id, 10);

    if (isNaN(idRiwayat)) {
        return res.status(400).json({ error: "Format ID riwayat tidak valid (Harus berupa angka)." });
    }

    const { data, error } = await supabase
        .from('riwayat')
        .delete()
        .eq('id', idRiwayat)
        .select();

    if (error) {
        return res.status(500).json({ error: error.message });
    }
    
    if (!data || data.length === 0) {
        return res.status(404).json({ message: "Data transaksi tidak ditemukan di database." });
    }

    res.json({ message: "Riwayat transaksi berhasil dihapus dari database." });
});

module.exports = app;
