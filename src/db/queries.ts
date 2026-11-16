/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { eq, desc, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  wbp,
  kunjungan,
  daftarPenyakit,
  referensiIcd10,
  pengaturanApp,
  auditLogs,
  sidbHistory,
  masterObat,
  resepObat,
} from './schema.ts';

export type WbpInsert = typeof wbp.$inferInsert;
export type KunjunganInsert = typeof kunjungan.$inferInsert;
export type PenyakitInsert = typeof daftarPenyakit.$inferInsert;
export type ReferensiInsert = typeof referensiIcd10.$inferInsert;
export type AuditLogInsert = typeof auditLogs.$inferInsert;
export type SidbHistoryInsert = typeof sidbHistory.$inferInsert;
export type MasterObatInsert = typeof masterObat.$inferInsert;
export type ResepObatInsert = typeof resepObat.$inferInsert;

// Seed helpers
export async function seedPenyakitIfEmpty(records: PenyakitInsert[]) {
  const existing = await getAllPenyakit();
  if (existing.length === 0 && records.length > 0) {
    await db.insert(daftarPenyakit).values(records).onConflictDoNothing();
  }
}

export async function seedReferensiIfEmpty(records: ReferensiInsert[]) {
  const existing = await getAllReferensi();
  if (existing.length === 0 && records.length > 0) {
    await db.insert(referensiIcd10).values(records).onConflictDoNothing();
  }
}

export async function seedWbpIfEmpty(records: WbpInsert[]) {
  const existing = await getAllWbp();
  if (existing.length === 0 && records.length > 0) {
    await db.insert(wbp).values(records).onConflictDoNothing();
  }
}

export async function seedKunjunganIfEmpty(records: KunjunganInsert[]) {
  const existing = await getAllKunjungan();
  if (existing.length === 0 && records.length > 0) {
    await db.insert(kunjungan).values(records).onConflictDoNothing();
  }
}

// WBP Queries
export async function getAllWbp() {
  return await db.select().from(wbp);
}

export async function upsertWbpSingle(record: WbpInsert) {
  const res = await upsertWbpBatch([record]);
  return res[0];
}

export async function upsertWbpBatch(records: WbpInsert[]) {
  if (!records.length) return [];

  const chunkSize = 100;
  const results: (typeof wbp.$inferSelect)[] = [];
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const res = await db
      .insert(wbp)
      .values(chunk)
      .onConflictDoUpdate({
        target: wbp.id,
        set: {
          no: sql`excluded.no`,
          nama: sql`excluded.nama`,
          nik: sql`excluded.nik`,
          noRegInstansi: sql`excluded.no_reg_instansi`,
          jenisKelamin: sql`excluded.jenis_kelamin`,
          tempatLahir: sql`excluded.tempat_lahir`,
          tanggalLahir: sql`excluded.tanggal_lahir`,
          alamat: sql`excluded.alamat`,
          namaAyah: sql`excluded.nama_ayah`,
          namaIbu: sql`excluded.nama_ibu`,
          pekerjaan: sql`excluded.pekerjaan`,
          jenisKejahatan: sql`excluded.jenis_kejahatan`,
          kategori: sql`excluded.kategori`,
          lamaPidana: sql`excluded.lama_pidana`,
          tanggalMasuk: sql`excluded.tanggal_masuk`,
          tglEkspirasi: sql`excluded.tgl_ekspirasi`,
          blok: sql`excluded.blok`,
          kamar: sql`excluded.kamar`,
          kamarSidb: sql`excluded.kamar_sidb`,
          lokasiSel: sql`excluded.lokasi_sel`,
          tglSuratPenahanan: sql`excluded.tgl_surat_penahanan`,
          nomorSuratPenahanan: sql`excluded.nomor_surat_penahanan`,
          statusData: sql`excluded.status_data`,
          batchBpjs: sql`excluded.batch_bpjs`,
          statusSkrining: sql`excluded.status_skrining`,
          kendalaBpjs: sql`excluded.kendala_bpjs`,
          dasarPbi: sql`excluded.dasar_pbi`,
          catatanPenggabungan: sql`excluded.catatan_penggabungan`,
          perluDicek: sql`excluded.perlu_dicek`,
          sumberUpdate: sql`excluded.sumber_update`,
          terakhirDiperbarui: sql`excluded.terakhir_diperbarui`,
        },
      })
      .returning();
    results.push(...res);
  }
  return results;
}

export async function deleteWbpById(id: string) {
  return await db.delete(wbp).where(eq(wbp.id, id)).returning();
}

// Kunjungan Queries
export async function getAllKunjungan() {
  return await db.select().from(kunjungan).orderBy(desc(kunjungan.createdAt));
}

export async function insertKunjungan(record: KunjunganInsert) {
  const result = await db
    .insert(kunjungan)
    .values(record)
    .onConflictDoUpdate({
      target: kunjungan.id,
      set: {
        tanggal: sql`excluded.tanggal`,
        wbpId: sql`excluded.wbp_id`,
        nama: sql`excluded.nama`,
        nik: sql`excluded.nik`,
        kamar: sql`excluded.kamar`,
        keluhan1: sql`excluded.keluhan1`,
        keluhan2: sql`excluded.keluhan2`,
        keluhan3: sql`excluded.keluhan3`,
        penyakit1: sql`excluded.penyakit1`,
        jenis1: sql`excluded.jenis1`,
        penyakit2: sql`excluded.penyakit2`,
        jenis2: sql`excluded.jenis2`,
        penyakit3: sql`excluded.penyakit3`,
        jenis3: sql`excluded.jenis3`,
        terapi: sql`excluded.terapi`,
        dokterPemeriksa: sql`excluded.dokter_pemeriksa`,
        perawat: sql`excluded.perawat`,
        catatan: sql`excluded.catatan`,
        dihapus: sql`excluded.dihapus`,
        diubahPada: sql`excluded.diubah_pada`,
      },
    })
    .returning();
  return result[0];
}

export async function updateKunjunganById(id: string, updates: Partial<KunjunganInsert>) {
  const result = await db
    .update(kunjungan)
    .set(updates)
    .where(eq(kunjungan.id, id))
    .returning();
  return result[0] || null;
}

export async function insertKunjunganBatch(records: KunjunganInsert[]) {
  if (!records.length) return [];

  const chunkSize = 100;
  const results = [];
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const res = await db.insert(kunjungan).values(chunk).onConflictDoNothing().returning();
    results.push(...res);
  }
  return results;
}

export async function clearAllKunjunganFromDb() {
  await db.delete(resepObat);
  return await db.delete(kunjungan).returning();
}

export async function clearAllWbpFromDb() {
  await db.delete(resepObat);
  await db.delete(kunjungan);
  return await db.delete(wbp).returning();
}

export async function softDeleteKunjungan(id: string) {
  return await db
    .update(kunjungan)
    .set({ dihapus: true, diubahPada: new Date().toISOString() })
    .where(eq(kunjungan.id, id))
    .returning();
}

export async function restoreKunjunganById(id: string) {
  return await db
    .update(kunjungan)
    .set({ dihapus: false, diubahPada: new Date().toISOString() })
    .where(eq(kunjungan.id, id))
    .returning();
}

export async function permanentDeleteKunjunganById(id: string) {
  return await db.delete(kunjungan).where(eq(kunjungan.id, id)).returning();
}

// Penyakit & Referensi
export async function getAllPenyakit() {
  return await db.select().from(daftarPenyakit).orderBy(daftarPenyakit.urutan);
}

export async function upsertPenyakit(record: PenyakitInsert) {
  const res = await db
    .insert(daftarPenyakit)
    .values(record)
    .onConflictDoUpdate({
      target: daftarPenyakit.id,
      set: {
        kategori: record.kategori,
        penyakit: record.penyakit,
        jenis: record.jenis,
        urutan: record.urutan,
      },
    })
    .returning();
  return res[0];
}

export async function getAllReferensi() {
  return await db.select().from(referensiIcd10);
}

export async function upsertReferensi(record: ReferensiInsert) {
  const res = await db
    .insert(referensiIcd10)
    .values(record)
    .onConflictDoUpdate({
      target: referensiIcd10.id,
      set: {
        keluhan: record.keluhan,
        masukPenyakit: record.masukPenyakit,
        kodeIcd10: record.kodeIcd10,
        namaIcd10: record.namaIcd10,
        jenis: record.jenis,
        catatan: record.catatan,
      },
    })
    .returning();
  return res[0];
}

export async function deleteReferensiById(id: string) {
  return await db.delete(referensiIcd10).where(eq(referensiIcd10.id, id)).returning();
}

export async function updateReferensiJenisByPenyakit(penyakitName: string, jenis: string) {
  const lower = penyakitName.trim().toLowerCase();

  await db
    .update(referensiIcd10)
    .set({ jenis })
    .where(sql`LOWER(TRIM(${referensiIcd10.masukPenyakit})) = ${lower}`);
}

// Pengaturan
export async function getSetting(key: string) {
  const result = await db
    .select()
    .from(pengaturanApp)
    .where(eq(pengaturanApp.key, key));
  return result[0]?.value ?? null;
}

export async function setSetting(key: string, value: any) {
  return await db
    .insert(pengaturanApp)
    .values({ key, value })
    .onConflictDoUpdate({
      target: pengaturanApp.key,
      set: { value },
    })
    .returning();
}

// Audit Logs
export async function addAuditLog(entry: AuditLogInsert) {
  return await db.insert(auditLogs).values(entry).onConflictDoNothing().returning();
}

export async function getAuditLogs(limitCount = 500) {
  return await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limitCount);
}

// SIDB History
export async function getSidbHistoryList() {
  return await db.select().from(sidbHistory).orderBy(desc(sidbHistory.createdAt));
}

export async function addSidbHistoryEntry(entry: SidbHistoryInsert) {
  const res = await db.insert(sidbHistory).values(entry).onConflictDoNothing().returning();
  return res[0];
}

// Master Obat & Resep Obat Queries
export async function seedMasterObatIfEmpty(records: MasterObatInsert[]) {
  const existing = await getAllMasterObat();
  if (existing.length === 0 && records.length > 0) {
    await db.insert(masterObat).values(records).onConflictDoNothing();
  }
}

export async function getAllMasterObat() {
  return await db.select().from(masterObat).orderBy(masterObat.nama);
}

export async function upsertMasterObat(record: MasterObatInsert) {
  const res = await db
    .insert(masterObat)
    .values(record)
    .onConflictDoUpdate({
      target: masterObat.id,
      set: {
        nama: record.nama,
        kekuatan: record.kekuatan,
        satuanTerkecil: record.satuanTerkecil,
        isiPerKotak: record.isiPerKotak,
        aktif: record.aktif ?? true,
      },
    })
    .returning();
  return res[0];
}

export async function deleteMasterObatById(id: string) {
  await db.delete(resepObat).where(eq(resepObat.obatId, id));
  return await db.delete(masterObat).where(eq(masterObat.id, id)).returning();
}

export async function getAllResepObat() {
  return await db.select().from(resepObat).orderBy(desc(resepObat.createdAt));
}

export async function replaceResepForKunjungan(kunjunganId: string, items: ResepObatInsert[]) {
  await db.transaction(async (tx) => {
    await tx.delete(resepObat).where(eq(resepObat.kunjunganId, kunjunganId));
    if (items.length > 0) {
      await tx.insert(resepObat).values(items);
    }
  });
  return await db.select().from(resepObat).where(eq(resepObat.kunjunganId, kunjunganId));
}

export async function deleteResepByKunjunganId(kunjunganId: string) {
  await db.delete(resepObat).where(eq(resepObat.kunjunganId, kunjunganId));
}

// Full Restore across all tables (atomic replacement)
export async function restoreAllTables(payload: {
  wbp: WbpInsert[];
  kunjungan: KunjunganInsert[];
  referensi: ReferensiInsert[];
  penyakit: PenyakitInsert[];
  pengaturan?: any;
  sidbHistory: SidbHistoryInsert[];
  auditLogs: AuditLogInsert[];
  masterObat?: MasterObatInsert[];
  resepObat?: ResepObatInsert[];
}) {
  await db.transaction(async (tx) => {
    await tx.delete(resepObat);
    await tx.delete(kunjungan);
    await tx.delete(wbp);
    await tx.delete(referensiIcd10);
    await tx.delete(daftarPenyakit);
    await tx.delete(sidbHistory);
    await tx.delete(auditLogs);
    if (payload.masterObat) {
      await tx.delete(masterObat);
    }

    const insertInChunks = async <T extends any[]>(
      table: any,
      rows: T,
      chunkSize = 100
    ) => {
      for (let i = 0; i < rows.length; i += chunkSize) {
        await tx.insert(table).values(rows.slice(i, i + chunkSize)).onConflictDoNothing();
      }
    };

    if (payload.wbp.length > 0) await insertInChunks(wbp, payload.wbp);
    if (payload.kunjungan.length > 0) await insertInChunks(kunjungan, payload.kunjungan);
    if (payload.referensi.length > 0) await insertInChunks(referensiIcd10, payload.referensi);
    if (payload.penyakit.length > 0) await insertInChunks(daftarPenyakit, payload.penyakit);
    if (payload.sidbHistory.length > 0) await insertInChunks(sidbHistory, payload.sidbHistory);
    if (payload.auditLogs.length > 0) await insertInChunks(auditLogs, payload.auditLogs);
    if (payload.masterObat && payload.masterObat.length > 0) {
      await insertInChunks(masterObat, payload.masterObat);
    }
    if (payload.resepObat && payload.resepObat.length > 0) {
      await insertInChunks(resepObat, payload.resepObat);
    }

    if (payload.pengaturan) {
      await tx
        .insert(pengaturanApp)
        .values({ key: 'app_settings', value: payload.pengaturan })
        .onConflictDoUpdate({
          target: pengaturanApp.key,
          set: { value: payload.pengaturan },
        });
    }

    await tx
      .insert(pengaturanApp)
      .values({ key: 'seeded_v1', value: true })
      .onConflictDoUpdate({
        target: pengaturanApp.key,
        set: { value: true },
      });
  });
  return true;
}
