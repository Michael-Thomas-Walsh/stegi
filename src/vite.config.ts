import { defineConfig } from 'vite'

const nominatimProxy = {
  target: 'https://nominatim.openstreetmap.org',
  changeOrigin: true,
  secure: true,
  rewrite: (path: string) => path.replace(/^\/nominatim/, ''),
  headers: {
    // Nominatim requires an identifying User-Agent or HTTP Referer. The proxy
    // lets us set one reliably, just as geopy does in the BNG Python app.
    'User-Agent':
      'STEGI-rooftop-greening/0.2 (https://github.com/Michael-Thomas-Walsh/BNG_Repo)',
    Accept: 'application/json',
  },
}

export default defineConfig({
  server: {
    proxy: {
      '/nominatim': nominatimProxy,
    },
  },
  // Vite preview inherits server.proxy by default, but this is explicit so the
  // address search also works after `npm run build && npm run preview`.
  preview: {
    proxy: {
      '/nominatim': nominatimProxy,
    },
  },
})
