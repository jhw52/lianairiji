import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icon'

export function Modal({
  title, children, onClose, maxWidth = 520
}: {
  title: string
  children: ReactNode
  onClose: () => void
  maxWidth?: number
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto p-4 md:p-8"
      style={{ background: 'rgba(26,22,18,.5)' }}
      onClick={onClose}
    >
      <div
        className="card mx-auto p-6 fade-up"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[18px]" style={{ fontFamily: 'var(--font-serif)' }}>{title}</h3>
          <button className="btn-ghost p-1.5 rounded-md" onClick={onClose} aria-label="关闭">
            <Icon name="x" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
