import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware((context, next) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const adminKey = url.searchParams.get('k') ?? '';

  if (pathname === '/admin/reef-portal-7k29') {
    return context.redirect('/reef-portal-7k29');
  }

  if (pathname === '/admin/dashboard') {
    if (adminKey === 'reef7k29') return next();
    return context.redirect('/');
  }

  return next();
});
