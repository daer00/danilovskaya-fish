import { useEffect, useRef, useState } from 'react'
import { apiGet, apiSend } from '../api'

type Msg = {
  id: number
  direction: 'in' | 'out' | string
  text: string
  created_at: string
  read_at: string | null
}

function fmtTime(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ClientChat({
  clientId,
  clientName,
  canReply,
  onClose,
  onRead,
}: {
  clientId: number
  clientName: string
  canReply: boolean
  onClose: () => void
  onRead?: () => void
}) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottom = useRef<HTMLDivElement>(null)

  async function load() {
    setLoading(true)
    try {
      const list = await apiGet<Msg[]>(`/admin/clients/${clientId}/messages`)
      setMsgs(list)
      await apiSend('POST', `/admin/clients/${clientId}/messages/read`)
      onRead?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось загрузить')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const t = window.setInterval(() => {
      void apiGet<Msg[]>(`/admin/clients/${clientId}/messages`)
        .then(setMsgs)
        .catch(() => undefined)
    }, 8000)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
      window.clearInterval(t)
    }
  }, [clientId])

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs.length])

  async function send() {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setErr('')
    try {
      const m = await apiSend<Msg>('POST', `/admin/clients/${clientId}/messages`, { text: body })
      setMsgs((list) => [...list, m])
      setText('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не отправилось')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="chat-overlay" role="dialog" aria-modal="true" aria-label="Сообщения">
      <button type="button" className="chat-overlay__backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="chat-panel">
        <header className="chat-panel__head">
          <div>
            <p className="muted" style={{ margin: 0 }}>
              Сообщения
            </p>
            <h2>{clientName}</h2>
          </div>
          <button type="button" className="chat-panel__close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        <div className="chat-panel__body">
          {loading && !msgs.length && <p className="muted">Загрузка…</p>}
          {!loading && !msgs.length && <p className="empty">Пока нет сообщений. Клиент пишет боту — появится здесь.</p>}
          {msgs.map((m) => (
            <div key={m.id} className={`chat-bubble chat-bubble--${m.direction}`}>
              <p>{m.text}</p>
              <time>{fmtTime(m.created_at)}</time>
            </div>
          ))}
          <div ref={bottom} />
        </div>

        {err && <p className="form-error chat-panel__err">{err}</p>}

        <div className="chat-panel__compose">
          {!canReply && (
            <p className="muted" style={{ margin: 0 }}>
              Нет Telegram — ответить нельзя. Можно только читать, если сообщения появятся после привязки.
            </p>
          )}
          <textarea
            rows={2}
            placeholder={canReply ? 'Ответ клиенту в Telegram…' : 'Ответ недоступен'}
            value={text}
            disabled={!canReply || sending}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
          />
          <button type="button" disabled={!canReply || sending || !text.trim()} onClick={() => void send()}>
            {sending ? '…' : 'Отправить'}
          </button>
        </div>
      </div>
    </div>
  )
}
