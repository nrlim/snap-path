import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Kepatuhan | SnapPath",
  description: "Komitmen SnapPath terhadap standar kepatuhan regulasi kesehatan Indonesia, keamanan data, dan praktik tata kelola AI yang bertanggung jawab.",
};

export default function CompliancePage() {
  return (
    <div className="flex flex-col min-h-screen bg-surface font-sans text-text">
      <Navbar />
      <main className="flex-1 pt-24">
        {/* Header */}
        <div className="border-b border-border/50 bg-surface-elevated py-12 sm:py-16">
          <div className="mx-auto max-w-3xl px-6 lg:px-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-faint mb-3">Dokumen Resmi</p>
            <h1 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
              Kepatuhan & Regulasi
            </h1>
            <p className="mt-4 text-lg text-text-subtle leading-relaxed">
              SnapPath berkomitmen penuh untuk beroperasi sesuai dengan regulasi dan standar yang berlaku di Indonesia, termasuk keamanan data kesehatan dan tata kelola kecerdasan buatan.
            </p>
            <p className="mt-3 text-sm text-text-faint">Terakhir diperbarui: 26 Mei 2026</p>
          </div>
        </div>

        {/* Content */}
        <div className="mx-auto max-w-3xl px-6 lg:px-8 py-12 sm:py-16">
          <div className="space-y-10">

            <section>
              <h2 className="text-xl font-bold text-text mb-4 pb-2 border-b border-border/50">
                1. Kepatuhan Regulasi Kesehatan
              </h2>
              <div className="space-y-4 text-sm text-text-subtle leading-relaxed">
                <p>
                  SnapPath dirancang sesuai dengan kerangka regulasi yang mengatur pengelolaan data kesehatan di Indonesia, termasuk namun tidak terbatas pada:
                </p>
                <ul className="space-y-2 pl-4">
                  <li className="flex gap-x-3">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary"></span>
                    <span><strong className="text-text">UU No. 17 Tahun 2023</strong> tentang Kesehatan — sebagai dasar hukum penyelenggaraan layanan kesehatan digital.</span>
                  </li>
                  <li className="flex gap-x-3">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary"></span>
                    <span><strong className="text-text">Permenkes No. 24 Tahun 2022</strong> tentang Rekam Medis Elektronik — panduan pengelolaan data rekam medis secara digital.</span>
                  </li>
                  <li className="flex gap-x-3">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary"></span>
                    <span><strong className="text-text">UU No. 27 Tahun 2022</strong> tentang Pelindungan Data Pribadi (PDP) — sebagai landasan perlindungan data pengguna dan pasien.</span>
                  </li>
                  <li className="flex gap-x-3">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary"></span>
                    <span><strong className="text-text">Standar BPJS Kesehatan</strong> — platform mendukung format dan standar klaim yang kompatibel dengan ekosistem JKN.</span>
                  </li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-text mb-4 pb-2 border-b border-border/50">
                2. Keamanan Data & Infrastruktur
              </h2>
              <div className="space-y-4 text-sm text-text-subtle leading-relaxed">
                <p>
                  Semua data yang diproses melalui SnapPath dilindungi menggunakan praktik keamanan berlapis:
                </p>
                <ul className="space-y-2 pl-4">
                  <li className="flex gap-x-3">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-secondary"></span>
                    <span>Enkripsi data saat transit (TLS 1.2+) dan saat penyimpanan (AES-256).</span>
                  </li>
                  <li className="flex gap-x-3">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-secondary"></span>
                    <span>Autentikasi berbasis JWT dengan HTTP-only cookies — tidak ada token yang terekspos ke sisi klien.</span>
                  </li>
                  <li className="flex gap-x-3">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-secondary"></span>
                    <span>Isolasi data per tenant — setiap institusi hanya dapat mengakses data milik mereka sendiri.</span>
                  </li>
                  <li className="flex gap-x-3">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-secondary"></span>
                    <span>Audit log lengkap untuk setiap transaksi AI dan aktivitas API.</span>
                  </li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-text mb-4 pb-2 border-b border-border/50">
                3. Tata Kelola AI yang Bertanggung Jawab
              </h2>
              <div className="space-y-4 text-sm text-text-subtle leading-relaxed">
                <p>
                  SnapPath menerapkan prinsip AI yang deterministik, akuntabel, dan dapat diaudit:
                </p>
                <ul className="space-y-2 pl-4">
                  <li className="flex gap-x-3">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent"></span>
                    <span><strong className="text-text">Deterministik</strong> — output AI divalidasi oleh schema dan kontrak data klinis yang ketat, bukan bergantung pada probabilitas semata.</span>
                  </li>
                  <li className="flex gap-x-3">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent"></span>
                    <span><strong className="text-text">Auditabel</strong> — setiap keputusan yang diambil sistem dicatat dalam audit trail yang dapat ditelusuri oleh institusi.</span>
                  </li>
                  <li className="flex gap-x-3">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent"></span>
                    <span><strong className="text-text">Tidak menggantikan klinis</strong> — SnapPath adalah alat bantu, bukan pengambil keputusan medis. Tanggung jawab klinis tetap pada tenaga kesehatan bersertifikat.</span>
                  </li>
                  <li className="flex gap-x-3">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent"></span>
                    <span><strong className="text-text">Usage monitoring</strong> — konsumsi AI dimonitor dan dicatat per klien untuk transparansi biaya dan penggunaan.</span>
                  </li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-text mb-4 pb-2 border-b border-border/50">
                4. Tanggung Jawab Institusi
              </h2>
              <div className="space-y-4 text-sm text-text-subtle leading-relaxed">
                <p>
                  Sebagai pengguna platform SnapPath, institusi kesehatan bertanggung jawab untuk:
                </p>
                <ul className="space-y-2 pl-4">
                  <li className="flex gap-x-3">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-text-faint"></span>
                    <span>Memastikan data pasien yang dikirim ke sistem telah mendapatkan persetujuan sesuai ketentuan yang berlaku.</span>
                  </li>
                  <li className="flex gap-x-3">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-text-faint"></span>
                    <span>Menjaga kerahasiaan API key dan API secret yang diterbitkan oleh SnapPath.</span>
                  </li>
                  <li className="flex gap-x-3">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-text-faint"></span>
                    <span>Memverifikasi output SnapPath sebelum digunakan sebagai dasar keputusan klinis atau administratif.</span>
                  </li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-text mb-4 pb-2 border-b border-border/50">
                5. Kontak Kepatuhan
              </h2>
              <p className="text-sm text-text-subtle leading-relaxed">
                Untuk pertanyaan terkait kepatuhan, audit, atau klarifikasi regulasi, hubungi tim SnapPath melalui dashboard institusi Anda atau email resmi yang tercantum dalam perjanjian layanan.
              </p>
            </section>

          </div>

          {/* Navigation */}
          <div className="mt-12 flex flex-wrap gap-4 border-t border-border/50 pt-8">
            <Link href="/privacy" className="text-sm font-medium text-primary hover:underline">
              Kebijakan Privasi
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
