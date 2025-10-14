import { useCallback, useEffect, useMemo } from 'react'

import type { ReactElement } from 'react'

import { useForm, type AnyFieldApi } from '@tanstack/react-form'
import { z } from 'zod'

import { Checkbox } from '@components/ui/checkbox'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@components/ui/field'
import { Input } from '@components/ui/input'
import { RadioGroup, RadioGroupItem } from '@components/ui/radio-group'
import { Textarea } from '@components/ui/textarea'

import { cn } from '@app/lib/utils'

import type { ButtonAction } from '../../runtime/types'

export interface SurveyItemChoice {
  value: string
  label: string
}

const LIKERT5_CHOICES: SurveyItemChoice[] = [
  { value: '1', label: 'Strongly disagree' },
  { value: '2', label: 'Disagree' },
  { value: '3', label: 'Neutral' },
  { value: '4', label: 'Agree' },
  { value: '5', label: 'Strongly agree' },
]

const LIKERT7_CHOICES: SurveyItemChoice[] = [
  { value: '1', label: 'Strongly disagree' },
  { value: '2', label: 'Disagree' },
  { value: '3', label: 'Somewhat disagree' },
  { value: '4', label: 'Neutral' },
  { value: '5', label: 'Somewhat agree' },
  { value: '6', label: 'Agree' },
  { value: '7', label: 'Strongly agree' },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface SurveyItemAnswer {
  type: string
  required: boolean
  placeholder?: string
  min?: number
  max?: number
  step?: number
  choices?: SurveyItemChoice[]
  component?: string
  props?: Record<string, unknown>
}

export interface SurveyItemDefinition {
  id: string
  text: string
  description?: string
  media?: Record<string, unknown>
  answer: SurveyItemAnswer
  next?: string | Record<string, string>
}

export interface SurveyProps {
  definition?: unknown
  items?: unknown
  source?: string
  title?: string
  intro?: string
  layout?: Record<string, unknown>
  onSubmitValues?: (values: Record<string, unknown>) => void | Promise<void>
  registerNavigationGuard?: (guard: (action: ButtonAction) => boolean | undefined | Promise<boolean | undefined>) => () => void
}

type FormDefaultValues = Record<string, unknown>
type SurveySchema = z.ZodObject<Record<string, z.ZodTypeAny>>

interface ResolveSurveyContentInput {
  definition?: unknown
  items?: unknown
  source?: string
}

interface ResolvedSurveyContent {
  items: SurveyItemDefinition[]
  title?: string
  intro?: string
}

export function Survey(props: SurveyProps): ReactElement | null {
  const { definition, items: itemsProp, source, title, intro, onSubmitValues, registerNavigationGuard } = props

  const { items, title: derivedTitle, intro: derivedIntro } = useMemo(
    () => resolveSurveyContent({ definition, items: itemsProp, source }),
    [definition, itemsProp, source],
  )

  const finalTitle = title ?? derivedTitle
  const finalIntro = intro ?? derivedIntro
  const hasItems = items.length > 0

  const { schema, defaults } = useMemo(() => buildFormSchema(items), [items])

  const form = useForm({
    defaultValues: defaults,
    validators: {
      onSubmit: schema,
    },
    onSubmit: async ({ value }) => {
      const transformed = transformSubmissionValue(value, items)
      console.log('Survey submitted', transformed)
      if (onSubmitValues) await onSubmitValues(transformed)
    },
  })

  const runNavigationValidation = useCallback(async (_action: ButtonAction) => {
    console.log('🛡️ Navigation guard triggered for action:', _action)

    const previousAttempts = form.state.submissionAttempts
    console.log('📊 Previous submission attempts:', previousAttempts)

    console.log('🔄 Calling form.handleSubmit()')
    await form.handleSubmit()

    const submitted = form.state.submissionAttempts > previousAttempts
    console.log('📊 New submission attempts:', form.state.submissionAttempts, 'Submitted:', submitted)

    if (!submitted) {
      console.log('❌ Form not submitted, blocking navigation')
      return false
    }

    const success = form.state.isSubmitSuccessful
    console.log('✅ Form submission success:', success)

    return success
  }, [form])

  useEffect(() => {
    if (!registerNavigationGuard) return
    const unregister = registerNavigationGuard(runNavigationValidation)
    return () => {
      unregister()
    }
  }, [registerNavigationGuard, runNavigationValidation])

  if (!hasItems) {
    return <div className="text-sm text-slate-500">No survey items configured.</div>
  }

  return (
    <div className="flex flex-col gap-8">
      {finalTitle ? <h2 className="text-xl font-semibold text-slate-900">{finalTitle}</h2> : null}
      {finalIntro ? <p className="text-base text-slate-600">{finalIntro}</p> : null}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
        className="flex flex-col gap-8"
      >
        <FieldGroup>
          {items.map((item) => (
            <form.Field key={item.id} name={item.id}>
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                const errors = resolveFieldErrors(field.state.meta.errors)

                return (
                  <Field data-invalid={isInvalid ? 'true' : undefined}>
                    <FieldContent>
                      <FieldLabel htmlFor={item.id}>{item.text}</FieldLabel>
                      {item.description ? <FieldDescription>{item.description}</FieldDescription> : null}
                      {renderMedia(item)}
                      {renderAnswerInput({ item, field })}
                      {errors?.length ? <FieldError errors={errors} /> : null}
                    </FieldContent>
                  </Field>
                )
              }}
            </form.Field>
          ))}
        </FieldGroup>

      </form>
    </div>
  )
}

interface RenderAnswerInputArgs {
  item: SurveyItemDefinition
  field: AnyFieldApi
}

function renderAnswerInput({ item, field }: RenderAnswerInputArgs): ReactElement {
  const answer = item.answer
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
  const commonProps = {
    id: item.id,
    name: item.id,
    onBlur: field.handleBlur,
    'aria-invalid': isInvalid || undefined,
  }

  switch (answer.type) {
    case 'text':
      return (
        <Input
          {...commonProps}
          value={String(field.state.value ?? '')}
          onChange={(event) => field.handleChange(event.target.value)}
          placeholder={answer.placeholder}
        />
      )

    case 'free_text':
      return (
        <Textarea
          {...commonProps}
          value={String(field.state.value ?? '')}
          onChange={(event) => field.handleChange(event.target.value)}
          placeholder={answer.placeholder}
        />
      )

    case 'numeric':
      return (
        <Input
          {...commonProps}
          type="number"
          value={String(field.state.value ?? '')}
          onChange={(event) => field.handleChange(event.target.value)}
          placeholder={answer.placeholder}
          min={answer.min}
          max={answer.max}
          step={answer.step}
        />
      )

    case 'multiple_choice':
    case 'likert5':
    case 'likert7': {
      const value = typeof field.state.value === 'string' ? field.state.value : ''
      return (
        <RadioGroup
          value={value.length ? value : null}
          onValueChange={(nextValue) => field.handleChange(nextValue)}
        >
          <FieldSet className="gap-2">
            <FieldLegend className="sr-only">{item.text}</FieldLegend>
            {answer.choices?.map((choice) => (
              <RadioGroupItem key={choice.value} value={choice.value} label={choice.label} />
            ))}
          </FieldSet>
        </RadioGroup>
      )
    }

    case 'multi_select': {
      const currentValue = Array.isArray(field.state.value) ? (field.state.value as string[]) : []

      return (
        <FieldSet className="gap-3">
          <FieldLegend className="sr-only">{item.text}</FieldLegend>
          {answer.choices?.map((choice) => {
            const checked = currentValue.includes(choice.value)
            const inputId = `${item.id}_${choice.value}`.replace(/[^a-zA-Z0-9_-]/g, '_')
            return (
              <label
                key={choice.value}
                htmlFor={inputId}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50',
                  { 'border-slate-900 bg-slate-900/5': checked },
                )}
              >
                <Checkbox
                  id={inputId}
                  checked={checked}
                  onChange={(event) => {
                    const next = new Set(currentValue)
                    if (event.target.checked) {
                      next.add(choice.value)
                    } else {
                      next.delete(choice.value)
                    }
                    field.handleChange(Array.from(next))
                  }}
                  onBlur={field.handleBlur}
                  name={item.id}
                />
                <span className="text-sm text-slate-900">{choice.label}</span>
              </label>
            )
          })}
        </FieldSet>
      )
    }

    default:
      return (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Unsupported answer type: <code>{answer.type}</code>
        </div>
      )
  }
}

function resolveFieldErrors(errors: unknown[] | undefined): string[] | undefined {
  if (!errors?.length) return undefined

  const resolved = errors.flatMap((error) => {
    if (!error) return []
    if (Array.isArray(error)) return resolveFieldErrors(error) ?? []
    if (typeof error === 'string') return [error]
    if (typeof error === 'object' && 'message' in (error as Record<string, unknown>)) {
      const message = (error as { message?: unknown }).message
      if (typeof message === 'string') return [message]
    }
    return [String(error)]
  })

  const unique = Array.from(new Set(resolved))

  return unique.length ? unique : undefined
}

function renderMedia(item: SurveyItemDefinition): ReactElement | null {
  const media = item.media
  if (!media) return null

  const type = typeof media.type === 'string' ? media.type : typeof media.kind === 'string' ? media.kind : null
  const src = typeof media.src === 'string' ? media.src : typeof media.url === 'string' ? media.url : null

  if (!type || !src) return null

  if (type === 'image') {
    return <img src={src} alt={item.text} className="max-h-48 w-full rounded-lg object-cover" />
  }

  if (type === 'video') {
    const captionsSrc = typeof media.captions === 'string' ? media.captions : undefined
    if (!captionsSrc) {
      return (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Video content requires captions. Provide a <code>captions</code> source to render the player or{' '}
          <a className="underline" href={src} target="_blank" rel="noreferrer">
            download the video
          </a>
          .
        </div>
      )
    }

    const mediaLabel =
      typeof media.label === 'string'
        ? media.label
        : typeof media.alt === 'string'
          ? media.alt
          : item.text

    return (
      <video controls className="w-full rounded-lg" aria-label={mediaLabel}>
        <source src={src} />
        <track kind="captions" src={captionsSrc} label="Captions" default />
        Your browser does not support the video tag.
      </video>
    )
  }

  return null
}

function resolveSurveyContent({ definition, items, source }: ResolveSurveyContentInput): ResolvedSurveyContent {
  const containerCandidate = isRecord(definition)
    ? definition
    : isRecord(items)
      ? items
      : null

  const rawItems = Array.isArray(items)
    ? items
    : Array.isArray(definition)
      ? definition
      : containerCandidate && Array.isArray((containerCandidate as { items?: unknown }).items)
        ? ((containerCandidate as { items?: unknown[] }).items ?? [])
        : []

  const normalizedSource = typeof source === 'string' && source.trim().length ? source.trim().replace(/\s+/g, '_') : 'survey'
  const idPrefix = `${normalizedSource}_question_`

  const resolvedItems = (rawItems as unknown[])
    .map((entry, index) => normalizeSurveyItem(entry, index, { idPrefix }))
    .filter((entry): entry is SurveyItemDefinition => Boolean(entry))

  const resolvedTitle =
    containerCandidate && typeof (containerCandidate as { title?: unknown }).title === 'string'
      ? ((containerCandidate as { title?: string }).title ?? '').trim()
      : undefined

  const resolvedIntro =
    containerCandidate && typeof (containerCandidate as { intro?: unknown }).intro === 'string'
      ? ((containerCandidate as { intro?: string }).intro ?? '').trim()
      : undefined

  return {
    items: resolvedItems,
    title: resolvedTitle,
    intro: resolvedIntro,
  }
}

function normalizeSurveyItem(raw: unknown, index: number, options: { idPrefix: string }): SurveyItemDefinition | null {
  if (!isRecord(raw)) return null

  const record = raw as Record<string, unknown>

  const idCandidate = typeof record.id === 'string' ? record.id.trim() : ''
  const id = idCandidate.length ? idCandidate : `${options.idPrefix}${index + 1}`

  const textCandidate = typeof record.text === 'string' ? record.text.trim() : ''
  if (!textCandidate.length) return null

  const description = typeof record.description === 'string' ? record.description.trim() : undefined
  const media = record.media && isRecord(record.media) ? (record.media as Record<string, unknown>) : undefined
  const answer = normalizeSurveyAnswer(record)
  if (!answer) return null
  const next = normalizeSurveyNext(record.next)

  return {
    id,
    text: textCandidate,
    description,
    media,
    answer,
    next,
  }
}

function normalizeSurveyAnswer(record: Record<string, unknown>): SurveyItemAnswer | null {
  const answerInput = record.answer ?? record.answer_type ?? record.answerType

  let required = record.required !== false

  let type: string | undefined
  let answerConfig: Record<string, unknown> = {}

  if (typeof answerInput === 'string') {
    type = answerInput.trim()
  } else if (isRecord(answerInput)) {
    const answerRecord = answerInput as Record<string, unknown>
    if (typeof answerRecord.required === 'boolean') {
      required = answerRecord.required
    }
    if (typeof answerRecord.type === 'string') {
      type = answerRecord.type.trim()
      answerConfig = answerRecord.props && isRecord(answerRecord.props) ? (answerRecord.props as Record<string, unknown>) : answerRecord
    } else if (typeof answerRecord.component === 'string') {
      type = 'custom'
      answerConfig = answerRecord
    } else {
      const entry = Object.entries(answerRecord)[0]
      if (entry && typeof entry[0] === 'string') {
        type = entry[0].trim()
        answerConfig = isRecord(entry[1]) ? (entry[1] as Record<string, unknown>) : {}
      }
    }
  }

  if (!type) return null

  const normalizedType = type.replace(/[-\s]/g, '_').toLowerCase()

  const numericBoundsSource = isRecord(answerConfig) ? answerConfig : {}
  const placeholderCandidate = answerConfig.placeholder ?? record.placeholder

  if (normalizedType === 'custom' || normalizedType === 'component') {
    const componentId = typeof answerConfig.component === 'string'
      ? answerConfig.component
      : typeof (record as { component?: unknown }).component === 'string'
        ? (record as { component?: string }).component
        : undefined

    if (!componentId) return null

    const props = answerConfig.props && isRecord(answerConfig.props) ? (answerConfig.props as Record<string, unknown>) : answerConfig
    return {
      type: 'custom',
      required,
      component: componentId,
      props,
    }
  }

  switch (normalizedType) {
    case 'text':
    case 'free_text':
      return {
        type: normalizedType,
        required,
        placeholder: typeof placeholderCandidate === 'string' ? placeholderCandidate : undefined,
      }

    case 'numeric':
    case 'number': {
      const min = typeof numericBoundsSource.min === 'number' ? numericBoundsSource.min : typeof record.min === 'number' ? record.min : undefined
      const max = typeof numericBoundsSource.max === 'number' ? numericBoundsSource.max : typeof record.max === 'number' ? record.max : undefined
      const step = typeof numericBoundsSource.step === 'number' ? numericBoundsSource.step : typeof record.step === 'number' ? record.step : undefined

      return {
        type: 'numeric',
        required,
        min,
        max,
        step,
        placeholder: typeof placeholderCandidate === 'string' ? placeholderCandidate : undefined,
      }
    }

    case 'radio':
    case 'multiple_choice': {
      const choices =
        normalizeSurveyChoices((numericBoundsSource as { choices?: unknown }).choices) ??
        normalizeSurveyChoices((record as { choices?: unknown }).choices)

      if (!choices) return null

      return {
        type: 'multiple_choice',
        required,
        choices,
      }
    }

    case 'checkbox':
    case 'multi_select': {
      const choices =
        normalizeSurveyChoices((numericBoundsSource as { choices?: unknown }).choices) ??
        normalizeSurveyChoices((record as { choices?: unknown }).choices)

      if (!choices) return null

      return {
        type: 'multi_select',
        required,
        choices,
      }
    }

    case 'likert5':
    case 'likert_5': {
      const choices =
        normalizeSurveyChoices((numericBoundsSource as { choices?: unknown }).choices) ??
        normalizeSurveyChoices((record as { choices?: unknown }).choices) ??
        LIKERT5_CHOICES

      return {
        type: 'likert5',
        required,
        choices,
      }
    }

    case 'likert7':
    case 'likert_7': {
      const choices =
        normalizeSurveyChoices((numericBoundsSource as { choices?: unknown }).choices) ??
        normalizeSurveyChoices((record as { choices?: unknown }).choices) ??
        LIKERT7_CHOICES

      return {
        type: 'likert7',
        required,
        choices,
      }
    }

    default:
      return null
  }
}

function normalizeSurveyChoices(raw: unknown): SurveyItemChoice[] | null {
  if (!Array.isArray(raw)) return null

  const choices: SurveyItemChoice[] = []

  for (const entry of raw) {
    if (typeof entry === 'string') {
      const value = entry.trim()
      if (value.length) choices.push({ value, label: value })
      continue
    }

    if (isRecord(entry)) {
      const choiceRecord = entry as Record<string, unknown>
      const valueCandidate = choiceRecord.value ?? choiceRecord.id ?? choiceRecord.slug
      const labelCandidate = choiceRecord.label ?? choiceRecord.text ?? choiceRecord.name ?? valueCandidate

      if (typeof valueCandidate === 'string') {
        const value = valueCandidate.trim()
        if (!value.length) continue
        const label = typeof labelCandidate === 'string' && labelCandidate.trim().length ? labelCandidate.trim() : value
        choices.push({ value, label })
      }
    }
  }

  return choices.length ? choices : null
}

function normalizeSurveyNext(raw: unknown): string | Record<string, string> | undefined {
  if (!raw) return undefined

  if (typeof raw === 'string') {
    const target = raw.trim()
    return target.length ? target : undefined
  }

  if (!isRecord(raw)) return undefined

  const mappingEntries = Object.entries(raw as Record<string, unknown>)
    .map(([key, value]) => (typeof value === 'string' && value.trim().length ? [key, value.trim()] : null))
    .filter((entry): entry is [string, string] => Boolean(entry))

  if (!mappingEntries.length) return undefined

  return Object.fromEntries(mappingEntries)
}

function buildFormSchema(items: SurveyItemDefinition[]): { schema: SurveySchema; defaults: FormDefaultValues } {
  const shape: Record<string, z.ZodTypeAny> = {}
  const defaults: FormDefaultValues = {}

  for (const item of items) {
    const answer = item.answer
    switch (answer.type) {
      case 'text':
      case 'free_text':
        shape[item.id] = buildStringSchema(answer)
        defaults[item.id] = ''
        break
      case 'numeric':
        shape[item.id] = buildNumericSchema(answer)
        defaults[item.id] = ''
        break
      case 'multiple_choice':
      case 'likert5':
      case 'likert7':
        shape[item.id] = buildChoiceSchema(answer)
        defaults[item.id] = ''
        break
      case 'multi_select':
        shape[item.id] = buildMultiSelectSchema(answer)
        defaults[item.id] = []
        break
      default:
        shape[item.id] = z.unknown()
        defaults[item.id] = null
        break
    }
  }

  return {
    schema: z.object(shape),
    defaults,
  }
}

function buildStringSchema(answer: SurveyItemAnswer): z.ZodTypeAny {
  const base = z.string({ required_error: 'Required' })
  return answer.required ? base.min(1, 'This field is required') : base
}

function buildNumericSchema(answer: SurveyItemAnswer): z.ZodTypeAny {
  const base = z.string({ required_error: 'Required' })
  let schema: z.ZodTypeAny = answer.required ? base.min(1, 'This field is required') : base

  schema = schema.refine((value: string) => {
    if (!value.trim().length) return !answer.required
    return !Number.isNaN(Number(value))
  }, 'Enter a valid number')

  if (typeof answer.min === 'number') {
    const minValue = answer.min
    schema = schema.refine((value: string) => {
      if (!value.trim().length) return !answer.required
      return Number(value) >= minValue
    }, `Must be at least ${minValue}`)
  }

  if (typeof answer.max === 'number') {
    const maxValue = answer.max
    schema = schema.refine((value: string) => {
      if (!value.trim().length) return !answer.required
      return Number(value) <= maxValue
    }, `Must be at most ${maxValue}`)
  }

  return schema
}

function buildChoiceSchema(answer: SurveyItemAnswer): z.ZodTypeAny {
  const values = answer.choices?.map((choice) => choice.value) ?? []
  const base = z.string({ required_error: 'Required' })
  let schema: z.ZodTypeAny = answer.required ? base.min(1, 'Select an option') : base

  if (values.length) {
    schema = schema.refine((value: string) => {
      if (!value.trim().length) return !answer.required
      return values.includes(value)
    }, 'Select an option')
  }

  return schema
}

function buildMultiSelectSchema(answer: SurveyItemAnswer): z.ZodTypeAny {
  const values = answer.choices?.map((choice) => choice.value) ?? []
  const base = z.array(z.string())
  let schema: z.ZodTypeAny = answer.required ? base.min(1, 'Select at least one option') : base

  schema = schema.refine((selected: string[]) => {
    if (!values.length) return true
    return selected.every((value) => values.includes(value))
  }, 'Select valid options')

  return schema
}

function transformSubmissionValue(
  value: Record<string, unknown>,
  items: SurveyItemDefinition[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const item of items) {
    const itemValue = value[item.id]
    switch (item.answer.type) {
      case 'numeric':
        if (typeof itemValue === 'string') {
          result[item.id] = itemValue.trim().length ? Number(itemValue) : null
        } else {
          result[item.id] = itemValue
        }
        break
      case 'multi_select':
        result[item.id] = Array.isArray(itemValue) ? itemValue : []
        break
      default:
        result[item.id] = itemValue
        break
    }
  }

  return result
}


