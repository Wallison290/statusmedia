import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/utils/formatters'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/70 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, style, onPointerDownOutside, onInteractOutside, ...props }, ref) => {
  // Toque fantasma do celular: um modal que abre no lugar de outro (ex.: o lápis
  // de "editar" troca a visualização pela edição) recebia o mesmo toque no botão
  // de fechar que nasceu embaixo do dedo, e fechava na hora. Nos primeiros
  // instantes depois de abrir, toque de fechar é ignorado.
  const openedAt = React.useRef(0)
  const tooSoon = () => Date.now() - openedAt.current < 450
  // Este componente continua montado com o modal fechado: o relógio zera quando
  // o conteúdo aparece de fato, a cada abertura.
  const setNode = React.useCallback((node: HTMLDivElement | null) => {
    if (node) openedAt.current = Date.now()
    if (typeof ref === 'function') ref(node)
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
  }, [ref])

  return (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={setNode}
      style={{
        WebkitUserSelect: 'text',
        userSelect: 'text',
        background: 'var(--sm-bg-card)',
        border: '1px solid var(--sm-border)',
        color: 'var(--sm-text-1)',
        ...style,
      }}
      className={cn(
        // grid-cols-[minmax(0,1fr)]: sem isto a coluna do grid cresce até o
        // conteúdo mais largo (um select com opção comprida, um link) e o modal
        // passa da largura da tela no celular
        'fixed left-[50%] top-[50%] z-50 grid grid-cols-[minmax(0,1fr)] w-full max-w-lg translate-x-[-50%] translate-y-[-50%]',
        // Padding numa classe só (16px no celular → 24px no computador): assim um
        // `p-0` passado pelo modal zera tudo. Com `p-4 sm:p-6`, o `p-0` só anulava
        // o `p-4` e sobrava uma moldura de 24px com o fundo do modal aparecendo.
        'gap-4 p-[clamp(1rem,2.5vw,1.5rem)] shadow-2xl rounded-2xl',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
        'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
        className
      )}
      onPointerDownOutside={e => { if (tooSoon()) e.preventDefault(); else onPointerDownOutside?.(e) }}
      onInteractOutside={e => { if (tooSoon()) e.preventDefault(); else onInteractOutside?.(e) }}
      {...props}
    >
      {children}
      {/* p-2 no lugar de right-4/top-4: o ícone fica no mesmo ponto, mas a área
          de toque passa de 16px para 32px */}
      <DialogPrimitive.Close
        onClick={e => { if (tooSoon()) e.preventDefault() }}
        className="absolute right-2 top-2 p-2 rounded-lg opacity-70 hover:opacity-100 transition-opacity touch-manipulation"
        style={{ color: 'var(--sm-text-3)' }}
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Fechar</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5', className)} {...props} />
)
DialogHeader.displayName = 'DialogHeader'

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />
)
DialogFooter.displayName = 'DialogFooter'

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none', className)}
    style={{ color: 'var(--sm-text-1)' }}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm', className)}
    style={{ color: 'var(--sm-text-3)' }}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export { Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription }
