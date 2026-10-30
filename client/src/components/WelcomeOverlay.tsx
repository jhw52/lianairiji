import { useEffect } from 'react'

export function WelcomeOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="welcome-mask" aria-hidden="true">
      <div className="welcome-inner">
        <div className="welcome-icon">🌷</div>
        <div className="welcome-text">欢迎回家～</div>
        <div className="welcome-sub">今天也要好好记录呀</div>
      </div>
    </div>
  )
}
