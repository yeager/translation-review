import { useState, useEffect } from 'react'
import { api } from '../api'

const DEMO_FILES = [
  { file_id: 1, file_path: 'locale/sv/LC_MESSAGES/django.po', project_name: 'Main Website', dirty_count: 47, last_export_at: '2025-03-10T14:00:00Z', platform: 'weblate' },
  { file_id: 2, file_path: 'locale/sv/messages.po', project_name: 'Mobile App', dirty_count: 23, last_export_at: '2025-03-12T09:30:00Z', platform: 'transifex' },
  { file_id: 3, file_path: 'i18n/sv.po', project_name: 'Admin Panel', dirty_count: 12, last_export_at: '2025-03-08T16:00:00Z', platform: 'weblate' },
  { file_id: 4, file_path: 'translations/sv/app.po', project_name: 'API Docs', dirty_count: 5, last_export_at: null, platform: 'manual' },
]

export default function DirtyFiles() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getDirtyFilesList()
        setFiles(data.sort((a, b) => b.dirty_count - a.dirty_count))
      } catch {
        setFiles(DEMO_FILES)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Loading dirty files…</div>
  }

  const totalDirty = files.reduce((sum, f) => sum + f.dirty_count, 0)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dirty Files</h1>
        <span className="text-sm text-gray-500">{totalDirty} strings need pushing across {files.length} files</span>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left">
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">File</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Project</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Platform</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Changed</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Last Pushed</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {files.map((f) => (
              <tr key={f.file_id} className="hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3">
                  <span className="text-gray-300 font-mono text-xs">{f.file_path}</span>
                </td>
                <td className="px-4 py-3 text-gray-400">{f.project_name}</td>
                <td className="px-4 py-3">
                  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">{f.platform}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`font-mono font-bold ${f.dirty_count >= 20 ? 'text-red-400' : f.dirty_count >= 10 ? 'text-yellow-400' : 'text-gray-300'}`}>
                    {f.dirty_count}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {f.last_export_at ? new Date(f.last_export_at).toLocaleDateString() : 'Never'}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    disabled
                    className="px-3 py-1 bg-gray-800 text-gray-600 rounded text-xs cursor-not-allowed"
                    title="Push coming soon"
                  >
                    Push
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {files.length === 0 && (
          <div className="text-center py-12 text-gray-500">All files are up to date</div>
        )}
      </div>
    </div>
  )
}
