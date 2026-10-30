export class ApiError extends Error {
  code: string
  status: number
  payload: any
  constructor(code: string, message: string, status = 0, payload: any = null) {
    super(message)
    this.code = code
    this.status = status
    this.payload = payload
  }
}

type Opts = { method?: string; body?: any; headers?: Record<string, string>; signal?: AbortSignal }

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    credentials: 'same-origin',
    headers: {
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {})
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal
  })
  let json: any = null
  try { json = await res.json() } catch { json = null }
  if (!res.ok) {
    const code = json?.error?.code || 'ERROR'
    // 只读游客动任何东西：统一提示一次
    if (code === 'READONLY') {
      const w = window as any
      if (!w.__readonlyNotice) {
        w.__readonlyNotice = true
        alert('你没有权限修改')
        setTimeout(() => { w.__readonlyNotice = false }, 1200)
      }
    }
    throw new ApiError(
      code,
      json?.error?.message || `请求失败 (${res.status})`,
      res.status,
      json
    )
  }
  return json?.data as T
}

export function uploadFiles(
  files: File[],
  extra: { albumId?: string; momentId?: string; usage?: 'gallery' | 'avatar' | 'logo' | 'hero' | 'bg' } = {},
  onProgress?: (ratio: number) => void
): Promise<{ results: Array<{ ok: boolean; media?: any; duplicate?: boolean; name?: string; error?: string }> }> {
  return new Promise((resolve, reject) => {
    const fd = new FormData()
    for (const f of files) fd.append('files', f, f.name)
    if (extra.albumId) fd.append('albumId', extra.albumId)
    if (extra.momentId) fd.append('momentId', extra.momentId)
    if (extra.usage) fd.append('usage', extra.usage)
    fd.append('mtimes', JSON.stringify(files.map((f) => f.lastModified)))

    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/media')
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      try {
        const j = JSON.parse(xhr.responseText)
        if (xhr.status >= 400) {
          reject(new ApiError(j?.error?.code || 'UPLOAD_FAILED', j?.error?.message || '上传失败', xhr.status, j))
        } else {
          resolve(j.data)
        }
      } catch (e) {
        reject(e)
      }
    }
    xhr.onerror = () => reject(new ApiError('NETWORK', '网络中断，请重试'))
    xhr.send(fd)
  })
}
