/** Меню лёгкой CRM (amoCRM-inspired). */
export const NAV = [
  { path: '/', label: 'Главная', end: true },
  { path: '/orders', label: 'Заказы' },
  { path: '/clients', label: 'Клиенты' },
  { path: '/messages', label: 'Сообщения' },
  { path: '/catalog', label: 'Товары' },
  { path: '/money', label: 'Деньги' },
  { path: '/bot-texts', label: 'Тексты бота' },
] as const
