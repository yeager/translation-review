import React from 'react'

export default function ProgressBar({ total, reviewed, approved, rejected }) {
  const pct = total > 0 ? Math.round((reviewed / total) * 100) : 0
  const approvedPct = total > 0 ? (approved / total) * 100 : 0
  const rejectedPct = total > 0 ? (rejected / total) * 100 : 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">
          {reviewed}/{total} reviewed ({pct}%)
        </span>
        <div className="flex gap-4 text-xs">
          <span className="text-emerald-400">✓ {approved} approved</span>
          <span className="text-red-400">✗ {rejected} rejected</span>
          <span className="text-gray-500">{total - reviewed} remaining</span>
        </div>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden flex">
        <div
          className="bg-emerald-500 transition-all duration-300"
          style={{ width: `${approvedPct}%` }}
        />
        <div
          className="bg-red-500 transition-all duration-300"
          style={{ width: `${rejectedPct}%` }}
        />
      </div>
    </div>
  )
}
