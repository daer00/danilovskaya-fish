/** Ввод десятичных чисел без сброса при «0.» или запятой. */
export function sanitizeDecimal(raw: string): string | null {
  const v = raw.replace(',', '.')
  if (v === '' || /^\d*\.?\d*$/.test(v)) return v
  return null
}

export function toNum(s: string): number {
  if (!s.trim()) return 0
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}
