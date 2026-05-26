import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Ketentuan Layanan | SnapPath",
  description: "Syarat dan ketentuan penggunaan platform SnapPath untuk institusi kesehatan, tim casemix, dan tenaga medis.",
};

export default function TermsPage() {
  return (
    <div className="flex flex-col min-h-screen bg-surface font-sans text-text">
      <Navbar />
      <main className="flex-1 pt-24">
        {/* Header */}
        <div className="border-b border-border/50 bg-surface-elevated py-12 sm:py-16">
          <div className="mx-auto max-w-3xl px-6 lg:px-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-faint mb-3">Dokumen Resmi</p>
            <h1 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
              Ketentuan Layanan
            </h1>
            <p className="mt-4 text-lg text-text-subtle leading-relaxed">
              Dengan menggunakan platform SnapPath, Anda menyetujui ketentuan-ketentuan berikut yang mengatur hubungan antara institusi Anda dan SnapPath.
            </p>
            <p className="mt-3 text-sm text-text-faint">Terakhir diperbarui: 26 Mei 2026</p>
          </div>
        </div>

        {/* Content */}
        <div className="mx-auto max-w-3xl px-6 lg:px-8 py-12 sm:py-16">
          <div className="space-y-10">

            <section>
              <h2 className="text-xl font-bold text-text mb-4 pb-2 border-b border-border/50">
                1. Penerimaan Ketentuan
              </h2>
              <p className="text-sm text-text-subtle leading-relaxed">
                Dengan mendaftar, mengakses, atau menggunakan platform SnapPath, Anda mewakili institusi Anda dan menyatakan bahwa Anda memiliki wewenang untuk mengikat institusi pada ketentuan ini. Jika Anda tidak menyetujui ketentuan ini, jangan gunakan layanan SnapPath.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-text mb-4 pb-2 border-b border-border/50">
                2. Deskripsi Layanan
              </h2>
              <div className="space-y-4 text-sm text-text-subtle leading-relaxed">
                <p>SnapPath menyediakan:</p>
                <ul className="space-y-2 pl-4">
                  <li className="flex gap-x-3"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary"></span><span>Platform berbasis AI untuk pembuatan dan visualisasi clinical pathway klinis</span></li>
                  <li className="flex gap-x-3"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary"></span><span>Engine validasi klaim terhadap standar tarif, obat, diagnosis, dan dokumen</span></li>
                  <li className="flex gap-x-3"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary"></span><span>API terprogram untuk integrasi sistem informasi rumah sakit (SIMRS) atau aplikasi internal</span></li>
                  <li className="flex gap-x-3"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary"></span><span>Dashboard pengelolaan klien, usage log, dan konfigurasi tenant</span></li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-text mb-4 pb-2 border-b border-border/50">
                3. Akun & Keamanan
              </h2>
              <div className="space-y-4 text-sm text-text-subtle leading-relaxed">
                <p>Pengguna bertanggung jawab untuk:</p>
                <ul className="space-y-2 pl-4">
                  <li className="flex gap-x-3"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-secondary"></span><span>Menjaga kerahasiaan kredensial login dan API key yang diterbitkan oleh SnapPath</span></li>
                  <li className="flex gap-x-3"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-secondary"></span><span>Segera melaporkan kepada SnapPath jika terdapat indikasi kebocoran atau penyalahgunaan akun</span></li>
                  <li className="flex gap-x-3"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-secondary"></span><span>Tidak berbagi akun atau API key kepada pihak yang tidak berwenang</span></li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-text mb-4 pb-2 border-b border-border/50">
                4. Penggunaan yang Diperbolehkan
              </h2>
              <div className="space-y-4 text-sm text-text-subtle leading-relaxed">
                <p>Platform SnapPath hanya boleh digunakan untuk:</p>
                <ul className="space-y-2 pl-4">
                  <li className="flex gap-x-3"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent"></span><span>Keperluan operasional institusi kesehatan yang sah dan terdaftar</span></li>
                  <li className="flex gap-x-3"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent"></span><span>Integrasi dengan sistem internal institusi yang memiliki izin operasional</span></li>
                  <li className="flex gap-x-3"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent"></span><span>Pengujian dan pengembangan (menggunakan environment yang telah disepakati)</span></li>
                </ul>
                <p className="mt-4 font-medium text-text">Dilarang keras:</p>
                <ul className="space-y-2 pl-4">
                  <li className="flex gap-x-3"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500/60"></span><span>Melakukan reverse engineering, scraping, atau peniruan layanan SnapPath</span></li>
                  <li className="flex gap-x-3"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500/60"></span><span>Menggunakan platform untuk tujuan yang melanggar hukum atau etika medis</span></li>
                  <li className="flex gap-x-3"><span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500/60"></span><span>Berbagi akses ke pihak di luar institusi yang terdaftar</span></li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-text mb-4 pb-2 border-b border-border/50">
                5. Disclaimer Medis
              </h2>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-text-subtle leading-relaxed">
                <p className="font-semibold text-text mb-2">Penting untuk Dipahami</p>
                <p>
                  Output yang dihasilkan SnapPath — termasuk clinical pathway, skor validasi klaim, dan rekomendasi tarif — adalah alat bantu pengambilan keputusan berbasis data, bukan pengganti penilaian klinis profesional.
                </p>
                <p className="mt-3">
                  Keputusan medis, diagnostik, dan administratif final tetap menjadi tanggung jawab eksklusif tenaga kesehatan dan manajemen institusi yang bersangkutan. SnapPath tidak bertanggung jawab atas kerugian yang timbul akibat penggunaan output platform tanpa verifikasi oleh pihak yang berwenang.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-text mb-4 pb-2 border-b border-border/50">
                6. Hak Kekayaan Intelektual
              </h2>
              <p className="text-sm text-text-subtle leading-relaxed">
                Seluruh teknologi, algoritma, antarmuka, dan merek dagang SnapPath adalah milik eksklusif tim SnapPath. Institusi pengguna mendapatkan lisensi terbatas, non-eksklusif, dan tidak dapat dipindahtangankan untuk menggunakan platform sesuai ketentuan yang berlaku.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-text mb-4 pb-2 border-b border-border/50">
                7. Perubahan & Penghentian Layanan
              </h2>
              <p className="text-sm text-text-subtle leading-relaxed">
                SnapPath berhak untuk memodifikasi, menangguhkan, atau menghentikan layanan kapan saja dengan pemberitahuan yang wajar kepada pengguna terdaftar. Perubahan material pada ketentuan ini akan dikomunikasikan setidaknya 14 hari sebelum berlaku efektif.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-text mb-4 pb-2 border-b border-border/50">
                8. Hukum yang Berlaku
              </h2>
              <p className="text-sm text-text-subtle leading-relaxed">
                Ketentuan ini diatur oleh dan ditafsirkan sesuai dengan hukum Republik Indonesia. Setiap perselisihan yang timbul akan diselesaikan melalui musyawarah mufakat, dan jika tidak tercapai, melalui pengadilan yang berwenang di Indonesia.
              </p>
            </section>

          </div>

          {/* Navigation */}
          <div className="mt-12 flex flex-wrap gap-4 border-t border-border/50 pt-8">
            <Link href="/compliance" className="text-sm font-medium text-primary hover:underline">
              Kepatuhan & Regulasi
            </Link>
            <Link href="/privacy" className="text-sm font-medium text-primary hover:underline">
              Kebijakan Privasi
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
