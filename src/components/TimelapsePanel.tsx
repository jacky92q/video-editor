import { useEffect, useRef, useState } from 'react'
import { generateTimelapse, type TimelapseResult } from '../effects/timelapse'
import type { VideoSource } from '../types'
import { downloadBlob, formatBytes, formatDuration } from '../utils/format'

interface TimelapsePanelProps {
  source: VideoSource
}

const SPEED_PRESETS = [2, 4, 8, 16, 30, 60]
const FPS_PRESETS = [24, 30]

export function TimelapsePanel({ source }: TimelapsePanelProps) {
  const [speed, setSpeed] = useState(8)
  const [fps, setFps] = useState(30)
  const [progress, setProgress] = useState(0)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TimelapseResult | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Reset output whenever the source or settings change.
  useEffect(() => {
    setResult(null)
    setError(null)
    setProgress(0)
  }, [source.url, speed, fps])

  // Manage the object URL for the result preview so it isn't recreated/leaked.
  useEffect(() => {
    if (!result) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(result.blob)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [result])

  const outputDuration = source.duration / speed

  async function handleGenerate() {
    setRendering(true)
    setError(null)
    setResult(null)
    setProgress(0)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await generateTimelapse(source.file, {
        speed,
        fps,
        onProgress: setProgress,
        signal: controller.signal,
      })
      setResult(res)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message ?? '타임랩스를 만드는 중 오류가 발생했습니다.')
      }
    } finally {
      setRendering(false)
      abortRef.current = null
    }
  }

  function handleCancel() {
    abortRef.current?.abort()
  }

  function handleDownload() {
    if (!result) return
    const base = source.name.replace(/\.[^.]+$/, '')
    downloadBlob(result.blob, `${base}_timelapse_${speed}x.${result.extension}`)
  }

  return (
    <div className="panel">
      <header className="panel__header">
        <span className="panel__icon">⏩</span>
        <div>
          <h3 className="panel__title">타임랩스</h3>
          <p className="panel__subtitle">속도와 프레임을 선택해 타임랩스를 만드세요.</p>
        </div>
      </header>

      <div className="field">
        <label className="field__label">
          재생 속도 <strong>{speed}×</strong>
        </label>
        <div className="chips">
          {SPEED_PRESETS.map((s) => (
            <button
              key={s}
              type="button"
              className={`chip ${speed === s ? 'chip--active' : ''}`}
              disabled={rendering}
              onClick={() => setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field__label">출력 프레임레이트</label>
        <div className="chips">
          {FPS_PRESETS.map((f) => (
            <button
              key={f}
              type="button"
              className={`chip ${fps === f ? 'chip--active' : ''}`}
              disabled={rendering}
              onClick={() => setFps(f)}
            >
              {f} fps
            </button>
          ))}
        </div>
      </div>

      <div className="estimate">
        <div className="estimate__row">
          <span>원본 길이</span>
          <strong>{formatDuration(source.duration)}</strong>
        </div>
        <div className="estimate__row estimate__row--accent">
          <span>타임랩스 길이 (예상)</span>
          <strong>{formatDuration(outputDuration)}</strong>
        </div>
      </div>

      {rendering ? (
        <div className="progress">
          <div className="progress__bar">
            <div className="progress__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <div className="progress__meta">
            <span>렌더링 중… {Math.round(progress * 100)}%</span>
            <button type="button" className="btn btn--ghost" onClick={handleCancel}>
              취소
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn--primary btn--block" onClick={handleGenerate}>
          ✨ 타임랩스 만들기
        </button>
      )}

      {error && <p className="alert alert--error">{error}</p>}

      {result && previewUrl && (
        <div className="result">
          <video className="result__preview" src={previewUrl} controls />
          <div className="result__info">
            <span>{formatDuration(result.durationSec)}</span>
            <span>·</span>
            <span>{formatBytes(result.blob.size)}</span>
            <span>·</span>
            <span className="result__ext">{result.extension.toUpperCase()}</span>
          </div>
          <button type="button" className="btn btn--success btn--block" onClick={handleDownload}>
            ⬇ 다운로드
          </button>
        </div>
      )}
    </div>
  )
}
