import { useEffect, useState } from 'react'
import { apiGet, apiSend } from '../api'

type Product = {
  id: number
  name: string
  price: number
  description: string | null
  allow_halves: boolean
  is_active: boolean
  sort_order: number
}

const empty = { name: '', price: 0, description: '', allow_halves: true, is_active: true, sort_order: 0 }

export function Catalog() {
  const [rows, setRows] = useState<Product[]>([])
  const [form, setForm] = useState(empty)
  const load = () => apiGet<Product[]>('/admin/catalog').then(setRows)
  useEffect(() => {
    load().catch(console.error)
  }, [])

  async function save() {
    await apiSend('POST', '/admin/catalog', { ...form, photo_url: null })
    setForm(empty)
    await load()
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
          <input
            type="checkbox"
            checked={form.allow_halves}
            onChange={(e) => setForm({ ...form, allow_halves: e.target.checked })}
          />{' '}
          Половинки (шаг 0,5)
        </label>
        <button type="button" onClick={() => save()}>
          Добавить
        </button>
      </div>
      <table>
        <thead>
          <tr>
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
              <td>{p.name}</td>
              <td>{p.price} ₽</td>
              <td>{p.allow_halves ? 'да' : 'нет'}</td>
              <td>{p.is_active ? 'да' : 'нет'}</td>
              <td>
                <button type="button" onClick={() => toggle(p)}>
                  {p.is_active ? 'Выкл' : 'Вкл'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
