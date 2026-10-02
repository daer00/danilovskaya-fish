import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { apiGet, apiSend } from '../api'
import { PageHeader } from '../components/PageHeader'
import { fmtRub } from '../lib/money'
import { sanitizeDecimal, toNum } from '../lib/numInput'

type Cash = {
  id: number
  entry_type: 'income' | 'expense'
  entry_date: string
  title: string
  amount: number
  category: string
}
type Overview = { received: number; spent: number; revenue: number; month: string }

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function monthKey(iso = todayISO()) {
  return iso.slice(0, 7)
}

const empty = () => ({
  entry_date: todayISO(),
  title: '',
  amount: '',
  category: 'прочее',
  entry_type: 'expense' as 'income' | 'expense',
})

export function Money() {
  const [rows, setRows] = useState<Cash[]>([])
  const [overview, setOverview] = useState<Overview | null>(null)
  const [form, setForm] = useState(empty)
  const [tab, setTab] = useState<'all' | 'income' | 'expense'>('all')
  const [loadErr, setLoadErr] = useState('')
  const [err, setErr] = useState('')

  const load = () => {
    setLoadErr('')
    return Promise.all([apiGet<Cash[]>('/admin/cash'), apiGet<Overview>('/admin/finance/overview')]).then(([c, o]) => {
      setRows(c)
      setOverview(o)
    })
  }

  useEffect(() => {
    load().catch((e) => setLoadErr(e instanceof Error ? e.message : 'Не удалось загрузить'))
  }, [])

  const month = overview?.month || monthKey()
  const totals = useMemo(
    () => ({
      income: Number(overview?.received ?? 0),
      expense: Number(overview?.spent ?? 0),
    }),
    [overview?.received, overview?.spent],
  )
  const balance = totals.income - totals.expense

  async function save(e?: FormEvent) {
    e?.preventDefault()
    const amount = toNum(form.amount)
    if (!form.title.trim()) return setErr('Укажите комментарий')
    if (!amount) return setErr('Укажите сумму')
    if (!form.entry_date) return setErr('Укажите дату')
    setErr('')
    await apiSend('POST', '/admin/cash', { ...form, amount })
    setForm(empty())
    await load()
  }

  async function remove(id: number) {
    if (!confirm('Удалить?')) return
    await apiSend('DELETE', `/admin/cash/${id}`)
    await load()
  }

  const list = rows.filter(
    (r) => String(r.entry_date).startsWith(month) && (tab === 'all' || r.entry_type === tab),
  )

  return (
    <div className="page">
      <PageHeader
        title="Деньги"
        description="KPI за месяц как на главной: заказы + ручные получения / траты. Черновики корзины не считаются. Баланс ≠ маржа партии (там ещё закупка)."
      />
      {loadErr && <p className="form-error">{loadErr}</p>}

      <div className="kpi-grid kpi-grid--2">
        <div className={`kpi kpi--pos${form.entry_type === 'income' ? ' kpi--focus' : ''}`}>
          <b className="pos">{fmtRub(totals.income)}</b>
          <span>Получения</span>
        </div>
        <div className={`kpi kpi--neg${form.entry_type === 'expense' ? ' kpi--focus' : ''}`}>
          <b className="neg">{fmtRub(totals.expense)}</b>
          <span>Траты</span>
        </div>
      </div>
      <div className="kpi-grid kpi-grid--2" style={{ marginTop: '0.75rem' }}>
        <div className={`kpi${balance >= 0 ? ' kpi--pos' : ' kpi--neg'}`}>
          <b className={balance >= 0 ? 'pos' : 'neg'}>{fmtRub(balance)}</b>
          <span>Баланс</span>
        </div>
      </div>

      <form className="card form" onSubmit={(e) => void save(e)}>
        <h2 className="card__title">Добавить</h2>
        {err && <p className="form-error">{err}</p>}
        <div className="form-row">
          <label>
            Тип
            <select
              value={form.entry_type}
              onChange={(e) => setForm({ ...form, entry_type: e.target.value as 'income' | 'expense' })}
            >
              <option value="expense">Трата</option>
              <option value="income">Получение</option>
            </select>
          </label>
          <label>
            Дата
            <input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
          </label>
        </div>
        <input placeholder="Комментарий" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <label>
          Сумма, ₽
          <input
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => {
              const v = sanitizeDecimal(e.target.value)
              if (v != null) setForm({ ...form, amount: v })
            }}
          />
        </label>
        <button type="submit">Сохранить</button>
      </form>

      <div className="pipeline">
        {(
          [
            ['all', 'Все'],
            ['income', 'Получения'],
            ['expense', 'Траты'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`pipeline__tab${tab === id ? ' pipeline__tab--on' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="simple-list">
        {list.map((r) => (
          <div key={r.id} className="simple-list__row">
            <div>
              <b>{r.title}</b>
              <span className="muted">
                {r.entry_date} · {r.entry_type === 'income' ? 'Получение' : 'Трата'}
              </span>
            </div>
            <div className="simple-list__right">
              <b className={r.entry_type === 'income' ? 'pos' : 'neg'}>
                {r.entry_type === 'income' ? '+' : '−'}
                {fmtRub(Number(r.amount))}
              </b>
              <button type="button" className="btn--ghost" onClick={() => void remove(r.id)}>
                Удалить
              </button>
            </div>
          </div>
        ))}
        {!list.length && <p className="empty">Пока пусто</p>}
      </div>
    </div>
  )
}
