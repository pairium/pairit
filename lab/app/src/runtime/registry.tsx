import type { ReactNode } from 'react'

import { Button } from '../components/ui/button'
import { Media } from '../components/ui/media'
import { Survey } from '../components/survey'
import type { SurveyProps } from '../components/survey'
import type { ButtonAction, ButtonsComponent, ComponentInstance, MediaComponent, TextComponent } from './types'
import { submitEvent } from '../lib/api'

export type NavigationGuard = (action: ButtonAction) => boolean | undefined | Promise<boolean | undefined>

export interface RuntimeComponentContext {
  onAction: (action: ButtonAction) => void | Promise<void>
  registerNavigationGuard: (guard: NavigationGuard) => () => void
  sessionId?: string | null
}

export type RuntimeComponentRenderer<
  Type extends string = string,
  Props extends Record<string, unknown> = Record<string, unknown>,
> = (input: { component: ComponentInstance<Type, Props>; context: RuntimeComponentContext }) => ReactNode

type AnyRenderer = RuntimeComponentRenderer<string, Record<string, unknown>>

const registry = new Map<string, AnyRenderer>()

let fallbackRenderer: AnyRenderer | null = null

const defaultFallbackRenderer: AnyRenderer = ({ component }) => (
  <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
    Missing renderer for <code>{component.type}</code> components.
  </div>
)

export function registerComponent<Type extends string, Props extends Record<string, unknown>>(
  type: Type,
  renderer: RuntimeComponentRenderer<Type, Props>,
) {
  registry.set(type, renderer as AnyRenderer)
}

export function unregisterComponent(type: string) {
  registry.delete(type)
}

export function setFallbackComponent(renderer: RuntimeComponentRenderer | null) {
  fallbackRenderer = renderer as AnyRenderer | null
}

export function getComponentRenderer(type: string): AnyRenderer {
  if (registry.has(type)) {
    return registry.get(type) as AnyRenderer
  }

  if (!fallbackRenderer) {
    console.warn(`No renderer registered for component type "${type}".`)
    return defaultFallbackRenderer
  }

  return fallbackRenderer
}

const textRenderer: RuntimeComponentRenderer<'text', TextComponent['props']> = ({ component }) => {
  const text = component.props.text
  if (!text) {
    return null
  }

  if (component.props.markdown) {
    return <div className="text-base text-slate-700 whitespace-pre-wrap leading-relaxed">{text}</div>
  }

  return <p className="text-base text-slate-700">{text}</p>
}

const buttonsRenderer: RuntimeComponentRenderer<'buttons', ButtonsComponent['props']> = ({ component, context }) => {
  const buttons = component.props.buttons ?? []
  if (!buttons.length) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        No buttons configured.
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-3">
      {buttons.map((button) => (
        <Button
          key={button.id}
          type="button"
          onClick={async () => {
            // Emit event if configured
            if (button.events?.onClick && context.sessionId) {
              try {
                await submitEvent(context.sessionId, {
                  type: button.events.onClick.type ?? 'button_click',
                  timestamp: new Date().toISOString(),
                  componentType: 'buttons',
                  componentId: component.id ?? 'unknown',
                  data: {
                    button_id: button.id,
                    label: button.text,
                    ...button.events.onClick.data,
                  },
                })
              } catch (error) {
                console.error('Failed to submit button event', error)
              }
            }

            void context.onAction(button.action)
          }}
        >
          {button.text}
        </Button>
      ))}
    </div>
  )
}

const mediaRenderer: RuntimeComponentRenderer<'media', MediaComponent['props']> = ({ component, context }) => {
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

  // Event handlers
  const createEventHandler = (eventName: 'onPlay' | 'onPause' | 'onSeek' | 'onComplete' | 'onError') => {
    if (!component.events?.[eventName] || !context.sessionId) return undefined

    const eventConfig = component.events[eventName]
    if (!eventConfig) return undefined

    return async (data?: Record<string, unknown>) => {
      if (!context.sessionId) {
        console.error('No sessionId provided for event submission')
        return
      }
      try {
        await submitEvent(context.sessionId as string, {
          type: eventConfig.type ?? `media_${eventName.toLowerCase()}`,
          timestamp: new Date().toISOString(),
          componentType: 'media',
          componentId: component.id ?? 'unknown',
          data: {
            media_id: component.id ?? 'unknown',
            media_type: type,
            ...data,
            ...eventConfig.data,
          },
        })
      } catch (error) {
        console.error(`Failed to submit media ${eventName} event`, error)
      }
    }
  }

  return (
    <Media
      media={media}
      alt={alt || label}
      onPlay={createEventHandler('onPlay')}
      onPause={createEventHandler('onPause')}
      onSeek={(currentTime) => createEventHandler('onSeek')?.({ current_time: currentTime })}
      onComplete={createEventHandler('onComplete')}
      onError={(error) => createEventHandler('onError')?.({ error_message: error.toString() })}
    />
  )
}

const surveyRenderer: RuntimeComponentRenderer<'survey', Partial<SurveyProps>> = ({ component, context }) => {
  const props = component.props as Partial<SurveyProps>

  const handleSubmit = async (values: Record<string, unknown>) => {
    if (props.onSubmitValues) {
      await props.onSubmitValues(values)
    }

    // Submit event if we have a sessionId (remote mode)
    if (context.sessionId) {
      try {
        await submitEvent(context.sessionId, {
          type: 'survey_submission',
          timestamp: new Date().toISOString(),
          componentType: 'survey',
          componentId: component.id ?? 'unknown',
          data: values,
        })
      } catch (error) {
        console.error('Failed to submit survey event', error)
      }
    }
  }

  return (
    <Survey
      {...props}
      onSubmitValues={handleSubmit}
      registerNavigationGuard={props.registerNavigationGuard ?? context.registerNavigationGuard}
    />
  )
}

registerComponent('text', textRenderer)
registerComponent('buttons', buttonsRenderer)
registerComponent('media', mediaRenderer)
registerComponent('survey', surveyRenderer)


