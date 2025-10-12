import { forwardRef } from 'react'

import type { ComponentPropsWithoutRef, ElementRef } from 'react'

import { cn } from '@app/lib/utils'

const textareaClasses =
  'w-full min-h-[144px] rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-50'

export const Textarea = forwardRef<ElementRef<'textarea'>, ComponentPropsWithoutRef<'textarea'>>(
  ({ className, ...props }, ref) => {
    return <textarea ref={ref} className={cn(textareaClasses, className)} {...props} />
  },
)

Textarea.displayName = 'Textarea'


