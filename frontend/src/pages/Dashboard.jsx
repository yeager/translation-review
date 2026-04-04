import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { ProgressBar } from '../components/ProgressBar'

export default function Dashboard() {
  const [overview, setOverview] = useState(null)
  const [dirty, setDirty] = useState([])
  const [activity, setActivity] = useState([])
  const [aiStats, setAiStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [ov, d, ai] = await Promise.all([
          api.getDashboardOverview(),
          api.getDirtyFiles(),
          api.getAIStats(),
        ])
        setOverview(ov)
        setDirty(d)
        setAiStats(ai)
        // Activity may not exist yet
        try { setActivity(await api.getActivity()) } catch { setActivity([]) }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Loading…</div>
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-6 text-red-300 text-sm">
          Failed to load dashboard: {error}
        </div>
      </div>
    )
  }

  const translatedPct = overview.total_strings > 0
    ? Math.round((overview.translated_strings / overview.total_strings) * 100)
    : 0
  const approvedPct = overview.total_strings > 0
    ? Math.round((overview.approved_strings / overview.total_strings) * 100)
    : 0
  const reviewedPct = overview.total_strings > 0
    ? Math.round(((overview.ai_reviewed + overview.human_reviewed) / overview.total_strings) * 100)
    : 0

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Link
          to="/import"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
        >
          Import PO file
        </Link>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Projects" value={overview.total_projects?.toLocaleString()} />
        <StatCard label="Total Strings" value={overview.total_strings?.toLocaleString()} />
        <StatCard label="Translated" value={`${translatedPct}%`} color="text-blue-400" />
        <StatCard label="Avg Quality" value={overview.avg_quality ? `${overview.avg_quality}/10` : '—'} color="text-yellow-400" />
        <StatCard label="Approved" value={`${approvedPct}%`} color="text-emerald-400" />
      </div>

      {/* Progress bar */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="flex justify-between text-xs text-gray-500 mb-2">
          <span>{overview.translated_strings?.toLocaleString()} translated</span>
          <span>{overview.untranslated_strings?.toLocaleString()} remaining</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-blue-600 to-emerald-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${translatedPct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-600 mt-2">
          <span>Files: {overview.total_files?.toLocaleString()}</span>
          <span>AI reviewed: {overview.ai_reviewed?.toLocaleString()} · Human reviewed: {overview.human_reviewed?.toLocaleString()}</span>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-4">
        <Link
          to="/ai-queue"
          className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-blue-600 transition-colors group"
        >
          <div className="text-sm font-medium text-gray-300 group-hover:text-blue-400 transition-colors">AI Review Queue</div>
          <div className="text-xs text-gray-500 mt-1">
            {aiStats ? `${aiStats.pending} pending · ${aiStats.total_reviewed} reviewed` : 'Strings pending automated review'}
          </div>
        </Link>
        <Link
          to="/dirty"
          className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-yellow-600 transition-colors group"
        >
          <div className="text-sm font-medium text-gray-300 group-hover:text-yellow-400 transition-colors">Dirty Files</div>
          <div className="text-xs text-gray-500 mt-1">
            {dirty.length} files with unexported changes
          </div>
        </Link>
      </div>

      {/* Dirty Files */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-300">Files Needing Export</h2>
          {dirty.length > 5 && (
            <Link to="/dirty" className="text-xs text-blue-400 hover:text-blue-300">View all ({dirty.length})</Link>
          )}
        </div>
        {dirty.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center text-gray-500 text-sm">
            ✅ All files are synced
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left">
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">Project</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">File</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Changed</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">Last Export</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {dirty.slice(0, 5).map((f) => (
                  <tr key={f.file_id} className="hover:bg-gray-800/50">
                    <td className="px-4 py-2.5 text-gray-300 font-medium">{f.project_name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-400 truncate max-w-xs">{f.file_path?.split('/').pop()}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-yellow-400">{f.dirty_count}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {f.last_export_at ? new Date(f.last_export_at).toLocaleDateString() : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-lg font-medium text-gray-300 mb-4">Recent Activity</h2>
        {activity.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center text-gray-500 text-sm">
            No review activity yet
          </div>
        ) : (
          <div className="space-y-2">
            {activity.slice(0, 10).map((a) => (
              <div key={a.id} className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-start gap-3">
                <span className={`mt-0.5 px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${
                  a.action === 'approved' ? 'bg-emerald-900/50 text-emerald-300' :
                  a.action === 'rejected' ? 'bg-red-900/50 text-red-300' :
                  'bg-blue-900/50 text-blue-300'
                }`}>{a.action}</span>
                <span className={`mt-0.5 px-1.5 py-0.5 rounded text-xs shrink-0 ${
                  a.reviewer_type === 'ai' ? 'bg-purple-900/50 text-purple-300' : 'bg-gray-800 text-gray-400'
                }`}>{a.reviewer_type}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-300 truncate">{a.string_msgid}</div>
                  {a.new_msgstr && (
                    <div className="text-xs text-gray-500 mt-0.5 truncate">→ {a.new_msgstr}</div>
                  )}
                  {a.notes && (
                    <div className="text-xs text-gray-500 mt-0.5">{a.notes}</div>
                  )}
                </div>
                <span className="text-xs text-gray-600 shrink-0">{new Date(a.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, color = 'text-gray-100' }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  )
}
