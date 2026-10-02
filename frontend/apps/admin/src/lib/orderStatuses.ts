/** Статусы заказов — как в backend STATUS_LABELS. */
export const ORDER_STATUS_OPTIONS = [
  { value: 'processing', label: 'Оформляется' },
  { value: 'new', label: 'Принят, ждёт подтверждения' },
  { value: 'confirmed', label: 'Подтверждён' },
  { value: 'ready', label: 'Готов к выдаче' },
  { value: 'completed', label: 'Выдан' },
  { value: 'cancelled', label: 'Отменён' },
] as const

export const ORDER_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  ORDER_STATUS_OPTIONS.map((s) => [s.value, s.label]),
)
