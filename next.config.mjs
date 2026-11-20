export default {
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/scherm/:id', destination: '/player.html' }];
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' }
    ] }];
  }
};
