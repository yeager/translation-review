import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api'
import { useKeyboard } from '../hooks/useKeyboard'
import StringPanel from '../components/StringPanel'
import QualityBadge from '../components/QualityBadge'
import ProgressBar from '../components/ProgressBar'
import KeyboardHints from '../components/KeyboardHints'

// Demo data for when API is unavailable
const DEMO_STRINGS = [
  {
    id: 1,
    source: 'Welcome to the application. Please sign in to continue.',
    translation: 'Välkommen till applikationen. Vänligen logga in för att fortsätta.',
    status: 'pending',
    context: 'login_page.welcome',
    quality_level: 4,
    file_count: 47,
    checks: [
      { name: 'Punctuation', level: 'pass', message: 'Matches source' },
      { name: 'Length', level: 'pass', message: '120% of source' },
      { name: 'Terminology', level: 'review', message: '"application" → check preferred term' },
    ],
    tm_matches: [
      { source: 'Welcome to the app', translation: 'Välkommen till appen', score: 78 },
    ],
    reviews: [
      { id: 1, action: 'approved', reviewer_type: 'ai', notes: 'Quality looks good', created_at: '2025-03-15T10:00:00Z' },
    ],
  },
  {
    id: 2,
    source: 'Your session has expired. Please log in again.',
    translation: 'Din session har gått ut. Vänligen logga in igen.',
    status: 'pending',
    context: 'auth.session_expired',
    quality_level: 5,
    file_count: 12,
    checks: [
      { name: 'Punctuation', level: 'pass', message: 'OK' },
      { name: 'Length', level: 'pass', message: '105% of source' },
    ],
    tm_matches: [
      { source: 'Please log in again', translation: 'Vänligen logga in igen', score: 92 },
    ],
    reviews: [],
  },
  {
    id: 3,
    source: 'Are you sure you want to delete this item? This action cannot be undone.',
    translation: 'Är du säker på att du vill ta bort detta objekt? Denna åtgärd kan inte ångras.',
    status: 'pending',
    context: 'common.confirm_delete',
    quality_level: 4,
    file_count: 23,
    checks: [
      { name: 'Punctuation', level: 'pass', message: 'OK' },
      { name: 'Placeholders', level: 'pass', message: 'No placeholders' },
      { name: 'Formality', level: 'review', message: '"du" — check formal/informal policy' },
    ],
    tm_matches: [],
    reviews: [
      { id: 2, action: 'edited', reviewer_type: 'human', notes: 'Minor fix', created_at: '2025-03-14T08:00:00Z' },
    ],
  },
  {
    id: 4,
    source: 'Settings saved successfully.',
    translation: 'Inställningar sparade.',
    status: 'pending',
    context: 'settings.save_success',
    quality_level: 2,
    file_count: 8,
    checks: [
      { name: 'Punctuation', level: 'pass', message: 'OK' },
      { name: 'Completeness', level: 'fail', message: '"successfully" not translated' },
    ],
    tm_matches: [
      { source: 'Settings saved', translation: 'Inställningar sparade', score: 95 },
      { source: 'Saved successfully', translation: 'Sparades framgångsrikt', score: 72 },
    ],
    reviews: [],
  },
  {
    id: 5,
    source: 'Enter your email address to receive a password reset link.',
    translation: 'Ange din e-postadress för att få en länk för återställning av lösenord.',
    status: 'pending',
    context: 'auth.forgot_password',
    quality_level: 4,
    file_count: 3,
    checks: [
      { name: 'Punctuation', level: 'pass', message: 'OK' },
      { name: 'Length', level: 'review', message: '135% of source — may overflow UI' },
      { name: 'Terminology', level: 'pass', message: 'OK' },
    ],
    tm_matches: [],
    reviews: [],
  },
  {
    id: 6,
    source: 'No results found. Try adjusting your search criteria.',
    translation: 'Inga resultat hittades. Försök justera dina sökkriterier.',
    status: 'pending',
    context: 'search.no_results',
    quality_level: 5,
    file_count: 15,
    checks: [
      { name: 'Punctuation', level: 'pass', message: 'OK' },
      { name: 'Length', level: 'pass', message: '102% of source' },
    ],
    tm_matches: [
      { source: 'No results found', translation: 'Inga resultat hittades', score: 100 },
    ],
    reviews: [
      { id: 3, action: 'approved', reviewer_type: 'ai', notes: null, created_at: '2025-03-13T12:00:00Z' },
    ],
  },
  {
    id: 7,
    source: 'Upload failed. The file exceeds the maximum size of {max_size} MB.',
    translation: 'Uppladdningen misslyckades. Filen överskrider maxstorleken på {max_size} MB.',
    status: 'pending',
    context: 'upload.error_size',
    quality_level: 5,
    file_count: 2,
    checks: [
      { name: 'Placeholders', level: 'pass', message: '{max_size} preserved' },
      { name: 'Punctuation', level: 'pass', message: 'OK' },
    ],
    tm_matches: [],
    reviews: [],
  },
  {
    id: 8,
    source: 'You have {count} unread notifications.',
    translation: 'Du har {count} olästa meddelanden.',
    status: 'pending',
    context: 'notifications.badge',
    quality_level: 2,
    file_count: 31,
    checks: [
      { name: 'Placeholders', level: 'pass', message: '{count} preserved' },
      { name: 'Terminology', level: 'fail', message: '"notifications" → "aviseringar" not "meddelanden"' },
    ],
    tm_matches: [
      { source: 'You have {count} notifications', translation: 'Du har {count} aviseringar', score: 88 },
    ],
    reviews: [
      { id: 4, action: 'rejected', reviewer_type: 'ai', notes: 'Wrong terminology', created_at: '2025-03-15T07:00:00Z' },
    ],
  },
]

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

function DiffView({ original, edited }) {
  if (original === edited) return null
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Changes</div>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-xs text-red-400 mb-1">Old</div>
          <div className="text-gray-400 bg-red-900/10 rounded p-2 border border-red-900/30">{original}</div>
        </div>
        <div>
          <div className="text-xs text-emerald-400 mb-1">New</div>
          <div className="text-gray-200 bg-emerald-900/10 rounded p-2 border border-emerald-900/30">{edited}</div>
        </div>
      </div>
    </div>
  )
}

export default function Review() {
  const { queueId } = useParams()
  const [strings, setStrings] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [queueName, setQueueName] = useState('')
  const [originalTranslation, setOriginalTranslation] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [queue, strs] = await Promise.all([
          api.getQueue(queueId),
          api.getQueueStrings(queueId),
        ])
        setQueueName(queue.name)
        setStrings(strs.map((s) => ({ ...s, status: s.status || 'pending' })))
      } catch {
        setQueueName(`Review Queue #${queueId}`)
        setStrings(DEMO_STRINGS)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [queueId])

  const current = strings[currentIndex]

  // Track original translation for diff view
  useEffect(() => {
    if (current) setOriginalTranslation(current.translation)
  }, [currentIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  const goNext = useCallback(() => {
    setEditing(false)
    setCurrentIndex((i) => Math.min(i + 1, strings.length - 1))
  }, [strings.length])

  const goPrev = useCallback(() => {
    setEditing(false)
    setCurrentIndex((i) => Math.max(i - 1, 0))
  }, [])

  const approve = useCallback(() => {
    if (editing || !current) return
    setStrings((prev) =>
      prev.map((s, i) => (i === currentIndex ? { ...s, status: 'approved' } : s)),
    )
    api.approveString(current.id).catch(() => {})
    const nextUnreviewed = strings.findIndex(
      (s, i) => i > currentIndex && s.status === 'pending',
    )
    if (nextUnreviewed !== -1) {
      setCurrentIndex(nextUnreviewed)
    } else {
      goNext()
    }
  }, [editing, current, currentIndex, strings, goNext])

  const reject = useCallback(() => {
    if (editing || !current) return
    setStrings((prev) =>
      prev.map((s, i) => (i === currentIndex ? { ...s, status: 'rejected' } : s)),
    )
    api.rejectString(current.id).catch(() => {})
    const nextUnreviewed = strings.findIndex(
      (s, i) => i > currentIndex && s.status === 'pending',
    )
    if (nextUnreviewed !== -1) {
      setCurrentIndex(nextUnreviewed)
    } else {
      goNext()
    }
  }, [editing, current, currentIndex, strings, goNext])

  const startEdit = useCallback(() => {
    if (!editing) setEditing(true)
  }, [editing])

  const saveEdit = useCallback(
    (newText) => {
      if (!current) return
      setStrings((prev) =>
        prev.map((s, i) =>
          i === currentIndex ? { ...s, translation: newText } : s,
        ),
      )
      api.editString(current.id, newText).catch(() => {})
      setEditing(false)
    },
    [current, currentIndex],
  )

  const exitEdit = useCallback(() => {
    setEditing(false)
  }, [])

  const bindings = useMemo(
    () => ({
      g: approve,
      a: reject,
      e: startEdit,
      j: goNext,
      k: goPrev,
      escape: exitEdit,
    }),
    [approve, reject, startEdit, goNext, goPrev, exitEdit],
  )

  useKeyboard(bindings)

  const stats = useMemo(() => {
    const reviewed = strings.filter((s) => s.status !== 'pending').length
    const approved = strings.filter((s) => s.status === 'approved').length
    const rejected = strings.filter((s) => s.status === 'rejected').length
    return { total: strings.length, reviewed, approved, rejected }
  }, [strings])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Loading review queue…
      </div>
    )
  }

  if (!current) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <div className="text-2xl text-gray-400 mb-4">Queue is empty</div>
        <Link to="/" className="text-blue-400 hover:text-blue-300">
          Back to dashboard
        </Link>
      </div>
    )
  }

  const allDone = stats.reviewed === stats.total
  const wasEdited = current.translation !== originalTranslation

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← Back
          </Link>
          <h1 className="text-lg font-semibold">{queueName}</h1>
        </div>
        <div className="text-sm text-gray-500 font-mono">
          {currentIndex + 1} / {strings.length}
        </div>
      </div>

      {/* Progress */}
      <ProgressBar {...stats} />

      {/* All done banner */}
      {allDone && (
        <div className="bg-emerald-900/30 border border-emerald-800 rounded-lg p-4 text-center text-emerald-300">
          All strings reviewed! Score:{' '}
          <span className="font-bold">
            {stats.total > 0
              ? Math.round((stats.approved / stats.total) * 100)
              : 0}
            %
          </span>{' '}
          approved
        </div>
      )}

      {/* String context + metadata */}
      <div className="flex items-center gap-3 flex-wrap">
        {current.context && (
          <span className="text-xs font-mono text-gray-600">{current.context}</span>
        )}
        {current.quality_level != null && (
          <QualityLevelBadge level={current.quality_level} />
        )}
        {current.file_count != null && (
          <span className="text-xs text-gray-500">
            Used in {current.file_count} file{current.file_count !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Source + Translation panels */}
      <StringPanel
        source={current.source}
        translation={current.translation}
        editing={editing}
        onSave={saveEdit}
        status={current.status}
      />

      {/* Diff view when translation was edited */}
      {wasEdited && <DiffView original={originalTranslation} edited={current.translation} />}

      {/* Quality checks */}
      {current.checks && current.checks.length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Quality Checks
          </div>
          <div className="flex flex-wrap gap-2">
            {current.checks.map((check, i) => (
              <QualityBadge key={i} check={check} />
            ))}
          </div>
        </div>
      )}

      {/* Existing reviews */}
      {current.reviews && current.reviews.length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Previous Reviews
          </div>
          <div className="space-y-1.5">
            {current.reviews.map((rev) => (
              <div key={rev.id} className="flex items-center gap-3 text-sm bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                  rev.action === 'approved' ? 'bg-emerald-900/50 text-emerald-300' :
                  rev.action === 'rejected' ? 'bg-red-900/50 text-red-300' :
                  'bg-blue-900/50 text-blue-300'
                }`}>{rev.action}</span>
                <span className={`px-1.5 py-0.5 rounded text-xs ${
                  rev.reviewer_type === 'ai' ? 'bg-purple-900/50 text-purple-300' : 'bg-gray-800 text-gray-400'
                }`}>{rev.reviewer_type}</span>
                {rev.notes && <span className="text-xs text-gray-400 flex-1">{rev.notes}</span>}
                <span className="text-xs text-gray-600 ml-auto">{new Date(rev.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Translation Memory */}
      {current.tm_matches && current.tm_matches.length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Translation Memory
          </div>
          <div className="space-y-2">
            {current.tm_matches.map((tm, i) => (
              <div
                key={i}
                className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-start gap-4"
              >
                <span
                  className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                    tm.score >= 90
                      ? 'bg-emerald-900/50 text-emerald-400'
                      : tm.score >= 70
                        ? 'bg-yellow-900/50 text-yellow-400'
                        : 'bg-gray-800 text-gray-400'
                  }`}
                >
                  {tm.score}%
                </span>
                <div className="flex-1 grid grid-cols-2 gap-4 text-sm">
                  <div className="text-gray-400">{tm.source}</div>
                  <div className="text-gray-200">{tm.translation}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Keyboard hints */}
      <div className="pt-3 border-t border-gray-800/50">
        <KeyboardHints editing={editing} />
      </div>

      {/* Mobile action buttons (hidden on desktop where keyboard is used) */}
      <div className="flex gap-3 lg:hidden">
        <button
          onClick={goPrev}
          className="px-4 py-2.5 bg-gray-800 rounded-lg text-sm border border-gray-700"
        >
          ← Prev
        </button>
        <button
          onClick={approve}
          className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-sm font-medium transition-colors"
        >
          Approve
        </button>
        <button
          onClick={reject}
          className="flex-1 py-2.5 bg-red-700 hover:bg-red-600 rounded-lg text-sm font-medium transition-colors"
        >
          Reject
        </button>
        <button
          onClick={startEdit}
          className="px-4 py-2.5 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm border border-blue-600"
        >
          Edit
        </button>
        <button
          onClick={goNext}
          className="px-4 py-2.5 bg-gray-800 rounded-lg text-sm border border-gray-700"
        >
          Next →
        </button>
      </div>
    </div>
  )
}
