import { useEffect, useMemo, useRef, useState } from 'react'

type Product = {
  id: number
  name: string
  price: string
  description: string | null
  photo_url: string | null
  allow_halves: boolean
  unit: 'pcs' | 'kg'
}
type Batch = {
  id: number
  deadline: string
  pickup_date: string
  pickup_place: string
  is_open: boolean
} | null
type CartItem = { product: Product; quantity: number }
type Step = 'catalog' | 'cart' | 'profile'
type PastOrderItem = {
  product_id: number
  product_name: string
  quantity: string
  line_total: string
}
type PastOrder = {
  id: number
  number: number
  status: string
  status_label: string
  сумма: string
  состав: string
  pickup_date: string
  created_at: string
  items: PastOrderItem[]
}

const API = (import.meta.env.VITE_API_BASE ?? '') + '/api/v1'
const MEDIA_BASE = import.meta.env.VITE_API_BASE ?? ''
const tg = () => window.Telegram?.WebApp

function mediaSrc(url: string | null) {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  return `${MEDIA_BASE}${url}`
}

function fmtMoney(v: string | number) {
  return `${Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`
}
function fmtQty(q: number) {
  return String(q).replace('.', ',')
}
function fmtDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}
function fmtDeadline(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
function stepSize(product: Product) {
  return product.unit === 'kg' || product.allow_halves ? 0.5 : 1
}
function cartQty(cart: CartItem[], id: number) {
  return cart.find((x) => x.product.id === id)?.quantity ?? 0
}
function unitSuffix(unit: Product['unit']) {
  return unit === 'kg' ? 'кг' : 'шт.'
}
function fmtQtyUnit(q: number, unit: Product['unit']) {
  return `${fmtQty(q)} ${unitSuffix(unit)}`
}
function qtySubtitle(q: number, product: Product) {
  if (product.unit === 'kg') {
    return q <= 0 ? 'нажмите +, чтобы добавить' : ''
  }
  if (q <= 0) return 'нажмите +, чтобы добавить'
  if (product.allow_halves) {
    if (q === 0.5) return 'половина рыбы'
    if (q === 1) return 'одна рыба'
    if (q === 1.5) return 'полторы рыбы'
    if (q === 2) return 'две рыбы'
  } else if (q === 1) return 'одна рыба'
  return ''
}

function qtyHint(product: Product) {
  if (product.unit === 'kg') return ''
  return product.allow_halves ? '0,5 — половина · 1 — одна рыба' : '1 — одна рыба'
}

function cartPayload(cart: CartItem[]) {
  return {
    items: cart.map((i) => ({
      product_id: i.product.id,
      name: i.product.name,
      price: i.product.price,
      quantity: String(i.quantity),
    })),
  }
}

function AppNav({
  step,
  onNav,
  count,
}: {
  step: Step
  onNav: (s: Step) => void
  count: number
}) {
  return (
    <nav className="app-nav">
      <button type="button" className={step === 'catalog' ? 'on' : ''} onClick={() => onNav('catalog')}>
        Каталог
      </button>
      <button type="button" className={step === 'cart' ? 'on' : ''} onClick={() => onNav('cart')}>
        Корзина
        {count > 0 && <em>{fmtQty(count)}</em>}
      </button>
      <button type="button" className={step === 'profile' ? 'on' : ''} onClick={() => onNav('profile')}>
        Мои заказы
      </button>
    </nav>
  )
}

function QtyStepper({
  product,
  qty,
  onChange,
}: {
  product: Product
  qty: number
  onChange: (delta: number) => void
}) {
  const step = stepSize(product)
  const sub = qtySubtitle(qty, product)
  const hint = qtyHint(product)
  return (
    <div className="stepper-wrap">
      <div className="stepper">
        <button
          type="button"
          className="stepper-btn minus"
          disabled={qty < step}
          aria-label="Убрать"
          onClick={() => onChange(-step)}
        >
          −
        </button>
        <div className="stepper-value">
          <strong>
            {fmtQty(qty)} {unitSuffix(product.unit)}
          </strong>
          {sub && <span>{sub}</span>}
        </div>
        <button
          type="button"
          className="stepper-btn plus"
          aria-label="Добавить"
          onClick={() => onChange(step)}
        >
          +
        </button>
      </div>
      {hint ? <p className="qty-hint">{hint}</p> : null}
    </div>
  )
}

export function App() {
  const [batch, setBatch] = useState<Batch>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [orders, setOrders] = useState<PastOrder[]>([])
  const [step, setStep] = useState<Step>('catalog')
  const [loading, setLoading] = useState(true)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profileNote, setProfileNote] = useState<string | null>(null)
  const [orderNotice, setOrderNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const inTelegram = Boolean(tg()?.initData || tg()?.initDataUnsafe?.user)
  const itemCount = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart])
  const total = useMemo(
    () => cart.reduce((s, i) => s + Number(i.product.price) * i.quantity, 0),
    [cart],
  )
  const shopOpen = Boolean(batch?.is_open)

  useEffect(() => {
    Promise.all([
      fetch(`${API}/batches/active`).then((r) => r.json()),
      fetch(`${API}/catalog`).then((r) => r.json()),
    ])
      .then(([b, p]) => {
        setBatch(b)
        setProducts(
          (Array.isArray(p) ? p : []).map((x: Product) => ({
            ...x,
            unit: x.unit === 'kg' ? 'kg' : 'pcs',
            allow_halves: x.unit === 'kg' ? true : Boolean(x.allow_halves),
          })),
        )
      })
      .catch(() => setError('Не удалось загрузить каталог'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (step !== 'profile') return
    void loadOrders()
    const id = setInterval(() => void loadOrders(), 5000)
    return () => clearInterval(id)
  }, [step])

  useEffect(() => {
    const w = tg()
    if (!w?.MainButton) return
    const onClick = () => {
      if (step === 'catalog' && cart.length) setStep('cart')
      else if (step === 'cart' && cart.length) void sendToBot()
    }
    w.MainButton.onClick(onClick)
    if (!inTelegram || step === 'profile') {
      w.MainButton.hide()
    } else if (step === 'catalog' && cart.length) {
      w.MainButton.setText(`Корзина · ${fmtMoney(total)}`)
      w.MainButton.show()
      w.MainButton.enable()
    } else if (step === 'cart' && cart.length && !busy) {
      w.MainButton.setText('Оформить в боте')
      w.MainButton.show()
      w.MainButton.enable()
    } else {
      w.MainButton.hide()
    }
    return () => w.MainButton.offClick(onClick)
  }, [step, cart, total, itemCount, busy, inTelegram])

  async function loadOrders() {
    setOrdersLoading(true)
    setProfileNote(null)
    const initData = tg()?.initData?.trim() || ''
    try {
      if (initData) {
        const r = await fetch(`${API}/webapp/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ init_data: initData }),
        })
        if (!r.ok) throw new Error(String(r.status))
        setOrders(await r.json())
        return
      }
      const uid = tg()?.initDataUnsafe?.user?.id
      if (import.meta.env.DEV && uid) {
        const r = await fetch(`${API}/orders/by-telegram/${uid}`)
        if (r.ok) setOrders(await r.json())
        return
      }
      setOrders([])
      setProfileNote('История заказов доступна в Telegram-боте')
    } catch {
      setProfileNote('Не удалось загрузить заказы')
      setOrders([])
    } finally {
      setOrdersLoading(false)
    }
  }

  function changeQty(p: Product, delta: number) {
    setCart((c) => {
      const i = c.findIndex((x) => x.product.id === p.id)
      const cur = i >= 0 ? c[i].quantity : 0
      const next = +(cur + delta).toFixed(2)
      if (next <= 0) return c.filter((x) => x.product.id !== p.id)
      if (i >= 0) {
        const copy = [...c]
        copy[i] = { ...copy[i], quantity: next }
        return copy
      }
      return [...c, { product: p, quantity: next }]
    })
    tg()?.HapticFeedback?.impactOccurred('light')
  }

  function repeatOrder(order: PastOrder, withChanges: boolean) {
    if (!shopOpen) {
      setError('Приём заказов сейчас закрыт — повторить заказ нельзя')
      return
    }
    const next: CartItem[] = []
    for (const row of order.items) {
      const product = products.find((p) => p.id === row.product_id)
      if (product) next.push({ product, quantity: Number(row.quantity) })
    }
    if (!next.length) {
      setError('Товары из этого заказа сейчас недоступны в каталоге')
      setStep('catalog')
      return
    }
    setCart(next)
    setError(null)
    setStep(withChanges ? 'catalog' : 'cart')
    tg()?.HapticFeedback?.notificationOccurred?.('success')
  }

  async function sendToBot() {
    if (sending.current || !cart.length) return
    sending.current = true
    setBusy(true)
    setError(null)
    setOrderNotice(null)
    const w = tg()
    const initData = w?.initData?.trim() || ''
    const payload = cartPayload(cart)

    try {
      if (initData) {
        const r = await fetch(`${API}/webapp/cart`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ init_data: initData, ...payload }),
        })
        if (!r.ok) {
          const detail = await r.text().catch(() => '')
          throw new Error(`${r.status} ${detail}`.slice(0, 180))
        }
        const data = await r.json()
        if (data.order) {
          setOrders((prev) => [data.order, ...prev.filter((o) => o.id !== data.order.id)])
          setOrderNotice(
            `Заказ №${data.order.number} создан со статусом «${data.order.status_label}». ` +
              'Завершите подтверждение в чате с ботом — статус обновится автоматически.',
          )
        }
        setCart([])
        setStep('profile')
        w?.HapticFeedback?.notificationOccurred?.('success')
        sending.current = false
        setBusy(false)
        return
      }
      if (typeof w?.sendData === 'function') {
        w.sendData(JSON.stringify(payload))
        return
      }
      setError('Откройте каталог кнопкой «Каталог» в боте (не через браузер).')
      sending.current = false
      setBusy(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      setError(
        msg.includes('401')
          ? 'Сессия Telegram устарела. Закройте мини-апп и откройте каталог заново.'
          : `Не удалось отправить корзину. ${msg || 'Попробуйте ещё раз.'}`,
      )
      sending.current = false
      setBusy(false)
    }
  }

  const nav = <AppNav step={step} onNav={setStep} count={itemCount} />

  if (loading) {
    return (
      <div className="page state">
        <p className="state-text">Загружаем каталог…</p>
      </div>
    )
  }

  if (step === 'profile') {
    return (
      <div className="page has-nav">
        <div className="cart-page profile-page">
          <h1>Мои заказы</h1>
          <p className="muted">История ваших заказов и быстрый повтор</p>
          {orderNotice && <p className="notice">{orderNotice}</p>}
          {profileNote && <p className="err">{profileNote}</p>}
          {ordersLoading ? (
            <p className="empty">Загружаем заказы…</p>
          ) : !orders.length ? (
            <p className="empty">Заказов пока нет. Соберите первый в каталоге.</p>
          ) : (
            <ul className="list orders-list">
              {orders.map((o) => (
                <li key={o.id} className="order-card">
                  <div className="list-top">
                    <div>
                      <b>Заказ №{o.number}</b>
                      <p className="order-meta">
                        {o.pickup_date && `Выдача ${fmtDate(o.pickup_date)}`}
                        {o.pickup_date && o.created_at && ' · '}
                        {o.created_at && fmtDateTime(o.created_at)}
                      </p>
                    </div>
                    <span className={`status status-${o.status}`}>{o.status_label}</span>
                  </div>
                  <p className="order-compose">{o.состав}</p>
                  <p className="order-sum">{o.сумма}</p>
                  {shopOpen && o.status !== 'processing' && o.status !== 'cancelled' && (
                    <div className="order-actions">
                      <button type="button" className="btn outline" onClick={() => repeatOrder(o, false)}>
                        Повторить заказ
                      </button>
                      <button type="button" className="btn outline accent" onClick={() => repeatOrder(o, true)}>
                        Повторить с изменениями
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        {nav}
      </div>
    )
  }

  if (!shopOpen) {
    return (
      <div className="page has-nav state closed">
        <h1>Даниловская рыба</h1>
        <p>Приём заказов сейчас закрыт.<br />Загляните позже — мы сообщим в боте.</p>
        {nav}
      </div>
    )
  }

  if (step === 'cart') {
    return (
      <div className="page has-nav">
        <div className="cart-page">
          <h1>Ваш заказ</h1>
          <ol className="howto">
            <li>Проверьте состав заказа</li>
            <li>Нажмите «Оформить» — бот пришлёт подтверждение</li>
            <li>Оплата и детали — в чате с ботом</li>
          </ol>
          {!inTelegram && <p className="err">Для оформления откройте каталог в Telegram-боте</p>}
          {!cart.length ? (
            <p className="empty">Пока пусто. Вернитесь в каталог и выберите рыбу.</p>
          ) : (
            <ul className="list">
              {cart.map((i) => {
                const line = Number(i.product.price) * i.quantity
                return (
                  <li key={i.product.id}>
                    <div className="list-top">
                      <b>{i.product.name}</b>
                      <div className="list-meta">
                        <span className="line-sum">{fmtMoney(line)}</span>
                        <span className="line-qty">{fmtQtyUnit(i.quantity, i.product.unit)}</span>
                      </div>
                    </div>
                    <QtyStepper
                      product={i.product}
                      qty={i.quantity}
                      onChange={(d) => changeQty(i.product, d)}
                    />
                  </li>
                )
              })}
            </ul>
          )}
          {!!cart.length && (
            <div className="total-box">
              <span>Итого</span>
              <span>{fmtMoney(total)}</span>
            </div>
          )}
          {error && <p className="err">{error}</p>}
          {!!cart.length && (!inTelegram || !tg()?.MainButton) && (
            <button type="button" className="btn wide" disabled={busy} onClick={() => void sendToBot()}>
              {busy ? 'Отправляем…' : 'Оформить в боте'}
            </button>
          )}
        </div>
        {nav}
      </div>
    )
  }

  return (
    <div className="page has-nav">
      <header className="hero">
        <h1 className="brand">Даниловская рыба</h1>
        <p className="subtitle">Свежая рыба с предзаказом — заберёте на выдаче в церкви</p>
        <div className="pills">
          <span className="pill">
            Выдача {fmtDate(batch!.pickup_date)}, {batch!.pickup_place}
          </span>
          <span className="pill pill-deadline">Заказать до {fmtDeadline(batch!.deadline)}</span>
        </div>
      </header>

      {error && <p className="err" style={{ padding: '0 1rem' }}>{error}</p>}

      <div className="catalog">
        {products.map((p) => {
          const qty = cartQty(cart, p.id)
          const line = Number(p.price) * qty
          return (
            <article key={p.id} className="card">
              <div className="photo-wrap">
                {p.photo_url ? (
                  <img src={mediaSrc(p.photo_url) || undefined} alt={p.name} className="photo" />
                ) : (
                  <div className="photo-placeholder">Фото скоро</div>
                )}
              </div>
              <div className="card-body">
                <h2>{p.name}</h2>
                <p className="price">
                  {fmtMoney(p.price)} <span>{p.unit === 'kg' ? 'за кг' : 'за шт.'}</span>
                </p>
                {p.description && <p className="desc">{p.description}</p>}
                {qty > 0 && (
                  <div className="in-cart">
                    <span>В заказе</span>
                    <strong>
                      {fmtQtyUnit(qty, p.unit)} · {fmtMoney(line)}
                    </strong>
                  </div>
                )}
                <QtyStepper product={p} qty={qty} onChange={(d) => changeQty(p, d)} />
              </div>
            </article>
          )
        })}
      </div>
      {nav}
    </div>
  )
}
