export const PIPELINE = [
  { id: 'new', label: 'Новые', match: ['processing', 'new'] },
  { id: 'confirmed', label: 'Подтверждённые', match: ['confirmed'] },
  { id: 'ready', label: 'К выдаче', match: ['ready'] },
  { id: 'completed', label: 'Выдан', match: ['completed'] },
] as const

export const NEXT: Record<string, string[]> = {
  processing: ['confirmed', 'cancelled'],
  new: ['confirmed', 'cancelled'],
  confirmed: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
}

export const ACTION_LABELS: Record<string, string> = {
  confirmed: '→ Подтвердить',
  ready: '→ К выдаче',
  completed: '→ Выдан',
  cancelled: 'Отмена',
}

export function statusClass(status: string) {
  const s = status === 'processing' ? 'new' : status
  return `badge badge--${s}`
}

export const STATUS_TABS = [
  { id: 'all', label: 'Все' },
  ...PIPELINE.map((c) => ({ id: c.id, label: c.label })),
  { id: 'cancelled', label: 'Отменены' },
] as const
