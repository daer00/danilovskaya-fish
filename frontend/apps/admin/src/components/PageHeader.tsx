import { Link } from 'react-router-dom'

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </header>
  )
}

export function QuietLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="quiet-link">
      {children}
    </Link>
  )
}
