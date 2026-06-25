import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// The "@" alias lets your pasted code import things like
// "@/components/ui/button" instead of long relative paths.
// Base44 code relies on this, so we point "@" at the src folder.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
