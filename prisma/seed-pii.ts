import prisma from '../src/lib/db';

async function main() {
  const piiRedactPatterns = ["name", "nama", "pasien", "patient", "fullname", "nik", "id", "ktp", "ssn", "identifier", "address", "alamat", "phone", "telepon", "nohp", "mobile", "email", "dob", "dateofbirth", "tanggallahir", "asuransi", "insurance", "bpjs"];
  const piiSafeContexts = ["diagnosis", "procedure", "medication", "drug", "facility", "hospital", "clinic", "encounter", "class", "code", "type"];

  console.log("Seeding default PII Privacy Config...");

  await prisma.systemConfig.upsert({
    where: { id: "GLOBAL_CONFIG" },
    update: {
      piiRedactPatterns: piiRedactPatterns,
      piiSafeContexts: piiSafeContexts,
    },
    create: {
      id: "GLOBAL_CONFIG",
      piiRedactPatterns: piiRedactPatterns,
      piiSafeContexts: piiSafeContexts,
    }
  });

  console.log("Seeding complete. Privacy Config has been populated.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
