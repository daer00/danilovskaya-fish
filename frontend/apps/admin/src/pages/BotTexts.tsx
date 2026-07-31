import { useEffect, useState } from 'react'
import { apiGet, apiSend } from '../api'

type Msg = { id: number; code: string; trigger: string; text: string }

export function BotTexts() {
  const [rows, setRows] = useState<Msg[]>([])
  const load = () => apiGet<Msg[]>('/admin/bot-messages').then(setRows)
  useEffect(() => {
    load().catch(console.error)
  }, [])

  async function save(m: Msg) {
    await apiSend('PATCH', `/admin/bot-messages/${m.code}`, { text: m.text })
    await load()
  }

  return (
    <div className="page">
      <h1>Тексты бота</h1>
      {rows.map((m) => (
        <div key={m.code} className="card">
          <strong>
            {m.code} — {m.trigger}
          </strong>
          <textarea
            rows={4}
            value={m.text}
            onChange={(e) => setRows((rs) => rs.map((x) => (x.code === m.code ? { ...x, text: e.target.value } : x)))}
          />
          <button type="button" onClick={() => save(m)}>
            Сохранить
          </button>
        </div>
      ))}
    </div>
  )
}
