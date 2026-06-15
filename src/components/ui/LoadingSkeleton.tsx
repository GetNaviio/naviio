interface SkeletonProps {
  className?: string
  height?: number | string
  width?: number | string
  rounded?: string
}

function Bone({ className = '', height = 16, width = '100%', rounded = 'rounded' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse ${rounded} ${className}`}
      style={{ height, width, backgroundColor: 'var(--color-surface-border)' }}
    />
  )
}

export function MetricCardSkeleton() {
  return (
    <div className="rounded-xl p-5 flex flex-col gap-3" style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}>
      <div className="flex items-start justify-between">
        <Bone width="45%" height={14} />
        <Bone width={36} height={36} rounded="rounded-lg" />
      </div>
      <Bone width="60%" height={28} rounded="rounded-md" />
      <Bone width="75%" height={12} />
    </div>
  )
}

export function CardSkeleton({ rows = 4, height = 200 }: { rows?: number; height?: number }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-surface-border)' }}>
      <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-surface-border)' }}>
        <div className="space-y-1.5">
          <Bone width={140} height={14} />
          <Bone width={100} height={11} />
        </div>
      </div>
      <div className="p-5 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Bone key={i} width={`${100 - i * 8}%`} height={12} />
        ))}
        <div className="pt-2">
          <Bone width="100%" height={height - rows * 24} rounded="rounded-lg" />
        </div>
      </div>
    </div>
  )
}

export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div className="w-full animate-pulse rounded-lg" style={{ height, backgroundColor: 'var(--color-surface-border)' }} />
  )
}

export function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CardSkeleton height={300} rows={2} />
        <CardSkeleton height={300} rows={2} />
      </div>
    </div>
  )
}
