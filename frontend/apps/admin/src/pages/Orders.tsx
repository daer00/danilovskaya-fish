import { Fragment, useEffect, useState } from 'react'
import { apiGet, apiSend } from '../api'

type Item = {
  id: number
  product_name: string
  quantity: number
  unit_price: number
  line_total: number
  actual_weight_kg: number | null
}

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
  items: Item[]
}

const NEXT: Record<string, string[]> = {
  new: ['confirmed', 'cancelled'],
  confirmed: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
}

export function Orders() {
  const [rows, setRows] = useState<Order[]>([])
  const [openId, setOpenId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Item[]>([])
  const load = () => apiGet<Order[]>('/admin/orders').then(setRows)
  useEffect(() => {
    load().catch(console.error)
  }, [])

  async function setStatus(o: Order, status: string) {
    const cancel_reason = status === 'cancelled' ? prompt('Причина отмены (необязательно)') || null : null
    await apiSend('PATCH', `/admin/orders/${o.id}/status`, { status, cancel_reason })
    await load()
  }

  function openWeigh(o: Order) {
    setOpenId(o.id)
    setDraft(o.items.map((i) => ({ ...i })))
  }

  function patchDraft(id: number, patch: Partial<Item>) {
    setDraft((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }

  async function saveItems(orderId: number) {
    await apiSend('PATCH', `/admin/orders/${orderId}/items`, {
      items: draft.map((i) => ({
        id: i.id,
        actual_weight_kg: i.actual_weight_kg == null ? null : Number(i.actual_weight_kg),
        unit_price: Number(i.unit_price),
        line_total: Number(i.line_total),
      })),
    })
    setOpenId(null)
    await load()
  }

  function Actions({ o }: { o: Order }) {
    return (
      <div className="actions">
        <button type="button" onClick={() => openWeigh(o)}>
          Вес / сумма
        </button>
        {(NEXT[o.status] || []).map((s) => (
          <button key={s} type="button" onClick={() => void setStatus(o, s)}>
            → {s}
          </button>
        ))}
      </div>
    )
  }

  function WeighPanel({ orderId }: { orderId: number }) {
    return (
      <div className="card weigh">
        {draft.map((i) => (
          <div key={i.id} className="weigh-row">
            <b>{i.product_name}</b>
            <span className="muted">× {i.quantity}</span>
            <label>
              Вес, кг
              <input
                type="number"
                step="0.001"
                value={i.actual_weight_kg ?? ''}
                onChange={(e) =>
                  patchDraft(i.id, { actual_weight_kg: e.target.value === '' ? null : Number(e.target.value) })
                }
              />
            </label>
            <label>
              Цена/шт
              <input
                type="number"
                value={i.unit_price}
                onChange={(e) => {
                  const unit_price = Number(e.target.value)
                  patchDraft(i.id, {
                    unit_price,
                    line_total: Math.round(unit_price * Number(i.quantity) * 100) / 100,
                  })
                }}
              />
            </label>
            <label>
              Итого позиции
              <input
                type="number"
                value={i.line_total}
                onChange={(e) => patchDraft(i.id, { line_total: Number(e.target.value) })}
              />
            </label>
          </div>
        ))}
        <p>
          Итого клиенту: <b>{draft.reduce((s, i) => s + Number(i.line_total), 0).toFixed(0)} ₽</b>
        </p>
        <div className="actions">
          <button type="button" onClick={() => void saveItems(orderId)}>
            Сохранить
          </button>
          <button type="button" onClick={() => setOpenId(null)}>
            Закрыть
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <h1>Заказы</h1>
      <div className="table-wrap desktop-only">
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
              <Fragment key={o.id}>
                <tr>
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
                    <Actions o={o} />
                  </td>
                </tr>
                {openId === o.id && (
                  <tr>
                    <td colSpan={6}>
                      <WeighPanel orderId={o.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-cards">
        {rows.map((o) => (
          <article key={o.id} className="m-card">
            <div className="m-card__row">
              <span className="m-card__title">№ {o.number}</span>
              <span>{o.total} ₽</span>
            </div>
            <div>
              {o.full_name}
              <div className="muted">{o.phone}</div>
            </div>
            <div className="m-card__row">
              <span className="m-card__label">Статус</span>
              <span>{o.status_label}</span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{o.состав}</div>
            <Actions o={o} />
            {openId === o.id && <WeighPanel orderId={o.id} />}
          </article>
        ))}
      </div>
    </div>
  )
}
