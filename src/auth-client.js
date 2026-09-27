const { createServerClient, parseCookieHeader } = require('@supabase/ssr');
module.exports = function authClient(req, res) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase URL and publishable key are required.');
  const cookies = new Map(parseCookieHeader(req.headers.cookie || '').map(c => [c.name, c.value]));
  return createServerClient(url, key, {
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' },
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: (items, headers) => {
        for (const { name, value, options } of items) {
          cookies.set(name, value);
          res.cookie(name, value, { ...options, maxAge: options.maxAge == null ? undefined : options.maxAge * 1000 });
        }
        if (headers) for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
      },
    },
  });
};
