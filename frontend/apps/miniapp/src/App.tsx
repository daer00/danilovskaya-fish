import { useEffect, useMemo, useRef, useState } from 'react'

type Product = {
  id: number
  name: string
  price: string
  description: string | null
  photo_url: string | null
  allow_halves: boolean
}
type Batch = { id: number; deadline: string; pickup_date: string; is_open: boolean } | null
type CartItem = { product: Product; quantity: number }

const API = (import.meta.env.VITE_API_BASE ?? '') + '/api/v1'
const tg = () => window.Telegram?.WebApp

function fmtMoney(v: string | number) {
  return `${Number(v).toFixed(0)} ₽`
}
function fmtQty(q: number) {
  return String(q).replace('.', ',')
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

export function App() {
  const [batch, setBatch] = useState<Batch>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [step, setStep] = useState<'catalog' | 'cart'>('catalog')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const inTelegram = Boolean(tg()?.initData || tg()?.initDataUnsafe?.user)

  const total = useMemo(
    () => cart.reduce((s, i) => s + Number(i.product.price) * i.quantity, 0),
    [cart],
  )

  useEffect(() => {
    Promise.all([
      fetch(`${API}/batches/active`).then((r) => r.json()),
      fetch(`${API}/catalog`).then((r) => r.json()),
    ])
      .then(([b, p]) => {
        setBatch(b)
        setProducts(p)
      })
      .catch(() => setError('Не удалось загрузить каталог'))
  }, [])

  useEffect(() => {
    const w = tg()
    if (!w?.MainButton) return
    // MainButton только при реальной Telegram-сессии (есть initData/user)
    const onClick = () => {
      if (step === 'catalog' && cart.length) setStep('cart')
      else if (step === 'cart' && cart.length) void sendToBot()
    }
    w.MainButton.onClick(onClick)
    if (!inTelegram) {
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
  }, [step, cart, total, busy, inTelegram])

  function add(p: Product, qty: number) {
    setCart((c) => {
      const i = c.findIndex((x) => x.product.id === p.id)
      if (i >= 0) {
        const next = [...c]
        next[i] = { ...next[i], quantity: +(next[i].quantity + qty).toFixed(2) }
        return next
      }
      return [...c, { product: p, quantity: qty }]
    })
    tg()?.HapticFeedback?.impactOccurred('light')
  }

  async function sendToBot() {
    if (sending.current || !cart.length) return
    sending.current = true
    setBusy(true)
    setError(null)
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
        w?.HapticFeedback?.notificationOccurred?.('success')
        w?.close?.()
        return
      }

      // Fallback: кнопка WebApp на reply-клавиатуре (sendData)
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

  if (!batch?.is_open) {
    return (
      <div className="page">
        <h1>Даниловская рыба</h1>
        <p>Приём заказов сейчас закрыт.</p>
      </div>
    )
  }

  if (step === 'cart') {
    return (
      <div className="page">
        <button type="button" className="link" onClick={() => setStep('catalog')}>
          ← Каталог
        </button>
        <h1>Корзина</h1>
        <p className="muted">Дальше оформление продолжится в чате с ботом</p>
        {!inTelegram && (
          <p className="err">Откройте каталог кнопкой «Каталог» в Telegram-боте</p>
        )}
        {!cart.length && <p>Пусто</p>}
        <ul className="list">
          {cart.map((i) => (
            <li key={i.product.id}>
              <div>
                <b>{i.product.name}</b>
                <div>
                  {fmtQty(i.quantity)} × {fmtMoney(i.product.price)}
                </div>
              </div>
              <button type="button" onClick={() => setCart((c) => c.filter((x) => x.product.id !== i.product.id))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        <p className="total">Итого: {fmtMoney(total)}</p>
        {error && <p className="err">{error}</p>}
        {!!cart.length && (!inTelegram || !tg()?.MainButton) && (
          <button type="button" className="btn primary" disabled={busy} onClick={() => void sendToBot()}>
            {busy ? 'Отправляем…' : 'Оформить в боте'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="page">
      <h1>Даниловская рыба</h1>
      <p className="muted">Выдача {batch.pickup_date}</p>
      {error && <p className="err">{error}</p>}
      <div className="cards">
        {products.map((p) => (
          <article key={p.id} className="card">
            {p.photo_url && <img src={p.photo_url} alt="" className="photo" />}
            <h2>{p.name}</h2>
            <p className="price">{fmtMoney(p.price)} за рыбу</p>
            {p.description && <p className="desc">{p.description}</p>}
            <div className="qty">
              {(p.allow_halves ? [0.5, 1, 1.5, 2] : [1, 2, 3]).map((q) => (
                <button key={q} type="button" onClick={() => add(p, q)}>
                  +{fmtQty(q)}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
