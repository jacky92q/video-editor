/**
 * Timelapse generation — runs entirely in the browser.
 *
 * Strategy: seek through the source video sampling one frame every
 * `speed / fps` source-seconds, draw each onto a canvas, and feed the
 * canvas frames into a MediaRecorder paced in real time so the encoded
 * output plays back at the chosen fps (i.e. `speed`× faster than the source).
 *
 * No server, no ffmpeg.wasm, no special COOP/COEP headers required.
 */

export interface TimelapseOptions {
  /** How many times faster than real-time, e.g. 8 → 8× speed. */
  speed: number
  /** Output frame rate. */
  fps: number
  /** Longest output edge in pixels; the frame is scaled down to fit. */
  maxDimension?: number
  /** Called with progress in the range 0..1. */
  onProgress?: (progress: number) => void
  /** Abort an in-flight render. */
  signal?: AbortSignal
}

export interface TimelapseResult {
  blob: Blob
  mimeType: string
  /** File extension matching the encoded mime type (e.g. "webm"). */
  extension: string
  /** Output duration in seconds. */
  durationSec: number
}

interface CanvasCaptureTrack extends MediaStreamTrack {
  requestFrame?: () => void
}

const PREFERRED_MIME_TYPES = [
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
]

function pickMimeType(): { mimeType: string; extension: string } {
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
    for (const type of PREFERRED_MIME_TYPES) {
      if (MediaRecorder.isTypeSupported(type)) {
        return { mimeType: type, extension: type.includes('mp4') ? 'mp4' : 'webm' }
      }
    }
  }
  return { mimeType: 'video/webm', extension: 'webm' }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Timelapse render aborted', 'AbortError')
}

/** Load a File/Blob into a hidden <video> element ready for frame-accurate seeking. */
function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'
    video.src = src
    const onLoaded = () => {
      cleanup()
      resolve(video)
    }
    const onError = () => {
      cleanup()
      reject(new Error('비디오를 디코딩할 수 없습니다. 다른 파일을 시도해 주세요.'))
    }
    const cleanup = () => {
      video.removeEventListener('loadeddata', onLoaded)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('loadeddata', onLoaded)
    video.addEventListener('error', onError)
  })
}

/** Seek the video and resolve once the frame at that time is ready to paint. */
function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
    video.addEventListener('seeked', onSeeked)
    video.currentTime = Math.min(time, video.duration || time)
  })
}

export async function generateTimelapse(
  file: File,
  options: TimelapseOptions,
): Promise<TimelapseResult> {
  const { speed, fps, maxDimension = 1280, onProgress, signal } = options
  if (speed <= 1) throw new Error('속도는 1보다 커야 합니다.')

  const objectUrl = URL.createObjectURL(file)

  try {
    const video = await loadVideo(objectUrl)
    throwIfAborted(signal)

    const sourceDuration = video.duration
    if (!isFinite(sourceDuration) || sourceDuration <= 0) {
      throw new Error('비디오 길이를 확인할 수 없습니다.')
    }

    // Scale the canvas down so the longest edge fits within maxDimension.
    const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight))
    const width = Math.max(2, Math.round((video.videoWidth * scale) / 2) * 2)
    const height = Math.max(2, Math.round((video.videoHeight * scale) / 2) * 2)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D 컨텍스트를 만들 수 없습니다.')

    const outputDuration = sourceDuration / speed
    const totalFrames = Math.max(1, Math.ceil(outputDuration * fps))
    const frameIntervalMs = 1000 / fps

    const stream = canvas.captureStream(0)
    const track = stream.getVideoTracks()[0] as CanvasCaptureTrack

    const { mimeType, extension } = pickMimeType()
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8_000_000,
    })

    const chunks: BlobPart[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
    })

    recorder.start()

    try {
      const renderStart = performance.now()
      for (let i = 0; i < totalFrames; i++) {
        throwIfAborted(signal)

        const sourceTime = Math.min(sourceDuration, (i * speed) / fps)
        await seekTo(video, sourceTime)
        ctx.drawImage(video, 0, 0, width, height)
        track.requestFrame?.()

        onProgress?.((i + 1) / totalFrames)

        // Pace to real time so the encoded timestamps yield the target fps.
        const targetElapsed = (i + 1) * frameIntervalMs
        const actualElapsed = performance.now() - renderStart
        const remaining = targetElapsed - actualElapsed
        if (remaining > 0) await wait(remaining)
      }
    } finally {
      recorder.stop()
    }

    await stopped
    throwIfAborted(signal)

    const blob = new Blob(chunks, { type: mimeType })
    return { blob, mimeType, extension, durationSec: outputDuration }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
