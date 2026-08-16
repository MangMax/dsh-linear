/**
 * npm pack contents check (plan §57 — release gate).
 *
 * Verifies the publishable tarball contains exactly the runtime surface the
 * DSH bundle loader needs — `dist/` (ESM + DTS), `cordis.patch.yml`,
 * README / LICENSE — and leaks nothing: no `src/`, `tests/`, `node_modules`,
 * coverage, or stray tarballs (plan §58: no secrets, no fixtures in the
 * package).
 *
 * `--config.ignore-scripts=true` skips the `prepack` gate here so this test
 * can run inside `vp test` without recursing into the build itself; the CI /
 * release pipelines run the full gate (`prepack` = check + test + pack).
 */
import { execFileSync } from "node:child_process";
import { expect, test } from "vite-plus/test";

const ROOT = new URL("../..", import.meta.url).pathname;

function packedFiles(): string[] {
  const stdout = execFileSync("pnpm", ["pack", "--dry-run", "--config.ignore-scripts=true"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const lines = stdout.split(/\r?\n/);
  const contents = lines.indexOf("Tarball Contents");
  const details = lines.indexOf("Tarball Details");
  expect(contents, "pnpm pack dry-run should print the tarball contents").toBeGreaterThan(-1);
  return lines
    .slice(contents + 1, details > -1 ? details : undefined)
    .map((line) => line.trim())
    .filter(Boolean);
}

test("tarball contains the runtime surface the DSH bundle loader needs", () => {
  const files = packedFiles();
  expect(files).toContain("dist/index.mjs");
  expect(files).toContain("dist/index.d.mts");
  expect(files).toContain("cordis.patch.yml");
  expect(files).toContain("package.json");
  expect(files).toContain("README.md");
  expect(files).toContain("LICENSE");
});

test("tarball leaks nothing sensitive or build-local", () => {
  const files = packedFiles();
  for (const file of files) {
    expect(file).not.toMatch(/^src\//);
    expect(file).not.toMatch(/^tests?\//);
    expect(file).not.toMatch(/node_modules/);
    expect(file).not.toMatch(/\.tgz$/);
    expect(file).not.toMatch(/\.env/);
    expect(file).not.toMatch(/^coverage\//);
  }
  expect(files).toContain("dist/index.mjs.map"); // sourcemaps are intentional
});
