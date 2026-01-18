import { registerComponent } from './registry'
import type { RuntimeComponentRenderer } from './registry'

export interface RuntimeComponentDefinition<Type extends string, Props extends Record<string, unknown> = Record<string, unknown>> {
  type: Type
  renderer: RuntimeComponentRenderer<Type, Props>
  normalize?: (input: unknown) => Props | null
}

export function defineRuntimeComponent<Type extends string, Props extends Record<string, unknown> = Record<string, unknown>>(
  definition: RuntimeComponentDefinition<Type, Props>,
): RuntimeComponentDefinition<Type, Props> {
  registerComponent(definition.type, definition.renderer)
  return definition
}

