"""Resolve desktop actions in the user's session, before requesting root."""
import ast
import re
import subprocess

from .config import KEYS, validate_profile


def accelerator_keys(accelerator):
    modifiers = {'super': 'KEY_LEFTMETA', 'meta': 'KEY_LEFTMETA',
                 'shift': 'KEY_LEFTSHIFT', 'control': 'KEY_LEFTCTRL',
                 'ctrl': 'KEY_LEFTCTRL', 'primary': 'KEY_LEFTCTRL', 'alt': 'KEY_LEFTALT'}
    keys = []
    remaining = accelerator
    while remaining.startswith('<'):
        match = re.match(r'<([^>]+)>', remaining)
        if not match or match[1].lower() not in modifiers:
            raise ValueError('Modificador de atalho não suportado.')
        keys.append(modifiers[match[1].lower()])
        remaining = remaining[match.end():]
    aliases = {'print': 'SYSRQ', 'return': 'ENTER', 'escape': 'ESC',
               'page_up': 'PAGEUP', 'page_down': 'PAGEDOWN'}
    key = 'KEY_' + aliases.get(remaining.lower(), remaining.upper())
    if key not in KEYS or not remaining or len(keys) > 5:
        raise ValueError('Tecla de captura não suportada.')
    return list(dict.fromkeys(keys + [key]))


def screenshot_keys():
    try:
        result = subprocess.run(['gsettings', 'get', 'org.gnome.shell.keybindings', 'show-screenshot-ui'],
                                capture_output=True, text=True, timeout=5, check=True)
        output = result.stdout.strip()
        shortcuts = ast.literal_eval(output.removeprefix('@as ').strip())
    except (OSError, subprocess.SubprocessError, ValueError, SyntaxError) as error:
        raise ValueError('Não foi possível ler o atalho de captura do Ubuntu. Usa «Atalho personalizado» com a tua combinação de teclas.') from error
    if not isinstance(shortcuts, list) or not shortcuts:
        raise ValueError('A captura de ecrã não tem um atalho ativo no Ubuntu. Define-o em Definições → Teclado → Atalhos.')
    for shortcut in shortcuts:
        if isinstance(shortcut, str):
            try:
                return accelerator_keys(shortcut)
            except ValueError:
                pass
    raise ValueError('O atalho de captura não é suportado. Usa «Atalho personalizado» para definir outra combinação.')


def resolve_profile_shortcuts(profile):
    # Validate creates a new profile: keep the semantic action in saved profiles.
    resolved = validate_profile(profile)
    keys = None

    def resolve(action):
        nonlocal keys
        if action['action'] == 'screenshot':
            if keys is None:
                keys = screenshot_keys()
            return {'action': 'custom', 'keys': list(keys)}
        if action['action'] == 'gestures':
            return {'action': 'gestures', 'directions': {d: resolve(a) for d, a in action['directions'].items()}}
        return action

    resolved['buttons'] = {button: resolve(action) for button, action in resolved['buttons'].items()}
    return validate_profile(resolved)
