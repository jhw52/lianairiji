import { useEffect, useState } from 'react'
import { subscribeNotice } from '../lib/notice'

/** 顶部浮出的提醒条，5 秒后自动消失 */
export function SiteToast() {
  const [text, setText] = useState('')
  const [show, setShow] = useState(false)

  useEffect(() => subscribeNotice((t) => {
    setText(t)
    setShow(true)
  }), [])

  useEffect(() => {
    if (!show) return
    const t = setTimeout(() => setShow(false), 5000)
    return () => clearTimeout(t)
  }, [show, text])

  if (!show) return null

  return (
    <div className="site-toast">
      <span className="site-toast-dot" />
      {text}
    </div>
  )
}
