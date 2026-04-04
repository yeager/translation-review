export default function QualityBadge({ level }) {
  if (level == null) return null
  const q = Number(level)
  let color
  if (q <= 2) color = 'bg-red-900/50 text-red-300 border-red-700'
  else if (q <= 3) color = 'bg-orange-900/50 text-orange-300 border-orange-700'
  else if (q <= 5) color = 'bg-yellow-900/50 text-yellow-300 border-yellow-700'
  else if (q <= 7) color = 'bg-blue-900/50 text-blue-300 border-blue-700'
  else color = 'bg-emerald-900/50 text-emerald-300 border-emerald-700'

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${color}`}>
      Q{q}
    </span>
  )
}
