import { useEffect, useRef } from 'react'
import { api } from './api'
import { useApi } from './session'
import { showNotice } from './notice'

export const MODULE_MESSAGES: Record<string, string> = {
  albums: '对方上传了新照片',
  timeline: '对方写了新日记',
  calendar: '对方新增了一条记录',
  anniversaries: '对方更新了纪念日',
  wishes: '对方更新了心愿清单',
  whisper: '对方有话说~'
}

export function useUnread() {
  const { data, reload } = useApi<any>('/api/unread')
  const items = (data?.items || {}) as Record<string, { unread: boolean; at: string | null }>

  const markRead = async (module: string) => {
    try {
      await api('/api/unread/read', { method: 'POST', body: { module } })
      reload()
    } catch {
      /* 游客只读等情况忽略 */
    }
  }

  return { items, markRead }
}

/** 进入模块时：有未读就弹提醒并标记已读 */
export function useModuleNotice(module: string) {
  const { items, markRead } = useUnread()
  const fired = useRef(false)

  useEffect(() => {
    const it = items[module]
    if (!it?.unread) {
      fired.current = false
      return
    }
    if (fired.current) return
    fired.current = true
    showNotice(MODULE_MESSAGES[module] || '有新的变化')
    markRead(module)
  }, [items, module])
}
