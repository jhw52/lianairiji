import { createContext, useContext, useState } from 'react'

type Privacy = {
  favUnlocked: boolean
  unlockFav: () => void
  lockFav: () => void
}

// 模块级开关：收藏锁定时，所有 GET 请求都带上 hideFav=1
let hideFavFlag = true
export const shouldHideFav = () => hideFavFlag
export const setHideFavFlag = (v: boolean) => { hideFavFlag = v }

const Ctx = createContext<Privacy>({ favUnlocked: false, unlockFav: () => {}, lockFav: () => {} })

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [favUnlocked, setFav] = useState(false)
  // 同步更新模块开关，保证子组件重新取数时已经带上新状态
  setHideFavFlag(!favUnlocked)
  return (
    <Ctx.Provider value={{ favUnlocked, unlockFav: () => setFav(true), lockFav: () => setFav(false) }}>
      {children}
    </Ctx.Provider>
  )
}

export const usePrivacy = () => useContext(Ctx)
