import { createContext, useContext } from 'react'
import type { SheetOpts } from '../components/AddSheet'

export const SheetCtx = createContext<(opts: SheetOpts) => void>(() => {})
export const useAddSheet = () => useContext(SheetCtx)
