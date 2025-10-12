import type { ButtonsComponent, ComponentInstance, Page } from './types'

import { Fragment } from 'react'

import { Card, CardContent } from '../components/ui/card'

import { getComponentRenderer, type RuntimeComponentContext } from './registry'

type ButtonAction = ButtonsComponent['props']['buttons'][number]['action']

interface PageRendererProps {
  page: Page
  onAction: (action: ButtonAction) => void
}

export function PageRenderer({ page, onAction }: PageRendererProps) {
  const runtimeContext: RuntimeComponentContext = { onAction }

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-3xl">
        <CardContent className="space-y-8">
          {page?.components?.length ? (
            page.components.map((component, index) => renderComponentInstance(component, index, runtimeContext))
          ) : (
            <div className="text-center text-sm text-slate-500">No components provided for this page.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function renderComponentInstance(component: ComponentInstance, index: number, context: RuntimeComponentContext) {
  const renderer = getComponentRenderer(component.type)
  return <Fragment key={`${component.type}-${index}`}>{renderer({ component, context })}</Fragment>
}
