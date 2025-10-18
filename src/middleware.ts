import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  // Only check for banned users on file upload routes
  if (request.nextUrl.pathname.startsWith('/api/upload') || 
      request.nextUrl.pathname.startsWith('/api/r2-upload') ||
      request.nextUrl.pathname.startsWith('/api/webpage-extract')) {
    
    try {
      const session = await auth.api.getSession({
        headers: request.headers,
      });

      if (session?.user) {
        // Check if user is banned
        if (session.user.subscriptionStatus === 'banned' || session.user.isBanned) {
          return NextResponse.json(
            { 
              error: 'Account suspended', 
              message: 'Your account has been suspended. Please contact support for more information.',
              reason: session.user.banReason || 'Account suspended by administrator'
            },
            { status: 403 }
          );
        }
      }
    } catch (error) {
      console.error('Error checking user ban status:', error);
      // Continue with the request if there's an error checking ban status
    }
  }

  return NextResponse.next();
}

export const config = {
  runtime: 'nodejs', // Force Node.js runtime to support better-auth (Edge Runtime not supported)
  matcher: [
    '/api/upload/:path*',
    '/api/r2-upload/:path*',
    '/api/webpage-extract/:path*',
  ],
};
