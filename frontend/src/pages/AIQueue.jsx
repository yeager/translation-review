import { useState, useEffect } from 'react'
import { api } from '../api'



function QualityLevelBadge({ level }) {
  const colors = {
    1: 'bg-red-900/50 text-red-300',
    2: 'bg-orange-900/50 text-orange-300',
    3: 'bg-yellow-900/50 text-yellow-300',
    4: 'bg-blue-900/50 text-blue-300',
    5: 'bg-emerald-900/50 text-emerald-300',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[level] || colors[3]}`}>
      Q{level}
    </span>
  )
}

export default function AIQueue() {
  const [queue, setQueue] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [q, s] = await Promise.all([api.getAIQueue(), api.getAIStats()])
        setQueue(q)
        setStats(s)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Loading AI queue…</div>
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">AI Review Queue</h1>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Pending</div>
            <div className="text-2xl font-bold text-gray-100">{stats.total_pending}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Reviewed Today</div>
            <div className="text-2xl font-bold text-blue-400">{stats.reviewed_today}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Approval Rate</div>
            <div className="text-2xl font-bold text-emerald-400">{stats.approval_rate}%</div>
          </div>
        </div>
      )}

      {/* Queue table */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left">
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Quality</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Source (msgid)</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Translation (msgstr)</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Files</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {queue.map((item) => (
              <tr key={item.string_id} className="hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3">
                  <QualityLevelBadge level={item.quality_level} />
                </td>
                <td className="px-4 py-3 text-gray-300 max-w-xs truncate">{item.msgid}</td>
                <td className="px-4 py-3 text-gray-400 max-w-xs truncate">{item.msgstr}</td>
                <td className="px-4 py-3">
                  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">{item.source}</span>
                </td>
                <td className="px-4 py-3 text-right text-gray-500">{item.file_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {queue.length === 0 && (
          <div className="text-center py-12 text-gray-500">No strings pending AI review</div>
        )}
      </div>
    </div>
  )
}
