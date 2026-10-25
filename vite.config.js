import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig(async () => ({
    plugins: [react()],

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    // prevent vite from obscuring rust errors
    clearScreen: false,
    // tauri expects a fixed port, fail if that port is not available
    server: {
        port: 1420,
        strictPort: true,
        // Bind IPv4 explicitly. Node 17+ resolves `localhost` to ::1 first on
        // Windows, so Vite would listen on [::1] while Tauri dials 127.0.0.1
        // and both sides sit waiting for each other.
        host: '127.0.0.1',
        watch: {
            // Rust writes and locks files under src-tauri/target while it
            // compiles. Watching that tree makes Vite's fs watcher trip over
            // the locked .pdb and kill the dev server.
            ignored: ['**/src-tauri/**'],
        },
    },
    // to make use of `TAURI_DEBUG` and other env variables
    // https://tauri.studio/v1/api/config#buildconfig.beforedevcommand
    envPrefix: ['VITE_', 'TAURI_'],
    build: {
        rollupOptions: {
            input: {
                index: resolve(__dirname, 'index.html'),
                daemon: resolve(__dirname, 'daemon.html'),
            },
        },
        // Tauri supports es2021. safari11 predates BigInt, which onnxruntime-web
        // (behind the PaddleOCR recognizer) emits, so bump the floor to the
        // first Safari with BigInt support.
        target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome105' : 'safari14',
        // don't minify for debug builds
        minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
        // produce sourcemaps for debug builds
        sourcemap: !!process.env.TAURI_DEBUG,
    },
}));
