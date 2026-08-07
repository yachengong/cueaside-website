import { mkdir, rename, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const apiDirectory = new URL("../app/api", import.meta.url);
const internalDirectory = new URL("../app/internal", import.meta.url);
const holdingRoot = new URL("../.pages-build/", import.meta.url);
const heldAPIDirectory = new URL("./api", holdingRoot);
const heldInternalDirectory = new URL("./internal", holdingRoot);
const serverOnlyDirectories = [
  { source: apiDirectory, held: heldAPIDirectory },
  { source: internalDirectory, held: heldInternalDirectory },
];

await mkdir(holdingRoot, { recursive: true });
// Route type metadata from a normal server build still references app/api.
// Static export temporarily removes that directory, so always start with a
// fresh Next build cache instead of compiling against stale route validators.
await rm(new URL("../.next/", import.meta.url), { recursive: true, force: true });

let status = 1;
const movedDirectories = [];
try {
  for (const directory of serverOnlyDirectories) {
    await rename(directory.source, directory.held);
    movedDirectories.push(directory);
  }
  const result = spawnSync(
    process.execPath,
    [
      new URL("../node_modules/next/dist/bin/next", import.meta.url).pathname,
      "build",
      "--webpack",
    ],
    {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, CUEASIDE_STATIC_EXPORT: "1" },
      stdio: "inherit",
    },
  );
  status = result.status ?? 1;
} finally {
  for (const directory of movedDirectories.reverse()) {
    await rename(directory.held, directory.source);
  }
}

process.exit(status);
