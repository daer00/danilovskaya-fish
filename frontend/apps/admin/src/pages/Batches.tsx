import { useEffect, useState } from 'react'
import { apiGet, apiSend } from '../api'

type Batch = {
  id: number
  title: string
  deadline: string
  pickup_date: string
  pickup_place: string
  is_open: boolean
}

const empty = {
  title: '',
  deadline: '',
  pickup_date: '',
  pickup_place: 'холл',
  is_open: true,
}

export function Batches() {
  const [rows, setRows] = useState<Batch[]>([])
  const [form, setForm] = useState(empty)
  const load = () => apiGet<Batch[]>('/admin/batches').then(setRows)
  useEffect(() => {
    load().catch(console.error)
  }, [])

  async function save() {
    await apiSend('POST', '/admin/batches', {
      ...form,
      deadline: new Date(form.deadline).toISOString(),
    })
    setForm(empty)
    await load()
  }

  async function toggle(b: Batch) {
    await apiSend('PATCH', `/admin/batches/${b.id}`, { ...b, is_open: !b.is_open })
    await load()
  }

  return (
    <div className="page">
      <h1>Партии</h1>
      <div className="card form">
        <input placeholder="Название" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <label>
          Дедлайн
          <input type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
        </label>
        <label>
          Дата выдачи
          <input type="date" value={form.pickup_date} onChange={(e) => setForm({ ...form, pickup_date: e.target.value })} />
        </label>
        <button type="button" onClick={() => save()}>
          Создать (откроет приём)
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Название</th>
              <th>Дедлайн</th>
              <th>Выдача</th>
              <th>Открыта</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td>{b.id}</td>
                <td>{b.title}</td>
                <td>{b.deadline}</td>
                <td>{b.pickup_date}</td>
                <td>{b.is_open ? 'да' : 'нет'}</td>
                <td>
                  <button type="button" onClick={() => toggle(b)}>
                    {b.is_open ? 'Закрыть' : 'Открыть'}
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
