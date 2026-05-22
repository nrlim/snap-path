"use client";

import React from "react";

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
          const hasDayStr = phase.phaseName?.toLowerCase().includes('day') || phase.phaseName?.toLowerCase().includes('hari');
          const displayName = hasDayStr ? phase.phaseName : `Day ${idx + 1} — ${phase.phaseName}`;
          return (
          <div key={idx} className="relative">
            {/* Timeline Dot */}
            <div className="absolute -left-5 sm:-left-6 top-1.5 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-surface border-[3px] border-primary shadow-sm z-10">
              <div className="h-2 w-2 rounded-full bg-primary"></div>
            </div>
            
            <div className="pl-1 sm:pl-2">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-text">{displayName}</h3>
                <p className="text-sm font-medium text-text-subtle mt-1">{phase.objectives}</p>
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
                          {typeof item === 'string' ? item : `${item.name}${item.frequency ? ` (${item.frequency})` : ''}`}
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
                          {typeof item === 'string' ? item : `${item.name}${item.route ? ` (${item.route})` : ''}`}
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
                          {typeof item === 'string' ? item : `${item.name} - ${item.dosage || ''} ${item.frequency || ''} ${item.duration ? `(${item.duration})` : ''}`}
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
                          {typeof item === 'string' ? item : `${item.activity}${item.frequency ? ` (${item.frequency})` : ''}`}
                        </li>
                      ))}
                      
                      {/* Nutrition can be an array of strings (legacy) or an object (new schema) */}
                      {Array.isArray(phase.nutrition) ? (
                        phase.nutrition.map((item: string, i: number) => (
                          <li key={`nutri-${i}`} className="text-sm text-text-subtle flex items-start">
                            <span className="text-border mr-2 mt-0.5">•</span>
                            [Nutrisi] {item}
                          </li>
                        ))
                      ) : phase.nutrition ? (
                        <>
                          <li className="text-sm text-text-subtle flex items-start">
                            <span className="text-border mr-2 mt-0.5">•</span>
                            [Nutrisi] Diet: {phase.nutrition.diet || phase.nutrition.dietType}
                          </li>
                          {phase.nutrition.restrictions && Array.isArray(phase.nutrition.restrictions) && phase.nutrition.restrictions.length > 0 && (
                            <li className="text-sm text-text-subtle flex items-start">
                              <span className="text-border mr-2 mt-0.5">•</span>
                              [Nutrisi] Pantangan: {phase.nutrition.restrictions.join(', ')}
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
