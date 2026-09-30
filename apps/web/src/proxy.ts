import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'ijod_sid';
// Ro‘yxatdan o‘tish sahifalari ham ochiq: tizimga kirgan foydalanuvchini sahifaning o‘zi bosh sahifasiga o‘tkazadi.
const PUBLIC = ['/login', '/system/login', '/register', '/register/student', '/register/teacher'];

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
  // API, statik fayllar, logotip va ikonkalar proksi orqali o‘tmaydi (fayl yuklash bufferlanmasin,
  // kirish sahifasida logotip ko‘rinsin).
  matcher: ['/((?!api|_next/static|_next/image|brand/|favicon.ico|icon.png|apple-icon.png|robots.txt).*)'],
};
