interface BadgeProps {
  children: React.ReactNode
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  size?: 'sm' | 'md'
}

const variants = {
  success: { bg: 'rgba(16,185,129,0.1)', color: '#10B981' },
  warning: { bg: 'rgba(245,158,11,0.1)', color: '#F59E0B' },
  danger:  { bg: 'rgba(239,68,68,0.1)',  color: '#EF4444' },
  info:    { bg: 'rgba(59,130,246,0.1)', color: '#3B82F6' },
  neutral: { bg: 'rgba(100,116,139,0.1)', color: 'var(--color-text-secondary)' },
}

export default function Badge({ children, variant = 'neutral', size = 'sm' }: BadgeProps) {
  const v = variants[variant]
  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'}`}
      style={{ backgroundColor: v.bg, color: v.color }}
    >
      {children}
    </span>
  )
}
