import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export default function PrivacyPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background font-sans text-foreground">
      <Navbar />
      <main className="flex-1 pt-32 pb-20">
        <div className="mx-auto max-w-screen-2xl px-6 lg:px-12 w-full">
          <p className="text-sm font-mono text-primary/60 tracking-[0.2em] uppercase mb-4">Kebijakan Publik</p>
          <h1 className="text-4xl font-light tracking-tight text-foreground sm:text-5xl mb-8">
            Kebijakan Privasi
          </h1>
          
          <div className="space-y-8 text-base text-muted-foreground leading-relaxed font-light">
            <p>
              Terakhir diperbarui: Juni 2026
            </p>
            <p>
              Kebijakan Privasi ini menjelaskan bagaimana CONSUL mengumpulkan, menggunakan, memproses, dan melindungi informasi Anda saat menggunakan platform validasi klaim klinis kami.
            </p>
            
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">1. Pengumpulan Informasi</h2>
              <p>
                Kami hanya mengumpulkan informasi yang diperlukan untuk operasional platform, yang terbagi menjadi dua kategori:
                <br /><br />
                <strong>Informasi Akun:</strong> Nama institusi, alamat email pengguna yang sah, dan informasi kontak operasional.
                <br />
                <strong>Data Telemetri:</strong> Log akses sistem, penggunaan token, dan performa aplikasi untuk keperluan pemeliharaan.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">2. Status Data Klinis Pasien</h2>
              <p>
                <strong>CONSUL bukan pengontrol data (Data Controller) pasien.</strong> Platform kami bertindak secara eksklusif sebagai Pemroses Data (Data Processor). Data rekam medis dan klinis yang dikirim ke API kami <strong>tidak pernah disimpan secara permanen</strong> di server eksternal kami. Pemrosesan dilakukan <em>in-memory</em> atau di dalam perimeter cloud lokal yang terisolasi untuk masing-masing institusi klien.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">3. Penggunaan Informasi</h2>
              <p>
                Kami menggunakan informasi analitik murni untuk:
                <br />- Memastikan ketersediaan dan keandalan sistem validasi klaim.
                <br />- Melakukan tagihan operasional berdasarkan volume klaim yang diverifikasi.
                <br />- Menghasilkan laporan analitik tingkat institusi yang hanya dapat diakses oleh administrator institusi tersebut.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">4. Pembagian Informasi</h2>
              <p>
                Kami tidak akan pernah menjual, menyewakan, atau memperdagangkan data apapun (baik data institusi maupun agregat medis) kepada pihak ketiga. Informasi hanya dapat dibuka kepada otoritas hukum jika diwajibkan oleh Undang-Undang Republik Indonesia.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
