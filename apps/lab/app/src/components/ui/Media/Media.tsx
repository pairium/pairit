import type { ReactElement } from 'react'

export interface MediaProps {
  media?: Record<string, unknown>
  alt?: string
  onPlay?: () => void
  onPause?: () => void
  onSeek?: (currentTime: number) => void
  onComplete?: () => void
  onError?: (error: Event) => void
}

export function Media({ media, alt, onPlay, onPause, onSeek, onComplete, onError }: MediaProps): ReactElement | null {
  if (!media) return null

  const type = typeof media.type === 'string' ? media.type : typeof media.kind === 'string' ? media.kind : null
  const src = typeof media.src === 'string' ? media.src : typeof media.url === 'string' ? media.url : null

  if (!type || !src) return null

  if (type === 'image') {
    return <img src={src} alt={alt} className="max-h-48 w-full rounded-lg object-cover" />
  }

  if (type === 'video') {
    const captionsSrc = typeof media.captions === 'string' ? media.captions : undefined

    const mediaLabel =
      typeof media.label === 'string'
        ? media.label
        : typeof media.alt === 'string'
          ? media.alt
          : alt

    return (
      <video
        controls
        className="w-full rounded-lg"
        aria-label={mediaLabel}
        onPlay={onPlay}
        onPause={onPause}
        onSeeked={(e) => onSeek?.(e.currentTarget.currentTime)}
        onEnded={onComplete}
        onError={(e) => onError?.(e as unknown as Event)}
      >
        <source src={src} />
        {captionsSrc && <track kind="captions" src={captionsSrc} label="Captions" default />}
        Your browser does not support the video tag.
      </video>
    )
  }

  return null
}
