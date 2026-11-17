import configparser
import io
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import app


ROOT = Path(__file__).resolve().parents[1]


class DesktopTests(unittest.TestCase):
    def test_staged_install_includes_app_launcher_and_icon_without_private_data(self):
        with tempfile.TemporaryDirectory(prefix='mx studio install ') as temp:
            stage = Path(temp)
            env = {**os.environ, 'DESTDIR': temp, 'PYTHONDONTWRITEBYTECODE': '1'}
            subprocess.run(['bash', str(ROOT / 'scripts/install-system.sh')], env=env,
                           cwd='/', check=True, capture_output=True, text=True)
            installed = stage / 'usr/local/share/mx-studio'
            for relative in ['app.py', 'mxstudio/config.py', 'mxstudio/devices.py', 'web/index.html',
                             'web/app.js', 'web/model-viewer.js', 'web/models/mx3s.glb', 'web/icon.svg']:
                self.assertEqual((installed / relative).read_bytes(), (ROOT / relative).read_bytes())
            self.assertFalse((installed / 'data').exists())
            self.assertFalse(list(installed.rglob('__pycache__')))
            launcher = stage / 'usr/local/bin/mx-studio'
            self.assertTrue(os.access(launcher, os.X_OK))
            self.assertEqual((stage / 'usr/local/lib/mx-studio/config.py').read_bytes(),
                             (ROOT / 'mxstudio/config.py').read_bytes())
            desktop = stage / 'usr/local/share/applications/mx-studio.desktop'
            config = configparser.ConfigParser(interpolation=None)
            config.read(desktop)
            entry = config['Desktop Entry']
            self.assertEqual(entry['Exec'], '/usr/local/bin/mx-studio')
            self.assertEqual(entry['Terminal'], 'false')
            icon = stage / f'usr/local/share/icons/hicolor/scalable/apps/{entry["Icon"]}.svg'
            self.assertEqual(icon.read_bytes(), (ROOT / 'web/icon.svg').read_bytes())
            subprocess.run([sys.executable, str(installed / 'app.py'), '--help'], env=env,
                           cwd='/', check=True, capture_output=True)
            if shutil.which('desktop-file-validate'):
                subprocess.run(['desktop-file-validate', str(desktop)], check=True, capture_output=True)
            # Reinstalling updates assets while leaving user profiles alone.
            profiles = stage / 'home/example/.local/share/mx-studio/profiles.json'
            profiles.parent.mkdir(parents=True)
            profiles.write_text('existing profiles')
            subprocess.run(['bash', str(ROOT / 'scripts/install-system.sh')], env=env,
                           check=True, capture_output=True)
            self.assertEqual(profiles.read_text(), 'existing profiles')

    def test_desktop_reopens_running_app_without_starting_another_server(self):
        with patch.object(sys, 'argv', ['app.py', '--desktop']), \
                patch.object(app, 'ThreadingHTTPServer', side_effect=OSError('busy')), \
                patch.object(app, 'running_app', return_value=True) as probe, \
                patch.object(app, 'open_window') as open_window:
            app.main()
        probe.assert_called_once_with('http://127.0.0.1:48731')
        open_window.assert_called_once_with('http://127.0.0.1:48731')

    def test_desktop_does_not_open_foreign_service_on_same_port(self):
        with patch.object(sys, 'argv', ['app.py', '--desktop']), \
                patch.object(app, 'ThreadingHTTPServer', side_effect=OSError('busy')), \
                patch.object(app, 'running_app', return_value=False), \
                patch.object(app, 'open_window') as open_window, \
                patch.object(sys, 'stderr', io.StringIO()), self.assertRaises(SystemExit):
            app.main()
        open_window.assert_not_called()

    def test_no_open_never_opens_window_on_occupied_port(self):
        with patch.object(sys, 'argv', ['app.py', '--desktop', '--no-open']), \
                patch.object(app, 'ThreadingHTTPServer', side_effect=OSError('busy')), \
                patch.object(app, 'running_app') as probe, \
                patch.object(sys, 'stderr', io.StringIO()), self.assertRaises(SystemExit):
            app.main()
        probe.assert_not_called()

    def test_running_app_checks_identity_and_handles_unavailable_server(self):
        for body, expected in [(b'{"application":"mx-studio"}', True), (b'{}', False), (b'<html>', False)]:
            with self.subTest(body=body), patch.object(app, 'urlopen', return_value=io.BytesIO(body)):
                self.assertEqual(app.running_app('http://127.0.0.1:48731'), expected)
        with patch.object(app, 'urlopen', side_effect=TimeoutError):
            self.assertFalse(app.running_app('http://127.0.0.1:48731'))

    def test_browser_window_matches_desktop_icon_class(self):
        with patch.object(app.shutil, 'which', side_effect=lambda name: '/usr/bin/chromium' if name == 'chromium' else None), \
                patch.object(app.subprocess, 'Popen') as popen:
            app.open_window('http://127.0.0.1:48731')
        command = popen.call_args.args[0]
        self.assertIn('--class=mx-studio', command)
        self.assertIn('--app=http://127.0.0.1:48731', command)

    def test_default_browser_fallback(self):
        with patch.object(app.shutil, 'which', return_value=None), \
                patch.object(app.webbrowser, 'open') as open_browser:
            app.open_window('http://127.0.0.1:48731')
        open_browser.assert_called_once_with('http://127.0.0.1:48731')
