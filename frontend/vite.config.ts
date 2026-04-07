import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react") || id.includes("scheduler")) return "vendor-react";
          if (id.includes("recharts")) return "vendor-charts";
          if (id.includes("leaflet") || id.includes("react-leaflet") || id.includes("h3-js")) return "vendor-maps";
          if (id.includes("@tanstack") || id.includes("zustand") || id.includes("axios")) return "vendor-data";
          return "vendor-misc";
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
