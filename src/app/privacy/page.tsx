import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Kebijakan Privasi | SnapPath",
  description: "Pelajari bagaimana SnapPath mengumpulkan, menggunakan, dan melindungi data Anda sesuai dengan UU Pelindungan Data Pribadi Indonesia.",
};

export default function PrivacyPage() {
  return (
    <div className="flex flex-col min-h-screen bg-surface font-sans text-text">
      <Navbar />
      <main className="flex-1 pt-24">
        {/* Header */}
        <div className="border-b border-border/50 bg-surface-elevated py-12 sm:py-16">
          <div className="mx-auto max-w-3xl px-6 lg:px-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-faint mb-3">Dokumen Resmi</p>
            <h1 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
              Kebijakan Privasi
            </h1>
            <p className="mt-4 text-lg text-text-subtle leading-relaxed">
              Kebijakan ini menjelaskan bagaimana SnapPath mengumpulkan, memproses, menyimpan, dan melindungi data Anda sebagai pengguna platform.
            </p>
            <p className="mt-3 text-sm text-text-faint">Terakhir diperbarui: 26 Mei 2026</p>
          </div>
        </div>

        {/* Content */}
        <div className="mx-auto max-w-3xl px-6 lg:px-8 py-12 sm:py-16">
          <div className="space-y-10">

            <section>
              <h2 className="text-xl font-bold text-text mb-4 pb-2 border-b border-border/50">
                1. Data yang Kami Kumpulkan
              </h2>
              <div className="space-y-4 text-sm text-text-subtle leading-relaxed">
                <p>SnapPath mengumpulkan data dalam dua kategori:</p>
                <div className="space-y-4">
                  <div className="rounded-lg border border-border/50 bg-surface-elevated p-4">
                    <h3 className="font-semibold text-text mb-2">Data Akun & Institusi</h3>
                    <ul className="space-y-1 pl-4">
                      <li className="flex gap-x-2"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary"></span><span>Nama, alamat email, dan kata sandi terenkripsi pengguna dashboard</span></li>
                      <li className="flex gap-x-2"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary"></span><span>Informasi institusi (nama rumah sakit/klinik, tipe, dan konfigurasi tenant)</span></li>
                      <li className="flex gap-x-2"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary"></span><span>Riwayat aktivitas dan log penggunaan AI per sesi</span></li>
                    </ul>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-surface-elevated p-4">
                    <h3 className="font-semibold text-text mb-2">Data Klinis (Diproses, Tidak Disimpan Permanen)</h3>
                    <ul className="space-y-1 pl-4">
                      <li className="flex gap-x-2"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-secondary"></span><span>Data pasien (anonim/pseudonim) yang dikirim untuk validasi klaim atau pembuatan pathway</span></li>
                      <li className="flex gap-x-2"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-secondary"></span><span>Data diagnosis, tindakan, dan obat yang digunakan sebagai input sistem</span></li>
                      <li className="flex gap-x-2"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-secondary"></span><span>Hasil validasi dan pathway yang disimpan sementara untuk kebutuhan audit institusi</span></li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-text mb-4 pb-2 border-b border-border/50">
                2. Cara Kami Menggunakan Data
              </h2>
              <div className="space-y-4 text-sm text-text-subtle leading-relaxed">
                <p>Data yang dikumpulkan digunakan semata-mata untuk:</p>
                <ul className="space-y-2 pl-4">
                  <li className="flex gap-x-3"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary"></span><span>Menjalankan fitur inti platform (validasi klaim, pembuatan clinical pathway)</span></li>
                  <li className="flex gap-x-3"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary"></span><span>Autentikasi dan keamanan sesi pengguna</span></li>
                  <li className="flex gap-x-3"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary"></span><span>Monitoring penggunaan AI untuk pengendalian biaya dan audit operasional institusi</span></li>
                  <li className="flex gap-x-3"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary"></span><span>Pemenuhan kewajiban hukum dan regulasi yang berlaku</span></li>
                </ul>
                <p className="mt-4 font-medium text-text">
                  SnapPath tidak menjual, menyewakan, atau berbagi data institusi atau pasien kepada pihak ketiga untuk tujuan komersial.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-text mb-4 pb-2 border-b border-border/50">
                3. Penyimpanan & Retensi Data
              </h2>
              <div className="space-y-4 text-sm text-text-subtle leading-relaxed">
                <p>
                  Data disimpan di infrastruktur database yang aman. Periode retensi mengikuti perjanjian layanan dengan masing-masing institusi. Data yang tidak lagi diperlukan akan dihapus secara permanen sesuai prosedur yang disepakati.
                </p>
                <p>
                  Data klinis yang digunakan dalam proses AI hanya diproses secara real-time dan tidak disimpan dalam sistem AI pihak ketiga manapun.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-text mb-4 pb-2 border-b border-border/50">
                4. Hak-hak Anda
              </h2>
              <div className="space-y-4 text-sm text-text-subtle leading-relaxed">
                <p>Sesuai dengan UU Pelindungan Data Pribadi No. 27 Tahun 2022, Anda berhak untuk:</p>
                <ul className="space-y-2 pl-4">
                  <li className="flex gap-x-3"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent"></span><span>Mengakses data pribadi Anda yang kami simpan</span></li>
                  <li className="flex gap-x-3"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent"></span><span>Meminta koreksi data yang tidak akurat</span></li>
                  <li className="flex gap-x-3"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent"></span><span>Meminta penghapusan data sesuai ketentuan yang berlaku</span></li>
                  <li className="flex gap-x-3"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent"></span><span>Mendapatkan informasi mengenai bagaimana data Anda diproses</span></li>
                </ul>
                <p>Untuk mengajukan permintaan, hubungi tim kami melalui dashboard institusi Anda.</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-text mb-4 pb-2 border-b border-border/50">
                5. Cookie & Sesi
              </h2>
              <p className="text-sm text-text-subtle leading-relaxed">
                SnapPath menggunakan HTTP-only cookie untuk menyimpan sesi autentikasi secara aman. Tidak ada cookie pihak ketiga untuk pelacakan iklan atau analitik eksternal yang digunakan pada platform ini.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-text mb-4 pb-2 border-b border-border/50">
                6. Perubahan Kebijakan
              </h2>
              <p className="text-sm text-text-subtle leading-relaxed">
                SnapPath dapat memperbarui kebijakan privasi ini dari waktu ke waktu. Setiap perubahan material akan dikomunikasikan kepada pengguna terdaftar melalui dashboard atau email yang terdaftar.
              </p>
            </section>

          </div>

          {/* Navigation */}
          <div className="mt-12 flex flex-wrap gap-4 border-t border-border/50 pt-8">
            <Link href="/compliance" className="text-sm font-medium text-primary hover:underline">
              Kepatuhan & Regulasi
            </Link>
            <Link href="/terms" className="text-sm font-medium text-primary hover:underline">
              Ketentuan Layanan
            </Link>
            <Link href="/api-docs" className="text-sm font-medium text-primary hover:underline">
              Dokumentasi API
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
