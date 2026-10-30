import { useRef, useState } from 'react'
import { Icon } from './Icon'
import { uploadFiles } from '../lib/api'

export function Uploader({
  albumId, onDone, hint
}: {
  albumId?: string
  onDone?: (count: number) => void
  hint?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [ratio, setRatio] = useState(0)
  const [drag, setDrag] = useState(false)
  const [msg, setMsg] = useState('')

  const handle = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => true)
    if (!files.length) return
    setBusy(true)
    setMsg('')
    let done = 0
    let failed = 0
    try {
      for (let i = 0; i < files.length; i += 10) {
        const chunk = files.slice(i, i + 10)
        const res = await uploadFiles(chunk, { albumId }, (r) => setRatio((i + r * chunk.length) / files.length))
        for (const r of res.results) {
          if (r.ok) done++
          else failed++
        }
      }
      setMsg(failed ? `完成 ${done} 个，${failed} 个失败` : `已上传 ${done} 个`)
      onDone?.(done)
      setTimeout(() => setMsg(''), 4000)
    } catch (e: any) {
      setMsg(e.message || '上传失败')
    } finally {
      setBusy(false)
      setRatio(0)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div
      className="card px-5 py-4 transition-colors"
      style={{
        borderStyle: drag ? 'dashed' : 'solid',
        borderColor: drag ? '#c0705f' : undefined,
        background: drag ? '#fdf5ef' : undefined
      }}
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        handle(e.dataTransfer.files)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => e.target.files && handle(e.target.files)}
      />
      <div className="flex items-center gap-4 flex-wrap">
        <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: '#f6ecdd', color: '#a3806a' }}>
          <Icon name="upload" size={19} />
        </div>
        <div className="flex-1 min-w-[180px]">
          <div className="text-[14px]">把照片拖进来，或者</div>
          <div className="text-[12px]" style={{ color: 'var(--color-faint)' }}>
            {hint || '自动读取拍摄日期按天归档 · 支持 JPG/PNG/HEIC/GIF/WebP/视频'}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? `上传中 ${Math.round(ratio * 100)}%` : '选择照片'}
        </button>
      </div>

      {busy && (
        <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: '#f0e6d6' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${ratio * 100}%`, background: '#c0705f' }} />
        </div>
      )}
      {msg && <div className="mt-2 text-[12.5px]" style={{ color: 'var(--color-muted)' }}>{msg}</div>}
    </div>
  )
}
