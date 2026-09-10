export function toDateTimeLocal(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

export function fromDateTimeLocal(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString()
}

export function isValidDateParts(date: string, time: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const y = Number(date.slice(0, 4))
  if (y < 2000 || y > 2100) return false
  const d = new Date(`${date}T${time}`)
  return !Number.isNaN(d.getTime())
}
