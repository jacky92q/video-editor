import { useCallback, useRef, useState } from 'react'

interface UploaderProps {
  onFile: (file: File) => void
}

const ACCEPTED = ['video/mp4', 'video/quicktime', 'video/webm']

export function Uploader({ onFile }: UploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0]
      if (!file) return
      if (!file.type.startsWith('video/') && !ACCEPTED.includes(file.type)) {
        setError('비디오 파일만 업로드할 수 있어요 (mp4 권장).')
        return
      }
      setError(null)
      onFile(file)
    },
    [onFile],
  )

  return (
    <div
      className={`uploader ${dragging ? 'uploader--active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        handleFiles(e.dataTransfer.files)
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/*"
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="uploader__icon">🎬</div>
      <h2 className="uploader__title">영상을 여기로 끌어다 놓으세요</h2>
      <p className="uploader__hint">또는 클릭해서 mp4 파일을 선택하세요</p>
      <button type="button" className="btn btn--primary uploader__btn">
        파일 선택
      </button>
      {error && <p className="uploader__error">{error}</p>}
      <p className="uploader__note">파일은 브라우저 안에서만 처리되며 어디에도 업로드되지 않습니다.</p>
    </div>
  )
}
