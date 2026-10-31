import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useModuleNotice } from '../lib/unread'
import { usePrivacy } from '../lib/privacy'
import { useApi, useAuth } from '../lib/session'
import { Icon } from '../components/Icon'
import { Uploader } from '../components/Uploader'
import { Lightbox } from '../components/Lightbox'
import { weekday } from '../lib/utils'

type Tab = 'day' | 'all' | 'video' | 'fav' | 'albums' | 'ai'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'day', label: '按天' },
  { key: 'all', label: '全部' },
  { key: 'video', label: '视频' },
  { key: 'fav', label: '收藏' },
  { key: 'albums', label: '相册' },
  { key: 'ai', label: '智能分类' }
]

export function Albums() {
  useModuleNotice('albums')
  const { version } = useAuth()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => {
    const t = params.get('tab') as Tab | null
    return t && TABS.some((x) => x.key === t) ? t : 'day'
  })
  const [items, setItems] = useState<any[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [moreLoading, setMoreLoading] = useState(false)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [newAlbum, setNewAlbum] = useState(false)
  const [albumTitle, setAlbumTitle] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selBusy, setSelBusy] = useState(false)
  const { favUnlocked } = usePrivacy()

  const cancelSel = () => { setSelecting(false); setSelected(new Set()) }
  const toggleSel = (id: string) => setSelected((prev) => {
    const n = new Set(prev)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  const batchDelete = async () => {
    if (!selected.size) return
    if (!confirm(`删除选中的 ${selected.size} 项？删掉后可以在备份里找回`)) return
    setSelBusy(true)
    try {
      for (const id of selected) await api(`/api/media/${id}`, { method: 'DELETE' })
      cancelSel()
      await load(true)
    } catch (e: any) {
      alert(e.message || '删除失败')
    } finally {
      setSelBusy(false)
    }
  }

  const batchFav = async (value: boolean) => {
    if (!selected.size) return
    setSelBusy(true)
    try {
      for (const id of selected) {
        const m = flat.find((x) => x.id === id)
        await api(`/api/media/${id}`, { method: 'PATCH', body: { favorite: value, rev: m?.rev } })
      }
      cancelSel()
      await load(true)
    } catch (e: any) {
      alert(e.message || '操作失败')
    } finally {
      setSelBusy(false)
    }
  }

  const batchSave = async () => {
    if (!selected.size) return
    const list = flat.filter((m) => selected.has(m.id))
    for (const m of list) {
      const a = document.createElement('a')
      a.href = m.orig
      a.download = m.caption || `${m.day || 'photo'}-${m.id.slice(0, 6)}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      await new Promise((r) => setTimeout(r, 400))
    }
  }
  const albums = useApi<any>(tab === 'albums' ? '/api/albums' : null)

  const scope = tab === 'video' ? 'video' : tab === 'fav' ? 'fav' : 'photo'
  const base = `/api/media?scope=${scope}`

  const load = useCallback(async (reset: boolean) => {
    if (reset) setLoading(true); else setMoreLoading(true)
    try {
      const url = reset ? base : `${base}&before=${encodeURIComponent(cursor || '')}`
      const d = await api(url)
      setItems((prev) => (reset ? d.items : [...prev, ...d.items]))
      setCursor(d.nextCursor)
      setHasMore(d.hasMore)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      setMoreLoading(false)
    }
  }, [base, cursor])

  // 收藏未解锁时不能停在收藏页
  useEffect(() => {
    if (tab === 'fav' && !favUnlocked) setTab('day')
  }, [tab, favUnlocked])

  useEffect(() => {
    if (tab === 'albums' || tab === 'ai') return
    load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, version])

  const groups = useMemo(() => {
    if (tab === 'all' || tab === 'fav' || tab === 'video') {
      return items.length ? [{ day: '全部', items: items.map((item, idx) => ({ item, idx })) }] : []
    }
    const map = new Map<string, Array<{ item: any; idx: number }>>()
    items.forEach((item, idx) => {
      const k = item.day || '未知日期'
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push({ item, idx })
    })
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, list]) => ({ day, items: list }))
  }, [items, tab])

  const open = (idx: number) => setLightbox(idx)
  const flat = items

  // 从首页点某张照片跳过来：自动滚到它并打开灯箱
  const targetPhoto = params.get('photo')
  const openedPhoto = useRef<string | null>(null)
  useEffect(() => {
    if (!targetPhoto || loading) return
    if (openedPhoto.current === targetPhoto) return
    const idx = items.findIndex((m) => m.id === targetPhoto)
    if (idx >= 0) {
      openedPhoto.current = targetPhoto
      setLightbox(idx)
      return
    }
    if (hasMore) return
    openedPhoto.current = targetPhoto
    api(`/api/media/${targetPhoto}`)
      .then((m: any) => {
        setItems((prev) => [m, ...prev.filter((x) => x.id !== m.id)])
        setLightbox(0)
      })
      .catch(() => {})
  }, [targetPhoto, items, loading, hasMore])

  return (
    <div className="container-page">
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h1 className="text-[27px]" style={{ fontFamily: 'var(--font-serif)' }}>相册</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--color-muted)' }}>
            {items.length ? `${items.length} 项 · 按拍摄日期自动归档` : '照片、动图与视频都在这里'}
          </p>
        </div>
        <div className="tabs overflow-x-auto max-w-full">
          {TABS.filter((t) => t.key !== 'fav' || favUnlocked).map((t) => (
            <button key={t.key} className="tab" data-active={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab !== 'albums' && tab !== 'ai' && !loading && items.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {!selecting ? (
            <button className="btn btn-sm" onClick={() => setSelecting(true)}>批量选择</button>
          ) : (
            <>
              <span className="text-[12.5px] mr-auto" style={{ color: 'var(--color-muted)' }}>
                已选 {selected.size} 项
              </span>
              <button className="btn btn-sm" onClick={() => setSelected(new Set(flat.map((m) => m.id)))}>全选</button>
              {favUnlocked && (
                <>
                  <button className="btn btn-sm" onClick={() => batchFav(true)} disabled={!selected.size || selBusy}>
                    {selBusy ? '处理中…' : '收藏'}
                  </button>
                  {tab === 'fav' && (
                    <button className="btn btn-sm" onClick={() => batchFav(false)} disabled={!selected.size || selBusy}>
                      取消收藏
                    </button>
                  )}
                </>
              )}
              <button className="btn btn-sm" onClick={batchSave} disabled={!selected.size || selBusy}>
                保存到本地
              </button>
              <button
                className="btn btn-sm"
                onClick={batchDelete}
                disabled={!selected.size || selBusy}
                style={{ color: '#a04435' }}
              >
                {selBusy ? '删除中…' : '删除'}
              </button>
              <button className="btn btn-sm" onClick={cancelSel}>取消</button>
            </>
          )}
        </div>
      )}

      {tab !== 'albums' && tab !== 'ai' && (
        <div className="mb-6">
          <Uploader
            onDone={() => { load(true) }}
            hint={tab === 'video' ? '视频会直接归到「视频」，不参与人脸分类' : undefined}
          />
        </div>
      )}

      {tab === 'albums' && (
        <AlbumList
          data={albums}
          onCreate={() => setNewAlbum(true)}
        />
      )}

      {tab === 'ai' && (
        <div className="card p-10 text-center">
          <div className="w-14 h-14 rounded-2xl grid place-items-center mx-auto mb-4" style={{ background: '#f6ecdd', color: '#b08a6c' }}>
            <Icon name="sparkles" size={24} />
          </div>
          <h3 className="text-[18px]" style={{ fontFamily: 'var(--font-serif)' }}>智能分类 · 预留位置</h3>
          <p className="text-[13px] mt-2 max-w-[360px] mx-auto leading-6" style={{ color: 'var(--color-muted)' }}>
            这里会按人物、风格自动分组。等接上人脸聚类后，每张新照片会自动分一次类，
            并且同时出现在原相册和分类里。
          </p>
          <div className="inline-flex items-center gap-2 mt-4 chip">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#c9a227' }} />
            接口已预留，尚未启用
          </div>
        </div>
      )}

      {tab !== 'albums' && tab !== 'ai' && (
        loading ? (
          <div className="columns-2 md:columns-3 xl:columns-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton mb-3 rounded-md" style={{ aspectRatio: i % 3 ? '4/3' : '3/4' }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Empty tab={tab} />
        ) : (
          <>
            {groups.map((g) => (
              <section key={g.day} className="mb-8">
                {tab !== 'all' && tab !== 'fav' && tab !== 'video' && (
                  <div
                    className="sticky top-0 md:top-0 z-10 -mx-2 px-2 py-2.5 flex items-baseline gap-2.5"
                    style={{ background: 'rgba(250,246,239,.93)', backdropFilter: 'blur(8px)' }}
                  >
                    <h3 className="text-[19px]" style={{ fontFamily: 'var(--font-serif)' }}>
                      {g.day.slice(0, 4)}年{g.day.slice(5, 7)}月{g.day.slice(8, 10)}日
                    </h3>
                    <span className="text-[12px]" style={{ color: 'var(--color-faint)' }}>
                      {weekday(g.day)} · {g.items.length} 项
                    </span>
                  </div>
                )}
                <div className="columns-2 md:columns-3 xl:columns-4 gap-3">
                  {g.items.map(({ item, idx }) => (
                    <PhotoCard
                      key={item.id}
                      item={item}
                      showFavorite={favUnlocked}
                      selecting={selecting}
                      selected={selected.has(item.id)}
                      onToggle={() => toggleSel(item.id)}
                      onClick={() => (selecting ? toggleSel(item.id) : open(idx))}
                    />
                  ))}
                </div>
              </section>
            ))}

            {hasMore && (
              <div className="text-center pt-2">
                <button className="btn" onClick={() => load(false)} disabled={moreLoading}>
                  {moreLoading ? '加载中…' : '加载更多'}
                </button>
              </div>
            )}
          </>
        )
      )}

      {lightbox !== null && flat[lightbox] && (
        <Lightbox
          items={flat}
          showFavorite={favUnlocked}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onChange={setLightbox}
        />
      )}

      {newAlbum && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: 'rgba(26,22,18,.5)' }} onClick={() => setNewAlbum(false)}>
          <div className="card p-6 w-full max-w-[380px] fade-up" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[18px] mb-4" style={{ fontFamily: 'var(--font-serif)' }}>新相册</h3>
            <label className="label">相册名</label>
            <input
              className="input"
              value={albumTitle}
              onChange={(e) => setAlbumTitle(e.target.value)}
              placeholder="比如：第一次旅行"
              autoFocus
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && albumTitle.trim()) {
                  await api('/api/albums', { method: 'POST', body: { title: albumTitle.trim() } })
                  setAlbumTitle(''); setNewAlbum(false); albums.reload()
                }
              }}
            />
            <div className="flex justify-end gap-2 mt-5">
              <button className="btn" onClick={() => setNewAlbum(false)}>取消</button>
              <button
                className="btn btn-primary"
                disabled={!albumTitle.trim()}
                onClick={async () => {
                  await api('/api/albums', { method: 'POST', body: { title: albumTitle.trim() } })
                  setAlbumTitle(''); setNewAlbum(false); albums.reload()
                }}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PhotoCard({
  item, onClick, selecting, selected, onToggle, showFavorite
}: {
  item: any
  onClick: () => void
  selecting?: boolean
  selected?: boolean
  onToggle?: () => void
  showFavorite?: boolean
}) {
  const ratio = item.width && item.height ? `${item.width}/${item.height}` : '4/5'
  return (
    <button
      className="photo-tile w-full mb-3 break-inside-avoid block text-left"
      onClick={onClick}
      style={{ aspectRatio: item.kind === 'video' ? '16/10' : ratio }}
    >
      {item.thumb ? (
        <img src={item.thumb} alt={item.caption || ''} loading="lazy" />
      ) : (
        <div className="w-full h-full grid place-items-center" style={{ background: 'linear-gradient(135deg,#e6d6c2,#d8bfa6)' }}>
          <Icon name="play" size={22} className="text-white/80" />
        </div>
      )}
      {item.kind === 'video' && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="w-11 h-11 rounded-full grid place-items-center" style={{ background: 'rgba(255,255,255,.85)', color: '#4a3c30' }}>
            <Icon name="play" size={16} />
          </span>
        </span>
      )}
      {item.kind === 'animated' && (
        <span className="absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,0,0,.45)', color: '#fff' }}>
          动图
        </span>
      )}
      {showFavorite && item.favorite && (
        <span className="absolute top-2 right-2" style={{ color: '#f2c177' }}>
          <Icon name="star" size={13} />
        </span>
      )}
      {item.takenSource === 'mtime' && (
        <span className="absolute bottom-2 left-2 text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,0,0,.4)', color: '#fff' }}>
          日期待确认
        </span>
      )}
      {selecting && (
        <span
          className="absolute top-2 left-2 w-6 h-6 rounded-full grid place-items-center"
          style={{
            background: selected ? '#c0705f' : 'rgba(255,255,255,.9)',
            border: selected ? 'none' : '1.5px solid #cbb9a4',
            color: '#fff',
            boxShadow: '0 2px 8px rgba(0,0,0,.15)'
          }}
          onClick={(e) => { e.stopPropagation(); onToggle?.() }}
        >
          {selected && <Icon name="check" size={13} />}
        </span>
      )}
    </button>
  )
}

function Empty({ tab }: { tab: Tab }) {
  const map: Record<string, { icon: string; title: string; desc: string }> = {
    day: { icon: 'image', title: '还没有照片', desc: '把手机里的照片拖上来，会自动按拍摄日期归档' },
    all: { icon: 'image', title: '还没有照片', desc: '从上传第一张开始吧' },
    video: { icon: 'play', title: '还没有视频', desc: '视频会单独归档，不参与人脸分类' },
    fav: { icon: 'star', title: '还没有收藏', desc: '在照片大图里点星星，就会出现在这里' }
  }
  const m = map[tab] || map.all
  return (
    <div className="card p-12 text-center">
      <div className="w-14 h-14 rounded-2xl grid place-items-center mx-auto mb-4" style={{ background: '#f6ecdd', color: '#b08a6c' }}>
        <Icon name={m.icon} size={24} />
      </div>
      <h3 className="text-[17px]" style={{ fontFamily: 'var(--font-serif)' }}>{m.title}</h3>
      <p className="text-[13px] mt-2" style={{ color: 'var(--color-muted)' }}>{m.desc}</p>
    </div>
  )
}

function AlbumList({ data, onCreate }: { data: any; onCreate: () => void }) {
  if (data.loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => <div key={i} className="skeleton rounded-xl aspect-[4/3]" />)}
      </div>
    )
  }
  const list = data.data?.albums || []
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <button
          className="card p-6 grid place-items-center text-center min-h-[170px] border-dashed"
          style={{ borderStyle: 'dashed' }}
          onClick={onCreate}
        >
          <div>
            <div className="w-11 h-11 rounded-full grid place-items-center mx-auto mb-2" style={{ background: '#f6ecdd', color: '#a3806a' }}>
              <Icon name="plus" size={20} />
            </div>
            <div className="text-[14px]">新建相册</div>
            <div className="text-[12px] mt-1" style={{ color: 'var(--color-faint)' }}>把照片按主题归类</div>
          </div>
        </button>
        {list.map((a: any) => (
          <Link key={a.id} to={`/albums/${a.id}`} className="card overflow-hidden group">
            <div className="aspect-[4/3] overflow-hidden" style={{ background: '#efe6d7' }}>
              {a.cover ? (
                <img src={a.cover} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
              ) : (
                <div className="w-full h-full grid place-items-center" style={{ color: '#c3b19b' }}>
                  <Icon name="folder" size={26} />
                </div>
              )}
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-[14.5px] truncate">{a.title}</div>
                <div className="text-[12px]" style={{ color: 'var(--color-faint)' }}>{a.count} 张</div>
              </div>
              <Icon name="right" size={16} className="text-[#c3b19b]" />
            </div>
          </Link>
        ))}
      </div>
      {list.length === 0 && (
        <p className="text-center text-[13px] mt-6" style={{ color: 'var(--color-faint)' }}>
          还没有手动相册，点上面的卡片创建一个
        </p>
      )}
    </div>
  )
}
