// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Runs as a Node server (Cloud Run), not the Lovable/Cloudflare default. The
// Firebase and gRPC packages use __dirname and load .proto files from disk, so
// they must ship as real node_modules instead of being bundled. A separate
// const because the wrapper's type omits traceDeps but forwards it to nitro.
const nitro = {
  preset: "node-server",
  traceDeps: [
    "firebase-admin",
    "firebase",
    /^@firebase\//,
    /^@google-cloud\//,
    /^@grpc\//,
    "google-gax",
    "protobufjs",
  ],
};

export default defineConfig({
  nitro,
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
