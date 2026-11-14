// Accessible confirmation built on the native <dialog>: focus is trapped,
// Escape cancels, and the safe action (Cancel) has initial focus.
import { useEffect, useId, useRef } from 'react'

export default function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', onConfirm, onCancel }) {
  const ref = useRef(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descId}
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel() // click on the backdrop
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/45 backdrop:backdrop-blur-[2px]"
    >
      {open && (
        <div className="p-5">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <p id={descId} className="mt-1.5 text-sm text-ink-2">
            {description}
          </p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              autoFocus
              onClick={onCancel}
              className="min-h-11 rounded-xl border border-line-strong px-4 text-sm font-medium hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="min-h-11 rounded-xl bg-danger px-4 text-sm font-medium text-white hover:opacity-90"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}
