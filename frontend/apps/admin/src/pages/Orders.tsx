import { useEffect, useState } from 'react'
import { apiGet, apiSend } from '../api'

type Order = {
  id: number
  number: number
  batch_id: number
  status: string
  status_label: string
  full_name: string
  phone: string
  comment: string | null
  total: number
  состав: string
}

const NEXT: Record<string, string[]> = {
  new: ['confirmed', 'cancelled'],
  confirmed: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
}

export function Orders() {
  const [rows, setRows] = useState<Order[]>([])
  const load = () => apiGet<Order[]>('/admin/orders').then(setRows)
  useEffect(() => {
    load().catch(console.error)
  }, [])

  async function setStatus(o: Order, status: string) {
    const cancel_reason = status === 'cancelled' ? prompt('Причина отмены (необязательно)') || null : null
    await apiSend('PATCH', `/admin/orders/${o.id}/status`, { status, cancel_reason })
    await load()
  }

  return (
    <div className="page">
      <h1>Заказы</h1>
      <table>
        <thead>
          <tr>
            <th>№</th>
            <th>Клиент</th>
            <th>Состав</th>
            <th>Сумма</th>
            <th>Статус</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id}>
              <td>{o.number}</td>
              <td>
                {o.full_name}
                <br />
                {o.phone}
              </td>
              <td style={{ whiteSpace: 'pre-wrap' }}>{o.состав}</td>
              <td>{o.total} ₽</td>
              <td>{o.status_label}</td>
              <td>
                {(NEXT[o.status] || []).map((s) => (
                  <button key={s} type="button" onClick={() => setStatus(o, s)}>
                    → {s}
                  </button>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
