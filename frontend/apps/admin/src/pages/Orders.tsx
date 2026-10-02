import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiGet, apiSend } from '../api'
import { NewOrderForm } from '../components/NewOrderForm'
import { PageHeader } from '../components/PageHeader'
import { ORDER_STATUS_LABEL, ORDER_STATUS_OPTIONS } from '../lib/orderStatuses'
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
  promo_code?: string | null
  discount?: number
  состав: string
  pickup_slot: string | null
  pickup_label: string | null
  items: Item[]
}
type Batch = { id: number; title: string; is_open: boolean }
type CatalogProduct = { id: number; name: string; is_active: boolean }

export function Orders() {
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState<Order[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const batchFromUrl = params.get('batch_id')
  const fromClients = params.get('from') === 'clients'
  const [batchId, setBatchId] = useState<number | 'all'>(() => {
    const n = Number(batchFromUrl)
    return batchFromUrl && Number.isFinite(n) && n > 0 ? n : 'all'
  })
  const [q, setQ] = useState(params.get('q') || '')
  const [product, setProduct] = useState(params.get('product') || '')
  const [openId, setOpenId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  async function load(bid: number | 'all' = batchId, query = q, fish = product) {
    setErr('')
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (bid !== 'all') p.set('batch_id', String(bid))
      if (query.trim()) p.set('q', query.trim())
      if (fish.trim()) p.set('product', fish.trim())
      const qs = p.toString()
      const [orders, b, catalog] = await Promise.all([
        apiGet<Order[]>(`/admin/orders${qs ? `?${qs}` : ''}`),
        batches.length ? Promise.resolve(batches) : apiGet<Batch[]>('/admin/batches'),
        products.length ? Promise.resolve(products) : apiGet<CatalogProduct[]>('/admin/catalog'),
      ])
      if (!batches.length) setBatches(b)
      if (!products.length) setProducts(catalog)
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
    setProduct(params.get('product') || '')
    const raw = params.get('batch_id')
    const n = Number(raw)
    setBatchId(raw && Number.isFinite(n) && n > 0 ? n : 'all')
  }, [params])

  useEffect(() => {
    void load(batchId, q, product)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, q, product])

  function patchParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k)
      else next.set(k, v)
    }
    setParams(next, { replace: true })
  }

  function changeBatch(next: number | 'all') {
    setBatchId(next)
    patchParams({ batch_id: next === 'all' ? null : String(next) })
  }

  function changeProduct(next: string) {
    setProduct(next)
    patchParams({ product: next || null })
  }

  const fishOptions = useMemo(() => {
    const names = new Set<string>()
    for (const p of products) if (p.is_active !== false) names.add(p.name)
    for (const o of rows) for (const i of o.items || []) names.add(i.product_name)
    return [...names].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [products, rows])

  async function changeStatus(o: Order, status: string) {
    if (status === o.status) return
    const cancel_reason = status === 'cancelled' ? prompt('Причина отмены (необязательно)') || null : null
    const prev = o.status
    const prevLabel = o.status_label
    setRows((list) =>
      list.map((x) => (x.id === o.id ? { ...x, status, status_label: ORDER_STATUS_LABEL[status] || status } : x)),
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
        description={`Из Telegram и вручную · ${rows.length} шт.`}
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
            <select
              className="select-inline"
              value={product}
              onChange={(e) => changeProduct(e.target.value)}
              aria-label="Фильтр по рыбе"
            >
              <option value="">Все рыбы</option>
              {fishOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
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
            void load('all', q, product)
          }}
        />
      )}

      <input
        className="search-wide"
        type="search"
        placeholder="Найти клиента или заказ…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          patchParams({ q: e.target.value.trim() || null })
        }}
      />

      {err && <p className="form-error">{err}</p>}
      {loading && !rows.length && <p className="muted">Загрузка…</p>}

      {!loading && !rows.length && (
        <div className="empty">
          {selectedBatch || product || q.trim() ? (
            <>
              По текущим фильтрам заказов нет.
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {selectedBatch && (
                  <button type="button" className="btn--ghost" onClick={() => changeBatch('all')}>
                    Все партии
                  </button>
                )}
                {product && (
                  <button type="button" className="btn--ghost" onClick={() => changeProduct('')}>
                    Все рыбы
                  </button>
                )}
                {q.trim() && (
                  <button
                    type="button"
                    className="btn--ghost"
                    onClick={() => {
                      setQ('')
                      patchParams({ q: null })
                    }}
                  >
                    Сбросить поиск
                  </button>
                )}
              </div>
            </>
          ) : (
            'Заказов пока нет'
          )}
        </div>
      )}

      <div className="client-list">
        {rows.map((o) => {
          const open = openId === o.id
          const subtotal = (o.items || []).reduce((s, i) => s + Number(i.line_total), 0)
          const disc = Number(o.discount) || 0
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
                    {o.promo_code ? (
                      <span className="order-promo-badge">{o.promo_code}</span>
                    ) : (
                      <span className="order-promo-missing">без промокода</span>
                    )}
                  </div>
                </button>
                <div className="client-card__meta order-card__meta">
                  <select
                    className={`order-status ${statusClass(o.status)}`}
                    value={ORDER_STATUS_OPTIONS.some((s) => s.value === o.status) ? o.status : 'new'}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => void changeStatus(o, e.target.value)}
                    aria-label="Статус заказа"
                  >
                    {ORDER_STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <em className="order-total">
                    {disc > 0 && <span className="order-total__old">{fmtMoney(subtotal)} ₽ </span>}
                    {fmtMoney(Number(o.total))} ₽
                  </em>
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
                  {disc > 0 && (
                    <>
                      <div className="order-detail__sum order-detail__sum--sub">
                        <span>Сумма позиций</span>
                        <strong>{fmtMoney(subtotal)} ₽</strong>
                      </div>
                      <div className="order-detail__sum order-detail__sum--disc">
                        <span>Промокод {o.promo_code}</span>
                        <strong>−{fmtMoney(disc)} ₽</strong>
                      </div>
                    </>
                  )}
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
