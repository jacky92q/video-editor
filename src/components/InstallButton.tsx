import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Shows an "앱 설치" button when Chrome fires `beforeinstallprompt`.
 * Hides itself once the app is installed or already running standalone.
 */
export function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(
    typeof window !== 'undefined' &&
      window.matchMedia('(display-mode: standalone)').matches,
  )

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed || !deferred) return null

  return (
    <button
      type="button"
      className="btn btn--primary install-btn"
      onClick={async () => {
        await deferred.prompt()
        const { outcome } = await deferred.userChoice
        if (outcome === 'accepted') setDeferred(null)
      }}
    >
      ⬇ 앱 설치
    </button>
  )
}
