import { useEffect, useState } from 'react'
import { apiGet } from '../api'

type Batch = { id: number; title: string; is_open: boolean }
type Line = { product_name: string; quantity: number; total: number }

export function Summary() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [batchId, setBatchId] = useState<number | null>(null)
  const [lines, setLines] = useState<Line[]>([])

  useEffect(() => {
    apiGet<Batch[]>('/admin/batches').then((b) => {
      setBatches(b)
      const open = b.find((x) => x.is_open) || b[0]
      if (open) setBatchId(open.id)
    })
  }, [])

  useEffect(() => {
    if (!batchId) return
    apiGet<Line[]>(`/admin/orders/summary/${batchId}`).then(setLines).catch(console.error)
  }, [batchId])

  return (
    <div className="page">
      <h1>Сводка к закупке</h1>
      <select value={batchId ?? ''} onChange={(e) => setBatchId(Number(e.target.value))}>
        {batches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.title} {b.is_open ? '(открыта)' : ''}
          </option>
        ))}
      </select>
      <div className="table-wrap">
        <table className="table--compact">
          <thead>
            <tr>
              <th>Товар</th>
              <th>Кол-во</th>
              <th>Сумма</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.product_name}>
                <td>{l.product_name}</td>
                <td>{l.quantity}</td>
                <td>{l.total} ₽</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
