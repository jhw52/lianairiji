import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api, uploadFiles } from '../lib/api'
import { useApi, useAuth } from '../lib/session'
import { Icon } from '../components/Icon'
import { DateField } from '../components/DateField'
import { ImageCropper } from '../components/ImageCropper'
import { QrEntry } from '../components/QrEntry'
import { avatarSrc, SYSTEM_AVATARS } from '../lib/avatar'

export function SettingsPage() {
  const { settings, patchSettings, user, logout, refresh } = useAuth()
  const home = useApi<any>('/api/home')
  const avatarList = useApi<any>('/api/me/avatars')
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [motto, setMotto] = useState('')
  const [saved, setSaved] = useState('')
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState<'avatar' | 'hero' | 'logo' | ''>('')
  const [crop, setCrop] = useState<File | null>(null)

  useEffect(() => {
    if (!settings) return
    setName(settings.name || '')
    setStartDate(settings.startDate || '')
    setMotto(settings.motto || '')
  }, [settings])

  const upload = async (kind: 'avatar' | 'hero' | 'logo', file: File) => {
    if (!file.type.startsWith('image/')) return alert('请选择图片文件')
    setUploading(kind)
    try {
      const usage = kind === 'avatar' ? 'avatar' : kind === 'logo' ? 'logo' : 'hero'
      const res = await uploadFiles([file], { usage })
      const r = res.results?.[0]
      if (!r?.ok || !r.media) throw new Error(r?.error || '上传失败')
      if (kind === 'avatar') {
        await api('/api/me/avatar', { method: 'POST', body: { mediaId: r.media.id } })
        await refresh()
        avatarList.reload()
      } else if (kind === 'logo') {
        await patchSettings({ logoMediaId: r.media.id })
      } else {
        await patchSettings({ heroMediaId: r.media.id })
        home.reload()
      }
    } catch (e: any) {
      alert(e.message || '上传失败')
    } finally {
      setUploading('')
    }
  }

  const pickAvatar = async (body: any) => {
    try {
      await api('/api/me/avatar', { method: 'POST', body })
      await refresh()
      avatarList.reload()
    } catch (e: any) { alert(e.message) }
  }

  const removeAvatar = async () => {
    if (!confirm('移除头像？')) return
    await api('/api/me/avatar', { method: 'DELETE' })
    await refresh()
  }

  const heroPreview = home.data?.hero?.thumb || home.data?.hero?.large

  if (user?.guestMode === 'readonly') return <Navigate to="/" replace />

  const saveSite = async () => {
    setBusy(true)
    try {
      await patchSettings({ name, startDate: startDate || null, motto })
      setSaved('已保存')
      setTimeout(() => setSaved(''), 2500)
    } finally {
      setBusy(false)
    }
  }

  const changePwd = async () => {
    setPwdMsg('')
    try {
      await api('/api/auth/password', { method: 'POST', body: { oldPassword: oldPwd, newPassword: newPwd } })
      setPwdMsg('密码已修改，请重新登录')
      setOldPwd(''); setNewPwd('')
      setTimeout(() => logout(), 1200)
    } catch (e: any) {
      setPwdMsg(e.message || '修改失败')
    }
  }

  return (
    <div className="container-page max-w-[820px]">
      <h1 className="text-[27px] mb-1" style={{ fontFamily: 'var(--font-serif)' }}>设置</h1>
      <p className="text-[13px] mb-7" style={{ color: 'var(--color-muted)' }}>站点信息与账号安全</p>

      <Section title="头像与背景" desc="头像在整站统一使用；背景用在首页大字后面">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="label">我的头像</label>
            <Link
              to="/profile"
              className="flex items-center gap-4 rounded-xl p-3 -m-3 transition-colors hover:bg-black/[0.02]"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div
                className="w-14 h-14 rounded-full overflow-hidden grid place-items-center text-[20px] shrink-0"
                style={{ background: '#eadfd0', color: '#8a6a52' }}
              >
                {avatarSrc(user?.avatar)
                  ? <img src={avatarSrc(user?.avatar)!} alt="" className="w-full h-full object-cover" />
                  : (user?.displayName?.slice(0, 1) || '我')}
              </div>
              <div className="flex-1">
                <div className="text-[14px]">修改头像</div>
                <div className="text-[11.5px]" style={{ color: 'var(--color-faint)' }}>
                  上传照片 / 系统头像 / 切回历史头像
                </div>
              </div>
              <Icon name="right" size={16} className="opacity-40" />
            </Link>
          </div>

          <div>
            <label className="label">首页背景</label>
            <div
              className="rounded-xl overflow-hidden"
              style={{
                height: 92,
                background: heroPreview
                  ? `url("${heroPreview}") center/cover no-repeat`
                  : 'linear-gradient(135deg,#fdf6ea,#f3e2cf)'
              }}
            />
            <div className="flex gap-2 mt-2.5">
              <label className="btn btn-sm cursor-pointer">
                {uploading === 'hero' ? '上传中…' : '上传背景'}
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
              {settings?.heroMediaId && (
                <button
                  className="btn btn-sm"
                  onClick={() => { patchSettings({ heroMediaId: null }); home.reload() }}
                >
                  恢复默认
                </button>
              )}
            </div>
          </div>
        </div>
      </Section>

      <Section title="站点" desc="首页会显示这些内容；站点图标改后整站（导航、登录页、浏览器标签）统一生效">
        <div className="flex items-center gap-4 mb-5 pb-5" style={{ borderBottom: '1px dashed var(--color-line)' }}>
          <div
            className="w-12 h-12 rounded-full overflow-hidden grid place-items-center shrink-0"
            style={{ background: 'linear-gradient(135deg,#e9c8ba,#c0705f)', color: '#fffaf5', fontSize: 20 }}
          >
            {settings?.logo
              ? <img src={settings.logo} alt="" className="w-full h-full object-cover" />
              : '🌷'}
          </div>
          <div>
            <div className="text-[13px]">站点图标</div>
            <div className="text-[11.5px]" style={{ color: 'var(--color-faint)' }}>
              显示在左侧导航顶部和浏览器标签上
            </div>
          </div>
          <div className="flex gap-2 ml-auto">
            <label className="btn btn-sm cursor-pointer">
              {uploading === 'logo' ? '上传中…' : '上传图标'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) upload('logo', f)
                  e.currentTarget.value = ''
                }}
              />
            </label>
            {settings?.logo && (
              <button className="btn btn-sm" onClick={() => patchSettings({ logoMediaId: null })}>恢复默认</button>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">网站名字</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">在一起的日子</label>
            <DateField value={startDate} onChange={setStartDate} />
          </div>
        </div>
        <div className="mt-4">
          <label className="label">首页题词</label>
          <input className="input" value={motto} onChange={(e) => setMotto(e.target.value)} placeholder="和你在一起的每一天，都值得被记住。" />
        </div>
        <div className="flex items-center gap-3 mt-5">
          <button className="btn btn-primary" onClick={saveSite} disabled={busy}>保存</button>
          {saved && <span className="text-[13px]" style={{ color: '#7c9a72' }}>{saved}</span>}
        </div>
      </Section>

      <Section title="账号" desc={`当前登录：${user?.displayName}（${user?.username}）`}>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">原密码</label>
            <input className="input" type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} />
          </div>
          <div>
            <label className="label">新密码（至少 6 位）</label>
            <input className="input" type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-5">
          <button className="btn" onClick={changePwd} disabled={!oldPwd || newPwd.length < 6}>修改密码</button>
          {pwdMsg && <span className="text-[13px]" style={{ color: '#a04435' }}>{pwdMsg}</span>}
        </div>
      </Section>

      <Section title="智能分类（预留）" desc="接入人脸聚类后启用；照片会同时出现在原相册和分类里">
        <div className="rounded-xl p-4" style={{ background: '#faf3e8', border: '1px dashed #e2d3bd' }}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg grid place-items-center shrink-0" style={{ background: '#f0e2cd', color: '#b08a6c' }}>
              <Icon name="sparkles" size={17} />
            </div>
            <div className="text-[13px] leading-6" style={{ color: '#7d6653' }}>
              接口位置、数据表与队列已预留，本期不上线。
              上线后：一张照片上传 → 自动分一次类 → 分类与原相册同时可见；
              视频单独归到「视频」类，不参与人脸识别。
            </div>
          </div>
        </div>
        <div className="mt-4 grid md:grid-cols-3 gap-3 text-[12.5px]" style={{ color: 'var(--color-muted)' }}>
          <div className="chip justify-center">模型：待配置</div>
          <div className="chip justify-center">人脸聚类：待接入</div>
          <div className="chip justify-center">状态：未启用</div>
        </div>
      </Section>

      <Section title="数据" desc="所有数据只保存在运行这台网站的设备的 data 目录里">
        <ul className="text-[13px] space-y-2" style={{ color: 'var(--color-muted)' }}>
          <li>· 照片原图与缩略图：<span className="num">data/media/</span></li>
          <li>· 数据库：<span className="num">data/app.db</span></li>
          <li>· 备份整份 <span className="num">data/</span> 目录即可完整搬家</li>
        </ul>
      </Section>

      <Section title="分享入口" desc="扫码就能打开登录页；二维码在本地生成，不会上传到任何地方">
        <QrEntry />
      </Section>

      {crop && (
        <ImageCropper
          file={crop}
          aspect={16 / 9}
          output={{ width: 1920, height: 1080 }}
          title="调整首页背景"
          onCancel={() => setCrop(null)}
          onDone={async (blob) => {
            setCrop(null)
            await upload('hero', new File([blob], 'hero.jpg', { type: 'image/jpeg' }))
          }}
        />
      )}
    </div>
  )
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="card p-6 mb-4">
      <div className="mb-4">
        <h2 className="text-[16px]" style={{ fontFamily: 'var(--font-serif)' }}>{title}</h2>
        {desc && <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--color-faint)' }}>{desc}</p>}
      </div>
      {children}
    </section>
  )
}
