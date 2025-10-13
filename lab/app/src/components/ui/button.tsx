import { forwardRef } from 'react'

import type { ComponentPropsWithoutRef, ElementRef } from 'react'

import { cn } from '../../lib/utils'

const baseClasses =
  'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-transparent px-5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:pointer-events-none disabled:opacity-50 active:scale-97'

const variants: Record<string, string> = {
  default: 'bg-black text-white shadow hover:bg-black/90',
  ghost: 'bg-white text-slate-900 border border-slate-300 shadow-sm hover:bg-slate-100',
}

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: keyof typeof variants
}

export const Button = forwardRef<ElementRef<'button'>, ButtonProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(baseClasses, variants[variant] ?? variants.default, className)}
        {...props}
      />
    )
  },
)

Button.displayName = 'Button'

