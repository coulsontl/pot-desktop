export const info = {
    name: 'paddleocr',
    icon: 'logo/paddle.png',
};

// PP-OCRv5 mobile ships Chinese+English in one model pair, so every language
// below is served by the same two ONNX files. The keys exist so the rest of
// the app can ask for a language the same way it does for other services.
export enum Language {
    auto = 'ch',
    zh_cn = 'ch',
    zh_tw = 'ch',
    yue = 'ch',
    en = 'en',
    ja = 'japan',
    ko = 'korean',
}

export const SUPPORTED_LANGUAGES = ['auto', 'zh_cn', 'zh_tw', 'yue', 'en', 'ja', 'ko'];
