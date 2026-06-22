import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export default function TermsPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background font-sans text-foreground">
      <Navbar />
      <main className="flex-1 pt-32 pb-20">
        <div className="mx-auto max-w-screen-2xl px-6 lg:px-12 w-full">
          <p className="text-sm font-mono text-primary/60 tracking-[0.2em] uppercase mb-4">Kebijakan Publik</p>
          <h1 className="text-4xl font-light tracking-tight text-foreground sm:text-5xl mb-8">
            Ketentuan Layanan
          </h1>
          
          <div className="space-y-8 text-base text-muted-foreground leading-relaxed font-light">
            <p>
              Terakhir diperbarui: Juni 2026
            </p>
            <p>
              Dengan mengakses atau menggunakan platform CONSUL (&quot;Layanan&quot;), Anda menyetujui untuk terikat oleh Ketentuan Layanan ini. Jika Anda mewakili sebuah institusi kesehatan, Anda menyatakan bahwa Anda memiliki kewenangan untuk mengikat institusi tersebut pada ketentuan ini.
            </p>
            
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">1. Lisensi Penggunaan</h2>
              <p>
                CONSUL memberikan institusi Anda lisensi non-eksklusif, tidak dapat dialihkan, dan dapat dibatalkan untuk menggunakan sistem validasi klaim klinis kami secara ketat untuk keperluan operasional internal institusi Anda, sesuai dengan kuota dan paket langganan yang aktif.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">2. Kewajiban Institusi Klien</h2>
              <p>
                Anda bertanggung jawab secara eksklusif untuk memastikan bahwa pengunggahan dan pemrosesan data melalui API CONSUL telah memenuhi semua persyaratan <em>informed consent</em> dari pasien jika diwajibkan, dan tidak melanggar aturan internal rumah sakit Anda terkait transmisi data klinis.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">3. Batasan Tanggung Jawab</h2>
              <p>
                CONSUL adalah sistem pendukung keputusan operasional (Operational Decision Support System), <strong>bukan pengganti penilaian medis profesional</strong>. Segala hasil validasi, identifikasi anomali tarif, dan peringatan <em>Length of Stay</em> (LOS) disediakan sebagai referensi audit. Keputusan final mengenai pengajuan klaim tetap berada pada otoritas tim koder dan dokter di institusi Anda.
              </p>
              <p className="mt-4">
                CONSUL tidak bertanggung jawab atas penolakan klaim oleh pihak asuransi atau BPJS yang disebabkan oleh interpretasi regulasi di luar parameter <em>rule-engine</em> kami.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">4. Pemutusan Layanan</h2>
              <p>
                Kami berhak menangguhkan atau menghentikan akses Anda ke Layanan kapan saja, dengan atau tanpa pemberitahuan sebelumnya, jika ditemukan adanya pelanggaran terhadap Ketentuan Layanan ini atau penggunaan API yang mengancam stabilitas infrastruktur CONSUL.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
