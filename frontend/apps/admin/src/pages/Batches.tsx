import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiGet, apiSend } from '../api'
import { PageHeader } from '../components/PageHeader'
import { fromDateTimeLocal, isValidDateParts } from '../lib/datetime'

type Batch = {
  id: number
  title: string
  deadline: string
  pickup_date: string
  pickup_place: string
  is_open: boolean
}

export function Batches() {
  const nav = useNavigate()
  const [rows, setRows] = useState<Batch[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [formErr, setFormErr] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    title: '',
    deadlineDate: '',
    deadlineTime: '12:00',
    pickup_date: '',
    pickup_place: 'холл',
  })

  const load = () => {
    setLoadErr('')
    return apiGet<Batch[]>('/admin/batches').then(setRows)
  }

  useEffect(() => {
    load().catch((e) => setLoadErr(e instanceof Error ? e.message : 'Не удалось загрузить партии'))
  }, [])

  const open = rows.find((b) => b.is_open)

  async function createBatch(e: FormEvent) {
    e.preventDefault()
    if (!form.pickup_date) return setFormErr('Укажите дату выдачи')
    if (!isValidDateParts(form.deadlineDate, form.deadlineTime)) return setFormErr('Укажите корректный дедлайн')
    setFormErr('')
    const title =
      form.title.trim() ||
      new Date(form.pickup_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    const created = await apiSend<Batch>('POST', '/admin/batches', {
      title,
      deadline: fromDateTimeLocal(form.deadlineDate, form.deadlineTime),
      pickup_date: form.pickup_date,
      pickup_place: form.pickup_place,
      is_open: true,
    })
    setShowForm(false)
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

  return (
    <div className="page">
      <PageHeader
        title="Партии"
        description="Приём раз в 2 недели. После закрытия следующая партия открывается автоматически с тем же составом."
      />
      {loadErr && <p className="form-error">{loadErr}</p>}

      <div className={`week-card${open ? ' week-card--on' : ''}`} style={{ marginBottom: '1rem' }}>
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
            <div className="actions">
              <Link to={`/orders?batch_id=${open.id}`} className="btn-primary">
                Заказы партии
              </Link>
              <Link to={`/batches/${open.id}`} className="btn--ghost">
                Состав и цены
              </Link>
            </div>
          </>
        ) : (
          <>
            <h2>Нет открытой партии</h2>
            <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
              Новая партия
            </button>
          </>
        )}
      </div>

      {showForm && (
        <form className="card form" onSubmit={(e) => void createBatch(e)}>
          <h2 className="card__title">Новая партия</h2>
          {formErr && <p className="form-error">{formErr}</p>}
          <label>
            Дата выдачи
            <input
              type="date"
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
            placeholder="Название"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <div className="form-row">
            <label>
              Дедлайн — дата
              <input type="date" value={form.deadlineDate} onChange={(e) => setForm({ ...form, deadlineDate: e.target.value })} />
            </label>
            <label>
              Время
              <input type="time" value={form.deadlineTime} onChange={(e) => setForm({ ...form, deadlineTime: e.target.value })} />
            </label>
          </div>
          <div className="actions">
            <button type="submit">Создать</button>
            <button type="button" className="btn--ghost" onClick={() => setShowForm(false)}>
              Отмена
            </button>
          </div>
        </form>
      )}

      <div className="week-list">
        <h3>Все партии</h3>
        {!rows.length && <p className="empty">Партий пока нет</p>}
        {rows.map((b) => (
          <div key={b.id} className="week-list__row">
            <span className="week-list__title">
              {b.title} · {b.pickup_date}
              {b.is_open ? ' · открыта' : ''}
            </span>
            <div className="week-list__actions">
              <Link to={`/batches/${b.id}`} className="week-list__btn">
                Открыть
              </Link>
              <Link to={`/orders?batch_id=${b.id}`} className="week-list__btn">
                Заказы
              </Link>
              {!b.is_open && (
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
    </div>
  )
}
