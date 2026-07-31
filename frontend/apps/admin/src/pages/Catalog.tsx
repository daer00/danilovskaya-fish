import { useEffect, useState } from 'react'
import { apiGet, apiSend, apiUpload } from '../api'

type Product = {
  id: number
  name: string
  price: number
  description: string | null
  photo_url: string | null
  allow_halves: boolean
  is_active: boolean
  sort_order: number
}

const empty = {
  name: '',
  price: 0,
  description: '',
  photo_url: null as string | null,
  allow_halves: true,
  is_active: true,
  sort_order: 0,
}

export function Catalog() {
  const [rows, setRows] = useState<Product[]>([])
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState<number | null>(null)
  const load = () => apiGet<Product[]>('/admin/catalog').then(setRows)
  useEffect(() => {
    load().catch(console.error)
  }, [])

  async function onPhoto(file: File | undefined) {
    if (!file) return
    const { url } = await apiUpload('/admin/catalog/upload', file)
    setForm((f) => ({ ...f, photo_url: url }))
  }

  async function save() {
    const body = { ...form, description: form.description || null }
    if (editId) await apiSend('PATCH', `/admin/catalog/${editId}`, body)
    else await apiSend('POST', '/admin/catalog', body)
    setForm(empty)
    setEditId(null)
    await load()
  }

  function startEdit(p: Product) {
    setEditId(p.id)
    setForm({
      name: p.name,
      price: Number(p.price),
      description: p.description || '',
      photo_url: p.photo_url,
      allow_halves: p.allow_halves,
      is_active: p.is_active,
      sort_order: p.sort_order,
    })
  }

  async function toggle(p: Product) {
    await apiSend('PATCH', `/admin/catalog/${p.id}`, { ...p, is_active: !p.is_active })
    await load()
  }

  return (
    <div className="page">
      <h1>Товары</h1>
      <div className="card form">
        <input placeholder="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input
          type="number"
          placeholder="Цена за рыбу"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
        />
        <textarea
          placeholder="Описание"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <label>
          Фото{' '}
          <input type="file" accept="image/*" onChange={(e) => void onPhoto(e.target.files?.[0])} />
        </label>
        {form.photo_url && <img src={form.photo_url} alt="" className="thumb" />}
        <label>
          <input
            type="checkbox"
            checked={form.allow_halves}
            onChange={(e) => setForm({ ...form, allow_halves: e.target.checked })}
          />{' '}
          Половинки (шаг 0,5)
        </label>
        <div className="actions">
          <button type="button" onClick={() => void save()}>
            {editId ? 'Сохранить' : 'Добавить'}
          </button>
          {editId && (
            <button
              type="button"
              onClick={() => {
                setEditId(null)
                setForm(empty)
              }}
            >
              Отмена
            </button>
          )}
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th />
              <th>Название</th>
              <th>Цена</th>
              <th>½</th>
              <th>Активен</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.photo_url ? <img src={p.photo_url} alt="" className="thumb" /> : '—'}</td>
                <td>{p.name}</td>
                <td>{p.price} ₽</td>
                <td>{p.allow_halves ? 'да' : 'нет'}</td>
                <td>{p.is_active ? 'да' : 'нет'}</td>
                <td className="actions">
                  <button type="button" onClick={() => startEdit(p)}>
                    Изменить
                  </button>
                  <button type="button" onClick={() => void toggle(p)}>
                    {p.is_active ? 'Выкл' : 'Вкл'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
