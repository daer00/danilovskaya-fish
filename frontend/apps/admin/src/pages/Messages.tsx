import { useEffect, useState } from 'react'
import { apiGet } from '../api'
import { ClientChat } from '../components/ClientChat'
import { PageHeader } from '../components/PageHeader'

type Conv = {
  client_id: number
  full_name: string | null
  phone: string | null
  username: string | null
  is_manual: boolean
  unread_count: number
  last_text: string | null
  last_at: string | null
}

function nameOf(c: Conv) {
  return c.full_name?.trim() || (c.username ? `@${c.username}` : `Клиент #${c.client_id}`)
}

function fmtTime(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function Messages() {
  const [rows, setRows] = useState<Conv[]>([])
  const [loading, setLoading] = useState(false)
  const [chatId, setChatId] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    return apiGet<Conv[]>('/admin/clients/conversations')
      .then(setRows)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load().catch(console.error)
    const t = window.setInterval(() => {
      void apiGet<Conv[]>('/admin/clients/conversations').then(setRows).catch(() => undefined)
    }, 10000)
    return () => window.clearInterval(t)
  }, [])

  const open = rows.find((r) => r.client_id === chatId)

  return (
    <div className="page">
      <PageHeader
        title="Сообщения"
        description="Обращения клиентов из Telegram. Ответ уходит им в бот."
        actions={
          <button type="button" className="btn--ghost" disabled={loading} onClick={() => void load()}>
            {loading ? 'Обновляю…' : 'Обновить'}
          </button>
        }
      />

      <div className="simple-list">
        {rows.map((c) => (
          <button
            key={c.client_id}
            type="button"
            className={`simple-list__row conv-row${c.unread_count ? ' conv-row--unread' : ''}`}
            onClick={() => setChatId(c.client_id)}
          >
            <div>
              <b>
                {nameOf(c)}
                {c.unread_count > 0 && <em className="unread-badge">{c.unread_count}</em>}
              </b>
              <span className="muted">{c.last_text || '—'}</span>
            </div>
            <span className="muted">{fmtTime(c.last_at)}</span>
          </button>
        ))}
        {!rows.length && <p className="empty">{loading ? 'Загрузка…' : 'Пока нет обращений'}</p>}
      </div>

      {open && (
        <ClientChat
          clientId={open.client_id}
          clientName={nameOf(open)}
          canReply={!open.is_manual}
          onClose={() => setChatId(null)}
          onRead={() => void load()}
        />
      )}
    </div>
  )
}
