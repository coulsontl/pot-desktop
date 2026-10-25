import { Language } from './info';

// Placeholders are written {like_this} so prompts can be pasted from other
// tools unchanged; $text/$to and friends stay supported for older configs.
const PLACEHOLDERS = [
    ['{text}', '$text'],
    ['{source_language}', '$from'],
    ['{target_language}', '$to'],
    ['{detected_source_language}', '$detect'],
];

function applyPlaceholders(content, { text, from, to, detect }) {
    let value = content;
    for (const [braced, dollar] of PLACEHOLDERS) {
        const replacement = {
            '{text}': text,
            '{source_language}': from,
            '{target_language}': to,
            '{detected_source_language}': Language[detect],
        }[braced];
        value = value.replaceAll(braced, replacement).replaceAll(dollar, replacement);
    }
    return value;
}

function buildEndpoint(requestPath) {
    let path = requestPath.trim();
    if (!/https?:\/\/.+/.test(path)) {
        path = `https://${path}`;
    }
    const url = new URL(path);
    // A base URL is what people usually copy from a provider's docs, so
    // append the endpoint unless it is already there.
    if (!url.pathname.endsWith('/chat/completions')) {
        url.pathname = url.pathname.replace(/\/$/, '') + '/chat/completions';
    }
    return url.href;
}

export async function translate(text, from, to, options = {}) {
    const { config, setResult, detect } = options;
    const { apiKey, model, stream, promptList, requestPath, requestArguments, temperature, reasoningEffort } = config;

    const endpoint = buildEndpoint(requestPath);

    const messages = promptList.map((item) => ({
        role: item.role,
        content: applyPlaceholders(item.content, { text, from, to, detect }),
    }));

    const headers = {
        'Content-Type': 'application/json',
    };
    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const body = {
        model,
        messages,
        stream,
    };
    if (temperature !== undefined && temperature !== null && temperature !== '') {
        body['temperature'] = Number(temperature);
    }
    if (reasoningEffort && reasoningEffort !== 'none') {
        body['reasoning_effort'] = reasoningEffort;
    }
    if (requestArguments) {
        try {
            Object.assign(body, JSON.parse(requestArguments));
        } catch {
            // A malformed extra-arguments blob should not block translation.
        }
    }

    // Both paths go through window.fetch rather than @tauri-apps/api/http.
    // The Tauri fetch runs in Rust with reqwest's own User-Agent, which strict
    // gateways reject; the webview's fetch carries the browser UA they expect.
    if (!stream) {
        const res = await window.fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            throw `Http Request Error\nHttp Status: ${res.status}\n${await res.text()}`;
        }
        const data = await res.json();
        const choices = data?.choices;
        if (!choices) {
            throw JSON.stringify(data);
        }
        let target = choices[0].message.content.trim();
        if (target.startsWith('"') && target.endsWith('"')) {
            target = target.slice(1, -1);
        }
        return target.trim();
    }

    const res = await window.fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        throw `Http Request Error\nHttp Status: ${res.status}`;
    }
    let target = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            // Keep the last partial line for the next chunk.
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) {
                    continue;
                }
                const payload = trimmed.slice(5).trim();
                if (payload === '' || payload === '[DONE]') {
                    continue;
                }
                try {
                    const chunk = JSON.parse(payload);
                    const delta = chunk.choices?.[0]?.delta?.content;
                    if (delta) {
                        target += delta;
                        if (setResult) {
                            setResult(target + '_');
                        }
                    }
                } catch {
                    // Ignore chunks that are not complete JSON yet.
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
    return target.trim();
}

export * from './Config';
export * from './info';
