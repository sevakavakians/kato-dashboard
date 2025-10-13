/**
 * Alert Context for managing alert history sidebar state
 *
 * Provides global state for opening/closing the alert history sidebar
 * across the entire application.
 */
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface AlertContextType {
  isOpen: boolean
  openSidebar: () => void
  closeSidebar: () => void
  toggleSidebar: () => void
}

const AlertContext = createContext<AlertContextType | undefined>(undefined)

interface AlertProviderProps {
  children: ReactNode
}

export function AlertProvider({ children }: AlertProviderProps) {
  const [isOpen, setIsOpen] = useState(false)

  const openSidebar = useCallback(() => {
    setIsOpen(true)
  }, [])

  const closeSidebar = useCallback(() => {
    setIsOpen(false)
  }, [])

  const toggleSidebar = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  return (
    <AlertContext.Provider
      value={{
        isOpen,
        openSidebar,
        closeSidebar,
        toggleSidebar,
      }}
    >
      {children}
    </AlertContext.Provider>
  )
}

export function useAlertSidebar() {
  const context = useContext(AlertContext)

  if (context === undefined) {
    throw new Error('useAlertSidebar must be used within an AlertProvider')
  }

  return context
}

export default AlertProvider
