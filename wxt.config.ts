import { defineConfig } from "wxt";
import Icons from "unplugin-icons/vite";

export default defineConfig({
  srcDir: "src",
  experimental: {
    entrypointImporter: "vite-node",
  },
  modules: [
    "@wxt-dev/module-vue",
    "@wxt-dev/i18n/module",
    "@wxt-dev/auto-icons",
  ],
  imports: {
    presets: ["vue-router"],
    imports: [
      { from: "@tanstack/vue-query", name: "useQuery" },
      { from: "@tanstack/vue-query", name: "useMutation" },
    ],
  },
  vite: () => ({
    plugins: [Icons({ compiler: "vue3" })],
    ssr: {
      // List any dependencies that depend on webextension-polyfill here for vite-node importer to work
      noExternal: ["@webext-core/proxy-service", "@webext-core/messaging"],
    },
  }),
  manifest: ({ browser }) => {
    const permissions = ["storage"];
    if (browser === "firefox") {
      permissions.push("https://api.github.com/*");
    }
    return {
      default_locale: "en",
      name: "__MSG_name__",
      description: "__MSG_description__",
      permissions,
    };
  },
  autoIcons: {
    grayscaleOnDevelopment: false,
  },
});
