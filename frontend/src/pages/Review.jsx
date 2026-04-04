import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useKeyboard } from '../hooks/useKeyboard'
import QualityBadge from '../components/QualityBadge'

export default function Review() {
  const [strings, setStrings] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [loading, setLoading] = useState(true)
  const [tmSuggestions, setTmSuggestions] = useState([])
  const [stats, setStats] = useState(null)
  const [maxQuality, setMaxQuality] = useState(7)
  const LIMIT = 50

  const loadBatch = useCallback(async (off = 0) => {
    setLoading(true)
    try {
      const [batch, st] = await Promise.all([
        api.getReviewBatch({ offset: off, limit: LIMIT, max_quality: maxQuality }),
        api.getReviewStats(),
      ])
      setStrings(batch.strings || [])
      setTotal(batch.total || 0)
      setOffset(off)
      setStats(st)
      setCurrentIndex(0)
      setEditing(false)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [maxQuality])

  useEffect(() => { loadBatch(0) }, [loadBatch])

  const current = strings[currentIndex]

  // Load TM when current changes
  useEffect(() => {
    if (!current) return
    setTmSuggestions([])
    api.searchTM(current.msgid).then(r => setTmSuggestions(r || [])).catch(() => {})
  }, [current?.string_id])

  const goNext = useCallback(() => {
    setEditing(false)
    if (currentIndex < strings.length - 1) {
      setCurrentIndex(i => i + 1)
    } else if (offset + LIMIT < total) {
      loadBatch(offset + LIMIT)
    }
  }, [currentIndex, strings.length, offset, total, loadBatch])

  const goPrev = useCallback(() => {
    setEditing(false)
    setCurrentIndex(i => Math.max(i - 1, 0))
  }, [])

  const decide = useCallback(async (action, msgstr) => {
    if (!current || editing) return
    try {
      await api.reviewDecide(current.translation_id, { action, msgstr })
      setStrings(prev => prev.map((s, i) => i === currentIndex ? { ...s, _decided: action } : s))
      goNext()
    } catch (e) {
      console.error(e)
    }
  }, [current, currentIndex, editing, goNext])

  const approve = useCallback(() => decide('approve'), [decide])
  const reject = useCallback(() => decide('reject'), [decide])

  const startEdit = useCallback(() => {
    if (!current) return
    setEditText(current.msgstr || '')
    setEditing(true)
  }, [current])

  const saveEdit = useCallback(async () => {
    if (!current) return
    await decide('edit', editText)
    setEditing(false)
  }, [current, editText, decide])

  const useTM = useCallback((idx) => {
    if (!tmSuggestions[idx]) return
    setEditText(tmSuggestions[idx].target)
    setEditing(true)
  }, [tmSuggestions])

  const bindings = useMemo(() => ({
    g: approve,
    a: reject,
    e: startEdit,
    j: goNext,
    k: goPrev,
    escape: () => setEditing(false),
    '1': () => useTM(0),
    '2': () => useTM(1),
    '3': () => useTM(2),
  }), [approve, reject, startEdit, goNext, goPrev, useTM])

  useKeyboard(bindings, !editing)

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Laddar granskning…</div>

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Granskningssats</h1>
        <div className="flex items-center gap-4">
          <label className="text-xs text-gray-500">Max kvalitet:
            <select value={maxQuality} onChange={e => setMaxQuality(Number(e.target.value))} className="ml-2 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200">
              {[3,5,7,10].map(v => <option key={v} value={v}>≤ Q{v}</option>)}
            </select>
          </label>
          <span className="text-sm text-gray-500 font-mono">{total} strängar totalt</span>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500">Totalt granskade</div>
            <div className="text-xl font-bold text-gray-100">{stats.total}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500">Idag</div>
            <div className="text-xl font-bold text-blue-400">{stats.today}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500">Per typ</div>
            <div className="text-sm text-gray-300">{stats.by_type ? JSON.stringify(stats.by_type) : '—'}</div>
          </div>
        </div>
      )}

      {!current ? (
        <div className="text-center py-20 text-gray-500">Inga strängar att granska med dessa filter</div>
      ) : (
        <>
          {/* Navigation */}
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Sträng {offset + currentIndex + 1} av {total}</span>
            <div className="flex gap-2">
              <button onClick={goPrev} disabled={currentIndex === 0} className="px-3 py-1 bg-gray-800 rounded text-xs disabled:opacity-30">← K</button>
              <button onClick={goNext} className="px-3 py-1 bg-gray-800 rounded text-xs">J →</button>
            </div>
          </div>

          {/* Current string */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-gray-900 rounded-lg border border-gray-800 p-5">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Källa (msgid)</div>
              <div className="text-base text-gray-200 whitespace-pre-wrap">{current.msgid}</div>
            </div>
            <div className={`bg-gray-900 rounded-lg border border-gray-800 border-l-4 ${current._decided === 'approve' ? 'border-l-emerald-500' : current._decided === 'reject' ? 'border-l-red-500' : 'border-l-gray-700'} p-5`}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-gray-500 uppercase tracking-wider">Översättning (msgstr)</div>
                <QualityBadge level={current.quality_level} />
              </div>
              {editing ? (
                <div>
                  <textarea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit() } }}
                    className="w-full bg-gray-800 text-base text-gray-100 rounded-md p-3 border border-blue-600 focus:outline-none resize-y min-h-[80px]"
                    rows={3}
                    autoFocus
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={saveEdit} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium">Spara (Cmd+Enter)</button>
                    <button onClick={() => setEditing(false)} className="px-3 py-1.5 bg-gray-700 rounded text-xs">Avbryt (Esc)</button>
                  </div>
                </div>
              ) : (
                <div className="text-base text-gray-200 whitespace-pre-wrap">{current.msgstr || <span className="text-gray-600 italic">Ingen översättning</span>}</div>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {current.source && <span className="bg-gray-800 px-2 py-0.5 rounded">{current.source}</span>}
            {current.updated_at && <span>Uppdaterad: {new Date(current.updated_at).toLocaleString('sv-SE')}</span>}
          </div>

          {/* TM suggestions */}
          {tmSuggestions.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">TM-förslag (tryck 1-3)</div>
              <div className="space-y-2">
                {tmSuggestions.slice(0, 3).map((tm, i) => (
                  <button key={i} onClick={() => useTM(i)} className="w-full text-left bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-lg p-3 flex items-start gap-3 transition-colors">
                    <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-xs font-mono text-gray-400">{i + 1}</kbd>
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                      tm.quality >= 90 ? 'bg-emerald-900/50 text-emerald-400' :
                      tm.quality >= 70 ? 'bg-yellow-900/50 text-yellow-400' :
                      'bg-gray-800 text-gray-400'
                    }`}>{tm.quality}%</span>
                    <div className="flex-1 grid grid-cols-2 gap-4 text-sm">
                      <div className="text-gray-400">{tm.source}</div>
                      <div className="text-gray-200">{tm.target}</div>
                    </div>
                    <span className="text-xs text-gray-600">{tm.origin}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button onClick={approve} className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-sm font-medium transition-colors">
              ✓ Godkänn (G)
            </button>
            <button onClick={reject} className="flex-1 py-2.5 bg-red-700 hover:bg-red-600 rounded-lg text-sm font-medium transition-colors">
              ✗ Avvisa (A)
            </button>
            <button onClick={startEdit} className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm font-medium transition-colors">
              ✎ Redigera (E)
            </button>
          </div>

          {/* Keyboard hints */}
          <div className="flex flex-wrap gap-3 text-xs border-t border-gray-800 pt-3">
            {[
              { key: 'G', label: 'Godkänn', color: 'text-emerald-400' },
              { key: 'A', label: 'Avvisa', color: 'text-red-400' },
              { key: 'E', label: 'Redigera', color: 'text-blue-400' },
              { key: 'J', label: 'Nästa', color: 'text-gray-400' },
              { key: 'K', label: 'Föregående', color: 'text-gray-400' },
              { key: '1-3', label: 'TM-förslag', color: 'text-yellow-400' },
              { key: 'Esc', label: 'Avbryt', color: 'text-gray-500' },
            ].map(h => (
              <span key={h.key} className={`flex items-center gap-1.5 ${editing ? 'opacity-30' : ''}`}>
                <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-300 font-mono text-[11px]">{h.key}</kbd>
                <span className={h.color}>{h.label}</span>
              </span>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm">
            <button onClick={() => loadBatch(Math.max(0, offset - LIMIT))} disabled={offset === 0} className="px-4 py-2 bg-gray-800 rounded disabled:opacity-30 text-xs">← Föregående sida</button>
            <span className="text-gray-500">Sida {Math.floor(offset / LIMIT) + 1} av {Math.ceil(total / LIMIT)}</span>
            <button onClick={() => loadBatch(offset + LIMIT)} disabled={offset + LIMIT >= total} className="px-4 py-2 bg-gray-800 rounded disabled:opacity-30 text-xs">Nästa sida →</button>
          </div>
        </>
      )}
    </div>
  )
}
