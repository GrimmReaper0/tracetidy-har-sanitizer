/* The build injects WORKER_SOURCE and DEMO_TEXT. No networking or persistence. */
const $ = (id) => document.getElementById(id);
const state = { result: null, source: null, worker: null, generation: 0, page: 0, filtered: [], activeTab: 'waterfall' };
const PAGE_SIZE = 50;
const MAX_BYTES = 25 * 1024 * 1024;
const tabs = ['waterfall', 'audit', 'brief'];
const mode = () => document.querySelector('input[name="mode"]:checked').value;
const number = (n) => new Intl.NumberFormat('en-US').format(n);
const duration = (ms) => ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
const bytes = (n) => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MiB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KiB` : `${n} B`;
const setStatus = (text) => { $('status').textContent = text; };

function terminate() {
  state.generation++;
  if (state.worker) state.worker.terminate();
  state.worker = null;
}
function clearOutput() {
  state.result = null;
  state.filtered = [];
  state.page = 0;
  $('results').hidden = true;
  $('request-rows').replaceChildren();
  $('audit-grid').replaceChildren();
  $('audit-notes').replaceChildren();
  $('brief-text').value = '';
  $('request-details').textContent = '';
  if ($('request-dialog').open) $('request-dialog').close();
}
function fail(message) {
  terminate();
  clearOutput();
  state.source = null;
  $('file-input').value = '';
  $('error').textContent = message;
  $('error').hidden = false;
  $('reset').hidden = true;
  setStatus('No export was created.');
  $('workspace').removeAttribute('aria-busy');
}
function processSource(source) {
  terminate();
  clearOutput();
  $('error').hidden = true;
  if (source.file && source.file.size > MAX_BYTES) { fail('The input exceeds the 25 MiB limit.'); return; }
  state.source = source;
  $('reset').hidden = false;
  $('workspace').setAttribute('aria-busy', 'true');
  setStatus('Processing locally. Your capture is not being uploaded.');
  const generation = state.generation;
  let workerUrl;
  try {
    workerUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
    const worker = new Worker(workerUrl);
    state.worker = worker;
    worker.onmessage = ({ data }) => {
      if (generation !== state.generation) return;
      if (!data.ok) { fail(data.error); return; }
      terminate();
      state.result = data;
      $('workspace').removeAttribute('aria-busy');
      renderResult();
    };
    worker.onerror = (event) => {
      event.preventDefault();
      if (generation === state.generation) fail('Local processing could not start. Use a current browser or the command-line version.');
    };
    worker.postMessage({ ...source, mode: mode() });
  } catch {
    fail('This browser could not start the local worker. Try a current browser or the command-line version.');
  } finally {
    if (workerUrl) URL.revokeObjectURL(workerUrl);
  }
}
function acceptFiles(files) {
  if (!files || files.length === 0) return;
  if (files.length !== 1) { fail('Choose one HAR file at a time.'); return; }
  processSource({ file: files[0] });
}
function renderResult() {
  const { report, summary, inputBytes, outputBytes, markdown } = state.result;
  $('results').hidden = false;
  $('search').value = '';
  $('status-filter').value = 'all';
  $('sort').value = 'start';
  $('metric-requests').textContent = number(summary.totalRequests);
  $('metric-removed').textContent = number(report.removed.headers + report.removed.bodies);
  $('metric-failed').textContent = number(summary.failedRequests);
  $('metric-duration').textContent = duration(summary.durationMs);
  $('metric-size').textContent = `${bytes(inputBytes)} input / ${bytes(outputBytes)} output`;
  const diagnostic = report.mode === 'diagnostic';
  $('capture-badge').textContent = `${report.mode.toUpperCase()} PROFILE`;
  $('capture-badge').classList.toggle('diagnostic', diagnostic);
  $('review-warning').classList.toggle('diagnostic', diagnostic);
  $('review-warning').textContent = diagnostic
    ? 'Review readable URLs: hostnames, paths, ports, and query names are still present and may contain secrets or personal data.'
    : 'Private profile applied. Timing, sizes, status codes, and request structure remain. Review the export before sharing.';
  $('brief-text').value = markdown;
  $('waterfall-span').textContent = duration(summary.durationMs);
  renderAudit();
  filterRows();
  selectTab(state.activeTab);
  setStatus(`${state.source?.text ? 'Synthetic demo' : 'Capture'} processed locally. ${number(summary.totalRequests)} requests ready to review.`);
}
function renderAudit() {
  const r = state.result.report;
  const rows = [
    ['Header records removed', r.removed.headers], ['Cookie objects removed', r.removed.cookies],
    ['Body containers removed', r.removed.bodies], ['Query values redacted', r.removed.queryValues],
    ['URL credentials removed', r.removed.urlCredentials], ['Fragments removed', r.removed.fragments],
    ['Metadata fields dropped', r.removed.metadataFields], ['Host occurrences aliased', r.replaced.hosts],
    ['Path segments aliased', r.replaced.pathSegments], ['Query names aliased', r.replaced.queryNames],
    ['Timestamps replaced', r.replaced.timestamps], ['Page labels replaced', r.replaced.pageLabels],
  ];
  $('audit-grid').replaceChildren(...rows.map(([label, value]) => {
    const item = document.createElement('div'); item.className = 'audit-item';
    const title = document.createElement('span'); title.textContent = label;
    const count = document.createElement('strong'); count.textContent = number(value);
    item.append(title, count); return item;
  }));
  const notes = r.warnings.length ? r.warnings : ['No input normalization warnings. This does not certify that the output is anonymous or safe to share.'];
  $('audit-notes').replaceChildren(...notes.map((note) => { const li = document.createElement('li'); li.textContent = note; return li; }));
}
function filterRows() {
  if (!state.result) return;
  const query = $('search').value.toLowerCase().trim();
  const status = $('status-filter').value;
  state.filtered = state.result.har.log.entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => {
    const code = entry.response.status;
    const matchStatus = status === 'all' || (status === 'failed' && (code === 0 || code >= 400)) || (status === 'success' && code >= 200 && code < 300) || (status === 'redirect' && code >= 300 && code < 400);
    return matchStatus && (!query || `${entry.request.method} ${entry.request.url}`.toLowerCase().includes(query));
  });
  const order = $('sort').value;
  state.filtered.sort((a, b) => (order === 'slowest' ? b.entry.time - a.entry.time : order === 'status' ? a.entry.response.status - b.entry.response.status : Date.parse(a.entry.startedDateTime) - Date.parse(b.entry.startedDateTime)) || a.index - b.index);
  state.page = 0;
  renderRows();
}
function renderRows() {
  const entries = state.result.har.log.entries;
  let first = Infinity;
  for (const entry of entries) first = Math.min(first, Date.parse(entry.startedDateTime));
  const span = Math.max(state.result.summary.durationMs, 1);
  const start = state.page * PAGE_SIZE;
  const rows = state.filtered.slice(start, start + PAGE_SIZE).map(({ entry, index }) => {
    const tr = document.createElement('tr');
    const cell = (text) => { const td = document.createElement('td'); if (text !== undefined) td.textContent = text; tr.append(td); return td; };
    cell(String(index + 1));
    const labelCell = cell();
    const button = document.createElement('button'); button.className = 'request-link'; button.type = 'button';
    button.setAttribute('aria-label', `Inspect request ${index + 1}: ${entry.request.method} ${entry.request.url}`);
    const method = document.createElement('span'); method.className = 'method'; method.textContent = entry.request.method;
    const url = document.createElement('span'); url.className = 'url'; url.textContent = entry.request.url; url.title = entry.request.url;
    button.append(method, url); button.addEventListener('click', () => inspectRequest(index)); labelCell.append(button);
    const code = entry.response.status;
    const bad = code === 0 || code >= 400;
    const badge = document.createElement('span'); badge.className = `status-code${bad ? ' bad' : code >= 300 && code < 400 ? ' redirect' : ''}`; badge.textContent = String(code); cell().append(badge);
    cell(duration(entry.time));
    const track = document.createElement('div'); track.className = 'timeline'; track.setAttribute('aria-hidden', 'true');
    const bar = document.createElement('div'); bar.className = `bar${bad ? ' bad' : ''}`;
    const left = Math.max(0, Math.min(100, (Date.parse(entry.startedDateTime) - first) / span * 100));
    bar.style.left = `${left}%`;
    bar.style.width = `${Math.max(0, Math.min(100 - left, entry.time / span * 100))}%`;
    track.append(bar); cell().append(track);
    return tr;
  });
  $('request-rows').replaceChildren(...rows);
  const total = state.filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  $('empty-filter').hidden = total !== 0;
  $('request-count').textContent = total ? `${start + 1}-${Math.min(start + PAGE_SIZE, total)} of ${number(total)} matched / ${number(entries.length)} total` : `0 matched / ${number(entries.length)} total`;
  $('page-count').textContent = `${state.page + 1} / ${pages}`;
  $('prev-page').disabled = state.page === 0;
  $('next-page').disabled = state.page >= pages - 1;
}
function inspectRequest(index) {
  const entry = state.result.har.log.entries[index];
  $('dialog-title').textContent = `Request ${index + 1}`;
  $('request-details').textContent = JSON.stringify(entry, null, 2);
  $('request-dialog').showModal();
}
function selectTab(name, focus = false) {
  state.activeTab = name;
  for (const key of tabs) {
    const selected = key === name;
    $(`tab-${key}`).setAttribute('aria-selected', String(selected));
    $(`tab-${key}`).tabIndex = selected ? 0 : -1;
    $(`panel-${key}`).hidden = !selected;
  }
  if (focus) $(`tab-${name}`).focus();
}
function download(text, name, type) {
  const objectUrl = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = objectUrl; a.download = name;
  document.body.append(a); a.click(); a.remove();
  // A short-lived object URL allows browsers to finish starting the download.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

$('choose-file').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', (event) => { acceptFiles(event.target.files); $('file-input').value = ''; });
$('load-demo').addEventListener('click', () => processSource({ text: DEMO_TEXT }));
$('reset').addEventListener('click', () => {
  terminate(); clearOutput(); state.source = null; state.activeTab = 'waterfall';
  $('file-input').value = ''; $('error').hidden = true; $('reset').hidden = true;
  $('workspace').removeAttribute('aria-busy');
  setStatus('Capture cleared. Ready for another file.'); $('choose-file').focus();
});
for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener('change', () => { if (state.source) processSource(state.source); });
}
for (const name of ['dragenter', 'dragover']) $('dropzone').addEventListener(name, (event) => { event.preventDefault(); $('dropzone').classList.add('dragover'); });
for (const name of ['dragleave', 'drop']) $('dropzone').addEventListener(name, (event) => { event.preventDefault(); $('dropzone').classList.remove('dragover'); });
$('dropzone').addEventListener('drop', (event) => acceptFiles(event.dataTransfer.files));
// Prevent an accidental file drop outside the target from navigating away.
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => event.preventDefault());
$('search').addEventListener('input', filterRows);
$('status-filter').addEventListener('change', filterRows);
$('sort').addEventListener('change', filterRows);
$('prev-page').addEventListener('click', () => { if (state.page > 0) { state.page--; renderRows(); } });
$('next-page').addEventListener('click', () => { if ((state.page + 1) * PAGE_SIZE < state.filtered.length) { state.page++; renderRows(); } });
for (const [index, name] of tabs.entries()) {
  $(`tab-${name}`).addEventListener('click', () => selectTab(name));
  $(`tab-${name}`).addEventListener('keydown', (event) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); selectTab(tabs[next], true); }
  });
}
$('download-har').addEventListener('click', () => { if (state.result) download(state.result.json, 'trace.cleaned.har', 'application/json'); });
$('download-audit').addEventListener('click', () => { if (state.result) download(JSON.stringify(state.result.report, null, 2) + '\n', 'trace.audit.json', 'application/json'); });
$('download-brief').addEventListener('click', () => { if (state.result) download(state.result.markdown, 'trace.brief.md', 'text/markdown'); });
$('copy-brief').addEventListener('click', async () => {
  if (!state.result) return;
  try {
    await navigator.clipboard.writeText(state.result.markdown);
    setStatus('Debugging brief copied. Review it before sharing.');
  } catch {
    $('brief-text').focus(); $('brief-text').select();
    setStatus('Clipboard access unavailable. The brief is selected; copy it manually or use Save .md.');
  }
});
$('close-dialog').addEventListener('click', () => $('request-dialog').close());
$('request-dialog').addEventListener('click', (event) => { if (event.target === $('request-dialog')) $('request-dialog').close(); });
window.addEventListener('pagehide', () => { terminate(); state.source = null; state.result = null; });
