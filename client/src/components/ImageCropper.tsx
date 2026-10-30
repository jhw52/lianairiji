import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { Modal } from './Modal'

/**
 * 图片裁剪：拖动位置、滑杆缩放，按目标比例导出。
 * aspect = 宽 / 高；output = 导出尺寸
 */
export function ImageCropper({
  file, aspect, output, title, onCancel, onDone
}: {
  file: File
  aspect: number
  output: { width: number; height: number }
  title?: string
  onCancel: () => void
  onDone: (blob: Blob) => void
}) {
  const boxW = 420
  const boxH = Math.round(boxW / aspect)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const url = useRef('')

  useEffect(() => {
    const u = URL.createObjectURL(file)
    url.current = u
    const el = new Image()
    el.onload = () => setImg(el)
    el.src = u
    return () => URL.revokeObjectURL(u)
  }, [file])

  const base = img ? Math.max(boxW / img.naturalWidth, boxH / img.naturalHeight) : 1
  const scale = base * zoom
  const shownW = img ? img.naturalWidth * scale : 0
  const shownH = img ? img.naturalHeight * scale : 0

  // 限制拖动范围，避免露出空白
  const clamp = (x: number, y: number) => {
    const maxX = Math.max(0, (shownW - boxW) / 2)
    const maxY = Math.max(0, (shownH - boxH) / 2)
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) }
  }

  const onDown = (e: React.PointerEvent) => {
    if (!img) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const d = drag.current
    setPos(clamp(d.px + (e.clientX - d.x), d.py + (e.clientY - d.y)))
  }
  const onUp = () => { drag.current = null }

  const confirm = async () => {
    if (!img) return
    setBusy(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = output.width
      canvas.height = output.height
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fdf9f2'
      ctx.fillRect(0, 0, output.width, output.height)

      // 屏幕坐标换算回原图像素
      const centerX = boxW / 2 + pos.x
      const centerY = boxH / 2 + pos.y
      const sx = (0 - centerX) / scale + img.naturalWidth / 2
      const sy = (0 - centerY) / scale + img.naturalHeight / 2
      const sw = boxW / scale
      const sh = boxH / scale

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, output.width, output.height)
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.92))
      if (blob) onDone(blob)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={title || '调整裁剪范围'} onClose={onCancel} maxWidth={520}>
      <p className="text-[12.5px] mb-3" style={{ color: 'var(--color-muted)' }}>
        拖动图片调整位置，滑动下方滑杆缩放
      </p>

      <div
        className="mx-auto rounded-xl overflow-hidden relative touch-none select-none"
        style={{ width: boxW, height: boxH, maxWidth: '100%', background: '#f2e9db', cursor: img ? 'grab' : 'default' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {img ? (
          <img
            src={url.current}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: shownW,
              height: shownH,
              transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
              maxWidth: 'none',
              userSelect: 'none',
              pointerEvents: 'none'
            }}
          />
        ) : (
          <div className="w-full h-full grid place-items-center" style={{ color: 'var(--color-faint)' }}>正在读取图片…</div>
        )}
        <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 0 2px rgba(192,112,95,.55)' }} />
      </div>

      <div className="flex items-center gap-3 mt-4">
        <Icon name="image" size={15} className="opacity-50" />
        <input
          type="range" min={1} max={3} step={0.01} value={zoom}
          onChange={(e) => {
            const z = Number(e.target.value)
            setZoom(z)
            const b = img ? Math.max(boxW / img.naturalWidth, boxH / img.naturalHeight) : 1
            const maxX = Math.max(0, (img!.naturalWidth * b * z - boxW) / 2)
            const maxY = Math.max(0, (img!.naturalHeight * b * z - boxH) / 2)
            setPos((p) => ({ x: Math.min(maxX, Math.max(-maxX, p.x)), y: Math.min(maxY, Math.max(-maxY, p.y)) }))
          }}
          className="flex-1"
        />
        <span className="text-[11px] num w-9 text-right" style={{ color: 'var(--color-faint)' }}>{zoom.toFixed(1)}x</span>
      </div>

      <div className="flex justify-end gap-2 mt-5">
        <button className="btn" onClick={onCancel}>取消</button>
        <button className="btn btn-primary" onClick={confirm} disabled={!img || busy}>
          {busy ? '处理中…' : '用这张'}
        </button>
      </div>
    </Modal>
  )
}
