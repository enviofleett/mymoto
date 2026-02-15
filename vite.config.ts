import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    // Let Vite use default host/port settings to avoid permission issues
    port: 5173,
    strictPort: false, // Try next available port if busy
    proxy: {
      '/partner': {
        target: 'http://localhost:5175',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    sourcemap: false,
    // Use esbuild minifier to avoid terser + workbox SW generation conflicts
    minify: "esbuild",
    rollupOptions: {
      output: {
        manualChunks: {
          // Split large libraries into separate chunks
          'mapbox': ['mapbox-gl'],
          'recharts': ['recharts'],
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query-vendor': ['@tanstack/react-query'],
          'date-vendor': ['date-fns', 'react-day-picker'],
          'icons-vendor': ['lucide-react'],
          'map-vendor': ['leaflet', 'react-leaflet', 'react-leaflet-cluster'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-popover', '@radix-ui/react-tabs'],
        },
      },
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        enabled: false, // Disable PWA in development to avoid caching/network issues
      },
      // Avoid SW minification to prevent build-time terser deadlocks
      minify: false,
      includeAssets: ["favicon.ico", "robots.txt", "sw-custom.js"], // ✅ Include custom service worker
      manifest: {
        name: "MyMoto - Vehicle Companion",
        short_name: "MyMoto",
        description: "Chat with your vehicles and manage your fleet",
        theme_color: "#131618",
        background_color: "#131618",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/?v=1.3.1",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // Use production mode in production builds.
        mode: mode === "development" ? "development" : "production",
        sourcemap: false,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // ✅ FIX: Import custom service worker handlers
        importScripts: ['/sw-custom.js'], // Injects custom notification handlers
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-cache",
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
            },
          },
          // Leaflet fallback tiles
          {
            urlPattern: /^https:\/\/([abc]\.)?tile\.openstreetmap\.org\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "osm-tiles",
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
            },
          },
          {
            urlPattern: /^https:\/\/server\.arcgisonline\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "esri-tiles",
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
            },
          },
          // Mapbox geocoding should prefer network (avoid caching error responses).
          {
            urlPattern: /^https:\/\/api\.mapbox\.com\/geocoding\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "mapbox-geocoding",
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 6, // 6 hours
              },
            },
          },
          {
            urlPattern: /^https:\/\/api\.mapbox\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "mapbox-cache",
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
  test: {
    // Keep vitest scoped to this app only.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "dist/**",
      "e2e/**",
      "service-provider-pwa/**",
    ],
  },
}));
