import { useState, useCallback } from 'react'
import { api } from '../api'

const DEMO_RESULTS = [
  { id: 1, msgid: 'Welcome to the application', msgstr: 'Välkommen till applikationen', quality_level: 4, file_count: 47, last_reviewed: '2025-03-15' },
  { id: 2, msgid: 'Settings saved successfully', msgstr: 'Inställningar sparade', quality_level: 2, file_count: 12, last_reviewed: '2025-03-14' },
  { id: 3, msgid: 'Are you sure you want to delete?', msgstr: 'Är du säker på att du vill ta bort?', quality_level: 5, file_count: 23, last_reviewed: null },
  { id: 4, msgid: 'No results found', msgstr: 'Inga resultat hittades', quality_level: 5, file_count: 8, last_reviewed: '2025-03-12' },
]

const DEMO_DETAIL = {
  id: 1,
  msgid: 'Welcome to the application',
  msgstr: 'Välkommen till applikationen',
  quality_level: 4,
  files: [
    { id: 1, path: 'locale/sv/LC_MESSAGES/django.po', project: 'Main Website' },
    { id: 2, path: 'locale/sv/messages.po', project: 'Mobile App' },
    { id: 3, path: 'i18n/sv.po', project: 'Admin Panel' },
  ],
  reviews: [
    { id: 1, action: 'approved', reviewer_type: 'ai', notes: 'Quality looks good', created_at: '2025-03-15T10:00:00Z' },
    { id: 2, action: 'edited', reviewer_type: 'human', notes: 'Minor tweak', created_at: '2025-03-14T08:00:00Z' },
  ],
  quality_checks: [
    { name: 'Punctuation', level: 'pass', message: 'OK' },
    { name: 'Terminology', level: 'review', message: '"application" → check preferred term' },
  ],
}

function QualityLevelBadge({ level }) {
  const colors = {
    1: 'bg-red-900/50 text-red-300 border-red-700',
    2: 'bg-orange-900/50 text-orange-300 border-orange-700',
    3: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
    4: 'bg-blue-900/50 text-blue-300 border-blue-700',
    5: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${colors[level] || colors[3]}`}>
      Q{level}
    </span>
  )
}

export default function Search() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')

  const doSearch = useCallback(async () => {
    if (!query.trim()) return
    setLoading(true)
    setSelected(null)
    setDetail(null)
    try {
      const data = await api.searchStrings(query)
      setResults(data)
    } catch {
      setResults(DEMO_RESULTS.filter(r =>
        r.msgid.toLowerCase().includes(query.toLowerCase()) ||
        r.msgstr.toLowerCase().includes(query.toLowerCase())
      ))
    } finally {
      setLoading(false)
    }
  }, [query])

  const selectResult = useCallback(async (item) => {
    setSelected(item.id)
    setEditing(false)
    try {
      const data = await api.getStringDetail(item.id)
      setDetail(data)
    } catch {
      setDetail({ ...DEMO_DETAIL, id: item.id, msgid: item.msgid, msgstr: item.msgstr, quality_level: item.quality_level })
    }
  }, [])

  const startEdit = () => {
    if (detail) {
      setEditText(detail.msgstr)
      setEditing(true)
    }
  }

  const saveEdit = async () => {
    if (!detail) return
    try {
      await api.editString(detail.id, editText)
    } catch {}
    setDetail({ ...detail, msgstr: editText })
    setEditing(false)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Search Strings</h1>

      {/* Search box */}
      <div className="flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()}
          placeholder="Search msgid or msgstr..."
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={doSearch}
          disabled={loading}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Results list */}
        <div className="space-y-2">
          {results && results.length === 0 && (
            <div className="text-gray-500 text-sm py-8 text-center">No results found</div>
          )}
          {results && results.map((r) => (
            <button
              key={r.id}
              onClick={() => selectResult(r)}
              className={`w-full text-left bg-gray-900 border rounded-lg p-4 transition-colors ${
                selected === r.id ? 'border-blue-500' : 'border-gray-800 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <QualityLevelBadge level={r.quality_level} />
                <span className="text-xs text-gray-500">{r.file_count} files</span>
                {r.last_reviewed && (
                  <span className="text-xs text-gray-600 ml-auto">{r.last_reviewed}</span>
                )}
              </div>
              <div className="text-sm text-gray-300 truncate">{r.msgid}</div>
              <div className="text-sm text-gray-500 truncate">{r.msgstr}</div>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        {detail && (
          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
              <div className="flex items-center gap-2">
                <QualityLevelBadge level={detail.quality_level} />
                <span className="text-xs text-gray-500">{detail.files?.length || 0} files use this string</span>
              </div>

              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Source</div>
                <div className="text-sm text-gray-200">{detail.msgid}</div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Translation</div>
                  {!editing && (
                    <button onClick={startEdit} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
                  )}
                </div>
                {editing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full bg-gray-800 text-sm text-gray-100 rounded-md p-3 border border-blue-600 focus:outline-none resize-y min-h-[80px]"
                      rows={3}
                    />
                    <div className="bg-yellow-900/30 border border-yellow-800 rounded px-3 py-2 text-xs text-yellow-300">
                      This will update {detail.files?.length || 0} files
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveEdit} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium">Save</button>
                      <button onClick={() => setEditing(false)} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-200">{detail.msgstr}</div>
                )}
              </div>
            </div>

            {/* Files */}
            {detail.files && detail.files.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Files using this string</div>
                <div className="space-y-1.5">
                  {detail.files.map((f) => (
                    <div key={f.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-300 font-mono text-xs truncate">{f.path}</span>
                      <span className="text-gray-500 text-xs shrink-0 ml-2">{f.project}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reviews */}
            {detail.reviews && detail.reviews.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Reviews</div>
                <div className="space-y-2">
                  {detail.reviews.map((rev) => (
                    <div key={rev.id} className="flex items-start gap-3 text-sm">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        rev.action === 'approved' ? 'bg-emerald-900/50 text-emerald-300' :
                        rev.action === 'rejected' ? 'bg-red-900/50 text-red-300' :
                        'bg-blue-900/50 text-blue-300'
                      }`}>{rev.action}</span>
                      <span className="text-xs text-gray-500">{rev.reviewer_type}</span>
                      {rev.notes && <span className="text-xs text-gray-400">{rev.notes}</span>}
                      <span className="text-xs text-gray-600 ml-auto">{new Date(rev.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quality checks */}
            {detail.quality_checks && detail.quality_checks.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Quality Checks</div>
                <div className="flex flex-wrap gap-2">
                  {detail.quality_checks.map((check, i) => {
                    const colors = {
                      pass: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
                      review: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
                      fail: 'bg-red-900/50 text-red-300 border-red-700',
                    }
                    return (
                      <span key={i} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs ${colors[check.level] || colors.review}`}>
                        {check.name} {check.message && <span className="opacity-70">— {check.message}</span>}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
