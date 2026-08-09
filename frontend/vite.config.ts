import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Allows the localtunnel dev tunnel (random *.loca.lt subdomain each
    // restart) through Vite's host-header protection, for phone testing.
    allowedHosts: [".loca.lt"],
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
