import prisma from '../src/lib/db';

async function main() {
  console.log("Seeding General Policy Rules...");

  // 1. Ensure a default client exists
  const clientCode = "CLIENT_DEMO";
  
  const client = await prisma.client.upsert({
    where: { code: clientCode },
    update: {},
    create: {
      code: clientCode,
      name: "Demo Client",
      isActive: true,
    }
  });

  console.log(`Using Client ID: ${client.id} (${client.code})`);

  // 2. Define the general policy rules
  const policyRules: any[] = [
    {
      ruleCode: "EXCL_DIAG_A09",
      ruleName: "Pengecualian Diagnosis Diare",
      ruleType: "EXCLUSION",
      targetType: "DIAGNOSIS",
      targetCode: "A09",
      severity: "REJECT_RECOMMENDED",
      status: "ACTIVE"
    },
    {
      ruleCode: "EXCL_VITAMIN",
      ruleName: "Pengecualian Vitamin",
      ruleType: "EXCLUSION",
      targetType: "MEDICATION_TYPE",
      targetPattern: "vitamin",
      severity: "REVIEW_NEEDED",
      status: "ACTIVE"
    },
    {
      ruleCode: "LIMIT_MAX",
      ruleName: "Limit Maksimal Klaim per Kunjungan",
      ruleType: "LIMIT",
      actionJson: {
        limitAmount: 4000000
      },
      severity: "WARNING",
      status: "ACTIVE"
    },
    {
      ruleCode: "ROOM_VIP_ONLY",
      ruleName: "Hak Kamar VIP",
      ruleType: "ROOM_ENTITLEMENT",
      conditionJson: {
        entitledClass: "vip"
      },
      severity: "REVIEW_NEEDED",
      status: "ACTIVE"
    },
    {
      ruleCode: "COPAY_10",
      ruleName: "Co-Pay Mandiri 10%",
      ruleType: "COPAY",
      actionJson: {
        copayPercent: 10
      },
      severity: "INFO",
      status: "ACTIVE"
    }
  ];

  for (const rule of policyRules) {
    await prisma.policyRule.upsert({
      where: {
        clientId_ruleCode: {
          clientId: client.id,
          ruleCode: rule.ruleCode,
        }
      },
      update: {
        ruleName: rule.ruleName,
        ruleType: rule.ruleType,
        targetType: rule.targetType ?? null,
        targetCode: rule.targetCode ?? null,
        targetPattern: rule.targetPattern ?? null,
        severity: rule.severity,
        status: rule.status,
        conditionJson: rule.conditionJson ?? undefined,
        actionJson: rule.actionJson ?? undefined,
      },
      create: {
        clientId: client.id,
        ruleCode: rule.ruleCode,
        ruleName: rule.ruleName,
        ruleType: rule.ruleType,
        targetType: rule.targetType ?? null,
        targetCode: rule.targetCode ?? null,
        targetPattern: rule.targetPattern ?? null,
        severity: rule.severity,
        status: rule.status,
        conditionJson: rule.conditionJson ?? undefined,
        actionJson: rule.actionJson ?? undefined,
      }
    });
  }

  console.log("Seeding complete. General Policy Rules have been populated.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
