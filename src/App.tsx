import { useCallback, useEffect, useState } from 'react'
import { Uploader } from './components/Uploader'
import { TimelapsePanel } from './components/TimelapsePanel'
import { EFFECTS, type EffectId, type VideoSource } from './types'
import { formatBytes, formatDuration } from './utils/format'

function readVideoMetadata(file: File, url: string): Promise<VideoSource> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      resolve({
        file,
        url,
        name: file.name,
        size: file.size,
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      })
    }
    video.onerror = () => reject(new Error('비디오 메타데이터를 읽을 수 없습니다.'))
    video.src = url
  })
}

export default function App() {
  const [source, setSource] = useState<VideoSource | null>(null)
  const [activeEffect, setActiveEffect] = useState<EffectId>('timelapse')
  const [loadError, setLoadError] = useState<string | null>(null)

  const handleFile = useCallback(
    async (file: File) => {
      setLoadError(null)
      const url = URL.createObjectURL(file)
      try {
        const meta = await readVideoMetadata(file, url)
        setSource((prev) => {
          if (prev) URL.revokeObjectURL(prev.url)
          return meta
        })
      } catch (err) {
        URL.revokeObjectURL(url)
        setLoadError((err as Error).message)
      }
    },
    [],
  )

  // Clean up the object URL when the source changes or the app unmounts.
  useEffect(() => {
    return () => {
      if (source) URL.revokeObjectURL(source.url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.url])

  function handleReset() {
    if (source) URL.revokeObjectURL(source.url)
    setSource(null)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">🎞️</span>
          <div>
            <h1 className="brand__name">Clip Studio</h1>
            <span className="brand__tag">브라우저 비디오 에디터</span>
          </div>
        </div>
        {source && (
          <button type="button" className="btn btn--ghost" onClick={handleReset}>
            새 영상 열기
          </button>
        )}
      </header>

      {!source ? (
        <main className="stage stage--empty">
          <Uploader onFile={handleFile} />
          {loadError && <p className="alert alert--error">{loadError}</p>}
          <FeatureHint />
        </main>
      ) : (
        <main className="stage stage--editor">
          <section className="preview">
            <div className="preview__frame">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={source.url} controls className="preview__video" />
            </div>
            <div className="preview__meta">
              <span className="preview__name" title={source.name}>
                {source.name}
              </span>
              <span className="preview__stats">
                {source.width}×{source.height} · {formatDuration(source.duration)} ·{' '}
                {formatBytes(source.size)}
              </span>
            </div>
          </section>

          <aside className="sidebar">
            <nav className="tools">
              {EFFECTS.map((effect) => (
                <button
                  key={effect.id}
                  type="button"
                  className={`tool ${activeEffect === effect.id ? 'tool--active' : ''} ${
                    effect.available ? '' : 'tool--disabled'
                  }`}
                  disabled={!effect.available}
                  onClick={() => setActiveEffect(effect.id)}
                >
                  <span className="tool__icon">{effect.icon}</span>
                  <span className="tool__text">
                    <span className="tool__label">{effect.label}</span>
                    <span className="tool__desc">{effect.description}</span>
                  </span>
                </button>
              ))}
            </nav>

            {activeEffect === 'timelapse' && <TimelapsePanel source={source} />}
          </aside>
        </main>
      )}

      <footer className="footer">
        <span>모든 처리는 로컬 브라우저에서 진행됩니다 · 다음 기능: 자르기 · 필터 · 자막</span>
      </footer>
    </div>
  )
}

function FeatureHint() {
  return (
    <div className="hints">
      {EFFECTS.map((e) => (
        <div className="hints__card" key={e.id}>
          <span className="hints__icon">{e.icon}</span>
          <span className="hints__label">{e.label}</span>
          <span className="hints__desc">{e.description}</span>
        </div>
      ))}
      <div className="hints__card hints__card--soon">
        <span className="hints__icon">✂️</span>
        <span className="hints__label">자르기</span>
        <span className="hints__desc">곧 추가됩니다</span>
      </div>
      <div className="hints__card hints__card--soon">
        <span className="hints__icon">🎨</span>
        <span className="hints__label">필터</span>
        <span className="hints__desc">곧 추가됩니다</span>
      </div>
    </div>
  )
}
