import type { ComponentInstance, Page } from './types'

import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'

type ButtonAction = Extract<ComponentInstance, { type: 'buttons' }>['props']['buttons'][number]['action']

interface PageRendererProps {
  page: Page
  onAction: (action: ButtonAction) => void
}

export function PageRenderer({ page, onAction }: PageRendererProps) {
  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-3xl">
        <CardContent className="space-y-8">
          {page?.components?.length ? (
            page.components.map((component, index) => (
              <Component key={`${component.type}-${index}`} component={component} onAction={onAction} />
            ))
          ) : (
            <div className="text-center text-sm text-slate-500">No components provided for this page.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Component({
  component,
  onAction,
}: {
  component: ComponentInstance
  onAction: (action: ButtonAction) => void
}) {
  switch (component.type) {
    case 'text': {
      return <p className="text-lg leading-relaxed text-slate-800">{component.props.text}</p>
    }
    case 'buttons': {
      return (
        <div className="flex flex-wrap gap-3">
          {component.props.buttons.map((button) => (
            <Button key={button.id} onClick={() => onAction(button.action)}>
              {button.text}
            </Button>
          ))}
        </div>
      )
    }
    default: {
      return <div className="text-sm text-red-600">Unknown component: {String((component as { type?: unknown }).type)}</div>
    }
  }
}
