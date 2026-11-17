import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import app
from mxstudio.config import default_profile


class Connection:
    """Exercise the actual HTTP handler without opening a network socket."""
    def __init__(self, request):
        self.input = io.BytesIO(request)
        self.output = bytearray()

    def makefile(self, *args, **kwargs):
        return self.input

    def sendall(self, value):
        self.output.extend(value)


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = patch.object(app, 'DATA', Path(self.temp.name))
        self.data.start()
        self.state = patch.object(app, 'status', return_value={'devices': [], 'logiops': False, 'helperInstalled': False})
        self.state.start()

    def tearDown(self):
        self.data.stop()
        self.state.stop()
        self.temp.cleanup()

    def request(self, path, value=None, token=app.TOKEN, host='127.0.0.1:48731', origin=None):
        body = json.dumps(value).encode() if value is not None else b''
        method = 'POST' if value is not None else 'GET'
        headers = f'{method} {path} HTTP/1.0\r\nHost: {host}\r\nContent-Length: {len(body)}\r\nX-MX-Token: {token}\r\n'
        if origin:
            headers += f'Origin: {origin}\r\n'
        conn = Connection(headers.encode() + b'\r\n' + body)
        with patch.object(app.Handler, 'log_message'):
            app.Handler(conn, ('127.0.0.1', 1), SimpleNamespace(server_port=48731))
        header, payload = bytes(conn.output).split(b'\r\n\r\n', 1)
        return int(header.split()[1]), payload

    def test_bootstrap_includes_models_and_no_invented_device(self):
        code, body = self.request('/api/bootstrap')
        result = json.loads(body)
        self.assertEqual(code, 200)
        self.assertEqual(set(result['models']), {'mx3s', 'mx4'})
        self.assertEqual(set(result['defaults']), {'mx3s', 'mx4'})
        self.assertEqual(result['status']['devices'], [])

    def test_missing_token_and_cross_origin_mutations_denied(self):
        for kwargs in [{'token': ''}, {'origin': 'https://example.org'}, {'host': 'evil.example:48731'}]:
            code, _ = self.request('/api/save', default_profile(), **kwargs)
            self.assertEqual(code, 403)
        self.assertFalse((Path(self.temp.name) / 'profiles.json').exists())

    def test_legacy_mx3_profile_is_hidden_and_preserved_when_saving(self):
        legacy = default_profile('mx3')
        target = Path(self.temp.name) / 'profiles.json'
        target.write_text(json.dumps([legacy, default_profile('mx4')]))
        code, body = self.request('/api/bootstrap')
        self.assertEqual(code, 200)
        self.assertEqual([p['model'] for p in json.loads(body)['profiles']], ['mx4'])
        code, body = self.request('/api/save', default_profile())
        self.assertEqual(code, 200)
        self.assertEqual({p['model'] for p in json.loads(body)['profiles']}, {'mx3s', 'mx4'})
        self.assertIn(legacy, json.loads(target.read_text()))
        for path in ['/api/save', '/api/export', '/api/apply']:
            self.assertEqual(self.request(path, legacy)[0], 400)

    def test_save_load_and_replace_profile_without_duplicate(self):
        p = default_profile()
        self.assertEqual(self.request('/api/save', p)[0], 200)
        p['buttons']['gesture'] = {'action': 'screenshot'}
        self.assertEqual(self.request('/api/save', p)[0], 200)
        saved = app.load_profiles()
        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0]['buttons']['gesture']['action'], 'screenshot')

    def test_invalid_payload_does_not_change_saved_profile(self):
        p = default_profile()
        self.request('/api/save', p)
        p['dpi'] = -1
        self.assertEqual(self.request('/api/save', p)[0], 400)
        self.assertIsNone(app.load_profiles()[0]['dpi'])

    def test_export_is_read_only(self):
        p = default_profile('mx4')
        p['buttons']['thumb'] = {'action': 'screenshot'}
        with patch('mxstudio.shortcuts.screenshot_keys', return_value=['KEY_LEFTMETA', 'KEY_LEFTSHIFT', 'KEY_S']):
            code, body = self.request('/api/export', p)
        self.assertEqual(code, 200)
        self.assertIn('0x01a0', json.loads(body)['config'])
        self.assertIn('KEY_LEFTMETA', json.loads(body)['config'])
        self.assertNotIn('KEY_SYSRQ', json.loads(body)['config'])
        self.assertFalse((Path(self.temp.name) / 'profiles.json').exists())

    def test_apply_resolves_capture_but_saves_semantic_action(self):
        p = default_profile()
        p['buttons']['gesture'] = {'action': 'screenshot'}
        with patch.object(app, 'status', return_value={'devices': [{'model': 'mx3s'}], 'logiops': True, 'helperInstalled': True}), patch('mxstudio.shortcuts.screenshot_keys', return_value=['KEY_LEFTMETA', 'KEY_LEFTSHIFT', 'KEY_S']), patch.object(app.subprocess, 'run', return_value=SimpleNamespace(returncode=0)) as run:
            code, _ = self.request('/api/apply', p)
            self.assertEqual(code, 200)
            sent = json.loads(run.call_args.kwargs['input'])
            self.assertEqual(sent['buttons']['gesture'], {'action': 'custom', 'keys': ['KEY_LEFTMETA', 'KEY_LEFTSHIFT', 'KEY_S']})
        self.assertEqual(app.load_profiles()[0]['buttons']['gesture'], {'action': 'screenshot'})

    def test_apply_in_preview_never_runs_privileged_helper(self):
        with patch.object(app.subprocess, 'run') as run:
            code, _ = self.request('/api/apply', default_profile())
            self.assertEqual(code, 400)
            run.assert_not_called()

    def test_static_server_does_not_expose_project_data(self):
        self.request('/api/save', default_profile())
        for path in ['/data/profiles.json', '/../app.py', '/%2e%2e/app.py', '/scripts/apply.py']:
            code, _ = self.request(path)
            self.assertEqual(code, 404)
        self.assertEqual(self.request('/')[0], 200)


if __name__ == '__main__':
    unittest.main()
