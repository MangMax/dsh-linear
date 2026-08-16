/**
 * Build the browser half of dsh-linear into the harness client-bundle
 * format (plan §48 / dsh.client packaging).
 *
 * The harness client module system loads a plugin's client half from the
 * package's `exports["./client"]` and expects a classic script that
 * registers itself via `window.__ModuleLoader__.load({ id, factory })`,
 * where `factory` is a CJS-style function whose `require` resolves against
 * the harness's client module graph (statics like `react` and the inject
 * edges from `package.json` `dsh.client`).
 *
 * This script bundles `src/client/index.js` with vite in CJS format,
 * externalizing every import the browser graph owns, then wraps the output
 * in the factory template. The result is `dist/client.js` (shipped in the
 * npm package; `dist/` is already in `files`).
 */
import { build } from "vite";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, "dist", ".client-build");
const entry = path.join(root, "src", "client", "index.js");

// Every specifier the browser graph owns — the bundle must never inline them.
const external = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "@deepseek-ai/cordis",
  "@deepseek-ai/dsh-client-ui-slots",
];

await build({
  root,
  configFile: false,
  logLevel: "warn",
  build: {
    outDir,
    emptyOutDir: true,
    lib: {
      entry,
      formats: ["cjs"],
      fileName: () => "client.bundle.js",
    },
    sourcemap: false,
    minify: false,
    rollupOptions: { external },
  },
});

const bundle = await readFile(path.join(outDir, "client.bundle.js"), "utf8");
const wrapped = `window.__ModuleLoader__.load({
\tid: "dsh-linear",
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
${bundle}
\t\treturn module.exports;
\t}
});
`;

await mkdir(path.join(root, "dist"), { recursive: true });
await writeFile(path.join(root, "dist", "client.js"), wrapped);
// Ship the type stub alongside the bundle (mirrors the client plugin surface).
await writeFile(
  path.join(root, "dist", "client.d.ts"),
  await readFile(path.join(root, "src", "client", "index.d.ts"), "utf8"),
);
await rm(outDir, { recursive: true, force: true });

// tsdown's `exports: true` regenerates package.json exports from its entries
// and drops the manual `./client` subpath — re-assert it here so the harness
// client-modules host can resolve the bundle (this runs last in the build).
const manifestPath = path.join(root, "package.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.exports = {
  ...manifest.exports,
  "./client": {
    types: "./dist/client.d.ts",
    default: "./dist/client.js",
  },
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log("built dist/client.js + dist/client.d.ts, exports[./client] re-asserted");
