import * as React from 'react'
import { cn } from '@/utils/formatters'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  showCount?: boolean
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, showCount, value, ...props }, ref) => {
    const count = typeof value === 'string' ? value.length : 0
    return (
      <div className="w-full">
        {label && (
          <label className="block text-xs font-medium text-[var(--sm-text-3)] mb-1.5">{label}</label>
        )}
        <textarea
          className={cn(
            'flex min-h-[80px] w-full rounded-lg border px-3 py-2 text-sm '+'bg-[var(--sm-field-bg)] border-[var(--sm-field-border)] text-[var(--sm-text-1)] placeholder:text-[var(--sm-text-4)]',
            'transition-all duration-200 resize-y',
            'focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/45',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-[#ef4444]',
            className
          )}
          ref={ref}
          value={value}
          {...props}
        />
        {(showCount || error) && (
          <div className="flex justify-between mt-1">
            <span>{error && <p className="text-xs text-red-400">{error}</p>}</span>
            {showCount && (
              <span className="text-xs text-gray-500">{count} chars</span>
            )}
          </div>
        )}
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'

export { Textarea }
