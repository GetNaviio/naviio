/**
 * "Powered by Navi" — the brand mark for every AI-driven surface.
 * Drop it next to any card title via Card's `badge` prop (or render inline).
 * One component so the branding stays pixel-identical everywhere.
 */
export default function NaviBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap align-middle"
      style={{
        background: 'linear-gradient(135deg, rgba(59,130,246,0.14), rgba(20,184,166,0.14))',
        border: '1px solid rgba(20,184,166,0.35)',
        color: '#14B8A6',
        letterSpacing: '0.02em',
      }}
    >
      <span
        aria-hidden="true"
        className="flex items-center justify-center w-3 h-3 rounded-full text-[7px]"
        style={{ background: 'linear-gradient(135deg, #3B82F6, #14B8A6)', color: '#fff' }}
      >
        ✦
      </span>
      Powered by Navi
    </span>
  )
}
