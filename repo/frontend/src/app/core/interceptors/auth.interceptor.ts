import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

// Only attach auth headers to trusted API paths — never to external URLs.
const PUBLIC_PATHS = ['/api/auth/login', '/api/time', '/api/health'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();

  // Only attach token to relative /api/ requests (same-origin), skip public endpoints
  const isApiRequest = req.url.startsWith('/api/');
  const isPublic = PUBLIC_PATHS.some(p => req.url.includes(p));

  if (token && isApiRequest && !isPublic) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }

  return next(req);
};
