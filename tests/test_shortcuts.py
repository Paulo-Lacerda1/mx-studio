import unittest
from types import SimpleNamespace
from unittest.mock import patch

from mxstudio.config import default_profile
from mxstudio.shortcuts import accelerator_keys, screenshot_keys, resolve_profile_shortcuts


class ShortcutTests(unittest.TestCase):
    def test_current_user_shortcut_and_default_print(self):
        self.assertEqual(accelerator_keys('<Shift><Super>s'), ['KEY_LEFTSHIFT', 'KEY_LEFTMETA', 'KEY_S'])
        self.assertEqual(accelerator_keys('Print'), ['KEY_SYSRQ'])

    def test_disabled_shortcut_reports_error(self):
        for output in ['@as []', '[]']:
            with patch('mxstudio.shortcuts.subprocess.run', return_value=SimpleNamespace(stdout=output)), self.assertRaisesRegex(ValueError, 'não tem um atalho ativo'):
                screenshot_keys()

    def test_try_next_supported_binding(self):
        with patch('mxstudio.shortcuts.subprocess.run', return_value=SimpleNamespace(stdout="['<Unsupported>x', '<Super><Shift>s']")):
            self.assertEqual(screenshot_keys(), ['KEY_LEFTMETA', 'KEY_LEFTSHIFT', 'KEY_S'])

    def test_no_capture_does_not_query_desktop(self):
        p = default_profile()
        p['buttons']['back'] = {'action': 'copy'}
        with patch('mxstudio.shortcuts.subprocess.run') as run:
            self.assertEqual(resolve_profile_shortcuts(p), p)
            run.assert_not_called()

    def test_capture_in_gestures_is_resolved_without_mutating_source(self):
        p = default_profile()
        p['buttons']['gesture'] = {'action': 'gestures', 'directions': {d: {'action': 'screenshot'} for d in ['None', 'Up', 'Down', 'Left', 'Right']}}
        with patch('mxstudio.shortcuts.screenshot_keys', return_value=['KEY_LEFTMETA', 'KEY_LEFTSHIFT', 'KEY_S']) as lookup:
            out = resolve_profile_shortcuts(p)
            lookup.assert_called_once()
        self.assertEqual(out['buttons']['gesture']['directions']['None']['action'], 'custom')
        self.assertEqual(p['buttons']['gesture']['directions']['None']['action'], 'screenshot')

    def test_unrecognised_accelerators_are_not_sent_to_driver(self):
        for value in ['', '<Super>', '<Hyper>s', 'KEY_A";', '<Super>unknown']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                accelerator_keys(value)
