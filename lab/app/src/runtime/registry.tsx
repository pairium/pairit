import type { ReactElement } from 'react'

import type { ButtonAction, ButtonsComponent, ComponentInstance, TextComponent } from './types'

import { Button } from '../components/ui/button'
import { Survey, type SurveyProps } from '@components/survey'

export type NavigationGuard = () => boolean | undefined | Promise<boolean | undefined>

export interface RuntimeComponentContext {
  onAction: (action: ButtonAction) => Promise<void> | void
  registerNavigationGuard: (guard: NavigationGuard) => () => void
}

export type RuntimeComponentRenderer<T extends ComponentInstance = ComponentInstance> = (input: {
  component: T
  context: RuntimeComponentContext
}) => ReactElement | null

const registry = new Map<string, RuntimeComponentRenderer>()

let fallbackRenderer: RuntimeComponentRenderer = ({ component }) => (
  <div className="text-sm text-red-600">Unknown component: {String(component.type)}</div>
)

export function registerComponent(type: string, renderer: RuntimeComponentRenderer) {
  registry.set(type, renderer)
}

export function unregisterComponent(type: string) {
  registry.delete(type)
}

export function setFallbackComponent(renderer: RuntimeComponentRenderer) {
  fallbackRenderer = renderer
}

export function getComponentRenderer(type: string): RuntimeComponentRenderer {
  return registry.get(type) ?? fallbackRenderer
}

const TextRenderer: RuntimeComponentRenderer<TextComponent> = ({ component }) => {
  return <p className="text-lg leading-relaxed text-slate-800">{component.props.text}</p>
}

const ButtonsRenderer: RuntimeComponentRenderer<ButtonsComponent> = ({ component, context }) => {
  return (
    <div className="flex flex-wrap gap-3">
      {component.props.buttons.map((button) => (
        <Button
          key={button.id}
          onClick={() => {
            void context.onAction(button.action)
          }}
        >
          {button.text}
        </Button>
      ))}
    </div>
  )
}

const SurveyRenderer: RuntimeComponentRenderer = ({ component, context }) => {
  const props = (component.props ?? {}) as SurveyProps
  return <Survey {...props} registerNavigationGuard={context.registerNavigationGuard} />
}

if (!registry.has('text')) {
  registerComponent('text', TextRenderer as RuntimeComponentRenderer)
}

if (!registry.has('buttons')) {
  registerComponent('buttons', ButtonsRenderer as RuntimeComponentRenderer)
}

if (!registry.has('survey')) {
  registerComponent('survey', SurveyRenderer)
}
