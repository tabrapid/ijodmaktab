import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'ijod_sid';
const PUBLIC = ['/login', '/system/login'];

/**
 * Kirish cookie’si bo‘lmasa sahifalar kirish oynasiga yo‘naltiriladi. Bu faqat qulaylik:
 * haqiqiy ruxsat tekshiruvi har so‘rovda API serverida bajariladi.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.includes(pathname) || request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const login = new URL(pathname.startsWith('/system') ? '/system/login' : '/login', request.url);
  if (pathname !== '/') login.searchParams.set('next', pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // API, statik fayllar va rasmlar proksi orqali o‘tmaydi (fayl yuklash bufferlanmasin).
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)'],
};
