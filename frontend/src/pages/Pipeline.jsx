import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

function QualityBar({ data }) {
  const total = data.total || 1
  const segments = [
    { key: 'approved', label: 'Godkända', count: data.approved, color: 'bg-emerald-500' },
    { key: 'auto_pass', label: 'Auto-pass', count: data.auto_pass, color: 'bg-green-600' },
    { key: 'tm_matched', label: 'TM-match', count: data.tm_matched, color: 'bg-blue-500' },
    { key: 'machine_translated', label: 'Maskinöversatt', count: data.machine_translated, color: 'bg-yellow-500' },
    { key: 'needs_review', label: 'Behöver granskning', count: data.needs_review, color: 'bg-orange-500' },
    { key: 'failed', label: 'Misslyckade', count: data.failed, color: 'bg-red-500' },
    { key: 'untranslated', label: 'Oöversatta', count: data.untranslated, color: 'bg-gray-700' },
  ]

  return (
    <div className="space-y-3">
      <div className="h-6 rounded-full overflow-hidden flex">
        {segments.map(s => s.count > 0 && (
          <div key={s.key} className={`${s.color} transition-all`} style={{ width: `${(s.count / total) * 100}%` }} title={`${s.label}: ${s.count}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-xs">
        {segments.map(s => (
          <div key={s.key} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded ${s.color}`} />
            <span className="text-gray-400">{s.label}: <span className="text-gray-200 font-medium">{s.count}</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Pipeline() {
  const [status, setStatus] = useState(null)
  const [files, setFiles] = useState([])
  const [running, setRunning] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [s, f] = await Promise.all([
          api.getPipelineStatus(),
          api.getFiles({ limit: 100 }),
        ])
        setStatus(s)
        setFiles(f.files || [])
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const runPipeline = async (fileId) => {
    setRunning(r => ({ ...r, [fileId]: true }))
    try {
      await api.runPipeline(fileId)
      const s = await api.getPipelineStatus()
      setStatus(s)
    } catch (e) {
      alert('Pipeline-fel: ' + e.message)
    } finally {
      setRunning(r => ({ ...r, [fileId]: false }))
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Laddar…</div>
  if (error) return <div className="bg-red-900/30 border border-red-800 rounded-lg p-6 text-red-300">Fel: {error}</div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Pipeline</h1>

      {status && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <h2 className="text-sm font-medium text-gray-400 mb-3">Kvalitetsfördelning — totalt {status.total} strängar</h2>
          <QualityBar data={status} />
          <div className="mt-4 text-sm text-gray-500">
            Auto-hanterade: <span className="text-gray-300">{status.auto_handled}</span>
          </div>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left">
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Fil</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Strängar</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Åtgärder</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {files.map(f => (
              <tr key={f.id} className="hover:bg-gray-800/50">
                <td className="px-4 py-3">
                  <Link to={`/files/${f.id}`} className="text-blue-400 hover:text-blue-300 font-mono text-xs">{f.path}</Link>
                </td>
                <td className="px-4 py-3 text-right text-gray-400">{f.total_strings}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button
                    onClick={() => runPipeline(f.id)}
                    disabled={running[f.id]}
                    className="px-3 py-1 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 rounded text-xs font-medium transition-colors"
                  >
                    {running[f.id] ? 'Kör…' : 'Kör pipeline'}
                  </button>
                  <Link to="/review" className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-300">Granska</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {files.length === 0 && <div className="text-center py-12 text-gray-500">Inga filer hittade</div>}
      </div>
    </div>
  )
}
