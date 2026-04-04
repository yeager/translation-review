import { NavLink, Outlet } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/', label: '📊 Översikt', end: true },
  { to: '/pipeline', label: '⚙️ Pipeline' },
  { to: '/review', label: '✏️ Granskningssats' },
  { to: '/ai-queue', label: '🤖 AI-granskningskö' },
  { to: '/search', label: '🔍 Sök strängar' },
  { to: '/projects', label: '📦 Projekt' },
  { to: '/files', label: '📁 Filer' },
  { to: '/changes', label: '🔄 Ändringar' },
  { to: '/import', label: '⬆️ Importera' },
  { to: '/dirty', label: '📤 Ändrade filer' },
  { to: '/admin', label: '⚙️ Admin' },
]

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 bg-gray-950 border-r border-gray-800 flex flex-col shrink-0">
        <div className="h-14 flex items-center px-5 border-b border-gray-800">
          <span className="text-sm font-bold tracking-wider text-gray-400">
            TR<span className="text-blue-500">v2</span>
          </span>
        </div>
        <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-gray-800 text-gray-100'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-3 border-t border-gray-800 text-xs text-gray-600">
          Translation Review v2
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
