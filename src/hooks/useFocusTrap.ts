'use client'

import { useEffect, useRef } from 'react'

/**
 * Accessibility focus management for overlays (dialogs, popovers, drawers).
 * While `active`, it:
 *   - moves focus into the overlay (first focusable element, else the container),
 *   - keeps Tab / Shift+Tab cycling within the overlay (a focus trap),
 *   - closes on Escape via `onClose`,
 *   - restores focus to whatever was focused before it opened, on close.
 *
 * Attach the returned ref to the overlay container; give that container
 * `tabIndex={-1}` so it can hold focus when it has no focusable children yet.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  active: boolean,
  onClose?: () => void,
) {
  const ref = useRef<T>(null)

  useEffect(() => {
    if (!active) return
    const node = ref.current
    if (!node) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === node,
      )

    // Move focus into the overlay.
    ;(focusables()[0] ?? node).focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        e.preventDefault()
        node.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement
      if (e.shiftKey && (current === first || current === node)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && current === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      // Restore focus to the trigger so keyboard users aren't dropped at the top.
      previouslyFocused?.focus?.()
    }
  }, [active, onClose])

  return ref
}
