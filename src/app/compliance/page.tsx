import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export default function CompliancePage() {
  return (
    <div className="flex flex-col min-h-screen bg-background font-sans text-foreground">
      <Navbar />
      <main className="flex-1 pt-32 pb-20">
        <div className="mx-auto max-w-screen-2xl px-6 lg:px-12 w-full">
          <p className="text-sm font-mono text-primary/60 tracking-[0.2em] uppercase mb-4">Pusat Keamanan</p>
          <h1 className="text-4xl font-light tracking-tight text-foreground sm:text-5xl mb-8">
            Kepatuhan & Keamanan Data
          </h1>
          
          <div className="space-y-8 text-base text-muted-foreground leading-relaxed font-light">
            <p>
              Di CONSUL, keamanan data medis pasien adalah prioritas mutlak kami. Sistem kami dirancang secara spesifik untuk mematuhi standar privasi data kesehatan nasional dan internasional tertinggi.
            </p>
            
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">1. Kepatuhan Regulasi Nasional</h2>
              <p>
                Infrastruktur kami sepenuhnya mematuhi Peraturan Menteri Kesehatan Republik Indonesia tentang Rekam Medis Elektronik. Seluruh data diproses secara lokal (Data Residency) dan siap untuk integrasi dengan standar interoperabilitas SATUSEHAT Kementerian Kesehatan RI.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">2. Standar HIPAA & Enkripsi</h2>
              <p>
                Walaupun berbasis di Indonesia, arsitektur keamanan kami mengadopsi standar HIPAA (Health Insurance Portability and Accountability Act). Semua data <em>in-transit</em> dienkripsi menggunakan TLS 1.3, dan data <em>at-rest</em> dienkripsi dengan standar AES-256.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">3. Sanitasi PII (Personally Identifiable Information)</h2>
              <p>
                Sebelum data klinis diproses oleh <em>rule-engine</em> kami, lapisan <strong>PII Sanitization</strong> secara otomatis akan mendeteksi dan menghapus/menyamarkan identitas pasien (Nama, NIK, No. RM). Komputasi hanya dilakukan pada metadata medis (Diagnosis, Tindakan, Tarif) tanpa pernah mengekspos identitas pasien ke luar sistem rumah sakit Anda.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">4. Audit Trail Sepenuhnya</h2>
              <p>
                Sistem validasi kami bersifat deterministik. Artinya, tidak ada keputusan &quot;black-box&quot; dari AI generatif. Setiap validasi klaim yang dieksekusi memiliki <em>audit log</em> yang transparan—memungkinkan tim auditor internal Anda untuk melacak aturan mana yang memicu perubahan status pada sebuah klaim.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
