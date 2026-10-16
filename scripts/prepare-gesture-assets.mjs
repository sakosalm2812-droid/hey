import { copyFile, lstat, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const packageRoot = path.join(projectRoot, "node_modules", "@mediapipe", "tasks-vision");
const packageMetadata = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));

if (packageMetadata.version !== "1.1.0" || packageMetadata.license !== "Apache-2.0") {
  throw new Error("Gesture runtime requires the reviewed @mediapipe/tasks-vision 1.1.0 Apache-2.0 package.");
}

const filenames = ["vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"];
const sourceRoot = path.join(packageRoot, "wasm");
const destinationRoot = path.join(projectRoot, "public", "mediapipe", "vision", "wasm");
await mkdir(destinationRoot, { recursive: true });

for (const filename of filenames) {
  const source = path.join(sourceRoot, filename);
  const metadata = await lstat(source);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1024) {
    throw new Error(`Invalid MediaPipe runtime asset: ${filename}`);
  }
  await copyFile(source, path.join(destinationRoot, filename));
}

console.log("Prepared pinned local MediaPipe Hand Landmarker WebAssembly assets.");
