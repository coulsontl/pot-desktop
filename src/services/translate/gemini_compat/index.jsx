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

// Gemini takes one `contents` array with `parts`; the system prompt goes in
// a separate `systemInstruction` field.
function buildContents(promptList, context) {
    const systemParts = [];
    const contents = [];
    for (const item of promptList) {
        const content = applyPlaceholders(item.content, context);
        if (item.role === 'system') {
            systemParts.push(content);
            continue;
        }
        const role = item.role === 'assistant' ? 'model' : 'user';
        const last = contents[contents.length - 1];
        if (last && last.role === role) {
            last.parts[0].text += '\n\n' + content;
        } else {
            contents.push({ role, parts: [{ text: content }] });
        }
    }
    if (contents.length === 0 || contents[0].role !== 'user') {
        contents.unshift({ role: 'user', parts: [{ text: '' }] });
    }
    return { systemParts, contents };
}

export async function translate(text, from, to, options = {}) {
    const { config, setResult, detect } = options;
    const { apiKey, model, stream, promptList, requestPath, temperature } = config;

    let base = requestPath.trim();
    if (!/https?:\/\/.+/.test(base)) {
        base = `https://${base}`;
    }
    base = base.replace(/\/$/, '');
    const action = stream ? 'streamGenerateContent' : 'generateContent';
    const endpoint = `${base}/models/${model}:${action}?key=${encodeURIComponent(apiKey ?? '')}`;

    const { systemParts, contents } = buildContents(promptList, { text, from, to, detect });

    const body = { contents };
    if (systemParts.length > 0) {
        body['systemInstruction'] = { parts: [{ text: systemParts.join('\n\n') }] };
    }
    if (temperature !== undefined && temperature !== null && temperature !== '') {
        body['generationConfig'] = { temperature: Number(temperature) };
    }

    // Both paths go through window.fetch rather than @tauri-apps/api/http.
    // The Tauri fetch runs in Rust with reqwest's own User-Agent, which strict
    // gateways reject; the webview's fetch carries the browser UA they expect.
    if (!stream) {
        const res = await window.fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            throw `Http Request Error\nHttp Status: ${res.status}\n${await res.text()}`;
        }
        const data = await res.json();
        const candidates = data?.candidates;
        if (!candidates) {
            throw JSON.stringify(data);
        }
        let target = candidates[0].content.parts.map((p) => p.text ?? '').join('').trim();
        if (target.startsWith('"') && target.endsWith('"')) {
            target = target.slice(1, -1);
        }
        return target.trim();
    }

    // `alt=sse` makes the streamed response proper `data:` events instead of
    // the default JSON array, which is far easier to consume incrementally.
    const streamEndpoint = `${endpoint}&alt=sse`;
    const res = await window.fetch(streamEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
                if (!trimmed.startsWith('data:')) {
                    continue;
                }
                const payload = trimmed.slice(5).trim();
                if (payload === '' || payload === '[DONE]') {
                    continue;
                }
                try {
                    const chunk = JSON.parse(payload);
                    const parts = chunk.candidates?.[0]?.content?.parts;
                    if (parts) {
                        for (const part of parts) {
                            if (part.text) {
                                target += part.text;
                            }
                        }
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
