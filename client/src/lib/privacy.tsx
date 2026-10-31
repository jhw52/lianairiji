import { createContext, useContext, useState } from 'react'

type Privacy = {
  favUnlocked: boolean
  unlockFav: () => void
  lockFav: () => void
}

const Ctx = createContext<Privacy>({ favUnlocked: false, unlockFav: () => {}, lockFav: () => {} })

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [favUnlocked, setFav] = useState(false)
  return (
    <Ctx.Provider value={{ favUnlocked, unlockFav: () => setFav(true), lockFav: () => setFav(false) }}>
      {children}
    </Ctx.Provider>
  )
}

export const usePrivacy = () => useContext(Ctx)
