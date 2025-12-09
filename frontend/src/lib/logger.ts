/**
 * Centralized logging utility for the frontend
 *
 * In development: Logs to console
 * In production: Logs are disabled by default (can be enabled via localStorage)
 *
 * Usage:
 *   import { logger } from './lib/logger'
 *   logger.info('Message', data)
 *   logger.warn('Warning message')
 *   logger.error('Error occurred', error)
 */

const isDevelopment = import.meta.env.DEV
const isLoggingEnabled = () => {
  // Always log in development
  if (isDevelopment) return true

  // In production, only log if explicitly enabled via localStorage
  if (typeof window !== 'undefined') {
    return localStorage.getItem('enableLogging') === 'true'
  }

  return false
}

export const logger = {
  info: (...args: any[]) => {
    if (isLoggingEnabled()) {
      console.log('[INFO]', ...args)
    }
  },

  warn: (...args: any[]) => {
    if (isLoggingEnabled()) {
      console.warn('[WARN]', ...args)
    }
  },

  error: (...args: any[]) => {
    if (isLoggingEnabled()) {
      console.error('[ERROR]', ...args)
    }
  },

  debug: (...args: any[]) => {
    if (isLoggingEnabled()) {
      console.debug('[DEBUG]', ...args)
    }
  },
}

// Export helper to enable/disable logging in production
export const enableProductionLogging = (enabled: boolean) => {
  if (typeof window !== 'undefined') {
    if (enabled) {
      localStorage.setItem('enableLogging', 'true')
      console.log('✅ Production logging enabled')
    } else {
      localStorage.removeItem('enableLogging')
      console.log('❌ Production logging disabled')
    }
  }
}
