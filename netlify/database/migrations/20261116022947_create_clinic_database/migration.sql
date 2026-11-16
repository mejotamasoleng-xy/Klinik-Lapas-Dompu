CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY,
	"waktu" text NOT NULL,
	"aksi" text NOT NULL,
	"rincian" text NOT NULL,
	"perangkat" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "daftar_penyakit" (
	"id" text PRIMARY KEY,
	"kategori" text NOT NULL,
	"penyakit" text NOT NULL,
	"jenis" text NOT NULL,
	"urutan" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kunjungan" (
	"id" text PRIMARY KEY,
	"tanggal" text NOT NULL,
	"wbp_id" text,
	"nama" text NOT NULL,
	"nik" text,
	"kamar" text DEFAULT '',
	"keluhan1" text,
	"keluhan2" text,
	"keluhan3" text,
	"penyakit1" text,
	"jenis1" text,
	"penyakit2" text,
	"jenis2" text,
	"penyakit3" text,
	"jenis3" text,
	"terapi" text,
	"dokter_pemeriksa" text,
	"perawat" text,
	"catatan" text,
	"dihapus" boolean DEFAULT false,
	"dibuat_pada" text,
	"diubah_pada" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "master_obat" (
	"id" text PRIMARY KEY,
	"nama" text NOT NULL,
	"kekuatan" text NOT NULL,
	"satuan_terkecil" text NOT NULL,
	"isi_per_kotak" integer NOT NULL,
	"aktif" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pengaturan_app" (
	"key" text PRIMARY KEY,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referensi_icd10" (
	"id" text PRIMARY KEY,
	"keluhan" text NOT NULL,
	"masuk_penyakit" text,
	"kode_icd10" text,
	"nama_icd10" text,
	"jenis" text DEFAULT 'Tidak Menular',
	"catatan" text
);
--> statement-breakpoint
CREATE TABLE "resep_obat" (
	"id" text PRIMARY KEY,
	"kunjungan_id" text NOT NULL,
	"obat_id" text NOT NULL,
	"jumlah_per_minum" text,
	"frekuensi_per_hari" integer,
	"lama_hari" integer,
	"jumlah_diberikan" integer NOT NULL,
	"aturan_pakai" text,
	"catatan" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sidb_history" (
	"id" text PRIMARY KEY,
	"tanggal" text NOT NULL,
	"nama_file" text NOT NULL,
	"total_baris" integer DEFAULT 0,
	"wbp_baru" integer DEFAULT 0,
	"wbp_diperbarui" integer DEFAULT 0,
	"wbp_ditandai_cek" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY,
	"uid" text NOT NULL UNIQUE,
	"email" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "wbp" (
	"id" text PRIMARY KEY,
	"no" integer,
	"nik" text,
	"no_reg_instansi" text,
	"nama" text NOT NULL,
	"jenis_kelamin" text DEFAULT 'Laki-laki',
	"tempat_lahir" text,
	"tanggal_lahir" text,
	"alamat" text,
	"nama_ayah" text,
	"nama_ibu" text,
	"pekerjaan" text,
	"jenis_kejahatan" text,
	"kategori" text DEFAULT 'Narapidana',
	"lama_pidana" text,
	"tanggal_masuk" text,
	"tgl_ekspirasi" text,
	"blok" text DEFAULT '',
	"kamar" text DEFAULT '',
	"kamar_sidb" text DEFAULT '',
	"lokasi_sel" text,
	"tgl_surat_penahanan" text,
	"nomor_surat_penahanan" text,
	"status_data" text DEFAULT 'Aktif',
	"batch_bpjs" text DEFAULT 'Belum masuk batch',
	"status_skrining" text,
	"kendala_bpjs" text,
	"dasar_pbi" text,
	"catatan_penggabungan" text,
	"perlu_dicek" boolean DEFAULT false,
	"sumber_update" text,
	"terakhir_diperbarui" text,
	"dibuat_pada" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "kunjungan" ADD CONSTRAINT "kunjungan_wbp_id_wbp_id_fkey" FOREIGN KEY ("wbp_id") REFERENCES "wbp"("id") ON DELETE SET NULL;