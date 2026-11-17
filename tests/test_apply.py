"""Test the privileged transaction in a temporary directory, without privileges."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from mxstudio.config import default_profile, compile_config


class ApplyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        project = Path(__file__).resolve().parents[1]
        shutil.copy(project / 'scripts/apply.py', self.root / 'apply.py')
        shutil.copy(project / 'mxstudio/config.py', self.root / 'config.py')
        spec = importlib.util.spec_from_file_location('apply_test_helper', self.root / 'apply.py')
        self.helper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.helper)
        self.target = self.root / 'logid.cfg'
        self.state = self.root / 'state'
        self.path_patch = patch.object(self.helper, 'Path', side_effect=lambda p: {'/etc/logid.cfg': self.target, '/var/lib/mx-studio': self.state}.get(str(p), Path(p)))
        self.path_patch.start()

    def tearDown(self):
        self.path_patch.stop()
        self.temp.cleanup()

    def apply(self, profile, run):
        with patch.object(self.helper.os, 'geteuid', return_value=0), patch.object(self.helper.sys, 'stdin', io.StringIO(json.dumps(profile))), patch.object(self.helper.subprocess, 'run', run), patch.object(self.helper.time, 'sleep'), contextlib.redirect_stdout(io.StringIO()):
            self.helper.main()

    def test_external_config_is_never_overwritten(self):
        self.target.write_text('devices: (); // user config')
        from unittest.mock import Mock
        run = Mock()
        with self.assertRaises(ValueError):
            self.apply(default_profile(), run)
        self.assertEqual(self.target.read_text(), 'devices: (); // user config')
        run.assert_not_called()

    def test_packaged_commented_example_can_be_replaced_and_is_backed_up(self):
        from unittest.mock import Mock
        original = '# devices: (\n# { name: "Wireless Mouse MX Master"; dpi: 1000; }\n# );\n'
        self.target.write_text(original)
        p = default_profile()
        p['buttons']['gesture'] = {'action': 'screenshot'}
        self.apply(p, Mock(return_value=subprocess.CompletedProcess([], 0)))
        self.assertIn('KEY_SYSRQ', self.target.read_text())
        backups = list((self.state / 'backups').glob('*.cfg'))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(), original)
        self.assertEqual(json.loads((self.state / 'active.json').read_text())['mx3s'], p)

    def test_comment_only_accepts_all_libconfig_comment_styles(self):
        for text in ['', ' \n\t', '# example', '// example\n', '/* example */', '# first\n /* devices: (); */ // third\n']:
            with self.subTest(text=text):
                self.assertTrue(self.helper.comment_only(text))

    def test_comment_only_does_not_hide_real_or_malformed_configuration(self):
        for text in ['# example\ndevices: ();', '/* comment */ dpi: 1000;', 'name: "// example";', 'name: "# example";', '/* unfinished comment', '@include "other.cfg"']:
            with self.subTest(text=text):
                self.assertFalse(self.helper.comment_only(text))

    def test_failed_restart_restores_commented_example(self):
        from unittest.mock import Mock
        original = '# devices: ();\n'
        self.target.write_text(original)
        run = Mock(side_effect=[subprocess.CalledProcessError(1, 'systemctl'), subprocess.CompletedProcess([], 0)])
        with self.assertRaises(ValueError):
            self.apply(default_profile(), run)
        self.assertEqual(self.target.read_text(), original)
        self.assertFalse((self.state / 'active.json').exists())

    def test_failed_restart_restores_previous_config(self):
        from unittest.mock import Mock
        previous = compile_config([default_profile()])
        self.target.write_text(previous)
        p = default_profile()
        p['buttons']['gesture'] = {'action': 'screenshot'}
        run = Mock(side_effect=[subprocess.CalledProcessError(1, 'systemctl'), subprocess.CompletedProcess([], 0)])
        with self.assertRaises(ValueError):
            self.apply(p, run)
        self.assertEqual(self.target.read_text(), previous)
        self.assertFalse((self.state / 'active.json').exists())
        self.assertEqual(len(list((self.state / 'backups').glob('*.cfg'))), 1)

    def test_success_preserves_other_models(self):
        from unittest.mock import Mock
        self.state.mkdir()
        (self.state / 'active.json').write_text(json.dumps({'mx3': default_profile('mx3')}))
        self.apply(default_profile('mx4'), Mock(return_value=subprocess.CompletedProcess([], 0)))
        active = json.loads((self.state / 'active.json').read_text())
        self.assertEqual(set(active), {'mx3', 'mx4'})
        self.assertIn('MX Master 4', self.target.read_text())
        self.assertIn('Wireless Mouse MX Master 3', self.target.read_text())

    def test_no_original_file_is_restored_to_absence_on_failure(self):
        from unittest.mock import Mock
        run = Mock(side_effect=[subprocess.CalledProcessError(1, 'systemctl'), subprocess.CompletedProcess([], 0)])
        with self.assertRaises(ValueError):
            self.apply(default_profile(), run)
        self.assertFalse(self.target.exists())


if __name__ == '__main__':
    unittest.main()
