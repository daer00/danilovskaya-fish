import { useEffect, useMemo, useState } from 'react'
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

  const load = () =>
    Promise.all([apiGet<Cash[]>('/admin/cash'), apiGet<Overview>('/admin/finance/overview')]).then(([c, o]) => {
      setRows(c)
      setOverview(o)
    })

  useEffect(() => {
    load().catch(console.error)
  }, [])

  const month = overview?.month || monthKey()
  const totals = useMemo(() => {
    let income = 0
    let expense = 0
    for (const r of rows) {
      if (!String(r.entry_date).startsWith(month)) continue
      const n = Number(r.amount) || 0
      if (r.entry_type === 'income') income += n
      else expense += n
    }
    // заказы месяца тоже в «Получения»
    const orders = Number(overview?.revenue ?? 0)
    return { income: income + orders, expense }
  }, [rows, month, overview?.revenue])

  async function save() {
    const amount = toNum(form.amount)
    if (!form.title.trim() || !amount || !form.entry_date) return
    await apiSend('POST', '/admin/cash', { ...form, amount })
    setForm(empty())
    await load()
  }

  async function remove(id: number) {
    if (!confirm('Удалить?')) return
    await apiSend('DELETE', `/admin/cash/${id}`)
    await load()
  }

  const list = rows.filter((r) => tab === 'all' || r.entry_type === tab)

  return (
    <div className="page">
      <PageHeader title="Деньги" description="Получения и траты за месяц. Заказы считаются в получениях." />

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

      <div className="card form">
        <h2 className="card__title">Добавить</h2>
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
        <button type="button" onClick={() => void save()}>
          Сохранить
        </button>
      </div>

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
