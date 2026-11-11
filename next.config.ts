import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['@electric-sql/pglite'],
  async headers() { return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'X-Frame-Options',value:'DENY'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},{key:'Content-Security-Policy',value:"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"}]},{source:'/sw.js',headers:[{key:'Cache-Control',value:'no-cache, no-store, must-revalidate'}]}]; }
};
export default config;
