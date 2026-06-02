-- Add SnapPath-owned table namespace prefix.
-- Prisma model names stay stable in application code; physical PostgreSQL tables use snp_*.

DO $$
DECLARE
  rename_pairs text[][] := ARRAY[
    ARRAY['User', 'snp_user'],
    ARRAY['ApiKey', 'snp_api_key'],
    ARRAY['ApiUsageLog', 'snp_api_usage_log'],
    ARRAY['Client', 'snp_client'],
    ARRAY['CreditLedger', 'snp_credit_ledger'],
    ARRAY['RequestLedger', 'snp_request_ledger'],
    ARRAY['Provider', 'snp_provider'],
    ARRAY['ThresholdConfig', 'snp_threshold_config'],
    ARRAY['TariffEntry', 'snp_tariff_entry'],
    ARRAY['DiagnosisCode', 'snp_diagnosis_code'],
    ARRAY['DiagnosisProcedureMap', 'snp_diagnosis_procedure_map'],
    ARRAY['ClaimJob', 'snp_claim_job'],
    ARRAY['MedicalItemPriceMaster', 'snp_medical_item_price_master'],
    ARRAY['ClinicalPathway', 'snp_clinical_pathway'],
    ARRAY['SystemConfig', 'snp_system_config']
  ];
  pair text[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY rename_pairs LOOP
    IF to_regclass(format('public.%I', pair[1])) IS NOT NULL
       AND to_regclass(format('public.%I', pair[2])) IS NULL THEN
      EXECUTE format('ALTER TABLE public.%I RENAME TO %I', pair[1], pair[2]);
    END IF;
  END LOOP;
END $$;
