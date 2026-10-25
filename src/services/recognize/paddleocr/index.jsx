// Loaded lazily: the SDK drags in OpenCV.js and onnxruntime, which is far too
// much to pull into every window just because this service is registered.
// Models live in public/paddleocr so they ship with the app instead of being
// fetched on first use; see the note in Config.jsx.
const MODEL_BASE = '/paddleocr';
// The runtime loads its WASM inside a worker. Hand onnxruntime an absolute URL
// so it cannot resolve a relative path against the worker script's location.
const ORT_BASE = `${window.location.origin}/ort/`;

let enginePromise = null;

function createEngine() {
    return import('@paddleocr/paddleocr-js').then(({ PaddleOCR }) =>
        PaddleOCR.create({
            textDetectionModelName: 'PP-OCRv5_mobile_det',
            textRecognitionModelName: 'PP-OCRv5_mobile_rec',
            textDetectionModelAsset: { url: `${MODEL_BASE}/PP-OCRv5_mobile_det.tar` },
            textRecognitionModelAsset: { url: `${MODEL_BASE}/PP-OCRv5_mobile_rec.tar` },
            ortOptions: {
                backend: 'wasm',
                // The runtime runs in a worker and otherwise falls back to a
                // jsDelivr URL, which fails under the app's CSP. public/ort/ is
                // populated from onnxruntime-web by scripts/copy-ort-wasm.mjs.
                wasmPaths: ORT_BASE,
            },
        })
    );
}

function getEngine() {
    if (!enginePromise) {
        enginePromise = createEngine().catch((err) => {
            // Let the next call retry instead of caching a rejected promise.
            enginePromise = null;
            throw err;
        });
    }
    return enginePromise;
}

function base64ToBlob(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: 'image/png' });
}

export async function recognize(base64, language, options = {}) {
    const ocr = await getEngine();
    const [result] = await ocr.predict(base64ToBlob(base64));
    const items = result?.items ?? [];
    // Join in reading order; the SDK already sorts boxes top-to-bottom.
    const text = items.map((item) => item.text).join('\n').trim();
    if (language === 'ch') {
        return text.replaceAll(' ', '');
    }
    return text;
}

export * from './Config';
export * from './info';
