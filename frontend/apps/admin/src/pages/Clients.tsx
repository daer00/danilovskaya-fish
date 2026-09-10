import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiGet, apiSend } from '../api'
import { ClientChat } from '../components/ClientChat'
import { NewOrderForm } from '../components/NewOrderForm'
import { PageHeader } from '../components/PageHeader'
import { fmtRub } from '../lib/money'
import { statusClass } from '../lib/orderStatus'

type Order = { id: number; number: number; status: string; status_label: string; total: number; состав: string }
type Client = {
  id: number
  full_name: string | null
  phone: string | null
  username: string | null
  notes: string | null
  is_manual: boolean
  orders_count: number
  unread_count: number
  orders: Order[]
}

function nameOf(full: string | null) {
  return full?.trim() || 'Без имени'
}

function formatNicks(username: string | null) {
  return (username || '')
    .split(/[·,;/|]+/)
    .map((x) => x.trim().replace(/^@/, ''))
    .filter(Boolean)
    .map((x) => `@${x}`)
    .join(' · ')
}

function pickKeep(list: Client[]) {
  const tg = list.find((c) => !c.is_manual)
  if (tg) return tg.id
  return [...list].sort((a, b) => b.orders_count - a.orders_count || a.id - b.id)[0].id
}

function normPhone(phone: string | null) {
  const d = (phone || '').replace(/\D/g, '')
  if (d.length < 10) return ''
  return d.slice(-10)
}

function normName(full: string | null) {
  const t = (full || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s]/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ')
  if (!t || t === 'без имени') return ''
  return t.split(' ').sort().join(' ')
}

/** Группы похожих: тот же телефон (10 цифр) или то же ФИО (без учёта порядка слов). */
function findDupGroups(clients: Client[]): Client[][] {
  const parent = new Map<number, number>()
  const find = (x: number): number => {
    const p = parent.get(x) ?? x
    if (p !== x) {
      const r = find(p)
      parent.set(x, r)
      return r
    }
    return x
  }
  const uni = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }

  for (const c of clients) parent.set(c.id, c.id)

  const byPhone = new Map<string, number[]>()
  const byName = new Map<string, number[]>()
  for (const c of clients) {
    const ph = normPhone(c.phone)
    if (ph) byPhone.set(ph, [...(byPhone.get(ph) || []), c.id])
    const nm = normName(c.full_name)
    if (nm) byName.set(nm, [...(byName.get(nm) || []), c.id])
  }
  for (const ids of [...byPhone.values(), ...byName.values()]) {
    if (ids.length < 2) continue
    for (let i = 1; i < ids.length; i++) uni(ids[0], ids[i])
  }

  const buckets = new Map<number, Client[]>()
  for (const c of clients) {
    const r = find(c.id)
    const list = buckets.get(r) || []
    list.push(c)
    buckets.set(r, list)
  }

  return [...buckets.values()]
    .filter((g) => g.length >= 2)
    .sort((a, b) => b.length - a.length || nameOf(a[0].full_name).localeCompare(nameOf(b[0].full_name), 'ru'))
}

function whySimilar(a: Client, b: Client) {
  const samePhone = Boolean(normPhone(a.phone) && normPhone(a.phone) === normPhone(b.phone))
  const sameName = Boolean(normName(a.full_name) && normName(a.full_name) === normName(b.full_name))
  if (samePhone && sameName) return 'телефон и имя'
  if (samePhone) return 'телефон'
  if (sameName) return 'имя'
  return 'похоже'
}

function groupReason(group: Client[]) {
  let phone = false
  let name = false
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      if (normPhone(group[i].phone) && normPhone(group[i].phone) === normPhone(group[j].phone)) phone = true
      if (normName(group[i].full_name) && normName(group[i].full_name) === normName(group[j].full_name)) name = true
    }
  }
  if (phone && name) return 'телефон и имя'
  if (phone) return 'телефон'
  if (name) return 'имя'
  return 'похоже'
}

export function Clients() {
  const [params] = useSearchParams()
  const [rows, setRows] = useState<Client[]>([])
  const [q, setQ] = useState(params.get('q') || '')
  const [openId, setOpenId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [orderFor, setOrderFor] = useState<number | null>(null)
  const [form, setForm] = useState({ full_name: '', phone: '', notes: '' })
  const [selected, setSelected] = useState<number[]>([])
  const [keepId, setKeepId] = useState<number | null>(null)
  const [merging, setMerging] = useState(false)
  const [err, setErr] = useState('')
  const [onlyDupes, setOnlyDupes] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [chatId, setChatId] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    setLoadErr('')
    try {
      setRows(await apiGet<Client[]>('/admin/clients'))
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : 'Не удалось загрузить клиентов')
      throw e
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load().catch(console.error)
    const t = window.setInterval(() => {
      void apiGet<Client[]>('/admin/clients').then(setRows).catch(() => undefined)
    }, 15000)
    return () => window.clearInterval(t)
  }, [])

  const dupGroups = useMemo(() => findDupGroups(rows), [rows])
  const dupIds = useMemo(() => new Set(dupGroups.flatMap((g) => g.map((c) => c.id))), [dupGroups])
  const groupOf = useMemo(() => {
    const m = new Map<number, Client[]>()
    for (const g of dupGroups) for (const c of g) m.set(c.id, g)
    return m
  }, [dupGroups])

  useEffect(() => {
    if (onlyDupes && dupGroups.length === 0) setOnlyDupes(false)
  }, [onlyDupes, dupGroups.length])

  const filtered = rows.filter((c) => {
    if (onlyDupes && !dupIds.has(c.id)) return false
    if (!q.trim()) return true
    const n = q.toLowerCase()
    return (
      (c.full_name || '').toLowerCase().includes(n) ||
      (c.phone || '').includes(n) ||
      (c.username || '').toLowerCase().includes(n) ||
      (c.notes || '').toLowerCase().includes(n)
    )
  })

  const picked = useMemo(() => rows.filter((c) => selected.includes(c.id)), [rows, selected])

  function selectGroup(group: Client[]) {
    const ids = group.map((c) => c.id)
    setSelected(ids)
    setKeepId(pickKeep(group))
    setErr('')
    setOnlyDupes(true)
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      if (next.length < 2) {
        setKeepId(null)
        setErr('')
      } else if (!keepId || !next.includes(keepId)) {
        const list = rows.filter((c) => next.includes(c.id))
        setKeepId(list.length ? pickKeep(list) : null)
      }
      return next
    })
  }

  async function add() {
    if (!form.full_name.trim()) return
    await apiSend('POST', '/admin/clients', form)
    setForm({ full_name: '', phone: '', notes: '' })
    setAdding(false)
    await load()
  }

  async function save(c: Client) {
    await apiSend('PATCH', `/admin/clients/${c.id}`, {
      full_name: c.full_name,
      phone: c.phone,
      notes: c.notes,
    })
    await load()
  }

  async function merge() {
    if (selected.length < 2 || keepId == null) return
    const keep = rows.find((c) => c.id === keepId)
    const others = picked.filter((c) => c.id !== keepId).map((c) => nameOf(c.full_name)).join(', ')
    if (
      !confirm(
        `Объединить в «${nameOf(keep?.full_name ?? null)}»?\n\nСюда перейдут заказы и заметки с: ${others}.\nОстальные карточки будут удалены.`,
      )
    ) {
      return
    }
    setMerging(true)
    setErr('')
    try {
      await apiSend('POST', '/admin/clients/merge', {
        keep_id: keepId,
        merge_ids: selected.filter((id) => id !== keepId),
      })
      setSelected([])
      setKeepId(null)
      setOnlyDupes(false)
      setOpenId(keepId)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось объединить')
    } finally {
      setMerging(false)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Клиенты"
        description="Похожие по телефону или имени подсвечены. Отметьте дубли и объедините в одну карточку."
        actions={
          <>
            <button
              type="button"
              className="btn--ghost"
              disabled={loading}
              onClick={() => void load().catch(console.error)}
            >
              {loading ? 'Обновляю…' : 'Обновить'}
            </button>
            <button type="button" onClick={() => setAdding(true)}>
              + Клиент
            </button>
          </>
        }
      />

      <div className="kpi-grid" style={{ gridTemplateColumns: 'minmax(8rem, 14rem)' }}>
        <div className="kpi">
          <b>{rows.length}</b>
          <span>Клиентов в базе</span>
        </div>
      </div>

      {loadErr && <p className="form-error">{loadErr}</p>}

      {adding && (
        <div className="card form">
          <input placeholder="Фамилия Имя" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <input placeholder="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input placeholder="Заметка" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="actions">
            <button type="button" onClick={() => void add()}>
              Добавить
            </button>
            <button type="button" className="btn--ghost" onClick={() => setAdding(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}

      <input className="search-wide" type="search" placeholder="Поиск…" value={q} onChange={(e) => setQ(e.target.value)} />

      {dupGroups.length > 0 && (
        <div className="dup-panel">
          <div className="dup-panel__head">
            <b>
              Возможные дубли: {dupGroups.length}{' '}
              {dupGroups.length === 1 ? 'группа' : dupGroups.length < 5 ? 'группы' : 'групп'}
            </b>
            <button type="button" className={`btn--ghost${onlyDupes ? ' is-on' : ''}`} onClick={() => setOnlyDupes((v) => !v)}>
              {onlyDupes ? 'Показать всех' : 'Только похожие'}
            </button>
          </div>
          <div className="dup-panel__list">
            {dupGroups.map((g) => {
              const reason = groupReason(g)
              return (
                <div key={g.map((c) => c.id).join('-')} className="dup-panel__row">
                  <div>
                    <span>
                      {g.map((c) => nameOf(c.full_name)).join(' · ')}
                    </span>
                    <span className="muted">
                      {g.length} карт. · совпадение: {reason}
                      {(() => {
                        const ph = normPhone(g.find((c) => normPhone(c.phone))?.phone || null)
                        return ph ? ` · …${ph}` : ''
                      })()}
                    </span>
                  </div>
                  <button type="button" className="btn--ghost" onClick={() => selectGroup(g)}>
                    Выбрать
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {selected.length >= 2 && (
        <div className="merge-bar">
          <div className="merge-bar__main">
            <b>Объединить {selected.length} карточки</b>
            <label>
              Оставить
              <select value={keepId ?? ''} onChange={(e) => setKeepId(Number(e.target.value))}>
                {picked.map((c) => (
                  <option key={c.id} value={c.id}>
                    {nameOf(c.full_name)}
                    {c.is_manual ? ' · вручную' : ' · TG'}
                    {` · ${c.orders_count} зак.`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="actions">
            <button type="button" disabled={merging || keepId == null} onClick={() => void merge()}>
              {merging ? 'Объединяю…' : 'Объединить'}
            </button>
            <button
              type="button"
              className="btn--ghost"
              onClick={() => {
                setSelected([])
                setKeepId(null)
                setErr('')
              }}
            >
              Сбросить
            </button>
          </div>
          {err && <p className="form-error">{err}</p>}
        </div>
      )}

      <div className="client-list">
        {filtered.map((c) => {
          const open = openId === c.id
          const on = selected.includes(c.id)
          const isDup = dupIds.has(c.id)
          const mates = groupOf.get(c.id)
          return (
            <article
              key={c.id}
              className={`client-card${on ? ' client-card--on' : ''}${isDup ? ' client-card--dup' : ''}`}
            >
              <div className="client-card__head">
                <label className="client-card__check" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={on} onChange={() => toggleSelect(c.id)} />
                </label>
                <button type="button" className="client-card__toggle" onClick={() => setOpenId(open ? null : c.id)}>
                  <div>
                    <b>{nameOf(c.full_name)}</b>
                    <span className="muted">
                      {c.phone || '—'}
                      {c.username ? ` · ${formatNicks(c.username)}` : ''}
                    </span>
                  </div>
                  <div className="client-card__meta">
                    {c.unread_count > 0 && <em className="unread-badge">{c.unread_count}</em>}
                    {isDup && mates && (
                      <span className="badge badge--ready" title={mates.map((x) => nameOf(x.full_name)).join(', ')}>
                        Похожие · {mates.length}
                      </span>
                    )}
                    <span className={`badge ${c.is_manual ? 'badge--completed' : 'badge--confirmed'}`}>
                      {c.is_manual ? 'Вручную' : 'Telegram'}
                    </span>
                    <em>{c.orders_count}</em>
                  </div>
                </button>
              </div>
              {open && (
                <div className="client-card__body">
                  {mates && mates.length > 1 && (
                    <div className="dup-hint">
                      <span>
                        Похожие карточки:{' '}
                        {mates
                          .filter((x) => x.id !== c.id)
                          .map((x) => `${nameOf(x.full_name)} (${whySimilar(c, x)})`)
                          .join('; ')}
                      </span>
                      <button type="button" className="btn--ghost" onClick={() => selectGroup(mates)}>
                        Выбрать группу
                      </button>
                    </div>
                  )}
                  <label>
                    Имя
                    <input
                      value={c.full_name || ''}
                      onChange={(e) =>
                        setRows((rs) => rs.map((x) => (x.id === c.id ? { ...x, full_name: e.target.value } : x)))
                      }
                    />
                  </label>
                  <label>
                    Телефон
                    <input
                      value={c.phone || ''}
                      onChange={(e) =>
                        setRows((rs) => rs.map((x) => (x.id === c.id ? { ...x, phone: e.target.value } : x)))
                      }
                    />
                  </label>
                  <label>
                    Заметка
                    <textarea
                      rows={2}
                      value={c.notes || ''}
                      onChange={(e) =>
                        setRows((rs) => rs.map((x) => (x.id === c.id ? { ...x, notes: e.target.value } : x)))
                      }
                    />
                  </label>
                  <div className="actions">
                    <button type="button" onClick={() => void save(c)}>
                      Сохранить
                    </button>
                    <button type="button" className="btn--ghost" onClick={() => setOrderFor(c.id)}>
                      + Заказ
                    </button>
                    <Link
                      to={`/orders?q=${encodeURIComponent(c.phone || c.full_name || '')}&from=clients`}
                      className="btn--ghost"
                    >
                      Все заказы
                    </Link>
                    <button type="button" className="btn--ghost msg-link" onClick={() => setChatId(c.id)}>
                      Сообщения
                      {c.unread_count > 0 ? <em className="unread-badge">{c.unread_count}</em> : null}
                    </button>
                    <button
                      type="button"
                      className="btn--ghost"
                      onClick={() => {
                        if (!confirm(`Удалить клиента «${nameOf(c.full_name)}» и его заказы?`)) return
                        void apiSend('DELETE', `/admin/clients/${c.id}`)
                          .then(() => {
                            setOpenId(null)
                            setSelected((s) => s.filter((id) => id !== c.id))
                            return load()
                          })
                          .catch((e) => setErr(e instanceof Error ? e.message : 'Не удалось удалить'))
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                  {orderFor === c.id && (
                    <NewOrderForm
                      clientId={c.id}
                      onCancel={() => setOrderFor(null)}
                      onDone={() => {
                        setOrderFor(null)
                        void load()
                      }}
                    />
                  )}
                  <ul className="client-orders">
                    {c.orders.slice(0, 2).map((o) => (
                      <li key={o.id}>
                        <span>
                          №{o.number} · {fmtRub(Number(o.total))}
                        </span>
                        <span className={statusClass(o.status)}>{o.status_label}</span>
                        <div className="muted">{o.состав}</div>
                      </li>
                    ))}
                    {c.orders.length > 2 && (
                      <li className="muted client-orders__more">Ещё {c.orders.length - 2}</li>
                    )}
                    {!c.orders.length && <li className="muted">Заказов нет</li>}
                  </ul>
                </div>
              )}
            </article>
          )
        })}
        {!filtered.length && (
          <p className="empty">
            {onlyDupes ? (
              <>
                Похожих не найдено.{' '}
                <button type="button" className="btn--ghost" onClick={() => setOnlyDupes(false)}>
                  Показать всех
                </button>
              </>
            ) : loading ? (
              'Загрузка…'
            ) : (
              'Клиентов нет'
            )}
          </p>
        )}
      </div>

      {chatId != null && (() => {
        const c = rows.find((x) => x.id === chatId)
        if (!c) return null
        return (
          <ClientChat
            clientId={c.id}
            clientName={nameOf(c.full_name)}
            canReply={!c.is_manual}
            onClose={() => setChatId(null)}
            onRead={() =>
              setRows((list) => list.map((x) => (x.id === c.id ? { ...x, unread_count: 0 } : x)))
            }
          />
        )
      })()}
    </div>
  )
}
