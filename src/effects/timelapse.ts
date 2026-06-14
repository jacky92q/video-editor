/**
 * Timelapse generation — runs entirely in the browser.
 *
 * Two strategies, picked by speed:
 *  - speed ≤ 16  → "playback capture": play the source at an increased
 *    playbackRate and capture every presented frame. Smooth, fast, and
 *    cannot hang (no per-frame seeking). Output duration is driven by the
 *    real-time playback, so it is exactly `source / speed`.
 *  - speed > 16  → "seek sampling": browsers cap playbackRate at 16×, so for
 *    higher factors we sample frames by seeking, with a timeout guard so a
 *    missing `seeked` event can never stall the render.
 *
 * No server, no ffmpeg.wasm, no special COOP/COEP headers required.
 */

export interface TimelapseOptions {
  /** How many times faster than real-time, e.g. 8 → 8× speed. */
  speed: number
  /** Output frame rate (used by the seek sampler / capture rate hint). */
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

/** Max playbackRate browsers will honor for the playback-capture path. */
const MAX_PLAYBACK_RATE = 16

interface CanvasCaptureTrack extends MediaStreamTrack {
  requestFrame?: () => void
}

type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number
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

/** Load a File/Blob into a hidden, DOM-attached <video> ready for capture. */
function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'
    // Off-screen but attached so decoding / frame callbacks behave reliably.
    video.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none'
    document.body.appendChild(video)
    video.src = src

    const onLoaded = () => {
      cleanup()
      resolve(video)
    }
    const onError = () => {
      cleanup()
      video.remove()
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

/** Seek and resolve once the frame is ready — with a timeout so it can't hang. */
function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const target = Math.min(time, (video.duration || time) - 0.001)
    // A no-op seek won't emit `seeked`; resolve on the next tick instead.
    if (Math.abs(video.currentTime - target) < 1e-3) {
      requestAnimationFrame(() => resolve())
      return
    }
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      video.removeEventListener('seeked', done)
      resolve()
    }
    const timer = setTimeout(done, 2000)
    video.addEventListener('seeked', done)
    video.currentTime = target
  })
}

interface Encoder {
  recorder: MediaRecorder
  track: CanvasCaptureTrack
  stream: MediaStream
  /** True when frames must be pushed manually via track.requestFrame(). */
  manual: boolean
  chunks: BlobPart[]
  stopped: Promise<void>
}

function createEncoder(canvas: HTMLCanvasElement, fps: number): Encoder & { mimeType: string; extension: string } {
  let stream = canvas.captureStream(0)
  let track = stream.getVideoTracks()[0] as CanvasCaptureTrack
  const manual = typeof track.requestFrame === 'function'
  if (!manual) {
    // Browser doesn't support manual frames (e.g. Firefox): auto-sample at fps.
    stream = canvas.captureStream(fps)
    track = stream.getVideoTracks()[0] as CanvasCaptureTrack
  }

  const { mimeType, extension } = pickMimeType()
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })
  return { recorder, track, stream, manual, chunks, stopped, mimeType, extension }
}

export async function generateTimelapse(
  file: File,
  options: TimelapseOptions,
): Promise<TimelapseResult> {
  const { speed, fps, maxDimension = 1280, onProgress, signal } = options
  if (speed <= 1) throw new Error('속도는 1보다 커야 합니다.')

  const objectUrl = URL.createObjectURL(file)
  let video: HTMLVideoElement | null = null

  try {
    video = await loadVideo(objectUrl)
    throwIfAborted(signal)

    const sourceDuration = video.duration
    if (!isFinite(sourceDuration) || sourceDuration <= 0) {
      throw new Error('비디오 길이를 확인할 수 없습니다.')
    }

    const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight))
    const width = Math.max(2, Math.round((video.videoWidth * scale) / 2) * 2)
    const height = Math.max(2, Math.round((video.videoHeight * scale) / 2) * 2)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D 컨텍스트를 만들 수 없습니다.')

    const enc = createEncoder(canvas, fps)
    enc.recorder.start()

    try {
      if (speed <= MAX_PLAYBACK_RATE) {
        await capturePlayback(video, ctx, enc, { speed, width, height, onProgress, signal })
      } else {
        await captureSeek(video, ctx, enc, {
          speed,
          fps,
          width,
          height,
          sourceDuration,
          onProgress,
          signal,
        })
      }
    } finally {
      if (enc.recorder.state !== 'inactive') enc.recorder.stop()
    }

    await enc.stopped
    throwIfAborted(signal)

    const blob = new Blob(enc.chunks, { type: enc.mimeType })
    return {
      blob,
      mimeType: enc.mimeType,
      extension: enc.extension,
      durationSec: sourceDuration / speed,
    }
  } finally {
    video?.pause()
    video?.remove()
    URL.revokeObjectURL(objectUrl)
  }
}

/** speed ≤ 16: capture every presented frame while playing at high rate. */
async function capturePlayback(
  video: HTMLVideoElement,
  ctx: CanvasRenderingContext2D,
  enc: Encoder,
  opts: {
    speed: number
    width: number
    height: number
    onProgress?: (p: number) => void
    signal?: AbortSignal
  },
): Promise<void> {
  const { speed, width, height, onProgress, signal } = opts
  const duration = video.duration
  const rvfcVideo = video as VideoWithRVFC
  const useRVFC = typeof rvfcVideo.requestVideoFrameCallback === 'function'

  video.currentTime = 0
  video.playbackRate = Math.min(speed, MAX_PLAYBACK_RATE)
  // muted is required for programmatic playback; we already set it on load.
  try {
    await video.play()
  } catch {
    throw new Error('영상을 재생할 수 없습니다. 다시 시도해 주세요.')
  }

  await new Promise<void>((resolve, reject) => {
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      video.removeEventListener('ended', finish)
      resolve()
    }

    const drawFrame = () => {
      if (signal?.aborted) {
        finished = true
        reject(new DOMException('Timelapse render aborted', 'AbortError'))
        return
      }
      ctx.drawImage(video, 0, 0, width, height)
      if (enc.manual) enc.track.requestFrame?.()
      onProgress?.(Math.min(1, video.currentTime / duration))
      if (!video.ended && !finished) scheduleNext()
    }

    const scheduleNext = () => {
      if (useRVFC) rvfcVideo.requestVideoFrameCallback!(drawFrame)
      else requestAnimationFrame(drawFrame)
    }

    video.addEventListener('ended', finish)
    scheduleNext()
  })

  onProgress?.(1)
}

/** speed > 16: sample frames by seeking, paced in real time. */
async function captureSeek(
  video: HTMLVideoElement,
  ctx: CanvasRenderingContext2D,
  enc: Encoder,
  opts: {
    speed: number
    fps: number
    width: number
    height: number
    sourceDuration: number
    onProgress?: (p: number) => void
    signal?: AbortSignal
  },
): Promise<void> {
  const { speed, fps, width, height, sourceDuration, onProgress, signal } = opts
  const outputDuration = sourceDuration / speed
  const totalFrames = Math.max(1, Math.ceil(outputDuration * fps))
  const frameIntervalMs = 1000 / fps

  video.pause()
  const renderStart = performance.now()
  for (let i = 0; i < totalFrames; i++) {
    throwIfAborted(signal)

    const sourceTime = Math.min(sourceDuration, (i * speed) / fps)
    await seekTo(video, sourceTime)
    ctx.drawImage(video, 0, 0, width, height)
    if (enc.manual) enc.track.requestFrame?.()
    onProgress?.((i + 1) / totalFrames)

    const targetElapsed = (i + 1) * frameIntervalMs
    const remaining = targetElapsed - (performance.now() - renderStart)
    if (remaining > 0) await wait(remaining)
  }
}
