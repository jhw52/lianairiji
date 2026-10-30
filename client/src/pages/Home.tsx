import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi, useAuth } from '../lib/session'
import { Icon } from '../components/Icon'
import { elapseParts } from '../lib/utils'

export function Home() {
  const { data, loading } = useApi<any>('/api/home')
  const { settings } = useAuth()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const start: string | null = data?.startDate || null
  const p = start ? elapseParts(start, now) : { totalDays: 0, hours: 0, minutes: 0, seconds: 0 }
  const pad = (n: number) => String(n).padStart(2, '0')
  const recent = data?.recent || []

  return (
    <div className="container-page">
      <section
        className="relative overflow-hidden rounded-[22px] mb-6 fade-up"
        style={data?.hero ? {
          border: '1px solid #e9e0d1',
          backgroundImage: `linear-gradient(100deg, rgba(253,246,234,.93) 0%, rgba(250,242,230,.76) 45%, rgba(244,229,211,.52) 100%), url("${data.hero.large || data.hero.thumb || data.hero.orig}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        } : {
          border: '1px solid #e9e0d1',
          background: 'linear-gradient(135deg,#fdf6ea 0%,#f8ecdb 55%,#f3e2cf 100%)'
        }}
      >
        {!data?.hero && (
          <div
            className="absolute -right-20 -top-24 w-[420px] h-[420px] rounded-full"
            style={{ background: 'radial-gradient(circle,#e9c3ad55,transparent 65%)' }}
          />
        )}
        <div className="relative px-7 py-8 md:px-12 md:py-10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2 text-[12px] tracking-[0.18em] pt-2" style={{ color: '#a3806a' }}>
              <span className="w-6 h-px" style={{ background: '#c9a58b' }} />
              {start ? '我们在一起已经' : '猪猪与小咪的世界'}
            </div>

            <div className="text-right leading-tight shrink-0">
              <div className="hero-time">
                {pad(p.hours)} : {pad(p.minutes)} : {pad(p.seconds)}
              </div>
            </div>
          </div>

          <div className="mt-1 md:mt-3 flex items-end gap-2 md:gap-3">
            <span className="hand-days">{p.totalDays}</span>
            <span className="hand-unit">天</span>
          </div>

          {!start && (
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <span className="text-[13px]" style={{ color: '#8a6a52' }}>
                填上在一起的日子，这个数字才会开始走。
              </span>
              <Link to="/settings" className="btn btn-primary btn-sm">去设置</Link>
            </div>
          )}

          <p className="mt-5 md:mt-6 text-[14px] max-w-[520px] leading-7" style={{ color: '#7d6653' }}>
            {data?.motto || settings?.motto || '和你在一起的每一天，都值得被记住。'}
          </p>

          <div className="flex flex-wrap gap-2 mt-5 write-only">
            <Link to="/albums" className="btn btn-primary"><Icon name="upload" size={16} />上传照片</Link>
            <Link to="/timeline" className="btn"><Icon name="edit" size={16} />写一条</Link>
            <Link to="/calendar" className="btn"><Icon name="calendar" size={16} />记日历</Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label="照片" value={data?.counts?.photos} icon="image" to="/albums?tab=all" />
        <Stat label="视频" value={data?.counts?.videos} icon="play" to="/albums?tab=video" />
        <Stat label="日记" value={data?.counts?.moments} icon="book" to="/timeline" />
        <Stat label="相册" value={data?.counts?.albums} icon="folder" to="/albums?tab=albums" />
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="section-title">最近的照片</h2>
        <Link to="/albums" className="text-[13px]" style={{ color: 'var(--color-rose-deep)' }}>
          查看全部 →
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton aspect-square rounded-xl" />)}
        </div>
      ) : recent.length ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {recent.map((m: any) => (
            <Link
              key={m.id}
              to="/albums"
              className="photo-tile aspect-square rounded-xl"
              style={{ boxShadow: '0 2px 10px rgba(58,51,44,.08)' }}
            >
              {m.thumb ? (
                <img src={m.thumb} alt="" loading="lazy" />
              ) : (
                <div className="w-full h-full grid place-items-center" style={{ background: '#e9dccb' }}>
                  <Icon name="image" size={26} className="opacity-40" />
                </div>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="card p-10 text-center">
          <div className="text-3xl mb-3">🌿</div>
          <p className="text-[15px]" style={{ fontFamily: 'var(--font-serif)' }}>还没有照片</p>
          <p className="text-[13px] mt-1.5" style={{ color: 'var(--color-muted)' }}>
            上传第一张照片，这里就会亮起来
          </p>
          <Link to="/albums" className="btn btn-primary mt-5">开始上传</Link>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, icon, to }: { label: string; value?: number; icon: string; to: string }) {
  return (
    <Link
      to={to}
      className="card px-4 py-3.5 flex items-center gap-3 transition-all hover:-translate-y-0.5"
      style={{ textDecoration: 'none' }}
    >
      <div className="w-9 h-9 rounded-[10px] grid place-items-center" style={{ background: '#f6ecdd', color: '#a3806a' }}>
        <Icon name={icon} size={17} />
      </div>
      <div>
        <div className="num text-[20px] leading-tight">{value ?? '—'}</div>
        <div className="text-[11.5px]" style={{ color: 'var(--color-faint)' }}>{label}</div>
      </div>
      <Icon name="right" size={14} className="ml-auto opacity-30" />
    </Link>
  )
}
