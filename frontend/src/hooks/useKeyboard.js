import { useEffect, useCallback } from 'react'

export function useKeyboard(bindings, enabled = true) {
  const handler = useCallback(
    (e) => {
      if (!enabled) return

      // Don't capture when typing in inputs/textareas (unless Escape)
      const tag = e.target.tagName
      if ((tag === 'INPUT' || tag === 'TEXTAREA') && e.key !== 'Escape') return

      const key = e.key.toLowerCase()
      const binding = bindings[key]
      if (binding) {
        e.preventDefault()
        binding(e)
      }
    },
    [bindings, enabled],
  )

  useEffect(() => {
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handler])
}
