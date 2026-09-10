import { useEffect, useRef, useState } from 'react'
import { apiGet, apiSend, apiUpload } from '../api'
import { PageHeader } from '../components/PageHeader'
import { sanitizeDecimal, toNum } from '../lib/numInput'

type Unit = 'pcs' | 'kg'

type Product = {
  id: number
  name: string
  price: number
  purchase_price: number | null
  weight_kg: number | null
  description: string | null
  photo_url: string | null
  unit: Unit
  allow_halves: boolean
  is_active: boolean
  sort_order: number
  purchase_price_per_kg: number | null
}

type Form = {
  name: string
  buyPerKg: string
  salePerKg: string
  weight_kg: string
  description: string
  unit: Unit
  allow_halves: boolean
  is_active: boolean
  photo_url: string | null
  sort_order: number
}

const blank = (): Form => ({
  name: '',
  buyPerKg: '',
  salePerKg: '',
  weight_kg: '',
  description: '',
  unit: 'pcs',
  allow_halves: true,
  is_active: true,
  photo_url: null,
  sort_order: 0,
})

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function unitLabel(u: Unit) {
  return u === 'kg' ? 'кг' : 'шт'
}

/** Для штук: ₽/кг × вес → итог за шт. Для кг: итог = сама цена за кг. */
function totals(unit: Unit, buyPerKg: number, salePerKg: number, weight: number) {
  if (unit === 'kg') {
    return {
      buy: buyPerKg > 0 ? round2(buyPerKg) : 0,
      sale: salePerKg > 0 ? round2(salePerKg) : 0,
    }
  }
  if (weight <= 0) return { buy: 0, sale: 0 }
  return {
    buy: buyPerKg > 0 ? round2(buyPerKg * weight) : 0,
    sale: salePerKg > 0 ? round2(salePerKg * weight) : 0,
  }
}

export function Catalog() {
  const [rows, setRows] = useState<Product[]>([])
  const [form, setForm] = useState<Form>(blank)
  const [editId, setEditId] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const [uploading, setUploading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const load = () => apiGet<Product[]>('/admin/catalog').then(setRows)

  useEffect(() => {
    load().catch(console.error)
  }, [])

  function edit(p: Product) {
    const w = p.weight_kg != null ? Number(p.weight_kg) : 0
    const buy = p.purchase_price != null ? Number(p.purchase_price) : 0
    const sale = Number(p.price)
    const unit = p.unit === 'kg' ? 'kg' : 'pcs'
    setEditId(p.id)
    setForm({
      name: p.name,
      buyPerKg:
        unit === 'kg'
          ? buy
            ? String(buy)
            : p.purchase_price_per_kg != null
              ? String(Number(p.purchase_price_per_kg))
              : ''
          : w > 0 && buy > 0
            ? String(round2(buy / w))
            : p.purchase_price_per_kg != null
              ? String(Number(p.purchase_price_per_kg))
              : '',
      salePerKg: unit === 'kg' ? String(sale) : w > 0 && sale > 0 ? String(round2(sale / w)) : '',
      weight_kg: w ? String(w) : '',
      description: p.description || '',
      unit,
      allow_halves: p.allow_halves,
      is_active: p.is_active,
      photo_url: p.photo_url,
      sort_order: p.sort_order,
    })
    setErr('')
    requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: 'smooth' }))
  }

  const calc = totals(form.unit, toNum(form.buyPerKg), toNum(form.salePerKg), toNum(form.weight_kg))

  async function onPhoto(file: File | undefined) {
    if (!file) return
    setUploading(true)
    setErr('')
    try {
      const { url } = await apiUpload('/admin/catalog/upload', file)
      setForm((f) => ({ ...f, photo_url: url }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось загрузить фото')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function save() {
    if (!form.name.trim()) return setErr('Название обязательно')
    if (form.unit === 'pcs' && toNum(form.weight_kg) <= 0) {
      return setErr('Укажите вес — по нему считается стоимость за штуку')
    }
    if (calc.sale <= 0) return setErr('Укажите цену продажи ₽/кг')
    const body = {
      name: form.name.trim(),
      price: calc.sale,
      purchase_price: calc.buy > 0 ? calc.buy : null,
      weight_kg: form.unit === 'pcs' ? toNum(form.weight_kg) : null,
      description: form.description || null,
      photo_url: form.photo_url,
      unit: form.unit,
      allow_halves: form.unit === 'kg' ? true : form.allow_halves,
      is_active: form.is_active,
      sort_order: form.sort_order,
      purchase_price_per_kg: toNum(form.buyPerKg) > 0 ? toNum(form.buyPerKg) : null,
    }
    try {
      if (editId) await apiSend('PATCH', `/admin/catalog/${editId}`, body)
      else await apiSend('POST', '/admin/catalog', body)
      setEditId(null)
      setForm(blank())
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Товары"
        description="Вводите ₽/кг и вес — итоговая закупка и продажа посчитаются сами. Клиент в мини-аппе видит только продажу."
      />

      <div className="card form" ref={ref}>
        <h2 className="card__title">{editId ? 'Изменить' : 'Новый товар'}</h2>
        {err && <p className="form-error">{err}</p>}
        <input placeholder="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

        <div className="photo-field">
          <div className="photo-field__preview">
            {form.photo_url ? (
              <img src={form.photo_url} alt="" />
            ) : (
              <span className="muted">Нет фото</span>
            )}
          </div>
          <div className="photo-field__actions">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              hidden
              onChange={(e) => void onPhoto(e.target.files?.[0])}
            />
            <button type="button" className="btn--ghost" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? 'Загрузка…' : form.photo_url ? 'Заменить фото' : 'Добавить фото'}
            </button>
            {form.photo_url && (
              <button type="button" className="btn--ghost" onClick={() => setForm({ ...form, photo_url: null })}>
                Убрать
              </button>
            )}
            <span className="muted">jpg, png, webp — видно в мини-аппе</span>
          </div>
        </div>

        <label>
          Как продаём
          <select
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value as Unit, allow_halves: true })}
          >
            <option value="pcs">Штуки (рыба целиком / половинки)</option>
            <option value="kg">Килограммы (креветки и т.п.)</option>
          </select>
        </label>
        <div className="form-row">
          <label>
            Закупка ₽/кг
            <input
              inputMode="decimal"
              placeholder="факт"
              value={form.buyPerKg}
              onChange={(e) => {
                const buyPerKg = sanitizeDecimal(e.target.value)
                if (buyPerKg != null) setForm({ ...form, buyPerKg })
              }}
            />
          </label>
          <label>
            Продажа ₽/кг
            <input
              inputMode="decimal"
              placeholder="клиенту"
              value={form.salePerKg}
              onChange={(e) => {
                const salePerKg = sanitizeDecimal(e.target.value)
                if (salePerKg != null) setForm({ ...form, salePerKg })
              }}
            />
          </label>
          {form.unit === 'pcs' && (
            <label>
              Вес кг
              <input
                inputMode="decimal"
                value={form.weight_kg}
                placeholder="напр. 2.5"
                onChange={(e) => {
                  const weight_kg = sanitizeDecimal(e.target.value)
                  if (weight_kg != null) setForm({ ...form, weight_kg })
                }}
              />
            </label>
          )}
        </div>

        {(calc.buy > 0 || calc.sale > 0) && (
          <div className="price-totals">
            <div>
              <span>Факт (закупка)</span>
              <b>
                {calc.buy > 0 ? `${calc.buy} ₽` : '—'}
                {form.unit === 'pcs' ? '/шт' : '/кг'}
              </b>
            </div>
            <div>
              <span>Клиенту (продажа)</span>
              <b>
                {calc.sale > 0 ? `${calc.sale} ₽` : '—'}
                {form.unit === 'pcs' ? '/шт' : '/кг'}
              </b>
            </div>
            {calc.buy > 0 && calc.sale > 0 && (
              <div>
                <span>Маржа</span>
                <b>{round2(calc.sale - calc.buy)} ₽</b>
              </div>
            )}
          </div>
        )}

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
        {rows.map((p) => {
          const unit = p.unit === 'kg' ? 'kg' : 'pcs'
          const ul = unitLabel(unit)
          const buy = p.purchase_price != null ? Number(p.purchase_price) : null
          const sale = Number(p.price)
          return (
            <div key={p.id} className="simple-list__row">
              <div className="product-row">
                <div className="product-row__thumb">
                  {p.photo_url ? <img src={p.photo_url} alt="" /> : <span />}
                </div>
                <div>
                  <b>{p.name}</b>
                  <span className="muted">
                    продажа {sale} ₽/{ul}
                    {buy != null ? ` · закупка ${buy} ₽/${ul}` : ''}
                    {buy != null ? ` · маржа ≈ ${round2(sale - buy)} ₽` : ''}
                    {unit === 'pcs' && p.weight_kg != null ? ` · ~${p.weight_kg} кг` : ''}
                    {!p.is_active ? ' · скрыт' : ''}
                  </span>
                </div>
              </div>
              <button type="button" className="btn--ghost" onClick={() => edit(p)}>
                Изменить
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
