import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/session'
import { Icon } from '../components/Icon'
import { Uploader } from '../components/Uploader'

export function AlbumDetail() {
  const { id } = useParams()
  const { version } = useAuth()
  const [album, setAlbum] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [a, m] = await Promise.all([
        api<any>('/api/albums'),
        api<any>(`/api/media?scope=all&album=${id}&limit=200`)
      ])
      const found = a.albums.find((x: any) => x.id === id)
      setAlbum(found || null)
      setTitle(found?.title || '')
      setItems(m.items)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [id, version])

  const removePhoto = async (mediaId: string) => {
    if (!confirm('从相册里移除这张照片？（不会删除原图）')) return
    await api(`/api/albums/${id}/media/${mediaId}`, { method: 'DELETE' })
    setItems((prev) => prev.filter((p) => p.id !== mediaId))
  }

  if (loading) {
    return <div className="container-page"><div className="skeleton h-8 w-48 rounded mb-6" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton aspect-square rounded-lg" />)}</div>
    </div>
  }

  return (
    <div className="container-page">
      <Link to="/albums" className="inline-flex items-center gap-1 text-[13px] mb-4" style={{ color: 'var(--color-muted)' }}>
        <Icon name="left" size={15} /> 返回相册
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          {editing ? (
            <input
              className="input text-[22px] h-12 max-w-[420px]"
              style={{ fontFamily: 'var(--font-serif)' }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={async () => {
                if (title.trim() && title !== album?.title) {
                  await api(`/api/albums/${id}`, { method: 'PATCH', body: { title: title.trim() } })
                }
                setEditing(false)
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
              autoFocus
            />
          ) : (
            <h1
              className="text-[26px] cursor-text"
              style={{ fontFamily: 'var(--font-serif)' }}
              onClick={() => setEditing(true)}
              title="点击重命名"
            >
              {album?.title || '相册'}
            </h1>
          )}
          <p className="text-[13px] mt-1" style={{ color: 'var(--color-muted)' }}>{items.length} 张照片</p>
        </div>
        <button
          className="btn btn-danger btn-sm"
          onClick={async () => {
            if (!confirm('删除这个相册？照片不会被删除。')) return
            await api(`/api/albums/${id}`, { method: 'DELETE' })
            history.back()
          }}
        >
          <Icon name="trash" size={14} /> 删除相册
        </button>
      </div>

      <div className="mb-6">
        <Uploader albumId={id} onDone={() => load()} hint="上传的照片会直接加入这个相册" />
      </div>

      {items.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-3xl mb-3">📷</div>
          <p className="text-[14px]" style={{ color: 'var(--color-muted)' }}>这个相册还是空的，上传几张照片吧</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((m) => (
            <div key={m.id} className="group relative photo-tile" style={{ aspectRatio: '1' }}>
              {m.thumb ? <img src={m.thumb} alt="" loading="lazy" /> : (
                <div className="w-full h-full grid place-items-center" style={{ background: '#e6d6c2' }}>
                  <Icon name="play" size={22} className="text-white/80" />
                </div>
              )}
              <button
                className="absolute top-2 right-2 w-7 h-7 rounded-full grid place-items-center opacity-0 group-hover:opacity-100 transition"
                style={{ background: 'rgba(0,0,0,.5)', color: '#fff' }}
                onClick={() => removePhoto(m.id)}
                title="从相册移除"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
