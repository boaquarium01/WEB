import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware((context, next) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (pathname === '/admin/reef-portal-7k29') {
    return context.redirect('/reef-portal-7k29');
  }

  if (pathname === '/admin/dashboard') {
    return context.redirect('/');
  }

  return next();
});
