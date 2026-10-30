import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import exifr from 'exifr'
import { MEDIA_DIR, currentMediaDir, get, run, nowIso, today } from './db.mjs'

const VIDEO_EXT = new Set(['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi'])
const ANIMATED_EXT = new Set(['gif', 'apng'])

export function extOf(name = '', mime = '') {
  const fromName = path.extname(name).replace('.', '').toLowerCase()
  if (fromName && fromName.length <= 5) return fromName
  const map = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'image/avif': 'avif', 'image/heic': 'heic', 'image/heif': 'heif', 'image/bmp': 'bmp',
    'image/tiff': 'tiff', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm'
  }
  return map[mime] || 'bin'
}

export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function pad(n) { return String(n).padStart(2, '0') }

function fmt(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function dirFor(iso) {
  const [y, m] = iso.split('T')[0].split('-')
  return `${y}/${m}`
}

async function sharpThumb(buf, kind) {
  const base = sharp(buf, { animated: false, failOn: 'none' }).rotate()
  const meta = await sharp(buf, { animated: false, failOn: 'none' }).metadata()
  return { base, meta }
}

export async function readTakenAt(buf) {
  try {
    const exif = await exifr.parse(buf, { pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'] })
    const d = exif?.DateTimeOriginal || exif?.CreateDate || exif?.ModifyDate
    if (d instanceof Date && !Number.isNaN(d.getTime()) && d.getFullYear() > 1990) {
      return { takenAt: fmt(d), source: 'exif' }
    }
  } catch { /* 无 EXIF 或格式不支持 */ }
  return null
}

/**
 * 处理并落盘一个上传文件。返回 media 行。
 * @param {{buffer:Buffer, originalname:string, mimetype:string}} file
 * @param {{lastModified?:number, createdBy?:string}} opt
 */
export async function ingestFile(file, opt = {}) {
  const buf = file.buffer
  const hash = sha256(buf)
  const existing = get(`SELECT * FROM media WHERE sha256 = ? AND deleted_at IS NULL`, hash)
  if (existing) return { ...existing, duplicate: true }

  const mime = file.mimetype || ''
  let ext = extOf(file.originalname, mime)
  if (ext === 'mov' || ext === 'mp4' || ext === 'webm' || mime.startsWith('video/')) ext = ext === 'bin' ? 'mp4' : ext
  const isVideo = mime.startsWith('video/') || VIDEO_EXT.has(ext)

  let kind = isVideo ? 'video' : ANIMATED_EXT.has(ext) ? 'animated' : 'image'
  let width = null, height = null
  let takenAt = null, source = null
  let blur = null
  let relThumb = null, relLarge = null

  if (!isVideo) {
    const exif = await readTakenAt(buf)
    if (exif) { takenAt = exif.takenAt; source = exif.source }
    try {
      const meta = await sharp(buf, { animated: false, failOn: 'none' }).metadata()
      // 手机竖拍常带 EXIF 旋转（orientation 5~8），显示时宽高要互换
      const swapped = (meta.orientation || 1) >= 5 && (meta.orientation || 1) <= 8
      width = (swapped ? meta.height : meta.width) || null
      height = (swapped ? meta.width : meta.height) || null
      if (!isVideo && (meta.pages || 1) > 1) kind = 'animated'
    } catch { /* HEIC 等可能无法解码 */ }
  }

  if (!takenAt && opt.lastModified && Number.isFinite(opt.lastModified)) {
    const d = new Date(opt.lastModified)
    if (d.getFullYear() > 1990) { takenAt = fmt(d); source = 'mtime' }
  }
  if (!takenAt) { takenAt = nowIso(); source = 'upload' }

  const day = takenAt.slice(0, 10)
  const dir = dirFor(takenAt)
  const id = crypto.randomUUID()
  for (const size of ['orig', 'thumb', 'large', 'micro']) {
    fs.mkdirSync(path.join(currentMediaDir(), size, dir), { recursive: true })
  }
  const relOrig = `orig/${dir}/${hash}.${ext}`
  const absOrig = path.join(currentMediaDir(), relOrig)
  await fs.promises.writeFile(absOrig, buf)

  if (!isVideo) {
    try {
      const small = await sharp(buf, { animated: false, failOn: 'none' })
        .rotate()
        .resize({ width: 32, height: 32, fit: 'inside' })
        .webp({ quality: 30 })
        .toBuffer()
      blur = `data:image/webp;base64,${small.toString('base64')}`
    } catch { /* ignore */ }

    try {
      const thumbBuf = await sharp(buf, { animated: false, failOn: 'none' })
        .rotate()
        .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 74 })
        .toBuffer()
      relThumb = `thumb/${dir}/${hash}.webp`
      await fs.promises.writeFile(path.join(currentMediaDir(), relThumb), thumbBuf)
    } catch { relThumb = null }

    if (kind !== 'animated') {
      try {
        const largeBuf = await sharp(buf, { animated: false, failOn: 'none' })
          .rotate()
          .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 84 })
          .toBuffer()
        relLarge = `large/${dir}/${hash}.webp`
        await fs.promises.writeFile(path.join(currentMediaDir(), relLarge), largeBuf)
      } catch { relLarge = null }
    }
  }

  const ts = nowIso()
  const usage = ['avatar', 'logo', 'hero', 'bg'].includes(opt.usage) ? opt.usage : 'gallery'
  run(`INSERT INTO media(id, sha256, kind, ext, mime, bytes, width, height,
        taken_at, taken_source, day, blur, path_thumb, path_large, path_orig,
        usage, created_by, created_at, updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, hash, kind, ext, mime || `image/${ext}`, buf.length, width, height,
    takenAt, source, day, blur, relThumb, relLarge, relOrig,
    usage, opt.createdBy || null, ts, ts)

  return get(`SELECT * FROM media WHERE id = ?`, id)
}

export function mediaPublic(row) {
  if (!row) return null
  return {
    id: row.id,
    kind: row.kind,
    day: row.day,
    takenAt: row.taken_at,
    takenSource: row.taken_source,
    caption: row.caption,
    width: row.width,
    height: row.height,
    duration: row.duration,
    favorite: !!row.is_favorite,
    aiStatus: row.ai_status,
    blur: row.blur,
    thumb: row.path_thumb ? `/files/${row.path_thumb}` : null,
    large: row.path_large ? `/files/${row.path_large}` : null,
    orig: row.path_orig ? `/files/${row.path_orig}` : null,
    momentId: row.moment_id,
    createdAt: row.created_at
  }
}

export function ensureDir(p) { fs.mkdirSync(p, { recursive: true }) }
export { today }
