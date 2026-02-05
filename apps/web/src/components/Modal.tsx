import { useEffect } from 'react'

export function Modal({
  title,
  children,
  onClose,
  actions,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
  actions?: React.ReactNode
}) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 px-4 py-8">
      <div className="w-full max-w-lg rounded-3xl border border-clay bg-white p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-ink">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-full border border-clay px-3 py-1 text-xs uppercase tracking-wide text-cocoa"
          >
            Close
          </button>
        </div>
        <div className="space-y-4">{children}</div>
        {actions ? <div className="mt-6 flex items-center justify-end gap-3">{actions}</div> : null}
      </div>
    </div>
  )
}
