"use client";

import React from "react";

function translateCommonClinicalText(value: unknown): string {
  if (Array.isArray(value)) return value.map(translateCommonClinicalText).join(', ');
  const text = String(value || '').trim();
  if (!text) return '';

  return text
    .replace(/\bDay\b/gi, 'Hari')
    .replace(/\bAdmission\b/gi, 'Admisi')
    .replace(/\bInitial Assessment\b/gi, 'Asesmen Awal')
    .replace(/\bAssessment\b/gi, 'Asesmen')
    .replace(/\bTreatment Plan\b/gi, 'Rencana Terapi')
    .replace(/\bTreatment\b/gi, 'Terapi')
    .replace(/\bMonitoring\b/gi, 'Pemantauan')
    .replace(/\bDischarge\b/gi, 'Pulang')
    .replace(/\bEducation\b/gi, 'Edukasi')
    .replace(/\bNursing\b/gi, 'Keperawatan')
    .replace(/\bNutrition\b/gi, 'Nutrisi')
    .replace(/\bDaily\b/gi, 'Harian')
    .replace(/\bEvery day\b/gi, 'Setiap hari')
    .replace(/\bAs needed\b/gi, 'Sesuai kebutuhan')
    .replace(/\bBefore discharge\b/gi, 'Sebelum pulang')
    .replace(/\bper day\b/gi, 'per hari')
    .replace(/\bday\(s\)\b/gi, 'hari')
    .replace(/\bdays\b/gi, 'hari');
}

function normalizePhaseTitle(phase: any, idx: number, totalPhases: number) {
  const rawDayRange = String(phase.dayRange || "").trim();
  const rawPhaseName = String(phase.phaseName || "").trim();
  const fallbackName = rawPhaseName || `Fase ${idx + 1}`;
  const lowerName = fallbackName.toLowerCase();
  const lowerRange = rawDayRange.toLowerCase();

  const phaseNameWithoutDay = fallbackName
    .replace(/^day\s*\d+(?:\s*[-–—]\s*\d+)?\s*[-–—:]?\s*/i, "")
    .replace(/^hari\s*\d+(?:\s*[-–—]\s*\d+)?\s*[-–—:]?\s*/i, "")
    .trim();

  const titleFromName = phaseNameWithoutDay || fallbackName;
  const isAdmission = /admission|admisi|igd|initial|assessment/.test(lowerName) || /admission|admisi|igd/.test(lowerRange);
  const isDischarge = /discharge|pulang/.test(lowerName) || /discharge|pulang/.test(lowerRange) || idx === totalPhases - 1;
  const isGenericDayTitle = /^day\s*\d+(?:\s*[-–—]\s*\d+)?$/i.test(fallbackName) || /^hari\s*\d+(?:\s*[-–—]\s*\d+)?$/i.test(fallbackName);

  let readableName = isGenericDayTitle ? "Rencana Terapi" : titleFromName;
  if (isAdmission) readableName = "Admisi";
  if (isDischarge) readableName = "Pulang";

  const normalizedRange = rawDayRange
    ? rawDayRange.replace(/^Day\s*0\b/i, "Hari 1").replace(/\bDay\b/gi, "Hari")
    : `Hari ${idx + 1}`;

  return `${normalizedRange} - ${translateCommonClinicalText(readableName)}`;
}

export default function PathwayTimeline({ phases }: { phases: any[] }) {
  if (!phases || phases.length === 0) {
    return (
      <div className="text-center p-8 border border-border/50 rounded-xl bg-surface-elevated/30">
        <p className="text-text-subtle">Data pathway klinis belum tersedia.</p>
      </div>
    );
  }

  return (
    <div className="relative pl-10 sm:pl-12 py-6">
      {/* Vertical line centered perfectly */}
      <div className="absolute left-5 sm:left-6 top-8 bottom-8 w-0.5 bg-border/80 -translate-x-1/2"></div>
      
      <div className="space-y-12">
        {phases.map((phase: any, idx: number) => {
          const displayName = normalizePhaseTitle(phase, idx, phases.length);
          return (
          <div key={idx} className="relative">
            {/* Timeline Dot */}
            <div className="absolute -left-5 sm:-left-6 top-1.5 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-surface border-[3px] border-primary shadow-sm z-10">
              <div className="h-2 w-2 rounded-full bg-primary"></div>
            </div>
            
            <div className="pl-1 sm:pl-2">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-text">{displayName}</h3>
                <p className="text-sm font-medium text-text-subtle mt-1">{translateCommonClinicalText(phase.objectives)}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Assessments */}
                {phase.assessments && phase.assessments.length > 0 && (
                  <div className="rounded-xl bg-surface-elevated/40 border border-border/50 p-4">
                    <h4 className="text-sm font-semibold text-text mb-3 flex items-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-2"></span>
                      Asesmen Klinis
                    </h4>
                    <ul className="space-y-2">
                      {phase.assessments.map((item: any, i: number) => (
                        <li key={i} className="text-sm text-text-subtle flex items-start">
                          <span className="text-border mr-2 mt-0.5">•</span>
                          {translateCommonClinicalText(typeof item === 'string' ? item : `${item.name}${item.frequency ? ` (${item.frequency})` : ''}`)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Treatments & Procedures */}
                {phase.treatments && phase.treatments.length > 0 && (
                  <div className="rounded-xl bg-surface-elevated/40 border border-border/50 p-4">
                    <h4 className="text-sm font-semibold text-text mb-3 flex items-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-2"></span>
                      Tindakan Medis
                    </h4>
                    <ul className="space-y-2">
                      {phase.treatments.map((item: any, i: number) => (
                        <li key={i} className="text-sm text-text-subtle flex items-start">
                          <span className="text-border mr-2 mt-0.5">•</span>
                          {translateCommonClinicalText(typeof item === 'string' ? item : `${item.name}${item.route ? ` (${item.route})` : ''}`)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Medications */}
                {phase.medications && phase.medications.length > 0 && (
                  <div className="rounded-xl bg-surface-elevated/40 border border-border/50 p-4">
                    <h4 className="text-sm font-semibold text-text mb-3 flex items-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2"></span>
                      Medikamentosa (Obat)
                    </h4>
                    <ul className="space-y-2">
                      {phase.medications.map((item: any, i: number) => (
                        <li key={i} className="text-sm text-text-subtle flex items-start">
                          <span className="text-border mr-2 mt-0.5">•</span>
                          {translateCommonClinicalText(typeof item === 'string' ? item : `${item.name} - ${item.dosage || ''} ${item.frequency || ''} ${item.duration ? `(${item.duration})` : ''}`)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Nursing & Nutrition */}
                {(phase.nursing?.length > 0 || phase.nutrition) && (
                  <div className="rounded-xl bg-surface-elevated/40 border border-border/50 p-4">
                    <h4 className="text-sm font-semibold text-text mb-3 flex items-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mr-2"></span>
                      Keperawatan & Nutrisi
                    </h4>
                    <ul className="space-y-2">
                      {Array.isArray(phase.nursing) && phase.nursing.map((item: any, i: number) => (
                        <li key={`nurse-${i}`} className="text-sm text-text-subtle flex items-start">
                          <span className="text-border mr-2 mt-0.5">•</span>
                          {translateCommonClinicalText(typeof item === 'string' ? item : `${item.activity}${item.frequency ? ` (${item.frequency})` : ''}`)}
                        </li>
                      ))}
                      
                      {/* Nutrition can be an array of strings (legacy) or an object (new schema) */}
                      {Array.isArray(phase.nutrition) ? (
                        phase.nutrition.map((item: string, i: number) => (
                          <li key={`nutri-${i}`} className="text-sm text-text-subtle flex items-start">
                            <span className="text-border mr-2 mt-0.5">•</span>
                            [Nutrisi] {translateCommonClinicalText(item)}
                          </li>
                        ))
                      ) : phase.nutrition ? (
                        <>
                          <li className="text-sm text-text-subtle flex items-start">
                            <span className="text-border mr-2 mt-0.5">•</span>
                            [Nutrisi] Diet: {translateCommonClinicalText(phase.nutrition.diet || phase.nutrition.dietType)}
                          </li>
                          {phase.nutrition.restrictions && Array.isArray(phase.nutrition.restrictions) && phase.nutrition.restrictions.length > 0 && (
                            <li className="text-sm text-text-subtle flex items-start">
                              <span className="text-border mr-2 mt-0.5">•</span>
                              [Nutrisi] Pantangan: {translateCommonClinicalText(phase.nutrition.restrictions.join(', '))}
                            </li>
                          )}
                        </>
                      ) : null}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
