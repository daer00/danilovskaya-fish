import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiGet, apiSend } from '../api'
import { NewOrderForm } from '../components/NewOrderForm'
import { PageHeader } from '../components/PageHeader'
import { statusClass } from '../lib/orderStatus'

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
  total: number
  состав: string
  pickup_slot: string | null
  pickup_label: string | null
  items: Item[]
}
type Batch = { id: number; title: string; is_open: boolean }

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'processing', label: 'Оформляется' },
  { value: 'new', label: 'Новый' },
  { value: 'confirmed', label: 'Подтверждён' },
  { value: 'ready', label: 'К выдаче' },
  { value: 'completed', label: 'Выдан' },
  { value: 'cancelled', label: 'Отменён' },
]

const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s.label]))

export function Orders() {
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState<Order[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const batchFromUrl = params.get('batch_id')
  const fromClients = params.get('from') === 'clients'
  const [batchId, setBatchId] = useState<number | 'all'>(() => {
    const n = Number(batchFromUrl)
    return batchFromUrl && Number.isFinite(n) && n > 0 ? n : 'all'
  })
  const [q, setQ] = useState(params.get('q') || '')
  const [openId, setOpenId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  async function load(bid: number | 'all' = batchId, query = q) {
    setErr('')
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (bid !== 'all') p.set('batch_id', String(bid))
      if (query.trim()) p.set('q', query.trim())
      const qs = p.toString()
      const [orders, b] = await Promise.all([
        apiGet<Order[]>(`/admin/orders${qs ? `?${qs}` : ''}`),
        batches.length ? Promise.resolve(batches) : apiGet<Batch[]>('/admin/batches'),
      ])
      if (!batches.length) setBatches(b)
      setRows(orders)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось загрузить заказы')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setQ(params.get('q') || '')
    const raw = params.get('batch_id')
    const n = Number(raw)
    setBatchId(raw && Number.isFinite(n) && n > 0 ? n : 'all')
  }, [params])

  useEffect(() => {
    void load(batchId, q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, q])

  function changeBatch(next: number | 'all') {
    setBatchId(next)
    const nextParams = new URLSearchParams(params)
    if (next === 'all') nextParams.delete('batch_id')
    else nextParams.set('batch_id', String(next))
    setParams(nextParams, { replace: true })
  }

  const filtered = rows.filter((o) => {
    if (!q.trim()) return true
    const n = q.toLowerCase()
    return (
      (o.full_name || '').toLowerCase().includes(n) ||
      (o.phone || '').includes(n) ||
      String(o.number).includes(n) ||
      (o.состав || '').toLowerCase().includes(n) ||
      (o.pickup_label || '').toLowerCase().includes(n)
    )
  })

  async function changeStatus(o: Order, status: string) {
    if (status === o.status) return
    const cancel_reason = status === 'cancelled' ? prompt('Причина отмены (необязательно)') || null : null
    const prev = o.status
    const prevLabel = o.status_label
    setRows((list) =>
      list.map((x) => (x.id === o.id ? { ...x, status, status_label: STATUS_LABEL[status] || status } : x)),
    )
    try {
      const updated = await apiSend<Order>('PATCH', `/admin/orders/${o.id}/status`, { status, cancel_reason })
      setRows((list) => list.map((x) => (x.id === o.id ? { ...x, ...updated } : x)))
    } catch (e) {
      setRows((list) => list.map((x) => (x.id === o.id ? { ...x, status: prev, status_label: prevLabel } : x)))
      alert(e instanceof Error ? e.message : 'Нельзя сменить статус')
    }
  }

  async function notifyTg(o: Order) {
    try {
      await apiSend('POST', `/admin/orders/${o.id}/notify`)
      alert('Отправлено в Telegram')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  const batchTitle = (id: number) => batches.find((b) => b.id === id)?.title ?? `партия ${id}`
  const selectedBatch = batchId === 'all' ? null : batches.find((b) => b.id === batchId)

  function fmtQty(n: number) {
    return Number(n) === Math.round(Number(n)) ? String(Math.round(Number(n))) : String(n)
  }

  function fmtMoney(n: number) {
    return Number(n).toLocaleString('ru-RU')
  }

  return (
    <div className="page">
      <PageHeader
        title="Заказы"
        description={`Из Telegram и вручную · ${filtered.length} шт.`}
        actions={
          <>
            {fromClients && (
              <Link to="/clients" className="btn--ghost page-back">
                ← Назад
              </Link>
            )}
            <select
              className="select-inline"
              value={batchId === 'all' ? 'all' : String(batchId)}
              onChange={(e) => changeBatch(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            >
              <option value="all">Все партии</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                  {b.is_open ? ' · открыта' : ''}
                </option>
              ))}
            </select>
            <button type="button" className="btn--ghost" onClick={() => void load()}>
              Обновить
            </button>
            <button type="button" onClick={() => setCreating(true)}>
              + Заказ
            </button>
          </>
        }
      />

      {creating && (
        <NewOrderForm
          prefill={q.trim() || undefined}
          onCancel={() => setCreating(false)}
          onDone={() => {
            setCreating(false)
            changeBatch('all')
            void load('all', q)
          }}
        />
      )}

      <input
        className="search-wide"
        type="search"
        placeholder="Найти клиента или заказ…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {err && <p className="form-error">{err}</p>}
      {loading && !rows.length && <p className="muted">Загрузка…</p>}

      {!loading && !filtered.length && (
        <div className="empty">
          {selectedBatch ? (
            <>
              В партии «{selectedBatch.title}» заказов нет.
              <div style={{ marginTop: '0.75rem' }}>
                <button type="button" className="btn--ghost" onClick={() => changeBatch('all')}>
                  Показать все партии
                </button>
              </div>
            </>
          ) : q.trim() ? (
            <>
              По запросу «{q}» ничего не найдено.
              <div style={{ marginTop: '0.75rem' }}>
                <button type="button" className="btn--ghost" onClick={() => setQ('')}>
                  Сбросить поиск
                </button>
              </div>
            </>
          ) : (
            'Заказов пока нет'
          )}
        </div>
      )}

      <div className="client-list">
        {filtered.map((o) => {
          const open = openId === o.id
          return (
            <article key={o.id} className="client-card">
              <div className="client-card__head order-card__head">
                <button type="button" className="order-card__main" onClick={() => setOpenId(open ? null : o.id)}>
                  <div>
                    <b>
                      №{o.number} · {o.full_name}
                    </b>
                    <span className="muted">
                      {o.phone}
                      {o.pickup_label ? ` · ${o.pickup_label}` : ''}
                    </span>
                  </div>
                </button>
                <div className="client-card__meta order-card__meta">
                  <select
                    className={`order-status ${statusClass(o.status)}`}
                    value={STATUS_OPTIONS.some((s) => s.value === o.status) ? o.status : 'new'}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => void changeStatus(o, e.target.value)}
                    aria-label="Статус заказа"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <em className="order-total">{fmtMoney(Number(o.total))} ₽</em>
                </div>
              </div>

              {open && (
                <div className="client-card__body order-detail">
                  <p className="muted order-detail__batch">
                    {batchTitle(o.batch_id)}
                    {o.pickup_label ? ` · ${o.pickup_label}` : ''}
                  </p>
                  <ul className="order-lines">
                    {(o.items || []).map((i) => (
                      <li key={i.id}>
                        <div className="order-lines__name">{i.product_name}</div>
                        <div className="order-lines__row">
                          <span>
                            {fmtQty(Number(i.quantity))} шт. × {fmtMoney(Number(i.unit_price))} ₽
                          </span>
                          <b>{fmtMoney(Number(i.line_total))} ₽</b>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="order-detail__sum">
                    <span>Итого</span>
                    <strong>{fmtMoney(Number(o.total))} ₽</strong>
                  </div>
                  <div className="actions">
                    <button type="button" className="btn--ghost" onClick={() => void notifyTg(o)}>
                      В Telegram
                    </button>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}
