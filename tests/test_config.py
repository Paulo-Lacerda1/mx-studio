import unittest
from mxstudio.config import default_profile, validate_profile, compile_config, MODELS, ACTIONS
from mxstudio.devices import model_from_name, parse_solaar


class ConfigurationTests(unittest.TestCase):
    def test_all_models_keep_native_buttons_and_dpi_by_default(self):
        for model in MODELS:
            out = compile_config([default_profile(model)])
            self.assertIn(MODELS[model]['name'], out)
            self.assertNotIn('buttons:', out)
            self.assertNotIn('dpi:', out)
            self.assertNotIn('smartshift:', out)

    def test_print_screen_only_changes_requested_button(self):
        p = default_profile()
        p['buttons']['gesture'] = {'action': 'screenshot'}
        out = compile_config([p])
        self.assertIn('cid: 0x00c3;', out)
        self.assertIn('KEY_SYSRQ', out)
        self.assertEqual(out.count('cid:'), 1)

    def test_mx4_thumb_pad_has_own_control_id(self):
        p = default_profile('mx4')
        p['buttons']['thumb'] = {'action': 'screenshot'}
        self.assertIn('cid: 0x01a0;', compile_config([p]))
        p['model'] = 'mx3s'
        with self.assertRaises(ValueError):
            validate_profile(p)

    def test_main_click_cannot_be_diverted(self):
        p = default_profile()
        p['buttons']['left'] = {'action': 'none'}
        with self.assertRaises(ValueError):
            validate_profile(p)

    def test_dpi_model_limit_and_integer_type(self):
        for value in [8050, 199, 4001, True, '1000', 1025]:
            p = default_profile('mx3s')
            p['dpi'] = value
            with self.assertRaises(ValueError):
                validate_profile(p)
        for model in MODELS:
            p = default_profile(model)
            p['dpi'] = 8000
            self.assertIn('dpi: 8000;', compile_config([p]))

    def test_mx3_only_compiles_for_preserving_existing_configuration(self):
        legacy = default_profile('mx3')
        with self.assertRaises(ValueError):
            compile_config([legacy])
        self.assertIn('Wireless Mouse MX Master 3', compile_config([legacy], allow_legacy=True))
        legacy['dpi'] = 8000
        with self.assertRaises(ValueError):
            compile_config([legacy], allow_legacy=True)

    def test_gestures_include_click_and_all_four_directions(self):
        p = default_profile()
        p['buttons']['gesture'] = {'action': 'gestures', 'directions': {d: {'action': 'copy'} for d in ['None', 'Up', 'Down', 'Left', 'Right']}}
        out = compile_config([p])
        self.assertEqual(out.count('mode: "OnRelease"'), 5)
        self.assertIn('direction: "None"', out)
        del p['buttons']['gesture']['directions']['Up']
        with self.assertRaises(ValueError):
            validate_profile(p)

    def test_nested_gesture_and_unknown_actions_rejected(self):
        for action in ['gestures', 'shell', 'execute']:
            p = default_profile()
            p['buttons']['back'] = {'action': 'gestures', 'directions': {d: {'action': action} for d in ['None', 'Up', 'Down', 'Left', 'Right']}}
            with self.assertRaises(ValueError):
                validate_profile(p)

    def test_custom_keys_are_allowlisted(self):
        p = default_profile()
        for keys in [[], ['KEY_A"; execute: "bad'], ['KEY_FAKE'], [42], ['KEY_A'] * 7]:
            p['buttons']['gesture'] = {'action': 'custom', 'keys': keys}
            with self.assertRaises(ValueError):
                validate_profile(p)
        p['buttons']['gesture']['keys'] = ['KEY_LEFTCTRL', 'KEY_C']
        self.assertIn('["KEY_LEFTCTRL", "KEY_C"]', compile_config([p]))

    def test_every_action_compiles(self):
        for action, *_ in ACTIONS:
            p = default_profile()
            p['buttons']['gesture'] = {'action': action, 'keys': ['KEY_A']}
            compile_config([p])

    def test_scroll_and_thumbwheel_use_valid_modes(self):
        p = default_profile()
        p['scroll'].update(enabled=True, thumbMode='tabs', invert=True)
        out = compile_config([p])
        self.assertIn('divert: true;', out)
        self.assertEqual(out.count('mode: "OnInterval"'), 2)
        self.assertNotIn('mode: "OnRelease"', out)
        self.assertIn('invert: true;', out)

    def test_scroll_rejects_bad_values(self):
        for key, value in [('threshold', 0), ('threshold', 256), ('threshold', True), ('enabled', 'false'), ('thumbMode', 'shell')]:
            p = default_profile()
            p['scroll'][key] = value
            with self.assertRaises(ValueError):
                validate_profile(p)

    def test_untrusted_model_or_profile_shape_rejected(self):
        for p in [None, [], {'model': 'unknown'}, {'model': ['mx3s']}, {'model': 'mx3s', 'buttons': []}]:
            with self.assertRaises((ValueError, TypeError)):
                validate_profile(p)

    def test_profile_names_never_enter_driver_config(self):
        p = default_profile()
        p['name'] = '"; execute: "test'
        self.assertNotIn('execute', compile_config([p]))


class DiscoveryTests(unittest.TestCase):
    def test_models_and_unknown_receiver(self):
        for name, model in [('Logitech MX Master 3S', 'mx3s'), ('Wireless Mouse MX Master 3', None), ('MX Master 4', 'mx4'), ('MX Master 3 for Mac', None), ('MX Master 3S for Mac', 'mx3s'), ('MX Master 4 for Mac', 'mx4'), ('Logitech USB Receiver', None), ('MX Master 30', None)]:
            self.assertEqual(model_from_name(name), model)

    def test_solaar_ignores_offline_paired_devices(self):
        sample = '''Logitech Bolt Receiver
  1: MX Master 3S
     Protocol : HID++ 4.5
     Battery: 76%, discharging.
  2: MX Master 4
     Device is offline
'''
        result = parse_solaar(sample)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['model'], 'mx3s')
        self.assertEqual(result[0]['battery'], 76)

    def test_no_fabricated_battery(self):
        sample = '  1: MX Master 3S\n     Protocol : HID++ 4.5\n     Battery: unknown\n'
        self.assertIsNone(parse_solaar(sample)[0]['battery'])

    def test_solaar_ignores_removed_mx3_without_reusing_its_battery(self):
        sample = '  1: MX Master 3S\n     Protocol : HID++ 4.5\n  2: MX Master 3\n     Protocol : HID++ 4.5\n     Battery: 80%, discharging.\n'
        result = parse_solaar(sample)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['model'], 'mx3s')
        self.assertIsNone(result[0]['battery'])

    def test_bluetooth_standalone_heading(self):
        sample = 'MX Master 3S\n     Device path  : /dev/hidraw5\n     Protocol : HID++ 4.5\n     Battery: 49%, discharging.\n'
        result = parse_solaar(sample)
        self.assertEqual(result[0]['model'], 'mx3s')
        self.assertEqual(result[0]['battery'], 49)

    def test_another_device_does_not_supply_battery(self):
        sample = '  1: MX Master 3S\n     Protocol : HID++ 4.5\n     Battery status unavailable.\n  2: MX Keys\n     Battery: 90%, discharging.\n'
        self.assertIsNone(parse_solaar(sample)[0]['battery'])

    def test_battery_inside_feature_list(self):
        # Real Solaar 1.1.11 output: the battery sits under the numbered HID++ feature list.
        sample = '''Bolt Receiver
  1: MX Master 3S
     Protocol     : unknown (device is offline)
     Battery: unknown (device is offline).

  3: MX Master 3S
     Protocol     : HID++ 4.5
     Supports 37 HID++ 2.0 features:
         0: ROOT                   {0000} V0
         8: UNIFIED BATTERY        {1004} V3
            Battery: 85%, discharging.
         9: REPROG CONTROLS V4     {1B04} V5
     Battery: 85%, discharging.
  4: MX Keys
     Protocol     : HID++ 4.5
     Battery: 20%, discharging.
'''
        result = parse_solaar(sample)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['battery'], 85)
        self.assertEqual(result[0]['connection'], 'Recetor Logitech')


if __name__ == '__main__':
    unittest.main()
