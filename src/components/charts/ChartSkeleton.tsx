/**
 * Placeholder shown while a chart's code chunk loads. Charts pull in recharts
 * (a large dependency), so every chart is loaded lazily via next/dynamic — this
 * keeps recharts out of the initial bundle. No recharts import here.
 */
export default function ChartSkeleton({ height = 256 }: { height?: number }) {
  return (
    <div
      className="w-full rounded-lg animate-pulse"
      style={{ height, backgroundColor: 'var(--color-surface-bg)' }}
      aria-hidden="true"
    />
  )
}
