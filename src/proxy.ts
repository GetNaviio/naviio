import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/', '/api/waitlist']

// The marketing landing page shows at `/` on the public marketing domain — and
// on the ngrok tunnel, so the live site (landing + legal pages, logo, "Back to
// Naviio") can be previewed end-to-end. localhost still jumps straight to the app.
const MARKETING_HOSTS = new Set(
  ['naviio.com', 'www.naviio.com', process.env.NGROK_HOST]
    .filter(Boolean)
    .map((h) => (h as string).toLowerCase()),
)

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/') {
    const host = (request.headers.get('host') ?? '').toLowerCase().split(':')[0]
    if (!MARKETING_HOSTS.has(host)) {
      const token = request.cookies.get('markup_session')?.value
      return NextResponse.redirect(new URL(token ? '/dashboard' : '/login', request.url))
    }
    return NextResponse.next()
  }

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  const token = request.cookies.get('markup_session')?.value
  if (!token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
