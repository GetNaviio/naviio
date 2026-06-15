/**
 * Thin wrapper over Vercel Blob for public asset uploads (white-label logos).
 *
 * The import specifier is held in a variable on purpose: it stops the compiler
 * from resolving '@vercel/blob' at build time, so the repo type-checks before
 * the package is installed (it's an optional, deploy-time dependency). At
 * runtime, `npm i @vercel/blob` + BLOB_READ_WRITE_TOKEN make it live.
 */

interface PutResult {
  url: string
}

export const blobConfigured = (): boolean => !!process.env.BLOB_READ_WRITE_TOKEN

/** Upload bytes to Vercel Blob with public read access; returns the public URL. */
export async function putPublic(
  pathname: string,
  body: ArrayBuffer | Buffer,
  contentType: string,
): Promise<string> {
  const spec = '@vercel/blob'
  const mod = (await import(/* webpackIgnore: true */ spec)) as {
    put: (path: string, body: ArrayBuffer | Buffer, opts: Record<string, unknown>) => Promise<PutResult>
  }
  const { url } = await mod.put(pathname, body, {
    access: 'public',
    contentType,
    addRandomSuffix: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })
  return url
}
