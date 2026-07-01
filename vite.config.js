import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// The "@" alias lets your pasted code import things like
// "@/components/ui/button" instead of long relative paths.
// Base44 code relies on this, so we point "@" at the src folder.
export default defineConfig({
  // Served at the domain root locally and on Vercel ("/"), but under a
  // subpath on GitHub Pages ("/gasoleads/"). The Pages build sets BASE_PATH.
  base: process.env.BASE_PATH || "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
