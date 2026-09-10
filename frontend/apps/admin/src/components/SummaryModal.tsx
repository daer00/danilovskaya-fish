import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../api'
import { fmtRub } from '../lib/money'

type Overview = {
  month: string
  received: number
  spent: number
  revenue: number
  orders_count: number
  products: { product_name: string; quantity: number; total: number }[]
}
type Order = { id: number; status: string; total: number; batch_id: number }
type Cash = { entry_type: 'income' | 'expense'; amount: number; entry_date: string; title: string }
type Batch = { id: number; title: string }

type ChartKind = 'bars' | 'share'
type ChartMetric = 'total' | 'quantity'
type ChartSource = 'products' | 'statuses' | 'cash'

const STATUS_RU: Record<string, string> = {
  processing: 'Оформляется',
  new: 'Новый',
  confirmed: 'Подтверждён',
  ready: 'К выдаче',
  completed: 'Выдан',
  cancelled: 'Отменён',
}

const COLORS = ['#1f5f73', '#2a7a5f', '#3d7ea6', '#c4a35a', '#a8483a', '#6b7a84', '#5b8c85', '#8e6bbf']

function monthTitle(month: string) {
  const raw = new Date(`${month}-01`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

export function SummaryModal({ onClose }: { onClose: () => void }) {
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [overview, setOverview] = useState<Overview | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [cash, setCash] = useState<Cash[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [kind, setKind] = useState<ChartKind>('bars')
  const [metric, setMetric] = useState<ChartMetric>('total')
  const [source, setSource] = useState<ChartSource>('products')
  const [topN, setTopN] = useState(8)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      apiGet<Overview>(`/admin/finance/overview?month=${month}`),
      apiGet<Order[]>('/admin/orders'),
      apiGet<Cash[]>('/admin/cash'),
      apiGet<Batch[]>('/admin/batches'),
    ])
      .then(([o, ords, c, b]) => {
        if (cancelled) return
        setOverview(o)
        setOrders(ords)
        setCash(c)
        setBatches(b)
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [month])

  const series = useMemo(() => {
    if (source === 'products') {
      const rows = [...(overview?.products || [])]
        .map((p) => ({
          label: p.product_name,
          value: metric === 'total' ? Number(p.total) : Number(p.quantity),
        }))
        .sort((a, b) => b.value - a.value)
      return rows.slice(0, topN)
    }
    if (source === 'statuses') {
      const map = new Map<string, number>()
      for (const o of orders) {
        if (o.status === 'cancelled') continue
        const v = metric === 'total' ? Number(o.total) : 1
        map.set(o.status, (map.get(o.status) || 0) + v)
      }
      return [...map.entries()]
        .map(([k, value]) => ({ label: STATUS_RU[k] || k, value }))
        .sort((a, b) => b.value - a.value)
    }
    const map = new Map<string, number>()
    for (const c of cash) {
      if (!c.entry_date.startsWith(month)) continue
      const key = c.entry_type === 'income' ? 'Получения' : 'Траты'
      map.set(key, (map.get(key) || 0) + Number(c.amount))
    }
    return [...map.entries()].map(([label, value]) => ({ label, value }))
  }, [source, overview, orders, cash, metric, topN, month])

  const max = Math.max(...series.map((s) => s.value), 1)
  const sum = series.reduce((a, s) => a + s.value, 0) || 1

  const batchStats = useMemo(() => {
    const map = new Map<number, { title: string; n: number; sum: number }>()
    for (const b of batches) map.set(b.id, { title: b.title, n: 0, sum: 0 })
    for (const o of orders) {
      if (o.status === 'cancelled') continue
      const row = map.get(o.batch_id) || { title: `Партия ${o.batch_id}`, n: 0, sum: 0 }
      row.n += 1
      row.sum += Number(o.total)
      map.set(o.batch_id, row)
    }
    return [...map.values()].filter((x) => x.n > 0).sort((a, b) => b.sum - a.sum).slice(0, 6)
  }, [batches, orders])

  function copyText() {
    if (!overview) return
    const text = [
      `Аналитика · ${monthTitle(month)}`,
      `Заказов: ${overview.orders_count}`,
      `Выручка: ${overview.revenue} ₽`,
      `Получения: ${overview.received} ₽`,
      `Траты: ${overview.spent} ₽`,
      '',
      ...overview.products.map((p) => `${p.product_name}: ${p.quantity} шт · ${p.total} ₽`),
    ].join('\n')
    void navigator.clipboard.writeText(text).then(() => alert('Скопировано'))
  }

  const fmt = (v: number) =>
    metric === 'total' || source === 'cash' ? fmtRub(v) : `${Number(v).toLocaleString('ru-RU')} шт`

  let angle = 0
  const slices = series.map((s, i) => {
    const part = (s.value / sum) * 360
    const start = angle
    angle += part
    return { ...s, start, end: angle, color: COLORS[i % COLORS.length] }
  })

  return (
    <div className="summary-overlay" role="dialog" aria-modal="true" aria-label="Аналитика">
      <button type="button" className="summary-overlay__backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="summary-panel">
        <header className="summary-panel__head">
          <div>
            <p className="muted" style={{ margin: 0 }}>
              Аналитика
            </p>
            <h2>{monthTitle(month)}</h2>
          </div>
          <button type="button" className="summary-panel__close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        <div className="summary-panel__tools">
          <label>
            Месяц
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          <label>
            Данные
            <select value={source} onChange={(e) => setSource(e.target.value as ChartSource)}>
              <option value="products">Товары</option>
              <option value="statuses">Статусы заказов</option>
              <option value="cash">Получения / Траты</option>
            </select>
          </label>
          <label>
            График
            <select value={kind} onChange={(e) => setKind(e.target.value as ChartKind)}>
              <option value="bars">Столбцы</option>
              <option value="share">Доли</option>
            </select>
          </label>
          {source !== 'cash' && (
            <label>
              Показатель
              <select value={metric} onChange={(e) => setMetric(e.target.value as ChartMetric)}>
                <option value="total">Сумма ₽</option>
                <option value="quantity">{source === 'statuses' ? 'Кол-во заказов' : 'Количество'}</option>
              </select>
            </label>
          )}
          {source === 'products' && (
            <label>
              Топ
              <select value={topN} onChange={(e) => setTopN(Number(e.target.value))}>
                <option value={5}>5</option>
                <option value={8}>8</option>
                <option value={12}>12</option>
                <option value={20}>20</option>
              </select>
            </label>
          )}
          <button type="button" className="btn--ghost" onClick={copyText}>
            Копировать текст
          </button>
        </div>

        {loading || !overview ? (
          <p className="muted">Загрузка…</p>
        ) : (
          <>
            <div className="summary-kpis">
              <div className="summary-kpis__item">
                <b>{fmtRub(Number(overview.received))}</b>
                <span>Получения</span>
              </div>
              <div className="summary-kpis__item">
                <b>{fmtRub(Number(overview.spent))}</b>
                <span>Траты</span>
              </div>
              <div className="summary-kpis__item">
                <b>{fmtRub(Number(overview.revenue))}</b>
                <span>выручка заказов</span>
              </div>
              <div className="summary-kpis__item">
                <b>{overview.orders_count}</b>
                <span>заказов</span>
              </div>
            </div>

            <div className="summary-grid">
              <section className="summary-chart card">
                <h3 className="card__title">График</h3>
                {!series.length ? (
                  <p className="muted">Пока нет данных для графика</p>
                ) : kind === 'bars' ? (
                  <div className="bar-chart">
                    {series.map((s, i) => (
                      <div key={s.label} className="bar-chart__row">
                        <span className="bar-chart__label" title={s.label}>
                          {s.label}
                        </span>
                        <div className="bar-chart__track">
                          <div
                            className="bar-chart__fill"
                            style={{
                              width: `${Math.max(4, (s.value / max) * 100)}%`,
                              background: COLORS[i % COLORS.length],
                            }}
                          />
                        </div>
                        <span className="bar-chart__val">{fmt(s.value)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="share-chart">
                    <div
                      className="share-chart__pie"
                      style={{
                        background: `conic-gradient(${slices
                          .map((s) => `${s.color} ${s.start}deg ${s.end}deg`)
                          .join(', ')})`,
                      }}
                    />
                    <ul className="share-chart__legend">
                      {slices.map((s) => (
                        <li key={s.label}>
                          <i style={{ background: s.color }} />
                          <span>{s.label}</span>
                          <b>
                            {fmt(s.value)} · {Math.round((s.value / sum) * 100)}%
                          </b>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              <section className="card">
                <h3 className="card__title">По партиям</h3>
                {!batchStats.length ? (
                  <p className="muted">Нет заказов</p>
                ) : (
                  <ul className="summary-list">
                    {batchStats.map((b) => (
                      <li key={b.title}>
                        <span>{b.title}</span>
                        <b>
                          {b.n} зак. · {fmtRub(b.sum)}
                        </b>
                      </li>
                    ))}
                  </ul>
                )}
                <h3 className="card__title" style={{ marginTop: '1rem' }}>
                  Товары месяца
                </h3>
                {!overview.products.length ? (
                  <p className="muted">Пусто</p>
                ) : (
                  <ul className="summary-list">
                    {overview.products.map((p) => (
                      <li key={p.product_name}>
                        <span>
                          {p.product_name}
                          <em className="muted"> · {Number(p.quantity).toLocaleString('ru-RU')} шт</em>
                        </span>
                        <b>{fmtRub(Number(p.total))}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
