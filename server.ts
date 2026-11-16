/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import {
  getAllWbp,
  upsertWbpSingle,
  upsertWbpBatch,
  deleteWbpById,
  clearAllWbpFromDb,
  getAllKunjungan,
  insertKunjungan,
  updateKunjunganById,
  insertKunjunganBatch,
  clearAllKunjunganFromDb,
  softDeleteKunjungan,
  restoreKunjunganById,
  permanentDeleteKunjunganById,
  getAllPenyakit,
  upsertPenyakit,
  getAllReferensi,
  upsertReferensi,
  deleteReferensiById,
  updateReferensiJenisByPenyakit,
  getSetting,
  setSetting,
  getAuditLogs,
  addAuditLog,
  getSidbHistoryList,
  addSidbHistoryEntry,
  seedPenyakitIfEmpty,
  seedReferensiIfEmpty,
  seedWbpIfEmpty,
  seedKunjunganIfEmpty,
  seedMasterObatIfEmpty,
  getAllMasterObat,
  upsertMasterObat,
  deleteMasterObatById,
  getAllResepObat,
  replaceResepForKunjungan,
  deleteResepByKunjunganId,
  restoreAllTables,
  type WbpInsert,
  type KunjunganInsert,
  type ReferensiInsert,
  type PenyakitInsert,
  type SidbHistoryInsert,
  type AuditLogInsert,
  type MasterObatInsert,
  type ResepObatInsert,
} from './src/db/queries.ts';
import {
  CLINIC_USERNAME,
  changePassword,
  issueToken,
  requireAuth,
  verifyPassword,
  type AuthRequest,
} from './src/middleware/auth.ts';
import {
  INITIAL_KUNJUNGAN,
  INITIAL_MASTER_OBAT,
  INITIAL_PENGATURAN,
  INITIAL_PENYAKIT,
  INITIAL_REFERENSI,
  INITIAL_WBP,
} from './src/data/initialData.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' }));
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
let initialization: Promise<void> | null = null;
app.use('/api', async (_req, res, next) => {
  try {
    initialization ??= seedInitialDataIfEmpty().catch((error) => {
      initialization = null;
      throw error;
    });
    await initialization;
    next();
  } catch {
    res.status(503).json({ error: 'Database online belum tersedia. Silakan coba kembali.' });
  }
});

// ============================================================================
// AUTHENTICATION (shared clinic account, verified server-side)
// ============================================================================
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 60 * 1000;

function clientKey(req: express.Request) {
  return String(req.headers['x-nf-client-connection-ip'] || req.headers['x-forwarded-for'] || req.ip || 'unknown')
    .split(',')[0]
    .trim();
}

app.post('/api/auth/login', async (req, res) => {
  const key = clientKey(req);
  const now = Date.now();
  const attempt = loginAttempts.get(key);
  if (attempt && attempt.lockedUntil > now) {
    const wait = Math.ceil((attempt.lockedUntil - now) / 1000);
    return res.status(429).json({
      error: `Terlalu banyak percobaan gagal. Silakan tunggu ${wait} detik sebelum mencoba kembali.`,
    });
  }
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '').trim();
  const rememberMe = Boolean(req.body?.rememberMe);
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi.' });
  }
  try {
    const ok = username === CLINIC_USERNAME && (await verifyPassword(password));
    if (!ok) {
      const count = (attempt && attempt.lockedUntil <= now && attempt.count >= MAX_LOGIN_ATTEMPTS ? 0 : attempt?.count ?? 0) + 1;
      loginAttempts.set(key, { count, lockedUntil: count >= MAX_LOGIN_ATTEMPTS ? now + LOGIN_LOCK_MS : 0 });
      await new Promise((r) => setTimeout(r, 400));
      return res.status(401).json({
        error:
          count >= MAX_LOGIN_ATTEMPTS
            ? 'Salah password 5 kali berturut-turut. Akses ditahan selama 1 menit demi keamanan.'
            : 'Kombinasi username atau password tidak sesuai.',
      });
    }
    loginAttempts.delete(key);
    res.json({ token: await issueToken(username, rememberMe), username });
  } catch {
    res.status(503).json({ error: 'Layanan login belum tersedia. Silakan coba kembali.' });
  }
});

// Every API route registered below requires a valid session token.
app.use('/api', requireAuth);

app.get('/api/auth/session', (req: AuthRequest, res) => {
  res.json({ username: req.user?.username });
});

app.post('/api/auth/change-password', async (req: AuthRequest, res) => {
  const currentPassword = String(req.body?.currentPassword ?? '').trim();
  const newPassword = String(req.body?.newPassword ?? '').trim();
  try {
    if (!(await verifyPassword(currentPassword))) {
      return res.status(400).json({ error: 'Kata sandi lama tidak sesuai.' });
    }
    if (newPassword.length < 5) {
      return res.status(400).json({ error: 'Kata sandi baru minimal 5 karakter.' });
    }
    await changePassword(newPassword);
    res.json({ success: true, token: await issueToken(req.user?.username || CLINIC_USERNAME, true) });
  } catch {
    res.status(500).json({ error: 'Gagal memperbarui kata sandi. Silakan coba kembali.' });
  }
});

// Never send or accept credential material through the shared settings object.
function sanitizeSettings<T>(value: T): T {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const { password_hash: _omit, ...rest } = value as Record<string, unknown>;
    return rest as T;
  }
  return value;
}
const PRIVATE_SETTING_KEYS = /^(auth_|seeded_)/;

// ============================================================================
// Snapshot version is informational; clients always read shared database state.
// ============================================================================
let syncVersion = Date.now();
function broadcastSync(_scope: string, _sourceClientId?: string) {
  syncVersion = Date.now();
}

// ============================================================================
// ============================================================================
// DATA MAPPERS (DB <-> API/Frontend Canonical Shapes)
// ============================================================================
function mapWbpFromClient(w: any): WbpInsert {
  return {
    id: String(w.id),
    no: w.no !== undefined && w.no !== null ? Number(w.no) : null,
    nik: w.nik ?? '',
    noRegInstansi: w.no_reg_instansi ?? w.noRegInstansi ?? '',
    nama: String(w.nama || ''),
    jenisKelamin: w.jenis_kelamin ?? w.jenisKelamin ?? 'Laki-laki',
    tempatLahir: w.tempat_lahir ?? w.tempatLahir ?? '',
    tanggalLahir: w.tanggal_lahir ?? w.tanggalLahir ?? '',
    alamat: w.alamat ?? '',
    namaAyah: w.nama_ayah ?? w.namaAyah ?? '',
    namaIbu: w.nama_ibu ?? w.namaIbu ?? '',
    pekerjaan: w.pekerjaan ?? '',
    jenisKejahatan: w.jenis_kejahatan ?? w.jenisKejahatan ?? '',
    kategori: w.kategori ?? 'Narapidana',
    lamaPidana: w.lama_pidana ?? w.lamaPidana ?? '',
    tanggalMasuk: w.tanggal_masuk ?? w.tanggalMasuk ?? '',
    tglEkspirasi: w.tgl_ekspirasi ?? w.tglEkspirasi ?? '',
    blok: w.blok ?? '',
    kamar: w.kamar ?? '',
    kamarSidb: w.kamar_sidb ?? w.kamarSidb ?? w.kamar ?? '',
    lokasiSel: w.lokasi_sel ?? w.lokasiSel ?? '',
    tglSuratPenahanan: w.tgl_surat_penahanan ?? w.tglSuratPenahanan ?? '',
    nomorSuratPenahanan: w.nomor_surat_penahanan ?? w.nomorSuratPenahanan ?? '',
    statusData: w.status_data ?? w.statusData ?? 'Aktif',
    batchBpjs: w.batch_bpjs ?? w.batchBpjs ?? 'Belum masuk batch',
    statusSkrining: w.status_skrining ?? w.statusSkrining ?? '',
    kendalaBpjs: w.kendala_bpjs ?? w.kendalaBpjs ?? '',
    dasarPbi: w.dasar_pbi ?? w.dasarPbi ?? '',
    catatanPenggabungan: w.catatan_penggabungan ?? w.catatanPenggabungan ?? '',
    perluDicek: Boolean(w.perlu_dicek ?? w.perluDicek ?? false),
    sumberUpdate: w.sumber_update ?? w.sumberUpdate ?? '',
    terakhirDiperbarui: w.terakhir_diperbarui ?? w.terakhirDiperbarui ?? '',
    dibuatPada: w.dibuat_pada ?? w.dibuatPada ?? '',
  };
}

function mapWbpToClient(dw: any, idx: number) {
  return {
    id: dw.id,
    no: dw.no ?? idx + 1,
    nik: dw.nik || '',
    no_reg_instansi: dw.noRegInstansi || '',
    nama: dw.nama,
    jenis_kelamin: dw.jenisKelamin || 'Laki-laki',
    tempat_lahir: dw.tempatLahir || '',
    tanggal_lahir: dw.tanggalLahir || '',
    alamat: dw.alamat || '',
    nama_ayah: dw.namaAyah || '',
    nama_ibu: dw.namaIbu || '',
    pekerjaan: dw.pekerjaan || '',
    jenis_kejahatan: dw.jenisKejahatan || '',
    kategori: dw.kategori || 'Narapidana',
    lama_pidana: dw.lamaPidana || '',
    tanggal_masuk: dw.tanggalMasuk || '',
    tgl_ekspirasi: dw.tglEkspirasi || '',
    blok: dw.blok || '',
    kamar: dw.kamar || '',
    kamar_sidb: dw.kamarSidb || dw.kamar || '',
    lokasi_sel: dw.lokasiSel || '',
    tgl_surat_penahanan: dw.tglSuratPenahanan || '',
    nomor_surat_penahanan: dw.nomorSuratPenahanan || '',
    status_data: dw.statusData || 'Aktif',
    batch_bpjs: dw.batchBpjs || 'Belum masuk batch',
    status_skrining: dw.statusSkrining || '',
    kendala_bpjs: dw.kendalaBpjs || '',
    dasar_pbi: dw.dasarPbi || '',
    catatan_penggabungan: dw.catatanPenggabungan || '',
    perlu_dicek: Boolean(dw.perluDicek),
    sumber_update: dw.sumberUpdate || '',
    terakhir_diperbarui: dw.terakhirDiperbarui || '',
    dibuat_pada: dw.dibuatPada || (dw.createdAt ? new Date(dw.createdAt).toISOString() : ''),
  };
}

function mapKunjunganFromClient(k: any): KunjunganInsert {
  return {
    id: String(k.id),
    tanggal: String(k.tanggal || ''),
    wbpId: k.wbp_id ?? k.wbpId ?? null,
    nama: String(k.nama || ''),
    nik: k.nik ?? '',
    kamar: k.kamar ?? '',
    keluhan1: k.keluhan1 ?? '',
    keluhan2: k.keluhan2 ?? '',
    keluhan3: k.keluhan3 ?? '',
    penyakit1: k.penyakit1 ?? '',
    jenis1: k.jenis1 ?? '',
    penyakit2: k.penyakit2 ?? '',
    jenis2: k.jenis2 ?? '',
    penyakit3: k.penyakit3 ?? '',
    jenis3: k.jenis3 ?? '',
    terapi: k.terapi ?? '',
    dokterPemeriksa: k.dokter_pemeriksa ?? k.dokterPemeriksa ?? '',
    perawat: k.perawat ?? '',
    catatan: k.catatan ?? '',
    dihapus: Boolean(k.dihapus ?? false),
    dibuatPada: k.dibuat_pada ?? k.dibuatPada ?? new Date().toISOString(),
    diubahPada: k.diubah_pada ?? k.diubahPada ?? null,
  };
}

function mapKunjunganToClient(dk: any) {
  return {
    id: dk.id,
    tanggal: dk.tanggal,
    wbp_id: dk.wbpId || '',
    nama: dk.nama,
    nik: dk.nik || '',
    kamar: dk.kamar || '',
    keluhan1: dk.keluhan1 || '',
    keluhan2: dk.keluhan2 || '',
    keluhan3: dk.keluhan3 || '',
    penyakit1: dk.penyakit1 || '',
    jenis1: dk.jenis1 || undefined,
    penyakit2: dk.penyakit2 || '',
    jenis2: dk.jenis2 || undefined,
    penyakit3: dk.penyakit3 || '',
    jenis3: dk.jenis3 || undefined,
    terapi: dk.terapi || '',
    dokter_pemeriksa: dk.dokterPemeriksa || '',
    perawat: dk.perawat || '',
    catatan: dk.catatan || '',
    dihapus: Boolean(dk.dihapus),
    dibuat_pada: dk.dibuatPada || (dk.createdAt ? new Date(dk.createdAt).toISOString() : new Date().toISOString()),
    diubah_pada: dk.diubahPada || undefined,
  };
}

function mapReferensiFromClient(r: any): ReferensiInsert {
  return {
    id: String(r.id),
    keluhan: String(r.keluhan || ''),
    masukPenyakit: r.masuk_penyakit ?? r.masukPenyakit ?? '',
    kodeIcd10: r.kode_icd10 ?? r.kodeIcd10 ?? '',
    namaIcd10: r.nama_icd10 ?? r.namaIcd10 ?? '',
    jenis: r.jenis ?? 'Tidak Menular',
    catatan: r.catatan ?? '',
  };
}

function mapReferensiToClient(r: any) {
  return {
    id: r.id,
    keluhan: r.keluhan,
    masuk_penyakit: r.masukPenyakit || '',
    kode_icd10: r.kodeIcd10 || '',
    nama_icd10: r.namaIcd10 || '',
    jenis: r.jenis || 'Tidak Menular',
    catatan: r.catatan || '',
  };
}

function mapPenyakitFromClient(p: any, idx: number): PenyakitInsert {
  return {
    id: String(p.id),
    kategori: String(p.kategori || ''),
    penyakit: String(p.penyakit || ''),
    jenis: String(p.jenis || 'Tidak Menular'),
    urutan: p.urutan !== undefined ? Number(p.urutan) : idx + 1,
  };
}

function mapPenyakitToClient(p: any) {
  return {
    id: p.id,
    kategori: p.kategori,
    penyakit: p.penyakit,
    jenis: p.jenis,
    urutan: p.urutan,
  };
}

function mapSidbFromClient(h: any): SidbHistoryInsert {
  return {
    id: String(h.id),
    tanggal: String(h.tanggal || new Date().toISOString()),
    namaFile: String(h.nama_file ?? h.namaFile ?? ''),
    totalBaris: Number(h.total_baris ?? h.totalBaris ?? 0),
    wbpBaru: Number(h.wbp_baru ?? h.wbpBaru ?? 0),
    wbpDiperbarui: Number(h.wbp_diperbarui ?? h.wbpDiperbarui ?? 0),
    wbpDitandaiCek: Number(h.wbp_ditandai_cek ?? h.wbpDitandaiCek ?? 0),
  };
}

function mapSidbToClient(h: any) {
  return {
    id: h.id,
    tanggal: h.tanggal,
    nama_file: h.namaFile,
    total_baris: h.totalBaris ?? 0,
    wbp_baru: h.wbpBaru ?? 0,
    wbp_diperbarui: h.wbpDiperbarui ?? 0,
    wbp_ditandai_cek: h.wbpDitandaiCek ?? 0,
  };
}

function mapAuditToClient(a: any) {
  return {
    id: a.id,
    waktu: a.waktu,
    aksi: a.aksi,
    rincian: a.rincian,
    perangkat: a.perangkat || '',
  };
}

function mapMasterObatFromClient(o: any): MasterObatInsert {
  return {
    id: String(o.id),
    nama: String(o.nama || ''),
    kekuatan: String(o.kekuatan || ''),
    satuanTerkecil: String(o.satuan_terkecil ?? o.satuanTerkecil ?? 'tablet'),
    isiPerKotak: Math.max(1, Math.round(Number(o.isi_per_kotak ?? o.isiPerKotak ?? 1))),
    aktif: o.aktif ?? true,
  };
}

function mapMasterObatToClient(o: any) {
  return {
    id: o.id,
    nama: o.nama,
    kekuatan: o.kekuatan,
    satuan_terkecil: o.satuanTerkecil || 'tablet',
    isi_per_kotak: o.isiPerKotak ?? 1,
    aktif: o.aktif ?? true,
    dibuat_pada: o.createdAt ? new Date(o.createdAt).toISOString() : undefined,
  };
}

function mapResepObatFromClient(r: any, kunjunganIdOverride?: string): ResepObatInsert {
  return {
    id: String(r.id),
    kunjunganId: String(kunjunganIdOverride ?? r.kunjungan_id ?? r.kunjunganId ?? ''),
    obatId: String(r.obat_id ?? r.obatId ?? ''),
    jumlahPerMinum:
      r.jumlah_per_minum !== undefined && r.jumlah_per_minum !== null && r.jumlah_per_minum !== ''
        ? String(r.jumlah_per_minum)
        : null,
    frekuensiPerHari:
      r.frekuensi_per_hari !== undefined && r.frekuensi_per_hari !== null && r.frekuensi_per_hari !== ''
        ? Number(r.frekuensi_per_hari)
        : null,
    lamaHari:
      r.lama_hari !== undefined && r.lama_hari !== null && r.lama_hari !== ''
        ? Number(r.lama_hari)
        : null,
    jumlahDiberikan: Math.max(1, Math.round(Number(r.jumlah_diberikan ?? r.jumlahDiberikan ?? 1))),
    aturanPakai: r.aturan_pakai ?? r.aturanPakai ?? null,
    catatan: r.catatan ?? null,
  };
}

function mapResepObatToClient(r: any) {
  const numMinum = r.jumlahPerMinum !== null && r.jumlahPerMinum !== undefined && r.jumlahPerMinum !== ''
    ? Number(r.jumlahPerMinum)
    : undefined;
  return {
    id: r.id,
    kunjungan_id: r.kunjunganId,
    obat_id: r.obatId,
    jumlah_per_minum: numMinum !== undefined && !isNaN(numMinum) ? numMinum : undefined,
    frekuensi_per_hari: r.frekuensiPerHari ?? undefined,
    lama_hari: r.lamaHari ?? undefined,
    jumlah_diberikan: r.jumlahDiberikan,
    aturan_pakai: r.aturanPakai || undefined,
    catatan: r.catatan || undefined,
  };
}

// ============================================================================
// INITIAL SEEDING (ONLY ONCE ON FRESH DB)
// ============================================================================
async function seedInitialDataIfEmpty() {
  try {
    const seededFlag = await getSetting('seeded_v1');
    if (!seededFlag) {
      await seedPenyakitIfEmpty(INITIAL_PENYAKIT.map((p, idx) => mapPenyakitFromClient(p, idx)));
      await seedReferensiIfEmpty(INITIAL_REFERENSI.map(mapReferensiFromClient));
      await seedMasterObatIfEmpty(INITIAL_MASTER_OBAT.map(mapMasterObatFromClient));
      await seedWbpIfEmpty(INITIAL_WBP.map(mapWbpFromClient));
      await seedKunjunganIfEmpty(INITIAL_KUNJUNGAN.map(mapKunjunganFromClient));
      const existingSettings = await getSetting('app_settings');
      if (!existingSettings) {
        await setSetting('app_settings', INITIAL_PENGATURAN);
      }
      await setSetting('seeded_v1', true);
    } else {
      const existingSettings = await getSetting('app_settings');
      if (!existingSettings) {
        await setSetting('app_settings', INITIAL_PENGATURAN);
      }
    }
  } catch (err) {
    throw err;
  }
}

async function buildFullSnapshot() {
  const [
    wbpRows,
    kunjunganRows,
    referensiRows,
    penyakitRows,
    appSettings,
    sidbRows,
    auditRows,
    obatRows,
    resepRows,
  ] = await Promise.all([
    getAllWbp(),
    getAllKunjungan(),
    getAllReferensi(),
    getAllPenyakit(),
    getSetting('app_settings'),
    getSidbHistoryList(),
    getAuditLogs(500),
    getAllMasterObat(),
    getAllResepObat(),
  ]);

  return {
    version: syncVersion,
    wbp: wbpRows.map(mapWbpToClient),
    kunjungan: kunjunganRows.map(mapKunjunganToClient),
    referensi: referensiRows.map(mapReferensiToClient),
    penyakit: penyakitRows.map(mapPenyakitToClient),
    pengaturan: sanitizeSettings(appSettings || INITIAL_PENGATURAN),
    sidb_history: sidbRows.map(mapSidbToClient),
    audit_logs: auditRows.map(mapAuditToClient),
    master_obat: obatRows.map(mapMasterObatToClient),
    resep_obat: resepRows.map(mapResepObatToClient),
  };
}

// ============================================================================
// FULL SNAPSHOT & BACKUP ENDPOINTS
// ============================================================================
app.get('/api/sync/state', async (_req, res) => {
  try {
    const snapshot = await buildFullSnapshot();
    res.json(snapshot);
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.get('/api/backup/export', async (_req, res) => {
  try {
    const snapshot = await buildFullSnapshot();
    res.json({
      version: '2.0',
      app_name: 'Klinik Pratama Lapas Kelas IIB Dompu',
      exported_at: new Date().toISOString(),
      counts: {
        wbp: snapshot.wbp.length,
        kunjungan_total: snapshot.kunjungan.length,
        kunjungan_aktif: snapshot.kunjungan.filter((k: any) => !k.dihapus).length,
        kunjungan_sampah: snapshot.kunjungan.filter((k: any) => k.dihapus).length,
        referensi: snapshot.referensi.length,
        penyakit: snapshot.penyakit.length,
        sidb_history: snapshot.sidb_history.length,
        audit_logs: snapshot.audit_logs.length,
      },
      wbp: snapshot.wbp,
      kunjungan: snapshot.kunjungan,
      referensi: snapshot.referensi,
      penyakit: snapshot.penyakit,
      pengaturan: snapshot.pengaturan,
      sidb_history: snapshot.sidb_history,
      audit_logs: snapshot.audit_logs,
      master_obat: snapshot.master_obat,
      resep_obat: snapshot.resep_obat,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.post('/api/backup/restore', async (req, res) => {
  try {
    const data = req.body;
    const clientId = req.headers['x-client-id'] as string | undefined;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Format cadangan tidak valid' });
    }

    const wbpRows: WbpInsert[] = Array.isArray(data.wbp) ? data.wbp.map(mapWbpFromClient) : [];
    const wbpIdSet = new Set(wbpRows.map((w) => w.id));
    const kunjunganRows: KunjunganInsert[] = Array.isArray(data.kunjungan)
      ? data.kunjungan.map((k: any) => {
          const mapped = mapKunjunganFromClient(k);
          if (mapped.wbpId && !wbpIdSet.has(mapped.wbpId)) {
            mapped.wbpId = null;
          }
          return mapped;
        })
      : [];
    const referensiRows: ReferensiInsert[] = Array.isArray(data.referensi)
      ? data.referensi.map(mapReferensiFromClient)
      : INITIAL_REFERENSI.map(mapReferensiFromClient);
    const penyakitRows: PenyakitInsert[] = Array.isArray(data.penyakit)
      ? data.penyakit.map((p: any, idx: number) => mapPenyakitFromClient(p, idx))
      : INITIAL_PENYAKIT.map((p, idx) => mapPenyakitFromClient(p, idx));
    const sidbRows: SidbHistoryInsert[] = Array.isArray(data.sidb_history)
      ? data.sidb_history.map(mapSidbFromClient)
      : [];
    const auditRows: AuditLogInsert[] = Array.isArray(data.audit_logs)
      ? data.audit_logs.map((a: any) => ({
          id: String(a.id),
          waktu: String(a.waktu || new Date().toISOString()),
          aksi: String(a.aksi || 'Log'),
          rincian: String(a.rincian || ''),
          perangkat: a.perangkat ?? '',
        }))
      : [];
    const masterObatRows: MasterObatInsert[] | undefined = Array.isArray(data.master_obat)
      ? data.master_obat.map(mapMasterObatFromClient)
      : undefined;
    const resepObatRows: ResepObatInsert[] | undefined = Array.isArray(data.resep_obat)
      ? data.resep_obat.map((r: any) => mapResepObatFromClient(r))
      : undefined;

    await restoreAllTables({
      wbp: wbpRows,
      kunjungan: kunjunganRows,
      referensi: referensiRows,
      penyakit: penyakitRows,
      pengaturan: sanitizeSettings(
        data.pengaturan ? { ...INITIAL_PENGATURAN, ...data.pengaturan } : INITIAL_PENGATURAN
      ),
      sidbHistory: sidbRows,
      auditLogs: auditRows,
      masterObat: masterObatRows,
      resepObat: resepObatRows,
    });

    broadcastSync('full_restore', clientId);
    res.json({ success: true, version: syncVersion });
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.post('/api/system/factory-reset', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    await restoreAllTables({
      wbp: INITIAL_WBP.map(mapWbpFromClient),
      kunjungan: INITIAL_KUNJUNGAN.map(mapKunjunganFromClient),
      referensi: INITIAL_REFERENSI.map(mapReferensiFromClient),
      penyakit: INITIAL_PENYAKIT.map((p, idx) => mapPenyakitFromClient(p, idx)),
      pengaturan: sanitizeSettings(INITIAL_PENGATURAN),
      sidbHistory: [],
      auditLogs: [],
      masterObat: INITIAL_MASTER_OBAT.map(mapMasterObatFromClient),
      resepObat: [],
    });
    broadcastSync('factory_reset', clientId);
    res.json({ success: true, version: syncVersion });
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

// ============================================================================
// WBP ENDPOINTS
// ============================================================================
app.get('/api/wbp', async (_req, res) => {
  try {
    const list = await getAllWbp();
    res.json(list.map(mapWbpToClient));
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.post('/api/wbp', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const saved = await upsertWbpSingle(mapWbpFromClient(req.body));
    broadcastSync('wbp', clientId);
    res.json(mapWbpToClient(saved, 0));
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.put('/api/wbp/:id', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const saved = await upsertWbpSingle(mapWbpFromClient({ ...req.body, id: req.params.id }));
    broadcastSync('wbp', clientId);
    res.json(mapWbpToClient(saved, 0));
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.delete('/api/wbp/all', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const result = await clearAllWbpFromDb();
    broadcastSync('wbp', clientId);
    res.json({ message: 'All WBP deleted', count: result.length });
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.delete('/api/wbp/:id', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const result = await deleteWbpById(req.params.id);
    broadcastSync('wbp', clientId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.post('/api/wbp/batch', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const items = Array.isArray(req.body) ? req.body.map(mapWbpFromClient) : [];
    const result = await upsertWbpBatch(items);
    broadcastSync('wbp', clientId);
    res.json(result.map(mapWbpToClient));
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

// ============================================================================
// KUNJUNGAN ENDPOINTS
// ============================================================================
app.get('/api/kunjungan', async (_req, res) => {
  try {
    const list = await getAllKunjungan();
    res.json(list.map(mapKunjunganToClient));
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.post('/api/kunjungan', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const payload = mapKunjunganFromClient(req.body);
    if (payload.wbpId === '') payload.wbpId = null;
    const result = await insertKunjungan(payload);
    broadcastSync('kunjungan', clientId);
    res.json(mapKunjunganToClient(result));
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.put('/api/kunjungan/:id', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const payload = mapKunjunganFromClient({ ...req.body, id: req.params.id });
    if (payload.wbpId === '') payload.wbpId = null;
    const result = await updateKunjunganById(req.params.id, {
      ...payload,
      diubahPada: new Date().toISOString(),
    });
    broadcastSync('kunjungan', clientId);
    res.json(result ? mapKunjunganToClient(result) : null);
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.post('/api/kunjungan/batch', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const items = Array.isArray(req.body)
      ? req.body.map((k) => {
          const mapped = mapKunjunganFromClient(k);
          if (mapped.wbpId === '') mapped.wbpId = null;
          return mapped;
        })
      : [];
    const result = await insertKunjunganBatch(items);
    broadcastSync('kunjungan', clientId);
    res.json(result.map(mapKunjunganToClient));
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.delete('/api/kunjungan/all', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const result = await clearAllKunjunganFromDb();
    broadcastSync('kunjungan', clientId);
    res.json({ message: 'All visits deleted', count: result.length });
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.patch('/api/kunjungan/:id/restore', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const result = await restoreKunjunganById(req.params.id);
    broadcastSync('kunjungan', clientId);
    res.json(result.map(mapKunjunganToClient));
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.delete('/api/kunjungan/:id/permanent', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    await deleteResepByKunjunganId(req.params.id);
    const result = await permanentDeleteKunjunganById(req.params.id);
    broadcastSync('kunjungan', clientId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.delete('/api/kunjungan/:id', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    await deleteResepByKunjunganId(req.params.id);
    const result = await softDeleteKunjungan(req.params.id);
    broadcastSync('kunjungan', clientId);
    res.json(result.map(mapKunjunganToClient));
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

// ============================================================================
// PENYAKIT & REFERENSI ICD-10 ENDPOINTS
// ============================================================================
app.get('/api/penyakit', async (_req, res) => {
  try {
    const list = await getAllPenyakit();
    res.json(list.map(mapPenyakitToClient));
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.post('/api/penyakit', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const saved = await upsertPenyakit(mapPenyakitFromClient(req.body, 0));
    broadcastSync('penyakit', clientId);
    res.json(mapPenyakitToClient(saved));
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.put('/api/penyakit/:id', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const saved = await upsertPenyakit(mapPenyakitFromClient({ ...req.body, id: req.params.id }, 0));
    if (req.body.jenis && req.body.penyakit) {
      await updateReferensiJenisByPenyakit(req.body.penyakit, req.body.jenis);
    }
    broadcastSync('penyakit', clientId);
    res.json(mapPenyakitToClient(saved));
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.get('/api/referensi', async (_req, res) => {
  try {
    const list = await getAllReferensi();
    res.json(list.map(mapReferensiToClient));
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.post('/api/referensi', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const saved = await upsertReferensi(mapReferensiFromClient(req.body));
    broadcastSync('referensi', clientId);
    res.json(mapReferensiToClient(saved));
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.put('/api/referensi/:id', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const saved = await upsertReferensi(mapReferensiFromClient({ ...req.body, id: req.params.id }));
    broadcastSync('referensi', clientId);
    res.json(mapReferensiToClient(saved));
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.delete('/api/referensi/:id', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const result = await deleteReferensiById(req.params.id);
    broadcastSync('referensi', clientId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

// ============================================================================
// PENGATURAN, SIDB HISTORY & AUDIT LOG ENDPOINTS
// ============================================================================
app.get('/api/pengaturan/:key', async (req, res) => {
  if (PRIVATE_SETTING_KEYS.test(req.params.key)) return res.status(404).json({ error: 'Tidak ditemukan' });
  try {
    const value = await getSetting(req.params.key);
    res.json(sanitizeSettings(value));
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.post('/api/pengaturan/:key', async (req, res) => {
  if (PRIVATE_SETTING_KEYS.test(req.params.key)) return res.status(404).json({ error: 'Tidak ditemukan' });
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const result = await setSetting(req.params.key, sanitizeSettings(req.body));
    broadcastSync('pengaturan', clientId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.get('/api/sidb-history', async (_req, res) => {
  try {
    const list = await getSidbHistoryList();
    res.json(list.map(mapSidbToClient));
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.post('/api/sidb-history', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const saved = await addSidbHistoryEntry(mapSidbFromClient(req.body));
    broadcastSync('sidb_history', clientId);
    res.json(saved ? mapSidbToClient(saved) : null);
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.get('/api/audit', async (_req, res) => {
  try {
    const list = await getAuditLogs(500);
    res.json(list.map(mapAuditToClient));
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.post('/api/audit', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const result = await addAuditLog(req.body);
    broadcastSync('audit', clientId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

// ============================================================================
// MASTER OBAT & RESEP OBAT ENDPOINTS
// ============================================================================
app.get('/api/obat', async (_req, res) => {
  try {
    const list = await getAllMasterObat();
    res.json(list.map(mapMasterObatToClient));
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.post('/api/obat', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const saved = await upsertMasterObat(mapMasterObatFromClient(req.body));
    broadcastSync('obat', clientId);
    res.json(mapMasterObatToClient(saved));
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.delete('/api/obat/:id', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const result = await deleteMasterObatById(req.params.id);
    broadcastSync('obat', clientId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.get('/api/resep', async (_req, res) => {
  try {
    const list = await getAllResepObat();
    res.json(list.map(mapResepObatToClient));
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

app.put('/api/resep/kunjungan/:kunjunganId', async (req, res) => {
  try {
    const clientId = req.headers['x-client-id'] as string | undefined;
    const items = Array.isArray(req.body)
      ? req.body.map((r: any) => mapResepObatFromClient(r, req.params.kunjunganId))
      : [];
    const saved = await replaceResepForKunjungan(req.params.kunjunganId, items);
    broadcastSync('resep', clientId);
    res.json(saved.map(mapResepObatToClient));
  } catch (error: any) {
    res.status(500).json({ error: 'Operasi database gagal. Silakan coba kembali.' });
  }
});

// Setup Vite middlewares for Frontend SPA
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server Klinik Lapas Dompu running on http://0.0.0.0:${port}`);

  });
}

if (!process.env.NETLIFY) startServer();
