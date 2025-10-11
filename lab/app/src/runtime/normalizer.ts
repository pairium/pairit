import type { Button, ButtonsComponent, ComponentInstance, Page, TextComponent } from './types'

type RawButton = Partial<Button> & { text?: unknown; action?: unknown }

type RawComponent =
  | { type?: unknown; props?: unknown; buttons?: unknown; text?: unknown; component?: unknown }
  | undefined

type RawPage = Partial<Page> & {
  text?: unknown
  buttons?: unknown
  components?: unknown
  componentType?: unknown
  props?: unknown
}

interface NormalizationOptions {
  pageId: string
}

function normalizeButton(raw: unknown, options: NormalizationOptions): Button | null {
  if (!raw || typeof raw !== 'object') return null
  const button = raw as RawButton
  const text = typeof button.text === 'string' ? button.text.trim() : null
  const action = button.action
  if (!text || !action || typeof action !== 'object') return null
  const goTo = action as { type?: unknown; target?: unknown }
  if (goTo.type !== 'go_to' || typeof goTo.target !== 'string') return null
  const id = typeof button.id === 'string' && button.id.trim().length > 0 ? button.id.trim() : `${options.pageId}_${text}`
  return {
    id,
    text,
    action: { type: 'go_to', target: goTo.target },
  }
}

function normalizeButtonsComponent(raw: RawComponent, options: NormalizationOptions): ButtonsComponent | null {
  if (!raw) return null
  const props = (raw.props ?? raw) as { buttons?: unknown }
  const buttonsInput = props.buttons
  const buttonsArray = Array.isArray(buttonsInput) ? buttonsInput : Array.isArray(raw) ? raw : null
  if (!buttonsArray) return null
  const buttons = buttonsArray
    .map((button) => normalizeButton(button, options))
    .filter((entry): entry is Button => Boolean(entry))
  if (!buttons.length) return null
  return { type: 'buttons', props: { buttons } }
}

function normalizeTextComponent(raw: RawComponent): TextComponent | null {
  if (!raw) return null
  const props = raw.props ?? raw
  const text = typeof (props as { text?: unknown }).text === 'string' ? (props as { text: string }).text : null
  if (!text && typeof raw.text === 'string') {
    return { type: 'text', props: { text: raw.text } }
  }
  if (!text) return null
  return { type: 'text', props: { text } }
}

function normalizeComponent(raw: RawComponent, options: NormalizationOptions): ComponentInstance | null {
  if (!raw) return null
  const type = typeof raw.type === 'string' ? raw.type : undefined
  if (type === 'text') return normalizeTextComponent(raw)
  if (type === 'buttons') return normalizeButtonsComponent(raw, options)
  if (!type && typeof raw.text === 'string') return normalizeTextComponent({ ...raw, type: 'text' })
  if (!type && Array.isArray(raw)) return normalizeButtonsComponent({ type: 'buttons', props: { buttons: raw } }, options)
  return null
}

export function normalizePage(raw: RawPage): Page | null {
  if (!raw || typeof raw !== 'object') return null

  const id = typeof raw.id === 'string' ? raw.id : null
  if (!id) return null

  const components: ComponentInstance[] = []

  if (typeof raw.text === 'string') {
    components.push({ type: 'text', props: { text: raw.text } })
  }

  if (Array.isArray(raw.buttons)) {
    const buttons = raw.buttons
      .map((button) => normalizeButton(button, { pageId: id }))
      .filter((entry): entry is Button => Boolean(entry))
    if (buttons.length) {
      components.push({ type: 'buttons', props: { buttons } })
    }
  }

  const componentsInput = Array.isArray(raw.components)
    ? (raw.components as unknown[])
    : Array.isArray(raw.componentType)
      ? (raw.componentType as unknown[])
      : undefined

  if (componentsInput) {
    for (const entry of componentsInput) {
      const component = normalizeComponent(entry, { pageId: id })
      if (component) components.push(component)
    }
  }

  if (!components.length) {
    return {
      id,
      end: Boolean(raw.end),
      components: [],
    }
  }

  return {
    id,
    end: Boolean(raw.end),
    components,
  }
}

export function normalizeConfig(config: unknown): { initialPageId: string; pages: Record<string, Page> } | null {
  if (!config || typeof config !== 'object') return null
  const parsed = config as { initialPageId?: unknown; initialNodeId?: unknown; pages?: unknown; nodes?: unknown }

  const initialPageId =
    typeof parsed.initialPageId === 'string'
      ? parsed.initialPageId
      : typeof parsed.initialNodeId === 'string'
        ? parsed.initialNodeId
        : null
  if (!initialPageId) return null

  const pagesInput = parsed.pages ?? parsed.nodes

  if (!pagesInput || (typeof pagesInput !== 'object' && !Array.isArray(pagesInput))) return null

  const pages: Record<string, Page> = {}

  const entries: Array<[string, unknown]> = Array.isArray(pagesInput)
    ? (pagesInput as unknown[]).map((value) => [typeof value === 'object' && value && 'id' in value ? String((value as { id: unknown }).id) : '', value])
    : Object.entries(pagesInput as Record<string, unknown>)

  for (const [key, value] of entries) {
    const page = normalizePage(value as RawPage)
    if (!page) continue
    pages[page.id] = page
  }

  if (!pages[initialPageId]) return null

  return { initialPageId, pages }
}

