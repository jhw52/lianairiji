import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ breaks: true, gfm: true })

export function Markdown({ text, className = '' }: { text?: string; className?: string }) {
  const html = useMemo(() => {
    if (!text) return ''
    const raw = marked.parse(text) as string
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
  }, [text])
  if (!text) return null
  return <div className={`markdown ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
}
