import { Language } from './info';

const PLACEHOLDERS = [
    ['{text}', '$text'],
    ['{source_language}', '$from'],
    ['{target_language}', '$to'],
    ['{detected_source_language}', '$detect'],
];

function applyPlaceholders(content, { text, from, to, detect }) {
    let value = content;
    const values = {
        '{text}': text,
        '{source_language}': from,
        '{target_language}': to,
        '{detected_source_language}': Language[detect],
    };
    for (const [braced, dollar] of PLACEHOLDERS) {
        value = value.replaceAll(braced, values[braced]).replaceAll(dollar, values[braced]);
    }
    return value;
}

// Anthropic keeps the system prompt outside `messages`, so split it out and
// merge consecutive turns of the same role (the API rejects duplicates).
function buildMessages(promptList, context) {
    const systemParts = [];
    const messages = [];
    for (const item of promptList) {
        const content = applyPlaceholders(item.content, context);
        if (item.role === 'system') {
            systemParts.push(content);
            continue;
        }
        const role = item.role === 'assistant' ? 'assistant' : 'user';
        const last = messages[messages.length - 1];
        if (last && last.role === role) {
            last.content += '\n\n' + content;
        } else {
            messages.push({ role, content });
        }
    }
    // The Messages API requires the conversation to start with a user turn.
    if (messages.length === 0 || messages[0].role !== 'user') {
        messages.unshift({ role: 'user', content: '' });
    }
    return { system: systemParts.join('\n\n'), messages };
}

export async function translate(text, from, to, options = {}) {
    const { config, setResult, detect } = options;
    const { apiKey, model, stream, promptList, requestPath, apiVersion, maxTokens, temperature, authHeader } = config;

    let base = requestPath.trim();
    if (!/https?:\/\/.+/.test(base)) {
        base = `https://${base}`;
    }
    const url = new URL(base);
    if (!url.pathname.endsWith('/messages')) {
        url.pathname = url.pathname.replace(/\/$/, '') + '/messages';
    }
    const endpoint = url.href;

    const { system, messages } = buildMessages(promptList, { text, from, to, detect });

    const headers = {
        'Content-Type': 'application/json',
        'anthropic-version': apiVersion || '2023-06-01',
    };
    if (apiKey) {
        if (authHeader === 'authorization') {
            headers['Authorization'] = `Bearer ${apiKey}`;
        } else {
            headers['x-api-key'] = apiKey;
        }
    }

    const body = {
        model,
        max_tokens: Number(maxTokens) || 3840,
        messages,
        stream,
    };
    if (system) {
        body['system'] = system;
    }
    if (temperature !== undefined && temperature !== null && temperature !== '') {
        body['temperature'] = Number(temperature);
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
        const content = data?.content;
        if (!Array.isArray(content)) {
            throw JSON.stringify(data);
        }
        const target = content
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join('')
            .trim();
        return target;
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
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                const trimmed = line.trim();
                // Event lines carry the type, data lines the payload; we can
                // reconstruct from data alone by looking at the JSON shape.
                if (!trimmed.startsWith('data:')) {
                    continue;
                }
                const payload = trimmed.slice(5).trim();
                if (payload === '') {
                    continue;
                }
                try {
                    const event = JSON.parse(payload);
                    if (event.type === 'content_block_delta' && event.delta?.text) {
                        target += event.delta.text;
                        if (setResult) {
                            setResult(target + '_');
                        }
                    }
                } catch {
                    // Ignore partial JSON spanning chunks.
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
