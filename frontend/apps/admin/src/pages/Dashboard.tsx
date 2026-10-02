import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiGet, apiSend } from '../api'
import { PageHeader } from '../components/PageHeader'
import { SummaryModal } from '../components/SummaryModal'
import { fromDateTimeLocal, isValidDateParts } from '../lib/datetime'
import { fmtPct, fmtRub } from '../lib/money'

type Batch = {
  id: number
  title: string
  deadline: string
  pickup_date: string
  pickup_place: string
  is_open: boolean
}
type Overview = {
  month: string
  received: number
  spent: number
  revenue: number
  orders_count: number
  products: { product_name: string; quantity: number; total: number }[]
}
type BotMsg = { code: string; text: string }
type Order = { batch_id: number; status: string; promo_code?: string | null }

const VERSE_FALLBACK = 'Всё могу в укрепляющем меня Иисусе Христе.\n— Филиппийцам 4:13'

export function Dashboard() {
  const nav = useNavigate()
  const [batches, setBatches] = useState<Batch[]>([])
  const [overview, setOverview] = useState<Overview | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [verse, setVerse] = useState(VERSE_FALLBACK)
  const [showWeek, setShowWeek] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [form, setForm] = useState({
    title: '',
    deadlineDate: '',
    deadlineTime: '12:00',
    pickup_date: '',
    pickup_place: 'холл',
  })
  const [err, setErr] = useState('')
  const [loadErr, setLoadErr] = useState('')

  const load = () => {
    setLoadErr('')
    return Promise.all([
      apiGet<Batch[]>('/admin/batches'),
      apiGet<Overview>('/admin/finance/overview'),
      apiGet<Order[]>('/admin/orders'),
      apiGet<BotMsg[]>('/admin/bot-messages'),
    ]).then(([b, o, ords, msgs]) => {
      setBatches(b)
      setOverview(o)
      setOrders(ords)
      const v = msgs.find((m) => m.code === 'dashboard_verse')
      if (v?.text?.trim()) setVerse(v.text.trim())
    })
  }

  useEffect(() => {
    load().catch((e) => setLoadErr(e instanceof Error ? e.message : 'Не удалось загрузить данные'))
  }, [])

  const open = batches.find((b) => b.is_open)
  const openOrders = useMemo(
    () => (open ? orders.filter((o) => o.batch_id === open.id && o.status !== 'cancelled') : []),
    [orders, open],
  )
  // Черновики корзины не в выручке и не в маршрутах
  const realOrders = useMemo(
    () => openOrders.filter((o) => o.status !== 'processing'),
    [openOrders],
  )
  const waiting = openOrders.filter((o) => o.status === 'processing' || o.status === 'new').length
  const promoStats = useMemo(() => {
    const map = new Map<string, number>()
    let without = 0
    for (const o of realOrders) {
      const code = (o.promo_code || '').trim()
      if (!code) {
        without += 1
        continue
      }
      map.set(code, (map.get(code) || 0) + 1)
    }
    const rows = [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
    return { rows, without }
  }, [realOrders])

  const monthLabel = overview
    ? (() => {
        const raw = new Date(`${overview.month}-01`).toLocaleDateString('ru-RU', {
          month: 'long',
          year: 'numeric',
        })
        return raw.charAt(0).toUpperCase() + raw.slice(1)
      })()
    : ''

  const received = Number(overview?.received ?? 0)
  const spent = Number(overview?.spent ?? 0)
  const margin = received - spent
  const marginPct = received > 0 ? Math.round((margin / received) * 1000) / 10 : null

  async function createWeek() {
    if (!form.pickup_date) return setErr('Укажите дату выдачи — партия привязана к дате')
    if (!isValidDateParts(form.deadlineDate, form.deadlineTime)) {
      return setErr('Укажите корректный дедлайн (год 2000–2100)')
    }
    const title =
      form.title.trim() ||
      new Date(form.pickup_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    setErr('')
    const created = await apiSend<Batch>('POST', '/admin/batches', {
      title,
      deadline: fromDateTimeLocal(form.deadlineDate, form.deadlineTime),
      pickup_date: form.pickup_date,
      pickup_place: form.pickup_place,
      is_open: true,
    })
    setShowWeek(false)
    setForm({ title: '', deadlineDate: '', deadlineTime: '12:00', pickup_date: '', pickup_place: 'холл' })
    await load()
    nav(`/batches/${created.id}`)
  }

  async function toggleOpen(b: Batch) {
    await apiSend('PATCH', `/admin/batches/${b.id}`, { ...b, is_open: !b.is_open })
    await load()
  }

  async function removeBatch(b: Batch) {
    if (!confirm(`Удалить партию «${b.title}» вместе с заказами?`)) return
    await apiSend('DELETE', `/admin/batches/${b.id}`)
    await load()
  }

  const [body, ref] = useMemo(() => {
    const parts = verse.split('\n')
    const last = parts[parts.length - 1] ?? ''
    if (last.startsWith('—') || last.startsWith('-')) {
      return [parts.slice(0, -1).join('\n').trim(), last.replace(/^[—-]\s*/, '')]
    }
    return [verse, '']
  }, [verse])

  return (
    <div className="page">
      <PageHeader
        title="Главная"
        description="Приём раз в 2 недели: после закрытия партии следующая открывается сама с тем же составом товаров."
      />
      {loadErr && <p className="form-error">{loadErr}</p>}

      <div className="hero-grid">
        <div className={`week-card${open ? ' week-card--on' : ''}`}>
          {open ? (
            <>
              <span className="pill">Приём открыт</span>
              <h2>{open.title}</h2>
              <p>
                Выдача {open.pickup_date} · дедлайн{' '}
                {new Date(open.deadline).toLocaleString('ru-RU', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              <p className="week-card__stat">
                {realOrders.length} заказов{waiting ? ` · ${waiting} ждут` : ''}
              </p>
              {!!realOrders.length && (
                <div className="promo-stats">
                  <div className="promo-stats__title">Промокоды (маршруты)</div>
                  {promoStats.rows.length ? (
                    <ul className="promo-stats__list">
                      {promoStats.rows.map(([code, cnt]) => (
                        <li key={code}>
                          <span className="promo-stats__code">{code}</span>
                          <b>{cnt}</b>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="promo-stats__empty">Пока ни одного промокода</p>
                  )}
                  {promoStats.without > 0 && (
                    <p className="promo-stats__warn">Без промокода: {promoStats.without}</p>
                  )}
                </div>
              )}
              <div className="actions">
                <Link to={`/orders?batch_id=${open.id}`} className="btn-primary">
                  Открыть заказы
                </Link>
                <Link to={`/batches/${open.id}`} className="btn--ghost">
                  Состав и цены
                </Link>
                <button type="button" className="btn--ghost" onClick={() => void toggleOpen(open)}>
                  Закрыть приём
                </button>
                <button type="button" className="btn--ghost" onClick={() => void removeBatch(open)}>
                  Удалить
                </button>
              </div>
            </>
          ) : (
            <>
              <h2>Нет открытой партии</h2>
              <p>Создайте партию: дедлайн приёма и дата выдачи в холле.</p>
              <button type="button" className="btn-primary" onClick={() => setShowWeek(true)}>
                Новая партия
              </button>
            </>
          )}
        </div>

        <div className="money-card">
          <span className="pill pill--sea">Деньги</span>
          <h2>За {monthLabel || 'месяц'}</h2>
          <p>Получения и траты месяца (без себестоимости закупки — она в карточке партии).</p>
          <div className="money-card__row">
            <div className="money-card__kpi">
              <b>{fmtRub(received)}</b>
              <span>Получения</span>
            </div>
            <div className="money-card__kpi">
              <b>{fmtRub(spent)}</b>
              <span>Траты</span>
            </div>
          </div>
          <div className="money-card__row money-card__row--margin">
            <div className={`money-card__kpi${margin >= 0 ? ' money-card__kpi--ok' : ' money-card__kpi--bad'}`}>
              <b>{fmtRub(margin)}</b>
              <span>Баланс</span>
            </div>
            <div className={`money-card__kpi${(marginPct ?? 0) >= 0 ? ' money-card__kpi--ok' : ' money-card__kpi--bad'}`}>
              <b>{fmtPct(marginPct)}</b>
              <span>Баланс %</span>
            </div>
          </div>
          <div className="actions">
            <Link to="/money" className="btn-primary">
              Открыть деньги
            </Link>
            <button type="button" className="btn--ghost" onClick={() => setShowSummary(true)}>
              Аналитика
            </button>
          </div>
        </div>
      </div>

      {showSummary && <SummaryModal onClose={() => setShowSummary(false)} />}

      {showWeek && (
        <div className="card form">
          <h2 className="card__title">Новая партия</h2>
          {err && <p className="form-error">{err}</p>}
          <label>
            Дата выдачи
            <input
              type="date"
              min="2000-01-01"
              max="2100-12-31"
              value={form.pickup_date}
              onChange={(e) => {
                const pickup_date = e.target.value
                const title = pickup_date
                  ? new Date(pickup_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
                  : form.title
                setForm({ ...form, pickup_date, title })
              }}
            />
          </label>
          <input
            placeholder="Название (подставится из даты)"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <div className="form-row">
            <label>
              Дедлайн — дата
              <input
                type="date"
                min="2000-01-01"
                max="2100-12-31"
                value={form.deadlineDate}
                onChange={(e) => setForm({ ...form, deadlineDate: e.target.value })}
              />
            </label>
            <label>
              Время
              <input type="time" value={form.deadlineTime} onChange={(e) => setForm({ ...form, deadlineTime: e.target.value })} />
            </label>
          </div>
          <div className="actions">
            <button type="button" onClick={() => void createWeek()}>
              Создать и настроить товары
            </button>
            <button type="button" className="btn--ghost" onClick={() => setShowWeek(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}

      <blockquote className="verse">
        <p>{body}</p>
        {ref && <cite>{ref}</cite>}
      </blockquote>

      {batches.length > 1 && (
        <div className="week-list">
          <h3>Прошлые партии</h3>
          {batches.slice(0, 6).map((b) => (
            <div key={b.id} className="week-list__row">
              <span className="week-list__title">
                {b.title} · {b.pickup_date}
              </span>
              <div className="week-list__actions">
                <Link to={`/batches/${b.id}`} className="week-list__btn">
                  Цены
                </Link>
                <Link to={`/batches/${b.id}#pickup`} className="week-list__btn">
                  Сводка
                </Link>
                {b.is_open ? (
                  <span className="week-list__btn week-list__btn--muted">Открыта</span>
                ) : (
                  <button type="button" className="week-list__btn" onClick={() => void toggleOpen(b)}>
                    Открыть
                  </button>
                )}
                <button type="button" className="week-list__btn" onClick={() => void removeBatch(b)}>
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
