import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiSend } from '../api'
import { PageHeader } from '../components/PageHeader'

type Msg = { id: number; code: string; trigger: string; text: string }

export function BotTexts() {
  const [rows, setRows] = useState<Msg[]>([])
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  const load = () => apiGet<Msg[]>('/admin/bot-messages').then(setRows)

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : 'Ошибка'))
  }, [])

  const list = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return rows
    return rows.filter(
      (m) =>
        m.code.toLowerCase().includes(n) ||
        m.trigger.toLowerCase().includes(n) ||
        m.text.toLowerCase().includes(n),
    )
  }, [rows, q])

  function startEdit(m: Msg) {
    setEdit(m.code)
    setDraft(m.text)
    setOk('')
    setErr('')
  }

  async function save(code: string) {
    setErr('')
    try {
      const updated = await apiSend<Msg>('PATCH', `/admin/bot-messages/${code}`, { text: draft })
      setRows((rs) => rs.map((x) => (x.code === code ? updated : x)))
      setEdit(null)
      setOk('Сохранено — бот подхватит при следующем сообщении')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Тексты бота"
        description="Фразы Telegram-бота. Плейсхолдеры вроде {имя}, {сумма}, {дата_выдачи} подставляются сами."
        actions={
          <button type="button" className="btn--ghost" onClick={() => void load().then(() => setOk('Обновлено'))}>
            Обновить
          </button>
        }
      />

      <input
        className="search-wide"
        type="search"
        placeholder="Поиск по коду или тексту…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {err && <p className="form-error">{err}</p>}
      {ok && <p className="muted">{ok}</p>}

      <div className="bot-texts">
        {list.map((m) => {
          const open = edit === m.code
          return (
            <article key={m.code} className="bot-text-card">
              <button type="button" className="bot-text-card__head" onClick={() => (open ? setEdit(null) : startEdit(m))}>
                <div>
                  <b>{m.trigger || m.code}</b>
                  <span className="muted">{m.code}</span>
                </div>
                <span className="muted">{open ? 'свернуть' : 'изменить'}</span>
              </button>
              {open ? (
                <div className="bot-text-card__body">
                  <textarea rows={7} value={draft} onChange={(e) => setDraft(e.target.value)} />
                  <div className="actions">
                    <button type="button" onClick={() => void save(m.code)}>
                      Сохранить
                    </button>
                    <button type="button" className="btn--ghost" onClick={() => setEdit(null)}>
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <p className="bot-text-card__preview">{m.text}</p>
              )}
            </article>
          )
        })}
        {!list.length && <div className="empty">Текстов нет</div>}
      </div>
    </div>
  )
}
