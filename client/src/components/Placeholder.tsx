import { Icon } from './Icon'

export function Placeholder({
  icon, title, subtitle, points, phase = '第二期'
}: {
  icon: string
  title: string
  subtitle: string
  points: string[]
  phase?: string
}) {
  return (
    <div className="container-page max-w-[760px]">
      <div className="card p-8 md:p-10 fade-up">
        <div className="flex items-start gap-5">
          <div className="w-14 h-14 rounded-2xl grid place-items-center shrink-0" style={{ background: '#f6ecdd', color: '#b08a6c' }}>
            <Icon name={icon} size={26} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-[24px]" style={{ fontFamily: 'var(--font-serif)' }}>{title}</h1>
              <span className="chip" style={{ color: '#a0784f', borderColor: '#e7d6bd', background: '#fdf6ea' }}>
                {phase}接入
              </span>
            </div>
            <p className="text-[13.5px] mt-2 leading-7" style={{ color: 'var(--color-muted)' }}>{subtitle}</p>
          </div>
        </div>

        <div className="mt-7 pt-6" style={{ borderTop: '1px dashed var(--color-line)' }}>
          <p className="text-[12px] tracking-wider mb-3" style={{ color: 'var(--color-faint)' }}>这里会有</p>
          <ul className="space-y-2.5">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-[13.5px]" style={{ color: '#6b6157' }}>
                <span className="mt-[9px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#d3bfa6' }} />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-8 text-[12px]" style={{ color: 'var(--color-faint)' }}>
          模块骨架与入口已就位，功能和数据表会在下一阶段接上。
        </p>
      </div>
    </div>
  )
}
