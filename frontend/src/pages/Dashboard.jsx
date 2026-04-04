import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import QualityBadge from '../components/QualityBadge'

function StatCard({ label, value, color = 'text-gray-100' }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  )
}

export default function Dashboard() {
  const [overview, setOverview] = useState(null)
  const [dirty, setDirty] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [ov, d] = await Promise.all([
          api.getDashboardOverview(),
          api.getDirtyFiles(),
        ])
        setOverview(ov)
        setDirty(Array.isArray(d) ? d : [])
        try { setActivity(await api.getActivity()) } catch { setActivity([]) }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Laddar…</div>
  if (error) return <div className="bg-red-900/30 border border-red-800 rounded-lg p-6 text-red-300 text-sm">Fel: {error}</div>

  const o = overview
  const translatedPct = o.total_strings > 0 ? Math.round((o.translated_strings / o.total_strings) * 100) : 0
  const approvedPct = o.total_strings > 0 ? Math.round((o.approved_strings / o.total_strings) * 100) : 0

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold">Översikt</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Projekt" value={o.total_projects} />
        <StatCard label="Strängar" value={o.total_strings?.toLocaleString()} />
        <StatCard label="Översatta" value={`${translatedPct}%`} color="text-blue-400" />
        <StatCard label="Snittkvaliét" value={o.avg_quality != null ? `${o.avg_quality}/10` : '—'} color="text-yellow-400" />
        <StatCard label="Godkända" value={`${approvedPct}%`} color="text-emerald-400" />
      </div>

      {/* Progress bar */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="flex justify-between text-xs text-gray-500 mb-2">
          <span>{o.translated_strings?.toLocaleString()} översatta</span>
          <span>{o.untranslated_strings?.toLocaleString()} kvar</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-emerald-500 h-full rounded-full transition-all" style={{ width: `${translatedPct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-gray-600 mt-2">
          <span>Filer: {o.total_files}</span>
          <span>AI: {o.ai_reviewed} · Manuell: {o.human_reviewed}</span>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-3 gap-4">
        <Link to="/review" className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-blue-600 transition-colors">
          <div className="text-sm font-medium text-gray-300">Granska</div>
          <div className="text-xs text-gray-500 mt-1">Starta granskningssats</div>
        </Link>
        <Link to="/ai-queue" className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-purple-600 transition-colors">
          <div className="text-sm font-medium text-gray-300">AI-kö</div>
          <div className="text-xs text-gray-500 mt-1">AI-granskningskö</div>
        </Link>
        <Link to="/dirty" className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-yellow-600 transition-colors">
          <div className="text-sm font-medium text-gray-300">Ändrade filer</div>
          <div className="text-xs text-gray-500 mt-1">{dirty.length} filer med oexporterade ändringar</div>
        </Link>
      </div>

      {/* Dirty files */}
      {dirty.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium text-gray-300">Filer som behöver exporteras</h2>
            {dirty.length > 5 && <Link to="/dirty" className="text-xs text-blue-400">Visa alla ({dirty.length})</Link>}
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left">
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Projekt</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Fil</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase text-right">Ändrade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {dirty.slice(0, 5).map((f) => (
                  <tr key={f.file_id} className="hover:bg-gray-800/50">
                    <td className="px-4 py-2.5 text-gray-300">{f.project_name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-400 truncate max-w-xs">{f.file_path}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-yellow-400">{f.dirty_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Activity */}
      <div>
        <h2 className="text-lg font-medium text-gray-300 mb-3">Senaste aktivitet</h2>
        {activity.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center text-gray-500 text-sm">Ingen aktivitet ännu</div>
        ) : (
          <div className="space-y-2">
            {activity.slice(0, 10).map((a) => (
              <div key={a.id} className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-center gap-3 text-sm">
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                  a.action === 'approved' ? 'bg-emerald-900/50 text-emerald-300' :
                  a.action === 'rejected' ? 'bg-red-900/50 text-red-300' :
                  'bg-blue-900/50 text-blue-300'
                }`}>{a.action}</span>
                <span className={`px-1.5 py-0.5 rounded text-xs ${
                  a.reviewer_type === 'ai' ? 'bg-purple-900/50 text-purple-300' : 'bg-gray-800 text-gray-400'
                }`}>{a.reviewer_type || a.reviewer}</span>
                <span className="text-gray-400 truncate flex-1">{a.translation_id && `#${a.translation_id}`}</span>
                <span className="text-xs text-gray-600">{new Date(a.created_at).toLocaleString('sv-SE')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
