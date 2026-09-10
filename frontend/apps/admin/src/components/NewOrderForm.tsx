import { useEffect, useMemo, useRef, useState } from 'react'
import { apiGet, apiSend } from '../api'

type Batch = { id: number; title: string; is_open: boolean }
type Product = { id: number; name: string; price: number; allow_halves: boolean; unit: 'pcs' | 'kg' }
type BatchLine = {
  product_id: number
  name: string
  sale_price: number
  allow_halves: boolean
  unit?: 'pcs' | 'kg'
  enabled: boolean
}
type ClientOpt = { id: number; full_name: string | null; phone: string | null }
type Line = { product_id: number; quantity: number }

function labelOf(c: ClientOpt) {
  return [c.full_name?.trim() || 'Без имени', c.phone].filter(Boolean).join(' · ')
}

export function NewOrderForm({
  clientId,
  prefill,
  onDone,
  onCancel,
}: {
  clientId?: number
  /** Подставить поиск (например телефон из фильтра заказов) */
  prefill?: string
  onDone: () => void
  onCancel: () => void
}) {
  const [batches, setBatches] = useState<Batch[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [clients, setClients] = useState<ClientOpt[]>([])
  const [batchId, setBatchId] = useState<number | ''>('')
  const [cid, setCid] = useState<number | ''>(clientId ?? '')
  const [query, setQuery] = useState('')
  const [phone, setPhone] = useState('')
  const [openSug, setOpenSug] = useState(false)
  const [lines, setLines] = useState<Line[]>([{ product_id: 0, quantity: 1 }])
  const [comment, setComment] = useState('')
  const [pickupSlot, setPickupSlot] = useState<'first' | 'second'>('first')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const locked = Boolean(clientId)

  useEffect(() => {
    Promise.all([apiGet<Batch[]>('/admin/batches'), apiGet<ClientOpt[]>('/admin/clients')]).then(([b, c]) => {
      setBatches(b)
      setClients(c)
      const open = b.find((x) => x.is_open)
      if (open) setBatchId(open.id)
      else if (b[0]) setBatchId(b[0].id)
      if (clientId) {
        const found = c.find((x) => x.id === clientId)
        if (found) {
          setCid(found.id)
          setQuery(found.full_name?.trim() || '')
          setPhone(found.phone || '')
        }
      } else if (prefill?.trim()) {
        const n = prefill.trim().toLowerCase()
        const found =
          c.find((x) => (x.phone || '').includes(prefill.trim())) ||
          c.find((x) => (x.full_name || '').toLowerCase().includes(n))
        if (found) {
          setCid(found.id)
          setQuery(found.full_name?.trim() || '')
          setPhone(found.phone || '')
        } else {
          setQuery(prefill.trim())
        }
      }
    })
  }, [clientId, prefill])

  useEffect(() => {
    if (!batchId) {
      setProducts([])
      return
    }
    apiGet<BatchLine[]>(`/admin/batches/${batchId}/products?enabled_only=true`)
      .then((list) =>
        setProducts(
          list.map((x) => ({
            id: x.product_id,
            name: x.name,
            price: Number(x.sale_price),
            allow_halves: x.unit === 'kg' ? true : x.allow_halves,
            unit: x.unit === 'kg' ? 'kg' : 'pcs',
          })),
        ),
      )
      .catch(console.error)
    setLines([{ product_id: 0, quantity: 1 }])
  }, [batchId])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpenSug(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const suggestions = useMemo(() => {
    const n = query.trim().toLowerCase()
    if (!n) return clients.slice(0, 8)
    return clients
      .filter(
        (c) =>
          (c.full_name || '').toLowerCase().includes(n) || (c.phone || '').includes(n),
      )
      .slice(0, 8)
  }, [clients, query])

  const exact = useMemo(() => {
    const n = query.trim().toLowerCase()
    if (!n) return null
    return (
      clients.find((c) => (c.full_name || '').trim().toLowerCase() === n) ||
      clients.find((c) => (c.phone || '') === query.trim()) ||
      null
    )
  }, [clients, query])

  const total = useMemo(() => {
    return lines.reduce((s, l) => {
      const p = products.find((x) => x.id === l.product_id)
      return s + (p ? Number(p.price) * Number(l.quantity) : 0)
    }, 0)
  }, [lines, products])

  function pick(c: ClientOpt) {
    setCid(c.id)
    setQuery(c.full_name?.trim() || '')
    setPhone(c.phone || '')
    setOpenSug(false)
    setErr('')
  }

  function onQueryChange(v: string) {
    setQuery(v)
    setCid('')
    setOpenSug(true)
  }

  function setLine(i: number, patch: Partial<Line>) {
    setLines((list) => list.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))
  }

  async function resolveClientId(): Promise<number> {
    if (cid) return Number(cid)
    if (exact) return exact.id
    const name = query.trim()
    if (!name) throw new Error('Укажите клиента')
    const created = await apiSend<ClientOpt>('POST', '/admin/clients', {
      full_name: name,
      phone: phone.trim() || null,
    })
    setClients((list) => [created, ...list])
    setCid(created.id)
    return created.id
  }

  async function save() {
    if (!batchId) return setErr('Выберите партию')
    const items = lines.filter((l) => l.product_id && l.quantity > 0)
    if (!items.length) return setErr('Добавьте хотя бы одну позицию')
    setErr('')
    setSaving(true)
    try {
      const client_id = await resolveClientId()
      await apiSend('POST', '/admin/orders', {
        client_id,
        batch_id: Number(batchId),
        comment: comment.trim() || null,
        pickup_slot: pickupSlot,
        items: items.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
        status: 'confirmed',
      })
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setSaving(false)
    }
  }

  const willCreate = !locked && !cid && !exact && query.trim().length > 0

  return (
    <div className="card form new-order">
      <h2 className="card__title">Новый заказ</h2>
      {err && <p className="form-error">{err}</p>}

      <div className="client-pick" ref={boxRef}>
        <label>
          Клиент
          <div className="client-pick__field">
            <input
              value={query}
              readOnly={locked}
              placeholder="Имя или телефон…"
              autoComplete="off"
              onChange={(e) => onQueryChange(e.target.value)}
              onFocus={() => !locked && setOpenSug(true)}
            />
            {!locked && openSug && (
              <ul className="client-pick__sug">
                {suggestions.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => pick(c)}>
                      {labelOf(c)}
                    </button>
                  </li>
                ))}
                {willCreate && (
                  <li>
                    <button type="button" className="client-pick__new" onClick={() => setOpenSug(false)}>
                      + Новый: «{query.trim()}»
                    </button>
                  </li>
                )}
                {!suggestions.length && !willCreate && (
                  <li className="muted" style={{ padding: '0.5rem 0.75rem' }}>
                    Никого не нашли — введите имя
                  </li>
                )}
              </ul>
            )}
          </div>
        </label>
        {!locked && (
          <p className="muted client-pick__hint">
            {cid || exact
              ? 'Клиент из базы'
              : willCreate
                ? 'Создадим нового клиента при сохранении заказа'
                : 'Начните вводить — покажем похожих'}
          </p>
        )}
      </div>

      {!locked && (
        <label>
          Телефон
          <input
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value)
              if (cid) setCid('')
            }}
            placeholder="необязательно"
          />
        </label>
      )}

      <label>
        Партия
        <select value={batchId} onChange={(e) => setBatchId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">— выберите —</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
              {b.is_open ? ' · открыта' : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="new-order__lines">
        <div className="muted" style={{ fontWeight: 600, fontSize: '0.82rem' }}>
          Позиции
        </div>
        {lines.map((l, i) => (
          <div key={i} className="new-order__line">
            <select
              value={l.product_id || ''}
              onChange={(e) => setLine(i, { product_id: Number(e.target.value) || 0 })}
            >
              <option value="">Выберите товар…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {Number(p.price).toLocaleString('ru-RU')} ₽
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0.5}
              step={
                (() => {
                  const p = products.find((x) => x.id === l.product_id)
                  return p && (p.unit === 'kg' || p.allow_halves) ? 0.5 : 1
                })()
              }
              value={l.quantity}
              onChange={(e) => setLine(i, { quantity: Number(e.target.value) })}
              aria-label="Количество"
            />
            <span className="muted" style={{ alignSelf: 'center', fontSize: '0.85rem' }}>
              {products.find((x) => x.id === l.product_id)?.unit === 'kg' ? 'кг' : 'шт'}
            </span>
            {lines.length > 1 && (
              <button type="button" className="btn--ghost" onClick={() => setLines((list) => list.filter((_, j) => j !== i))}>
                ×
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="btn--ghost new-order__add"
          onClick={() => setLines((list) => [...list, { product_id: 0, quantity: 1 }])}
        >
          + Позиция
        </button>
      </div>

      <label>
        Собрание (выдача)
        <select value={pickupSlot} onChange={(e) => setPickupSlot(e.target.value as 'first' | 'second')}>
          <option value="first">1-е собрание</option>
          <option value="second">2-е собрание</option>
        </select>
      </label>

      <label>
        Комментарий
        <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="необязательно" />
      </label>

      <p className="new-order__total">
        Итого: <b>{total.toLocaleString('ru-RU')} ₽</b>
      </p>

      <div className="actions">
        <button type="button" disabled={saving} onClick={() => void save()}>
          {saving ? '…' : 'Создать заказ'}
        </button>
        <button type="button" className="btn--ghost" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  )
}
