"""Real-browser tests for the shipped HTML, using unittest + Playwright.

Default transport is localhost HTTP. Set TRACETIDY_TEST_TRANSPORT=document
for managed environments that prohibit navigation. This loads the unchanged
HTML with page.set_content, including its CSP. No security policy is disabled.
Use TRACETIDY_BROWSER=firefox/webkit to exercise another installed browser.
"""
import functools
import json
import os
from pathlib import Path
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import unittest

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
HTML = (ROOT / 'dist' / 'index.html').read_text(encoding='utf-8')
DEMO = json.loads((ROOT / 'examples' / 'demo.har').read_text(encoding='utf-8'))
CANARY = 'PRIVATE_BROWSER_CANARY_7z92'
TRANSPORT = os.environ.get('TRACETIDY_TEST_TRANSPORT', 'http')


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class AppTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        name = os.environ.get('TRACETIDY_BROWSER', 'chromium')
        browser_type = getattr(cls.playwright, name)
        kwargs = {'headless': True}
        executable = os.environ.get('TRACETIDY_BROWSER_EXECUTABLE')
        if executable:
            kwargs['executable_path'] = executable
        cls.browser = browser_type.launch(**kwargs)
        cls.server = None
        if TRANSPORT == 'http':
            handler = functools.partial(QuietHandler, directory=str(ROOT / 'dist'))
            cls.server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
            cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
            cls.server_thread.start()
            cls.url = f'http://127.0.0.1:{cls.server.server_port}/'
        elif TRANSPORT == 'file':
            cls.url = (ROOT / 'dist' / 'index.html').as_uri()
        elif TRANSPORT != 'document':
            raise ValueError('TRACETIDY_TEST_TRANSPORT must be http, file or document')
        print(f'\nBrowser: {name} {cls.browser.version}; transport: {TRANSPORT}')

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        if cls.server:
            cls.server.shutdown()
            cls.server.server_close()
            cls.server_thread.join(timeout=5)

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 1440, 'height': 1050}, accept_downloads=True)
        self.page = self.context.new_page()
        self.errors = []
        self.requests = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.on('console', lambda message: self.errors.append(message.text) if message.type == 'error' else None)
        self.page.on('request', lambda request: self.requests.append(request.url))
        if TRANSPORT == 'document':
            self.page.set_content(HTML, wait_until='load')
        else:
            self.page.goto(self.url, wait_until='load')
        self.requests.clear()

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [], 'Unexpected JavaScript or CSP errors')

    def demo(self):
        self.page.locator('#load-demo').click()
        expect(self.page.locator('#results')).to_be_visible()

    def upload(self, value, name='PRIVATE_FILENAME.har'):
        contents = value if isinstance(value, bytes) else json.dumps(value).encode('utf-8')
        self.page.locator('#file-input').set_input_files({'name': name, 'mimeType': 'application/json', 'buffer': contents})

    def sensitive(self):
        data = json.loads(json.dumps(DEMO))
        data['log']['entries'] = data['log']['entries'][:1]
        entry = data['log']['entries'][0]
        entry['request']['url'] = f'https://{CANARY}.test/{CANARY}?{CANARY}={CANARY}#{CANARY}'
        entry['request']['headers'] = [{'name': CANARY, 'value': CANARY}]
        entry['request']['postData'] = {'text': CANARY}
        entry['response']['content']['text'] = CANARY
        entry['_initiator'] = {'secret': CANARY}
        return data

    def download(self, button):
        with self.page.expect_download() as event:
            self.page.locator(button).click()
        download = event.value
        self.assertIsNone(download.failure())
        return download.suggested_filename, Path(download.path()).read_text(encoding='utf-8')

    def test_demo_and_statistics(self):
        self.demo()
        expect(self.page.locator('#request-rows tr')).to_have_count(12)
        expect(self.page.locator('#metric-requests')).to_have_text('12')
        expect(self.page.locator('#metric-removed')).to_have_text('74')
        expect(self.page.locator('#metric-failed')).to_have_text('3')
        expect(self.page.locator('#metric-duration')).to_have_text('3.92 s')

    def test_private_upload_never_renders_source_values_or_filename(self):
        self.upload(self.sensitive())
        expect(self.page.locator('#results')).to_be_visible()
        self.assertNotIn(CANARY, self.page.locator('body').inner_text())
        self.assertNotIn('PRIVATE_FILENAME', self.page.locator('body').inner_text())
        self.page.locator('#request-rows button').first.click()
        expect(self.page.locator('#request-dialog')).to_be_visible()
        self.assertNotIn(CANARY, self.page.locator('#request-details').inner_text())
        self.page.keyboard.press('Escape')
        expect(self.page.locator('#request-dialog')).not_to_be_visible()

    def test_clean_har_download(self):
        self.upload(self.sensitive())
        expect(self.page.locator('#results')).to_be_visible()
        name, text = self.download('#download-har')
        self.assertEqual(name, 'trace.cleaned.har')
        self.assertNotIn(CANARY, text)
        self.assertEqual(json.loads(text)['log']['entries'][0]['request']['headers'], [])

    def test_audit_download(self):
        self.demo()
        self.page.locator('#tab-audit').click()
        name, text = self.download('#download-audit')
        self.assertEqual(name, 'trace.audit.json')
        self.assertEqual(json.loads(text)['removed']['headers'], 60)
        self.assertNotIn('DEMO_ONLY', text)

    def test_brief_download(self):
        self.demo()
        self.page.locator('#tab-brief').click()
        name, text = self.download('#download-brief')
        self.assertEqual(name, 'trace.brief.md')
        self.assertIn('Steps to reproduce:', text)
        self.assertNotIn('alex@example', text)

    def test_switching_modes_reprocesses_original(self):
        self.demo()
        self.assertNotIn('api.example.test', self.page.locator('#request-rows').inner_text())
        self.page.locator('input[value="diagnostic"]').check()
        expect(self.page.locator('#capture-badge')).to_have_text('DIAGNOSTIC PROFILE')
        self.assertIn('api.example.test', self.page.locator('#request-rows').inner_text())
        expect(self.page.locator('#review-warning')).to_contain_text('may contain secrets')
        self.page.locator('input[value="private"]').check()
        expect(self.page.locator('#capture-badge')).to_have_text('PRIVATE PROFILE')
        self.assertNotIn('api.example.test', self.page.locator('#request-rows').inner_text())

    def test_invalid_json_removes_previous_downloadable_state(self):
        self.demo()
        self.upload(b'{"PRIVATE_JSON_CANARY":')
        expect(self.page.locator('#error')).to_be_visible()
        expect(self.page.locator('#results')).not_to_be_visible()
        self.assertNotIn('PRIVATE_JSON_CANARY', self.page.locator('#error').inner_text())
        expect(self.page.locator('#brief-text')).to_have_value('')

    def test_invalid_har_is_rejected(self):
        self.upload({'not_a_har': CANARY})
        expect(self.page.locator('#error')).to_contain_text('log.entries')
        self.assertNotIn(CANARY, self.page.locator('#error').inner_text())

    def test_invalid_utf8_is_rejected(self):
        self.upload(bytes([0xff, 0xfe, 0xff]))
        expect(self.page.locator('#error')).to_be_visible()
        expect(self.page.locator('#results')).not_to_be_visible()

    def test_oversized_file_is_rejected(self):
        self.upload(b' ' * (25 * 1024 * 1024 + 1))
        expect(self.page.locator('#error')).to_contain_text('25 MiB limit')
        expect(self.page.locator('#results')).not_to_be_visible()

    def test_empty_capture(self):
        self.upload({'log': {'entries': []}})
        expect(self.page.locator('#results')).to_be_visible()
        expect(self.page.locator('#metric-requests')).to_have_text('0')
        expect(self.page.locator('#request-rows tr')).to_have_count(0)
        expect(self.page.locator('#prev-page')).to_be_disabled()
        expect(self.page.locator('#next-page')).to_be_disabled()
        self.assertNotIn('NaN', self.page.locator('#results').inner_text())

    def test_filter_failed_requests(self):
        self.demo()
        self.page.locator('#status-filter').select_option('failed')
        expect(self.page.locator('#request-rows tr')).to_have_count(3)
        self.assertEqual(self.page.locator('#request-rows .status-code').all_text_contents(), ['503', '401', '0'])

    def test_sort_slowest_first(self):
        self.demo()
        self.page.locator('#sort').select_option('slowest')
        expect(self.page.locator('#request-rows tr').first.locator('td').first).to_have_text('6')

    def test_text_filter_and_empty_state(self):
        self.demo()
        self.page.locator('#search').fill('POST')
        expect(self.page.locator('#request-rows tr')).to_have_count(2)
        self.page.locator('#search').fill('does-not-exist')
        expect(self.page.locator('#empty-filter')).to_be_visible()
        expect(self.page.locator('#request-rows tr')).to_have_count(0)
        self.page.locator('#search').fill('')
        expect(self.page.locator('#request-rows tr')).to_have_count(12)

    def test_pagination_bounds_and_filter_reset(self):
        data = json.loads(json.dumps(DEMO))
        data['log']['entries'] = [data['log']['entries'][0] for _ in range(121)]
        self.upload(data)
        expect(self.page.locator('#request-rows tr')).to_have_count(50)
        expect(self.page.locator('#page-count')).to_have_text('1 / 3')
        self.page.locator('#next-page').click()
        self.page.locator('#next-page').click()
        expect(self.page.locator('#request-rows tr')).to_have_count(21)
        expect(self.page.locator('#next-page')).to_be_disabled()
        self.page.locator('#search').fill('GET')
        expect(self.page.locator('#page-count')).to_have_text('1 / 3')
        expect(self.page.locator('#prev-page')).to_be_disabled()

    def test_keyboard_tabs(self):
        self.demo()
        self.page.locator('#tab-waterfall').focus()
        self.page.keyboard.press('ArrowRight')
        expect(self.page.locator('#panel-audit')).to_be_visible()
        expect(self.page.locator('#tab-audit')).to_be_focused()
        self.page.keyboard.press('End')
        expect(self.page.locator('#panel-brief')).to_be_visible()
        self.page.keyboard.press('Home')
        expect(self.page.locator('#panel-waterfall')).to_be_visible()

    def test_clear_capture(self):
        self.demo()
        self.page.locator('#reset').click()
        expect(self.page.locator('#results')).not_to_be_visible()
        expect(self.page.locator('#brief-text')).to_have_value('')
        expect(self.page.locator('#choose-file')).to_be_focused()
        self.page.locator('input[value="diagnostic"]').check()
        expect(self.page.locator('#results')).not_to_be_visible()

    def test_replacement_capture_wins(self):
        self.demo()
        self.upload({'log': {'entries': []}})
        expect(self.page.locator('#metric-requests')).to_have_text('0')
        expect(self.page.locator('#request-rows tr')).to_have_count(0)

    def test_processing_needs_no_network_after_document_load(self):
        attempted = []

        def block_network(route):
            if route.request.url.startswith(('http://', 'https://')):
                attempted.append(route.request.url)
                route.abort()
            else:
                route.continue_()

        self.context.route('**/*', block_network)
        self.demo()
        self.assertEqual(attempted, [])
        self.page.locator('#tab-brief').click()
        self.assertIn('Network debugging brief', self.page.locator('#brief-text').input_value())

    def test_no_external_requests_while_processing_or_reviewing(self):
        self.demo()
        self.page.locator('#tab-audit').click()
        self.page.locator('#tab-brief').click()
        self.assertEqual([url for url in self.requests if url.startswith(('http://', 'https://'))], [])

    def test_responsive_layout_does_not_overflow_document(self):
        self.demo()
        for width in [360, 390, 768, 1440]:
            with self.subTest(width=width):
                self.page.set_viewport_size({'width': width, 'height': 900})
                actual = self.page.evaluate('({scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth})')
                self.assertLessEqual(actual['scroll'], actual['client'] + 1)
                expect(self.page.locator('#download-har')).to_be_visible()

    def test_clipboard_failure_selects_brief_for_manual_copy(self):
        self.demo()
        self.page.locator('#tab-brief').click()
        self.page.evaluate("Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: () => Promise.reject(new Error('Denied for test'))}})")
        self.page.locator('#copy-brief').click()
        expect(self.page.locator('#status')).to_contain_text('Clipboard access unavailable')
        self.assertTrue(self.page.locator('#brief-text').evaluate('(el) => el.selectionEnd > el.selectionStart'))

    def test_multiple_dropped_files_are_rejected(self):
        self.page.locator('#dropzone').evaluate("""el => {
          const transfer = new DataTransfer();
          transfer.items.add(new File(['{}'], 'one.har'));
          transfer.items.add(new File(['{}'], 'two.har'));
          el.dispatchEvent(new DragEvent('drop', {dataTransfer: transfer, bubbles: true}));
        }""")
        expect(self.page.locator('#error')).to_contain_text('one HAR file at a time')

    def test_diagnostic_url_is_text_not_executable_markup(self):
        data = json.loads(json.dumps(DEMO))
        data['log']['entries'] = data['log']['entries'][:1]
        data['log']['entries'][0]['request']['url'] = 'https://example.test/<img%20src=x%20onerror=alert(1)>'
        self.page.locator('input[value="diagnostic"]').check()
        self.upload(data)
        expect(self.page.locator('#results')).to_be_visible()
        self.assertEqual(self.page.locator('#request-rows img').count(), 0)
        self.assertEqual(self.page.locator('#request-rows script').count(), 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)