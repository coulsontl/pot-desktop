export const info = {
    name: 'system_tts',
    icon: 'logo/system.svg',
};

// Only the languages the OS actually ships voices for are offered. On a
// stock Windows install that is zh-CN and en-US; other locales raise a
// clear error instead of silently speaking with the wrong voice.
export enum Language {
    zh_cn = 'zh-CN',
    zh_tw = 'zh-TW',
    en = 'en-US',
}
