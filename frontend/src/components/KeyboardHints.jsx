import React from 'react'

const hints = [
  { key: 'G', label: 'Approve (Godkänn)', color: 'text-emerald-400' },
  { key: 'A', label: 'Reject (Avvisa)', color: 'text-red-400' },
  { key: 'E', label: 'Edit translation', color: 'text-blue-400' },
  { key: 'J', label: 'Next string', color: 'text-gray-400' },
  { key: 'K', label: 'Previous string', color: 'text-gray-400' },
  { key: 'Esc', label: 'Exit edit mode', color: 'text-gray-500' },
]

export default function KeyboardHints({ editing }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {hints.map(({ key, label, color }) => (
        <span
          key={key}
          className={`flex items-center gap-1.5 ${editing && key !== 'Esc' ? 'opacity-30' : 'opacity-70'}`}
        >
          <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-300 font-mono text-[11px]">
            {key}
          </kbd>
          <span className={color}>{label}</span>
        </span>
      ))}
    </div>
  )
}
