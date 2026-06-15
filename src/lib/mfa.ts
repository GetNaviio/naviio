import { generateSecret as otpGenerateSecret, generateURI, verifySync } from 'otplib'
import QRCode from 'qrcode'

const APP_NAME = 'Naviio'

export function generateSecret(): string {
  return otpGenerateSecret()
}

export function generateOtpUri(email: string, secret: string): string {
  return generateURI({ label: email, issuer: APP_NAME, secret })
}

export async function generateQRCode(otpUri: string): Promise<string> {
  return QRCode.toDataURL(otpUri, {
    width: 256,
    margin: 2,
    color: { dark: '#0b1220', light: '#ffffff' },
  })
}

export function verifyToken(token: string, secret: string): boolean {
  try {
    const result = verifySync({ token: token.replace(/\s/g, ''), secret })
    return Boolean(result)
  } catch {
    return false
  }
}

export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    Math.random().toString(36).slice(2, 6).toUpperCase() +
    '-' +
    Math.random().toString(36).slice(2, 6).toUpperCase()
  )
}
