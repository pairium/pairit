import { PagedSurvey, type PagedSurveyPage, type PagedSurveyProps } from './PagedSurvey'
import { submitEvent } from '@app/lib/api'
import { defineRuntimeComponent } from '@app/runtime/define-runtime-component'
import type { ButtonAction } from '@app/runtime/types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const PagedSurveyRuntime = defineRuntimeComponent<'paged_survey', Partial<PagedSurveyProps>>({
  type: 'paged_survey',
  renderer: ({ component, context }) => {
    const props = component.props as Partial<PagedSurveyProps>
    const sessionId = context.sessionId
    const completeAction = normalizeButtonAction((props as { completeAction?: unknown }).completeAction)

    const pages = (props.pages ?? []).flatMap((page) => {
      if (!isRecord(page)) {
        return []
      }

      const pageId = typeof page.id === 'string' && page.id.trim().length ? page.id : null
      const surveyCandidate = (page as { survey?: unknown }).survey
      const survey = isRecord(surveyCandidate) ? (surveyCandidate as PagedSurveyPage['survey']) : null

      if (!pageId || !survey) {
        return []
      }

      const typedSurvey = survey as PagedSurveyPage['survey']
      const originalSubmit = typeof typedSurvey.onSubmitValues === 'function' ? typedSurvey.onSubmitValues : undefined

      return [
        {
          ...page,
          id: pageId,
          survey: {
            ...typedSurvey,
            onSubmitValues: async (values: Record<string, unknown>) => {
              if (originalSubmit) {
                await originalSubmit(values)
              }

              if (sessionId) {
                try {
                  await submitEvent(sessionId, {
                    type: 'survey_submission',
                    timestamp: new Date().toISOString(),
                    componentType: 'paged_survey',
                    componentId: component.id ?? 'unknown',
                    data: {
                      pageId,
                      values,
                    },
                  })
                } catch (error) {
                  console.error('Failed to submit paged survey page event', error)
                }
              }
            },
          },
        },
      ]
    })

    const handleComplete = async (responses: Record<string, Record<string, unknown>>) => {
      if (props.onComplete) {
        await props.onComplete(responses)
      }

      if (sessionId) {
        try {
          await submitEvent(sessionId, {
            type: 'survey_submission',
            timestamp: new Date().toISOString(),
            componentType: 'paged_survey',
            componentId: component.id ?? 'unknown',
            data: {
              status: 'completed',
              responses,
            },
          })
        } catch (error) {
          console.error('Failed to submit paged survey completion event', error)
        }
      }

      if (completeAction) {
        try {
          await context.onAction(completeAction)
        } catch (error) {
          console.error('Failed to run paged survey completion action', error)
        }
      }
    }

    return <PagedSurvey {...props} pages={pages} onComplete={handleComplete} />
  },
})

function normalizeButtonAction(action: unknown): ButtonAction | null {
  if (!isRecord(action)) return null

  const type = typeof action.type === 'string' ? action.type : null
  if (type !== 'go_to') return null

  const target = typeof action.target === 'string' ? action.target : null
  if (!target) return null

  const skipValidation = typeof action.skipValidation === 'boolean' ? action.skipValidation : undefined

  return {
    type: 'go_to',
    target,
    skipValidation,
  }
}


