'use client'

/**
 * Spreadsheet sync controls shared by the FP&A tabs: a plain-download export
 * link and a file-picker import button. Works with Excel and Google Sheets —
 * one .xlsx format both ways (Sheets: File ▸ Download ▸ .xlsx to re-import).
 */
import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'

const btn = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50'
const btnStyle = {
  backgroundColor: 'var(--color-surface-input)',
  border: '1px solid var(--color-surface-border)',
  color: 'var(--color-text-primary)',
} as const

export function ExportLink({ year, template }: { year?: string; template?: boolean }) {
  const params = new URLSearchParams()
  if (year) params.set('year', year)
  if (template) params.set('template', '1')
  const qs = params.toString()
  const href = `/api/model/fpa-export${qs ? `?${qs}` : ''}`
  return (
    <a
      href={href}
      download
      className={btn}
      style={btnStyle}
      title={
        template
          ? 'Download a blank import template (.xlsx) — Budget grid + Workforce sheet, ready to fill in Excel or Google Sheets.'
          : 'Download the FP&A workbook (.xlsx) — TTM Forecast, Budget, and Workforce sheets. Opens in Excel and Google Sheets; the Budget and Workforce sheets double as import templates.'
      }
    >
      <Download size={14} /> {template ? 'Template' : 'Export .xlsx'}
    </a>
  )
}

export function ImportButton({
  endpoint,
  fields,
  onResult,
}: {
  endpoint: string
  /** Extra form fields (e.g. { mode: 'replace' }). */
  fields?: Record<string, string>
  /** Called with a user-facing message; isError distinguishes styling. */
  onResult: (message: string, isError: boolean) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(file: File) {
    setBusy(true)
    try {
      const form = new FormData()
      form.set('file', file)
      for (const [k, v] of Object.entries(fields ?? {})) form.set(k, v)
      const res = await fetch(endpoint, { method: 'POST', body: form })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        onResult(body?.error ?? 'Import failed — please check the file and try again.', true)
      } else {
        onResult(`Imported ${body?.imported ?? 0} row${body?.imported === 1 ? '' : 's'}.`, false)
      }
    } catch {
      onResult('Import failed — please check the file and try again.', true)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = '' // allow re-selecting the same file
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
        }}
      />
      <button
        type="button"
        className={btn}
        style={btnStyle}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        title="Import from .xlsx (use the exported sheet as the template; Google Sheets: File ▸ Download ▸ .xlsx)"
      >
        <Upload size={14} /> {busy ? 'Importing…' : 'Import'}
      </button>
    </>
  )
}
