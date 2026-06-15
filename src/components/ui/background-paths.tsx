'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
  }))

  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg className="w-full h-full text-white" viewBox="0 0 696 316" fill="none">
        <title>Background Paths</title>
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={0.08 + path.id * 0.02}
            initial={{ pathLength: 0.3, opacity: 0.6 }}
            animate={{ pathLength: 1, opacity: [0.3, 0.6, 0.3], pathOffset: [0, 1, 0] }}
            transition={{ duration: 20 + Math.random() * 10, repeat: Infinity, ease: 'linear' }}
          />
        ))}
      </svg>
    </div>
  )
}

interface BackgroundPathsProps {
  title?: string
  ctaHref?: string
  secondaryHref?: string
}

export function BackgroundPaths({
  title = 'Your financial co-pilot for growth',
  ctaHref = '/login',
  secondaryHref = '#features',
}: BackgroundPathsProps) {
  const words = title.split(' ')

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-[#0a0e1a]">
      {/* Animated paths */}
      <div className="absolute inset-0">
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />
      </div>

      {/* Subtle radial glow */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 40%, rgba(37,99,255,0.12) 0%, transparent 70%)' }} />

      <div className="relative z-10 container mx-auto px-4 md:px-6 text-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5 }}
          className="max-w-4xl mx-auto"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 mb-8 rounded-full px-4 py-1.5 text-sm font-medium"
            style={{ background: 'rgba(37,99,255,0.12)', border: '1px solid rgba(37,99,255,0.3)', color: '#93b4ff' }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#06d6a0' }} />
            Now in private beta — Q4 2026 launch
          </motion.div>

          {/* Animated title */}
          <h1 className="text-5xl sm:text-7xl md:text-8xl font-bold mb-6 tracking-tighter leading-[1.05]">
            {words.map((word, wi) => (
              <span key={wi} className="inline-block mr-4 last:mr-0">
                {word.split('').map((letter, li) => (
                  <motion.span
                    key={`${wi}-${li}`}
                    initial={{ y: 80, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: wi * 0.1 + li * 0.03, type: 'spring', stiffness: 150, damping: 25 }}
                    className="inline-block text-transparent bg-clip-text"
                    style={{ backgroundImage: 'linear-gradient(135deg, #ffffff, rgba(255,255,255,0.75))' }}
                  >
                    {letter}
                  </motion.span>
                ))}
              </span>
            ))}
          </h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="text-lg mb-10 max-w-xl mx-auto leading-relaxed"
            style={{ color: '#8892a4' }}
          >
            Connect your bank, accounting, and revenue tools — delivering CFO-level clarity in real time. No spreadsheets. No waiting on accountants.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <div className="group relative p-px rounded-2xl overflow-hidden"
              style={{ background: 'linear-gradient(135deg, rgba(37,99,255,0.4), rgba(37,99,255,0.1))' }}
            >
              <Link href={ctaHref}>
                <Button
                  variant="ghost"
                  className="rounded-[1.1rem] px-8 py-6 text-lg font-semibold text-white transition-all duration-300 group-hover:-translate-y-0.5 border-0"
                  style={{ background: '#3B82F6' }}
                >
                  <span>Start free trial</span>
                  <span className="ml-3 group-hover:translate-x-1 transition-transform duration-300">→</span>
                </Button>
              </Link>
            </div>

            <a href={secondaryHref} className="flex items-center gap-2 text-base transition-colors duration-200" style={{ color: '#8892a4' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.color = '#8892a4')}
            >
              See how it works <span>→</span>
            </a>
          </motion.div>

          {/* Integration logos */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            className="mt-16 flex flex-wrap justify-center gap-8 text-sm font-medium"
            style={{ color: 'rgba(255,255,255,0.25)' }}
          >
            {['Stripe', 'QuickBooks', 'Plaid', 'Xero', 'Gusto', 'Shopify'].map(name => (
              <span key={name} className="cursor-default transition-colors duration-200"
                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}
              >{name}</span>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
