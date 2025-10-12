export type ButtonAction = { type: 'go_to'; target: string }

export type Button = { id: string; text: string; action: ButtonAction }

export interface ComponentInstance<Type extends string = string, Props extends Record<string, unknown> = Record<string, unknown>> {
  type: Type
  props: Props
}

export type TextComponent = ComponentInstance<'text', { text: string; markdown?: boolean }>

export type ButtonsComponent = ComponentInstance<'buttons', { buttons: Button[] }>

export type AnyComponentInstance = ComponentInstance<string, Record<string, unknown>>

export type Page = {
  id: string
  end?: boolean
  components?: ComponentInstance[]
}
