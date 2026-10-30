export interface SystemAvatar {
  id: string
  label: string
}

export const SYSTEM_AVATARS: SystemAvatar[] = [
  { id: 'cat', label: '小猫' },
  { id: 'rabbit', label: '兔子' },
  { id: 'bear', label: '小熊' },
  { id: 'panda', label: '熊猫' },
  { id: 'fox', label: '狐狸' },
  { id: 'chick', label: '小鸡' },
  { id: 'frog', label: '青蛙' },
  { id: 'penguin', label: '企鹅' }
]

/** 头像值可能是上传文件名（thumb/...）或系统头像（sys:cat） */
export function avatarSrc(a?: string | null): string | null {
  if (!a) return null
  if (a.startsWith('sys:')) return `/avatars/${a.slice(4)}.svg`
  return `/files/${a}`
}

export function isSystemAvatar(a?: string | null) {
  return !!a && a.startsWith('sys:')
}
