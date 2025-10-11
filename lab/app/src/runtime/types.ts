export type ButtonAction = { type: 'go_to'; target: string }

export type Button = { id: string; text: string; action: ButtonAction }

export type TextComponent = { type: 'text'; props: { text: string; markdown?: boolean } }

export type ButtonsComponent = { type: 'buttons'; props: { buttons: Button[] } }

export type ComponentInstance = TextComponent | ButtonsComponent

export type Page = {
  id: string
  end?: boolean
  components?: ComponentInstance[]
}
