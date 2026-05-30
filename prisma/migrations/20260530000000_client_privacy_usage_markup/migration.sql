ALTER TABLE "Client"
  ADD COLUMN "piiRedactPatterns" TEXT[] NOT NULL DEFAULT ARRAY['name', 'nama', 'pasien', 'patient', 'fullname', 'nik', 'id', 'ktp', 'ssn', 'identifier', 'address', 'alamat', 'phone', 'telepon', 'nohp', 'mobile', 'email', 'dob', 'dateofbirth', 'tanggallahir', 'asuransi', 'insurance', 'bpjs']::TEXT[],
  ADD COLUMN "piiSafeContexts" TEXT[] NOT NULL DEFAULT ARRAY['diagnosis', 'procedure', 'medication', 'drug', 'facility', 'hospital', 'clinic', 'encounter', 'class', 'code', 'type']::TEXT[];

ALTER TABLE "SystemConfig"
  ADD COLUMN "aiUsageMarkupPct" DOUBLE PRECISION NOT NULL DEFAULT 100.0;
