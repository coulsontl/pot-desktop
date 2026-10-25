import { invoke } from '@tauri-apps/api/tauri';

export async function tts(text, lang, options = {}) {
    const { config } = options;
    const voice = config?.voice ?? lang;
    // The Rust side renders the OS voice to a WAV and returns the raw bytes;
    // useVoice feeds them straight into decodeAudioData.
    return await invoke('system_tts', { text, lang: voice });
}

export * from './Config';
export * from './info';
