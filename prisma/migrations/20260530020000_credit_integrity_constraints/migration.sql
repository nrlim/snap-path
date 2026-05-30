ALTER TABLE "Client"
  ADD CONSTRAINT "Client_creditBalance_nonnegative" CHECK ("creditBalance" >= 0);

ALTER TABLE "CreditLedger"
  ADD CONSTRAINT "CreditLedger_amount_nonzero" CHECK ("amount" <> 0),
  ADD CONSTRAINT "CreditLedger_balanceAfter_nonnegative" CHECK ("balanceAfter" >= 0);
