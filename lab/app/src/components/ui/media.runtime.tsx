import { Media } from './media'
import { submitEvent } from '../../lib/api'
import { defineRuntimeComponent } from '../../runtime/define-runtime-component'
import type { RuntimeComponentContext } from '../../runtime/registry'
import type { MediaComponent } from '../../runtime/types'

type MediaEventName = 'onPlay' | 'onPause' | 'onSeek' | 'onComplete' | 'onError'

export const MediaRuntime = defineRuntimeComponent<'media', MediaComponent['props']>({
  type: 'media',
  renderer: ({ component, context }) => {
    const props = component.props as { type?: string; src?: string; alt?: string; label?: string; captions?: string }
    const { type, src, alt, label, captions } = props

    const media = {
      type,
      src,
      url: src,
      alt: alt || label,
      label,
      captions,
    }

    const emitters = createEventEmitters(component, context, type)

    return (
      <Media
        media={media}
        alt={alt || label}
        onPlay={emitters.onPlay}
        onPause={emitters.onPause}
        onSeek={emitters.onSeek}
        onComplete={emitters.onComplete}
        onError={emitters.onError}
      />
    )
  },
})

interface MediaEventHandlers {
  onPlay?: () => void
  onPause?: () => void
  onSeek?: (currentTime: number) => void
  onComplete?: () => void
  onError?: (error: Event) => void
}

function createEventEmitters(
  component: MediaComponent,
  context: RuntimeComponentContext,
  mediaType: string | undefined,
): MediaEventHandlers {
  const sessionId = context.sessionId
  if (!sessionId || !component.events) return {}

  const wrapEmitter = (eventName: MediaEventName) => {
    const eventConfig = component.events?.[eventName]
    if (!eventConfig) return undefined

    return async (data?: Record<string, unknown>) => {
      try {
        await submitEvent(sessionId, {
          type: eventConfig.type ?? `media_${eventName.toLowerCase()}`,
          timestamp: new Date().toISOString(),
          componentType: 'media',
          componentId: component.id ?? 'unknown',
          data: {
            media_id: component.id ?? 'unknown',
            media_type: mediaType,
            ...data,
            ...eventConfig.data,
          },
        })
      } catch (error) {
        console.error(`Failed to submit media ${eventName} event`, error)
      }
    }
  }

  const onPlayEmitter = wrapEmitter('onPlay')
  const onPauseEmitter = wrapEmitter('onPause')
  const onSeekEmitter = wrapEmitter('onSeek')
  const onCompleteEmitter = wrapEmitter('onComplete')
  const onErrorEmitter = wrapEmitter('onError')

  return {
    onPlay: onPlayEmitter ? () => { void onPlayEmitter() } : undefined,
    onPause: onPauseEmitter ? () => { void onPauseEmitter() } : undefined,
    onSeek: onSeekEmitter ? (currentTime) => { void onSeekEmitter({ current_time: currentTime }) } : undefined,
    onComplete: onCompleteEmitter ? () => { void onCompleteEmitter() } : undefined,
    onError: onErrorEmitter ? (error) => { void onErrorEmitter({ error_message: error.toString() }) } : undefined,
  }
}

