import React from 'react'

const styles = {
  pass: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  review: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  fail: 'bg-red-900/50 text-red-300 border-red-700',
}

const icons = {
  pass: '✓',
  review: '⚠',
  fail: '✗',
}

export default function QualityBadge({ check }) {
  const level = (check.level || 'review').toLowerCase()
  const style = styles[level] || styles.review

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-medium ${style}`}
    >
      <span>{icons[level]}</span>
      <span>{check.name}</span>
      {check.message && (
        <span className="opacity-70 ml-1">— {check.message}</span>
      )}
    </span>
  )
}
