export function pricePerKg(price: number, weightKg: number | null | undefined): number | null {
  if (!weightKg || weightKg <= 0) return null
  return Math.round((price / weightKg) * 100) / 100
}

export function fmtRub(n: number) {
  return `${n.toLocaleString('ru-RU')} ₽`
}

export function fmtPct(n: number | null | undefined) {
  if (n == null) return '—'
  return `${n}%`
}
