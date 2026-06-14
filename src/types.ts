export interface VideoSource {
  file: File
  url: string
  name: string
  size: number
  duration: number
  width: number
  height: number
}

export type EffectId = 'timelapse'

export interface EffectMeta {
  id: EffectId
  label: string
  description: string
  icon: string
  available: boolean
}

/** Registry of editing tools. Add new effects here as they ship. */
export const EFFECTS: EffectMeta[] = [
  {
    id: 'timelapse',
    label: '타임랩스',
    description: '영상을 빠르게 압축해 타임랩스로 만듭니다',
    icon: '⏩',
    available: true,
  },
]
