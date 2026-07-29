import { mkdir, rename } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const apiDirectory = new URL("../app/api", import.meta.url);
const holdingRoot = new URL("../.pages-build/", import.meta.url);
const heldAPIDirectory = new URL("./api", holdingRoot);

await mkdir(holdingRoot, { recursive: true });
await rename(apiDirectory, heldAPIDirectory);

let status = 1;
try {
  const result = spawnSync(
    process.execPath,
    [new URL("../node_modules/next/dist/bin/next", import.meta.url).pathname, "build"],
    {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, CUEASIDE_STATIC_EXPORT: "1" },
      stdio: "inherit",
    },
  );
  status = result.status ?? 1;
} finally {
  await rename(heldAPIDirectory, apiDirectory);
}

process.exit(status);
