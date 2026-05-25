const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function calculateLosDays(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;

  const startDate = new Date(start);
  const endDate = new Date(end);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  if (endDate.getTime() < startDate.getTime()) return 0;

  const elapsedDays = Math.ceil((endDate.getTime() - startDate.getTime()) / MS_PER_DAY);
  return Math.max(1, elapsedDays);
}

export function resolveActualLosDays(payload: any): number {
  const periodLos = calculateLosDays(
    payload?.encounter?.period?.start ?? payload?.encounter?.admissionDate,
    payload?.encounter?.period?.end ?? payload?.encounter?.dischargeDate,
  );

  if (periodLos > 0) return periodLos;

  const extraLos = Number.parseInt(String(payload?.extra?.los ?? ''), 10);
  return Number.isFinite(extraLos) && extraLos > 0 ? extraLos : 0;
}
