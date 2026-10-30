import { useState } from 'react'
import { api, uploadFiles } from '../lib/api'
import { useApi, useAuth } from '../lib/session'
import { Icon } from '../components/Icon'
import { avatarSrc, SYSTEM_AVATARS } from '../lib/avatar'
import { ImageCropper } from '../components/ImageCropper'
import { Link, Navigate } from 'react-router-dom'

export function Profile() {
  const { user, refresh } = useAuth()
  const avatarList = useApi<any>('/api/me/avatars')
  const [uploading, setUploading] = useState(false)
  const [crop, setCrop] = useState<File | null>(null)

  if (user?.guestMode) return <Navigate to="/" replace />

  const pickAvatar = async (body: any) => {
    try {
      await api('/api/me/avatar', { method: 'POST', body })
      await refresh()
      avatarList.reload()
    } catch (e: any) { alert(e.message) }
  }

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) return alert('请选择图片文件')
    setUploading(true)
    try {
      const res = await uploadFiles([file], { usage: 'avatar' })
      const r = res.results?.[0]
      if (!r?.ok || !r.media) throw new Error(r?.error || '上传失败')
      await pickAvatar({ mediaId: r.media.id })
    } catch (e: any) {
      alert(e.message || '上传失败')
    } finally {
      setUploading(false)
    }
  }

  const removeAvatar = async () => {
    if (!confirm('移除头像？')) return
    await api('/api/me/avatar', { method: 'DELETE' })
    await refresh()
  }

  const history = avatarList.data?.history || []

  return (
    <div className="container-page max-w-[720px]">
      <Link to="/settings" className="inline-flex items-center gap-1 text-[13px] mb-5" style={{ color: 'var(--color-muted)' }}>
        <Icon name="left" size={15} /> 返回设置
      </Link>

      <div className="flex items-center gap-4 mb-7">
        <div
          className="w-20 h-20 rounded-full overflow-hidden grid place-items-center text-[24px] shrink-0"
          style={{ background: '#eadfd0', color: '#8a6a52' }}
        >
          {avatarSrc(user?.avatar)
            ? <img src={avatarSrc(user?.avatar)!} alt="" className="w-full h-full object-cover" />
            : (user?.displayName?.slice(0, 1) || '我')}
        </div>
        <div>
          <h1 className="text-[24px]" style={{ fontFamily: 'var(--font-serif)' }}>{user?.displayName}</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--color-muted)' }}>换一个头像，整站都会跟着变</p>
        </div>
      </div>

      <div className="card p-6 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="btn btn-primary cursor-pointer">
            {uploading ? '上传中…' : '上传照片做头像'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) setCrop(f)
                e.currentTarget.value = ''
              }}
            />
          </label>
          {user?.avatar && (
            <button className="btn btn-danger" onClick={removeAvatar}>移除头像</button>
          )}
        </div>
      </div>

      <div className="card p-6 mb-4">
        <h2 className="text-[16px] mb-4" style={{ fontFamily: 'var(--font-serif)' }}>系统头像</h2>
        <div className="flex flex-wrap gap-2.5">
          {SYSTEM_AVATARS.map((a) => (
            <button
              key={a.id}
              className="avatar-opt"
              data-on={user?.avatar === `sys:${a.id}`}
              title={a.label}
              onClick={() => pickAvatar({ path: `sys:${a.id}` })}
            >
              <img src={`/avatars/${a.id}.svg`} alt={a.label} />
            </button>
          ))}
        </div>
      </div>

      {history.length > 0 && (
        <div className="card p-6">
          <h2 className="text-[16px] mb-4" style={{ fontFamily: 'var(--font-serif)' }}>最近用过</h2>
          <div className="flex flex-wrap gap-2.5">
            {history.map((h: any) => (
              <button
                key={h.id}
                className="avatar-opt"
                data-on={h.path === user?.avatar}
                title={h.source === 'system' ? '系统头像' : '上传的照片'}
                onClick={() => pickAvatar({ historyId: h.id })}
              >
                <img src={avatarSrc(h.path)!} alt="" />
              </button>
            ))}
          </div>
          <p className="text-[11.5px] mt-4" style={{ color: 'var(--color-faint)' }}>
            点任意一个即可切回，历史会一直留着
          </p>
        </div>
      )}

      {crop && (
        <ImageCropper
          file={crop}
          aspect={1}
          output={{ width: 640, height: 640 }}
          title="调整头像"
          onCancel={() => setCrop(null)}
          onDone={async (blob) => {
            setCrop(null)
            await upload(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }))
          }}
        />
      )}
    </div>
  )
}
