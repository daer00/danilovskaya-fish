import { useEffect, useState } from 'react'
import { apiGet, apiSend } from '../api'
import { PageHeader } from '../components/PageHeader'
import { sanitizeDecimal, toNum } from '../lib/numInput'

type Promo = {
  id: number
  code: string
  title: string | null
  discount_type: 'percent' | 'fixed'
  discount_value: number
  is_active: boolean
  max_uses: number | null
  used_count: number
  notes: string | null
}

const blank = () => ({
  code: '',
  title: '',
  discount_type: 'percent' as 'percent' | 'fixed',
  discount_value: '',
  is_active: true,
  max_uses: '',
  notes: '',
})

export function Promos() {
  const [rows, setRows] = useState<Promo[]>([])
  const [form, setForm] = useState(blank)
  const [editId, setEditId] = useState<number | null>(null)
  const [err, setErr] = useState('')

  const load = () => apiGet<Promo[]>('/admin/promos').then(setRows)

  useEffect(() => {
    load().catch(console.error)
  }, [])

  function edit(p: Promo) {
    setEditId(p.id)
    setForm({
      code: p.code,
      title: p.title || '',
      discount_type: p.discount_type,
      discount_value: String(Number(p.discount_value)),
      is_active: p.is_active,
      max_uses: p.max_uses != null ? String(p.max_uses) : '',
      notes: p.notes || '',
    })
    setErr('')
  }

  async function save() {
    const value = toNum(form.discount_value)
    if (!form.code.trim()) return setErr('Укажите код')
    if (!value) return setErr('Укажите скидку')
    const body = {
      code: form.code.trim(),
      title: form.title.trim() || null,
      discount_type: form.discount_type,
      discount_value: value,
      is_active: form.is_active,
      max_uses: form.max_uses.trim() ? Number(form.max_uses) : null,
      notes: form.notes.trim() || null,
    }
    try {
      if (editId) await apiSend('PATCH', `/admin/promos/${editId}`, body)
      else await apiSend('POST', '/admin/promos', body)
      setForm(blank())
      setEditId(null)
      setErr('')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось сохранить')
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Промокоды"
        description="Скидка в процентах или фиксированная сумма. Клиент вводит код в корзине — итог пересчитывается."
      />

      <div className="card form">
        <h2 className="card__title">{editId ? 'Изменить промокод' : 'Новый промокод'}</h2>
        {err && <p className="form-error">{err}</p>}
        <div className="form-row">
          <label>
            Код
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="FISH10"
            />
          </label>
          <label>
            Название
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Скидка друзьям"
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Тип скидки
            <select
              value={form.discount_type}
              onChange={(e) => setForm({ ...form, discount_type: e.target.value as 'percent' | 'fixed' })}
            >
              <option value="percent">Процент, %</option>
              <option value="fixed">Сумма, ₽</option>
            </select>
          </label>
          <label>
            {form.discount_type === 'percent' ? 'Скидка, %' : 'Скидка, ₽'}
            <input
              inputMode="decimal"
              value={form.discount_value}
              onChange={(e) => {
                const v = sanitizeDecimal(e.target.value)
                if (v != null) setForm({ ...form, discount_value: v })
              }}
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Лимит использований
            <input
              inputMode="numeric"
              value={form.max_uses}
              onChange={(e) => setForm({ ...form, max_uses: e.target.value.replace(/\D/g, '') })}
              placeholder="без лимита"
            />
          </label>
          <label>
            Статус
            <select
              value={form.is_active ? '1' : '0'}
              onChange={(e) => setForm({ ...form, is_active: e.target.value === '1' })}
            >
              <option value="1">Активен</option>
              <option value="0">Выключен</option>
            </select>
          </label>
        </div>
        <input
          placeholder="Заметка"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        <div className="actions">
          <button type="button" onClick={() => void save()}>
            {editId ? 'Сохранить' : 'Добавить'}
          </button>
          {editId && (
            <button
              type="button"
              className="btn--ghost"
              onClick={() => {
                setEditId(null)
                setForm(blank())
              }}
            >
              Отмена
            </button>
          )}
        </div>
      </div>

      <div className="simple-list">
        {rows.map((p) => (
          <div key={p.id} className="simple-list__row">
            <div>
              <b>{p.code}</b>
              <span className="muted">
                {p.title ? `${p.title} · ` : ''}
                {p.discount_type === 'percent' ? `−${Number(p.discount_value)}%` : `−${Number(p.discount_value)} ₽`}
                {` · использовано ${p.used_count}${p.max_uses != null ? `/${p.max_uses}` : ''}`}
                {!p.is_active ? ' · выключен' : ''}
              </span>
            </div>
            <div className="actions" style={{ flexShrink: 0 }}>
              <button type="button" className="btn--ghost" onClick={() => edit(p)}>
                Изменить
              </button>
              <button
                type="button"
                className="btn--ghost"
                onClick={() => {
                  if (!confirm(`Удалить промокод «${p.code}»?`)) return
                  void apiSend('DELETE', `/admin/promos/${p.id}`).then(load)
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        ))}
        {!rows.length && <p className="empty">Промокодов пока нет</p>}
      </div>
    </div>
  )
}
