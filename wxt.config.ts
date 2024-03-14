import type { UserManifest } from "wxt";
import { defineConfig } from "wxt";
import Vue from "@vitejs/plugin-vue";
import Icons from "unplugin-icons/vite";

export default defineConfig({
  srcDir: "src",
  imports: {
    presets: ["vue", "vue-router", "@vueuse/core"],
    imports: [
      { from: "vue-query", name: "useQuery" },
      { from: "vue-query", name: "useMutation" },
    ],
    addons: {
      vueTemplate: true,
    },
  },
  vite: () => ({
    plugins: [Icons({ compiler: "vue3" }), Vue()],
  }),
  manifest: ({ browser }) => {
    const manifest: UserManifest = {
      permissions: ["storage"],
    };
    if (browser === "firefox") {
      manifest.permissions!.push("https://api.github.com/*");
    }
    return manifest;
  },
});
