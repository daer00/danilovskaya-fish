import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiGet, apiSend } from '../api'
import { PageHeader } from '../components/PageHeader'
import { fmtRub } from '../lib/money'
import { sanitizeDecimal, toNum } from '../lib/numInput'

type Batch = {
  id: number
  title: string
  pickup_date: string
  deadline: string
  is_open: boolean
}
type Line = {
  product_id: number
  name: string
  allow_halves: boolean
  unit: 'pcs' | 'kg'
  weight_kg: number | null
  enabled: boolean
  sale_price: string
  purchase_price: string
}
type PickupOrder = {
  id: number
  number: number
  full_name: string
  phone: string
  total: number
  pickup_label: string
}
type PickupSummary = {
  first_count: number
  second_count: number
  unknown_count: number
  first: PickupOrder[]
  second: PickupOrder[]
  unknown: PickupOrder[]
}

export function BatchSetup() {
  const { id } = useParams()
  const nav = useNavigate()
  const batchId = Number(id)
  const [batch, setBatch] = useState<Batch | null>(null)
  const [rows, setRows] = useState<Line[]>([])
  const [pickup, setPickup] = useState<PickupSummary | null>(null)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [neu, setNeu] = useState({
    name: '',
    sale_per_kg: '',
    purchase_per_kg: '',
    weight_kg: '',
    unit: 'pcs' as 'pcs' | 'kg',
  })

  const load = () =>
    Promise.all([
      apiGet<Batch[]>('/admin/batches').then((list) => list.find((b) => b.id === batchId) || null),
      apiGet<Line[]>(`/admin/batches/${batchId}/products`),
      apiGet<PickupSummary>(`/admin/batches/${batchId}/pickup-summary`),
    ]).then(([b, lines, p]) => {
      if (!b) throw new Error('Партия не найдена')
      setBatch(b)
      setRows(
        lines.map((l) => ({
          ...l,
          sale_price: String(Number(l.sale_price)),
          purchase_price: String(Number(l.purchase_price)),
        })),
      )
      setPickup(p)
    })

  useEffect(() => {
    if (!batchId) return
    load().catch((e) => setErr(e instanceof Error ? e.message : 'Ошибка'))
  }, [batchId])

  useEffect(() => {
    if (window.location.hash === '#pickup') {
      requestAnimationFrame(() => document.getElementById('pickup')?.scrollIntoView({ behavior: 'smooth' }))
    }
  }, [pickup])

  function patch(pid: number, part: Partial<Line>) {
    setRows((list) => list.map((r) => (r.product_id === pid ? { ...r, ...part } : r)))
    setOk('')
  }

  async function save() {
    setErr('')
    setSaving(true)
    try {
      const lines = await apiSend<Line[]>('PUT', `/admin/batches/${batchId}/products`, {
        items: rows.map((r) => ({
          product_id: r.product_id,
          enabled: r.enabled,
          sale_price: toNum(r.sale_price),
          purchase_price: toNum(r.purchase_price),
        })),
      })
      setRows(
        lines.map((l) => ({
          ...l,
          sale_price: String(Number(l.sale_price)),
          purchase_price: String(Number(l.purchase_price)),
        })),
      )
      setOk('Сохранено')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  async function addNew() {
    const w = toNum(neu.weight_kg)
    const buyKg = toNum(neu.purchase_per_kg)
    const saleKg = toNum(neu.sale_per_kg)
    if (!neu.name.trim()) return setErr('Название обязательно')
    if (saleKg <= 0) return setErr('Укажите цену продажи ₽/кг')
    if (neu.unit === 'pcs' && w <= 0) return setErr('Укажите вес — по нему считается стоимость')
    const sale = neu.unit === 'kg' ? saleKg : Math.round(saleKg * w * 100) / 100
    const purchase =
      buyKg > 0 ? (neu.unit === 'kg' ? buyKg : Math.round(buyKg * w * 100) / 100) : 0
    setErr('')
    try {
      await apiSend('POST', `/admin/batches/${batchId}/products`, {
        name: neu.name.trim(),
        sale_price: sale,
        purchase_price: purchase,
        unit: neu.unit,
        allow_halves: true,
        weight_kg: neu.unit === 'pcs' ? w : null,
      })
      setNeu({ name: '', sale_per_kg: '', purchase_per_kg: '', weight_kg: '', unit: 'pcs' })
      setAdding(false)
      await load()
      setOk('Товар добавлен в партию')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  if (!batch && !err) return <div className="boot">Загрузка…</div>

  return (
    <div className="page">
      <PageHeader
        title={batch ? batch.title : 'Партия'}
        description={
          batch
            ? `Дата выдачи ${batch.pickup_date} · отметьте товары и цены на эту партию`
            : 'Состав партии'
        }
        actions={
          <>
            <Link to="/" className="btn--ghost">
              ← Главная
            </Link>
            {batch && (
              <button
                type="button"
                className="btn--ghost"
                onClick={() => {
                  if (!confirm(`Удалить партию «${batch.title}» вместе с заказами?`)) return
                  void apiSend('DELETE', `/admin/batches/${batch.id}`)
                    .then(() => nav('/'))
                    .catch((e) => setErr(e instanceof Error ? e.message : 'Не удалось удалить'))
                }}
              >
                Удалить партию
              </button>
            )}
          </>
        }
      />

      {err && <p className="form-error">{err}</p>}
      {ok && <p className="muted">{ok}</p>}

      {pickup && (
        <section id="pickup" className="card pickup-summary">
          <h2 className="card__title">Выдача по собраниям</h2>
          <div className="pickup-summary__kpis">
            <div>
              <b>{pickup.first_count}</b>
              <span>1-е собрание</span>
            </div>
            <div>
              <b>{pickup.second_count}</b>
              <span>2-е собрание</span>
            </div>
            {pickup.unknown_count > 0 && (
              <div>
                <b>{pickup.unknown_count}</b>
                <span>не указано</span>
              </div>
            )}
          </div>
          {(
            [
              ['1-е собрание', pickup.first],
              ['2-е собрание', pickup.second],
              ...(pickup.unknown.length ? [['Не указано', pickup.unknown] as const] : []),
            ] as [string, PickupOrder[]][]
          ).map(([title, list]) =>
            list.length ? (
              <div key={title} className="pickup-summary__block">
                <h3>{title}</h3>
                <ul className="summary-list">
                  {list.map((o) => (
                    <li key={o.id}>
                      <span>
                        №{o.number} · {o.full_name}
                        <em className="muted"> · {o.phone}</em>
                      </span>
                      <b>{fmtRub(Number(o.total))}</b>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
          {!pickup.first_count && !pickup.second_count && !pickup.unknown_count && (
            <p className="muted">Заказов пока нет — сводка появится после оформления.</p>
          )}
        </section>
      )}

      <h3 className="section-title">Состав и цены</h3>

      <div className="batch-products">
        {rows.map((r) => (
          <article key={r.product_id} className={`batch-product${r.enabled ? ' batch-product--on' : ''}`}>
            <label className="batch-product__check">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => patch(r.product_id, { enabled: e.target.checked })}
              />
              <span>
                <b>{r.name}</b>
                <em className="muted">
                  {' '}
                  · {r.unit === 'kg' ? 'кг' : 'шт'}
                  {r.unit !== 'kg' && r.weight_kg != null ? ` · ~${r.weight_kg} кг` : ''}
                </em>
              </span>
            </label>
            <div className="batch-product__prices">
              <label>
                Закупка ₽
                <input
                  inputMode="decimal"
                  disabled={!r.enabled}
                  value={r.purchase_price}
                  onChange={(e) => {
                    const v = sanitizeDecimal(e.target.value)
                    if (v == null) return
                    patch(r.product_id, { purchase_price: v })
                  }}
                />
              </label>
              <label>
                Продажа ₽
                <input
                  inputMode="decimal"
                  disabled={!r.enabled}
                  value={r.sale_price}
                  onChange={(e) => {
                    const v = sanitizeDecimal(e.target.value)
                    if (v == null) return
                    patch(r.product_id, { sale_price: v })
                  }}
                />
              </label>
              <div className="batch-product__hint muted">
                {r.enabled ? (
                  <>маржа ≈ {fmtRub(toNum(r.sale_price) - toNum(r.purchase_price))}</>
                ) : (
                  'не в партии'
                )}
              </div>
            </div>
          </article>
        ))}
        {!rows.length && <div className="empty">В каталоге пока нет товаров</div>}
      </div>

      <div className="actions" style={{ marginTop: '0.75rem' }}>
        <button type="button" disabled={saving} onClick={() => void save()}>
          {saving ? '…' : 'Сохранить состав'}
        </button>
        <button type="button" className="btn--ghost" onClick={() => setAdding((v) => !v)}>
          + Новый товар
        </button>
        <button type="button" className="btn--ghost" onClick={() => nav('/orders')}>
          К заказам
        </button>
      </div>

      {adding && (
        <div className="card form" style={{ marginTop: '1rem' }}>
          <h2 className="card__title">Новый товар в эту партию</h2>
          <input
            placeholder="Название"
            value={neu.name}
            onChange={(e) => setNeu({ ...neu, name: e.target.value })}
          />
          <label>
            Как продаём
            <select
              value={neu.unit}
              onChange={(e) => setNeu({ ...neu, unit: e.target.value as 'pcs' | 'kg' })}
            >
              <option value="pcs">Штуки</option>
              <option value="kg">Килограммы</option>
            </select>
          </label>
          <div className="form-row">
            <label>
              Закупка ₽/кг
              <input
                inputMode="decimal"
                value={neu.purchase_per_kg}
                onChange={(e) => {
                  const v = sanitizeDecimal(e.target.value)
                  if (v != null) setNeu({ ...neu, purchase_per_kg: v })
                }}
              />
            </label>
            <label>
              Продажа ₽/кг
              <input
                inputMode="decimal"
                value={neu.sale_per_kg}
                onChange={(e) => {
                  const v = sanitizeDecimal(e.target.value)
                  if (v != null) setNeu({ ...neu, sale_per_kg: v })
                }}
              />
            </label>
            {neu.unit === 'pcs' && (
              <label>
                Вес кг
                <input
                  inputMode="decimal"
                  placeholder="напр. 2.5"
                  value={neu.weight_kg}
                  onChange={(e) => {
                    const v = sanitizeDecimal(e.target.value)
                    if (v != null) setNeu({ ...neu, weight_kg: v })
                  }}
                />
              </label>
            )}
          </div>
          {(() => {
            const w = toNum(neu.weight_kg)
            const buyKg = toNum(neu.purchase_per_kg)
            const saleKg = toNum(neu.sale_per_kg)
            const buy = neu.unit === 'kg' ? buyKg : w > 0 && buyKg > 0 ? Math.round(buyKg * w * 100) / 100 : 0
            const sale = neu.unit === 'kg' ? saleKg : w > 0 && saleKg > 0 ? Math.round(saleKg * w * 100) / 100 : 0
            if (!buy && !sale) return null
            return (
              <div className="price-totals">
                <div>
                  <span>Факт (закупка)</span>
                  <b>
                    {buy > 0 ? `${buy} ₽` : '—'}
                    {neu.unit === 'pcs' ? '/шт' : '/кг'}
                  </b>
                </div>
                <div>
                  <span>Клиенту (продажа)</span>
                  <b>
                    {sale > 0 ? `${sale} ₽` : '—'}
                    {neu.unit === 'pcs' ? '/шт' : '/кг'}
                  </b>
                </div>
                {buy > 0 && sale > 0 && (
                  <div>
                    <span>Маржа</span>
                    <b>{Math.round((sale - buy) * 100) / 100} ₽</b>
                  </div>
                )}
              </div>
            )
          })()}
          <div className="actions">
            <button type="button" onClick={() => void addNew()}>
              Добавить
            </button>
            <button type="button" className="btn--ghost" onClick={() => setAdding(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
