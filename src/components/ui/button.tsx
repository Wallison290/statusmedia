import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/utils/formatters'
import { useTheme } from '@/contexts/ThemeContext'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] font-normal transition-colors duration-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-[#2563EB] text-white',
        destructive: 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/15',
        outline: 'border border-white/[0.08] bg-transparent text-zinc-300 hover:bg-white/[0.04] hover:text-zinc-100',
        secondary: 'bg-white/[0.05] text-zinc-200 hover:bg-white/[0.08] border border-white/[0.08]',
        ghost: 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200',
        link: 'text-blue-400 underline-offset-4 hover:underline',
        success: 'bg-green-600 text-white hover:bg-green-500',
        warning: 'bg-yellow-600 text-white hover:bg-yellow-500',
        premium: 'bg-[#2563EB] text-white',
      },
      size: {
        default: 'h-8 px-3.5 py-1.5',
        sm: 'h-7 px-3 text-[12px]',
        lg: 'h-9 px-5 text-[13px]',
        xl: 'h-10 px-6 text-sm',
        icon: 'h-8 w-8',
        'icon-sm': 'h-7 w-7',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, style, ...props }, ref) => {
    const { isDark } = useTheme()
    const Comp = asChild ? Slot : 'button'
    const lightStyle: React.CSSProperties =
      !isDark && (variant === 'outline' || variant === 'ghost' || variant === 'secondary')
        ? {
            color: 'var(--sm-text-1)',
            borderColor: variant !== 'ghost' ? 'var(--sm-border)' : undefined,
            background: variant === 'ghost' ? 'transparent' : 'var(--sm-bg-card)',
          }
        : {}
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        style={{ ...lightStyle, ...style }}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
