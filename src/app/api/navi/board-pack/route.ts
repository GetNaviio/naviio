/**
 * Board-pack export — returns a print-ready HTML financial summary for the
 * authenticated org. The user saves it as PDF via the browser (Print → Save as
 * PDF). Opened after the user confirms Navi's export_board_pack action.
 */
import { requireAuth, getDefaultOrgId } from '@/lib/auth'
import { buildBoardPackHtml } from '@/lib/navi/board-pack'

export async function GET() {
  let user
  try {
    user = await requireAuth()
  } catch {
    return Response.json({ error: 'Please sign in.' }, { status: 401 })
  }
  try {
    const orgId = await getDefaultOrgId(user.id)
    const html = await buildBoardPackHtml(orgId)
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('board pack failed:', e)
    return Response.json({ error: 'Could not generate the board pack.' }, { status: 500 })
  }
}
