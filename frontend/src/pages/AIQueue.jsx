import { useState, useEffect } from 'react'
import { api } from '../api'
import QualityBadge from '../components/QualityBadge'

export default function AIQueue() {
  const [queue, setQueue] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [q, s] = await Promise.all([api.getAIQueue(), api.getAIStats()])
        setQueue(Array.isArray(q) ? q : [])
        setStats(s)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Laddar AI-kö…</div>
  if (error) return <div className="bg-red-900/30 border border-red-800 rounded-lg p-6 text-red-300">Fel: {error}</div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">AI-granskningskö</h1>

      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase mb-1">Totalt granskade</div>
            <div className="text-2xl font-bold text-gray-100">{stats.total_reviewed}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase mb-1">Idag</div>
            <div className="text-2xl font-bold text-blue-400">{stats.today}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase mb-1">Godkännandegrad</div>
            <div className="text-2xl font-bold text-emerald-400">{stats.approval_rate}%</div>
          </div>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left">
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Kvalitet</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Källa (msgid)</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Översättning (msgstr)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {queue.map((item) => (
              <tr key={item.string_id} className="hover:bg-gray-800/50">
                <td className="px-4 py-3"><QualityBadge level={item.quality_level} /></td>
                <td className="px-4 py-3 text-gray-300 max-w-xs truncate">{item.msgid}</td>
                <td className="px-4 py-3 text-gray-400 max-w-xs truncate">{item.msgstr}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {queue.length === 0 && <div className="text-center py-12 text-gray-500">Inga strängar i AI-kön</div>}
      </div>
    </div>
  )
}
