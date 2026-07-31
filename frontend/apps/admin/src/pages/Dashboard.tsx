import { Link } from 'react-router-dom'
import { SECTIONS } from '../sections'

export function Dashboard() {
  return (
    <div className="page">
      <h1>Даниловская рыба</h1>
      <p>Админка недельных партий: каталог, заказы, сводка к закупке.</p>
      <ul>
        {SECTIONS.map((s) => (
          <li key={s.path}>
            <Link to={s.path}>{s.label}</Link>
          </li>
        ))}
      </ul>
      <p className="muted">Логин по умолчанию после seed: admin@fish.local / admin123</p>
    </div>
  )
}
