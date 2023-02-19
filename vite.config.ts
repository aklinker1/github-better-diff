import { defineConfig } from "vite";
import WebExtension, { readJsonFile } from "vite-plugin-web-extension";
import { AutoImport } from "./vite.shared";
import Vue from "@vitejs/plugin-vue";
import Icons from "unplugin-icons/vite";

const target = process.env.TARGET === "firefox" ? "firefox" : "chrome";

function generateManifest() {
  const manifest = readJsonFile("manifest.json");
  const pkg = readJsonFile("package.json");
  return {
    name: pkg.name,
    description: pkg.description,
    version: pkg.version,
    ...manifest,
  };
}

export default defineConfig({
  build: {
    outDir: `dist-${target}`,
    emptyOutDir: true,
    sourcemap: "inline",
  },
  plugins: [
    Icons({ compiler: "vue3" }),
    Vue(),
    AutoImport(),
    WebExtension({
      manifest: generateManifest,
      watchFilePaths: ["vite.config.ts", "manifest.json"],
      browser: target,
    }),
  ],
});
