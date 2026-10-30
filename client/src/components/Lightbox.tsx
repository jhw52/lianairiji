import { useCallback, useEffect, useState } from 'react'
import { Icon } from './Icon'
import { api } from '../lib/api'
import { fmtDate, weekday } from '../lib/utils'

export function Lightbox({
  items, index, onClose, onChange
}: {
  items: any[]
  index: number
  onClose: () => void
  onChange: (next: number) => void
}) {
  const item = items[index]
  const [caption, setCaption] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setCaption(item?.caption || '')
    setEditing(false)
  }, [item?.id])

  const go = useCallback((dir: number) => {
    const next = (index + dir + items.length) % items.length
    onChange(next)
  }, [index, items.length, onChange])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [go, onClose])

  if (!item) return null

  const saveCaption = async () => {
    setBusy(true)
    try {
      await api(`/api/media/${item.id}`, { method: 'PATCH', body: { caption, rev: item.rev ?? undefined } })
      setEditing(false)
      item.caption = caption
    } catch (e: any) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  const toggleFav = async () => {
    try {
      await api(`/api/media/${item.id}`, { method: 'PATCH', body: { favorite: !item.favorite } })
      item.favorite = !item.favorite
    } catch (e: any) { alert(e.message) }
  }

  const remove = async () => {
    if (!confirm('确定删除这张照片吗？')) return
    try {
      await api(`/api/media/${item.id}`, { method: 'DELETE' })
      onClose()
    } catch (e: any) { alert(e.message) }
  }

  const src = item.large || item.orig || item.thumb

  return (
    <div className="lightbox-mask" onClick={onClose}>
      <button className="absolute top-4 right-4 p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10" onClick={onClose}>
        <Icon name="x" size={22} />
      </button>

      {items.length > 1 && (
        <>
          <button
            className="absolute left-3 md:left-6 p-3 rounded-full text-white/60 hover:text-white hover:bg-white/10"
            onClick={(e) => { e.stopPropagation(); go(-1) }}
          >
            <Icon name="left" size={24} />
          </button>
          <button
            className="absolute right-3 md:right-6 p-3 rounded-full text-white/60 hover:text-white hover:bg-white/10"
            onClick={(e) => { e.stopPropagation(); go(1) }}
          >
            <Icon name="right" size={24} />
          </button>
        </>
      )}

      <div className="max-w-[min(1180px,92vw)] max-h-[86vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        {item.kind === 'video' ? (
          <video
            src={item.orig}
            controls
            autoPlay
            playsInline
            className="max-h-[74vh] max-w-full rounded-lg"
            style={{ background: '#000' }}
          />
        ) : (
          <img
            src={src}
            alt={item.caption || ''}
            className="max-h-[74vh] max-w-full object-contain rounded-lg"
            style={{ boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}
          />
        )}

        <div className="w-full mt-4 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                className="input h-9 text-[13px]"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveCaption()}
                placeholder="给这张照片写一句说明"
                autoFocus
              />
            ) : (
              <div className="text-white/85 text-[14px] truncate">
                {item.caption || <span className="text-white/35">还没有说明，点右边编辑</span>}
              </div>
            )}
            <div className="text-[12px] text-white/40 mt-1">
              {fmtDate(item.takenAt)} {weekday(item.takenAt)} · {item.width && item.height ? `${item.width}×${item.height}` : '视频'}
              {items.length > 1 && ` · ${index + 1}/${items.length}`}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 write-only">
            {editing ? (
              <button className="btn btn-sm" onClick={saveCaption} disabled={busy}>保存</button>
            ) : (
              <button className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10" onClick={() => setEditing(true)} title="编辑说明">
                <Icon name="edit" size={17} />
              </button>
            )}
            <button className="p-2 rounded-lg hover:bg-white/10" onClick={toggleFav} title="收藏">
              <Icon name="star" size={17} className={item.favorite ? 'text-[#e8b06a]' : 'text-white/60'} />
            </button>
            <a
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10"
              href={item.orig}
              download
              title="下载原图"
              onClick={(e) => e.stopPropagation()}
            >
              <Icon name="download" size={17} />
            </a>
            <button className="p-2 rounded-lg text-white/60 hover:text-[#e08a7a] hover:bg-white/10" onClick={remove} title="删除">
              <Icon name="trash" size={17} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
