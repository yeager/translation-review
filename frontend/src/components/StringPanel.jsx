import { useState, useEffect, useRef } from 'react'

export default function StringPanel({
  source,
  translation,
  editing,
  onSave,
  status,
}) {
  const [editText, setEditText] = useState(translation || '')
  const textareaRef = useRef(null)

  useEffect(() => {
    setEditText(translation || '')
  }, [translation])

  // Reset editText to original when exiting edit mode (Esc)
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.selectionStart = textareaRef.current.value.length
    }
    if (!editing) {
      setEditText(translation || '')
    }
  }, [editing, translation])

  const statusBorder = {
    approved: 'border-l-emerald-500',
    rejected: 'border-l-red-500',
    pending: 'border-l-gray-700',
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Source panel */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-5">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
          Source — English
        </div>
        <div className="text-lg leading-relaxed text-gray-200 whitespace-pre-wrap font-light">
          {source}
        </div>
      </div>

      {/* Translation panel */}
      <div
        className={`bg-gray-900 rounded-lg border border-gray-800 border-l-4 ${statusBorder[status] || statusBorder.pending} p-5`}
      >
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
          Translation — Swedish
          {status && status !== 'pending' && (
            <span
              className={`ml-2 ${status === 'approved' ? 'text-emerald-500' : 'text-red-500'}`}
            >
              ({status})
            </span>
          )}
        </div>

        {editing ? (
          <div>
            <textarea
              ref={textareaRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  onSave(editText)
                }
              }}
              className="w-full bg-gray-800 text-lg leading-relaxed text-gray-100 rounded-md p-3 border border-blue-600 focus:border-blue-400 focus:outline-none resize-y min-h-[100px] font-light"
              rows={4}
            />
            <div className="text-xs text-gray-500 mt-2">
              Cmd/Ctrl+Enter to save · Esc to cancel
            </div>
          </div>
        ) : (
          <div className="text-lg leading-relaxed text-gray-200 whitespace-pre-wrap font-light">
            {translation || (
              <span className="text-gray-600 italic">No translation</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
