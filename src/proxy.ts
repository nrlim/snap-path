import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Security headers proxy.
 * Applies Content-Security-Policy and other hardening headers to all responses.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  // Security headers
  const headers = response.headers;

  // Prevent clickjacking
  headers.set('X-Frame-Options', 'DENY');

  // Enforce HTTPS via HSTS (production only)
  if (process.env.NODE_ENV === 'production') {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Prevent MIME-type sniffing
  headers.set('X-Content-Type-Options', 'nosniff');

  // XSS protection (legacy browsers)
  headers.set('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy — restrict browser features
  headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()',
  );

  // Content Security Policy
  const isDev = process.env.NODE_ENV !== 'production';
  const cspDirectives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`, // unsafe-eval only for HMR in dev
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https: wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  headers.set('Content-Security-Policy', cspDirectives.join('; '));

  // Remove server identification
  headers.delete('X-Powered-By');

  return response;
}

// Run on all routes except static assets
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|og-image.png|.*\\.png|.*\\.jpg|.*\\.svg).*)',
  ],
};
