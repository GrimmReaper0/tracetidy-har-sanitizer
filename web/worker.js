import { parseHar, sanitizeHar, toMarkdown, HarError, MAX_INPUT_BYTES } from '../src/core.js';

self.onmessage = async ({ data }) => {
  try {
    if (data.file && data.file.size > MAX_INPUT_BYTES) throw new HarError('The input exceeds the 25 MiB limit.');
    const text = data.file ? new TextDecoder('utf-8', { fatal: true }).decode(await data.file.arrayBuffer()) : data.text;
    const result = sanitizeHar(parseHar(text), { mode: data.mode });
    const json = JSON.stringify(result.har, null, 2) + '\n';
    self.postMessage({
      ok: true, ...result, json, markdown: toMarkdown(result),
      inputBytes: new TextEncoder().encode(text).byteLength,
      outputBytes: new TextEncoder().encode(json).byteLength,
    });
  } catch (error) {
    // Never forward the platform's JSON / URL / UTF-8 error text.
    self.postMessage({ ok: false, error: error instanceof HarError ? error.message : 'Could not process this file. Use a valid UTF-8 HAR under 25 MiB.' });
  }
};
