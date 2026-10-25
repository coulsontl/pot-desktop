// Copy onnxruntime-web's WASM runtime into public/ort/ so it is served as a real
// file both in `vite dev` and in the packaged app.
//
// Why this exists: @paddleocr/paddleocr-js runs onnxruntime in a worker and,
// when ortOptions.wasmPaths is unset, falls back to a jsDelivr URL. Vite does
// not emit those files to a stable path in dev, so the request lands on the SPA
// fallback and the loader gets index.html back — instantiate() then fails with
// "expected magic word 00 61 73 6d, found 3c 21 44 4f" (i.e. "<!DO").
//
// Runs from predev/prebuild so the copy is refreshed whenever dependencies move.
import { copyFileSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Follow the pnpm symlink into .pnpm/<pkg>/node_modules/@paddleocr/paddleocr-js.
const sdkRoot = realpathSync(join(process.cwd(), 'node_modules', '@paddleocr', 'paddleocr-js'));
// pnpm gives each package its own node_modules holding symlinks to its deps:
// <pkg>/@paddleocr/paddleocr-js -> up 3 levels -> <pkg>/node_modules.
const onnxDist = join(dirname(dirname(dirname(sdkRoot))), 'node_modules', 'onnxruntime-web', 'dist');

const outDir = join(process.cwd(), 'public', 'ort');
mkdirSync(outDir, { recursive: true });

// onnxruntime-web's bundler entry (ort.bundle.min.mjs) hardcodes the jsep
// build, so the plain SIMD files never load on their own. Copy jsep plus the
// plain pair it may fall back to; jspi/asyncify are unused and would add ~43MB.
const wanted = readdirSync(onnxDist).filter((name) =>
    /^ort-wasm-simd-threaded(\.jsep)?\.(wasm|mjs)$/.test(name)
);
if (wanted.length === 0) {
    throw new Error(`No ort wasm files found in ${onnxDist}`);
}
for (const name of wanted) {
    copyFileSync(join(onnxDist, name), join(outDir, name));
}
console.log(`[copy-ort-wasm] copied ${wanted.length} files to public/ort/`);
