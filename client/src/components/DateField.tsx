import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

export function isValidDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

function mask(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 4) return d
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`
}

/**
 * 日期输入：只接受 4 位年份的 YYYY-MM-DD，不再出现「年 / 月 / 日」分段占位。
 * 右侧按钮可唤起系统日历。
 */
export function DateField({
  value, onChange, placeholder = 'YYYY-MM-DD'
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [text, setText] = useState(value || '')
  const [bad, setBad] = useState(false)
  const native = useRef<HTMLInputElement>(null)

  useEffect(() => { setText(value || '') }, [value])

  const commit = (v: string) => {
    setText(v)
    onChange(v)
    setBad(false)
  }

  return (
    <div className="date-field">
      <input
        className="input"
        value={text}
        placeholder={placeholder}
        inputMode="numeric"
        onChange={(e) => {
          const out = mask(e.target.value)
          setText(out)
          setBad(false)
          if (out.length === 10) {
            if (isValidDate(out)) { onChange(out) } else { setBad(true) }
          }
        }}
        onBlur={() => {
          if (!text) { onChange(''); return }
          if (!isValidDate(text)) {
            setBad(true)
            setText(value || '')
            window.setTimeout(() => setBad(false), 1800)
          }
        }}
      />
      <button
        type="button"
        className="date-field-btn"
        aria-label="打开日历"
        onClick={() => {
          const el = native.current
          if (!el) return
          if (typeof (el as any).showPicker === 'function') (el as any).showPicker()
          else el.focus()
        }}
      >
        <Icon name="calendar" size={15} />
      </button>
      <input
        ref={native}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className="date-field-native"
        value={isValidDate(text) ? text : ''}
        onChange={(e) => {
          if (e.target.value && isValidDate(e.target.value)) commit(e.target.value)
        }}
      />
      {bad && (
        <span className="date-field-hint">日期不完整或超出范围</span>
      )}
    </div>
  )
}
