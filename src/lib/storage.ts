import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// ─── Client ───────────────────────────────────────────────────────────────────

const BUCKET  = process.env.AWS_S3_BUCKET  ?? 'naviio-reports-dev'
const REGION  = process.env.AWS_REGION     ?? 'us-east-1'
const BASE_URL = process.env.AWS_CLOUDFRONT_URL  // optional CDN URL

let client: S3Client | null = null

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({ region: REGION })
  }
  return client
}

// ─── Key helpers ──────────────────────────────────────────────────────────────

function reportKey(orgId: string, reportId: string): string {
  return `reports/${orgId}/${reportId}.pdf`
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Upload a report PDF to S3.
 * Returns the S3 object key.
 */
export async function uploadReport(
  orgId: string,
  reportId: string,
  buffer: Buffer,
  metadata: Record<string, string> = {},
): Promise<string> {
  const key = reportKey(orgId, reportId)

  await getClient().send(
    new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         key,
      Body:        buffer,
      ContentType: 'application/pdf',
      Metadata: {
        orgId,
        reportId,
        uploadedAt: new Date().toISOString(),
        ...metadata,
      },
      ServerSideEncryption: 'AES256',
    }),
  )

  return key
}

/**
 * Generate a pre-signed URL for a report (default expiry: 1 hour).
 * Falls back to CloudFront URL if AWS_CLOUDFRONT_URL is set.
 */
export async function getReportUrl(
  key: string,
  expiresInSeconds = 3600,
): Promise<string> {
  if (BASE_URL) {
    return `${BASE_URL}/${key}`
  }

  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: expiresInSeconds },
  )
}

/**
 * Download a report buffer from S3.
 */
export async function downloadReport(key: string): Promise<Buffer> {
  const response = await getClient().send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
  )

  if (!response.Body) throw new Error(`S3 object empty: ${key}`)

  const chunks: Uint8Array[] = []
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/**
 * Delete a report from S3.
 */
export async function deleteReport(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: BUCKET, Key: key }),
  )
}

/**
 * Check whether a report exists in S3.
 */
export async function reportExists(orgId: string, reportId: string): Promise<boolean> {
  try {
    await getClient().send(
      new HeadObjectCommand({
        Bucket: BUCKET,
        Key:    reportKey(orgId, reportId),
      }),
    )
    return true
  } catch {
    return false
  }
}

/**
 * Convenience: upload and immediately return the pre-signed URL.
 */
export async function uploadAndGetUrl(
  orgId: string,
  reportId: string,
  buffer: Buffer,
  expiresInSeconds = 3600,
): Promise<{ key: string; url: string }> {
  const key = await uploadReport(orgId, reportId, buffer)
  const url = await getReportUrl(key, expiresInSeconds)
  return { key, url }
}
