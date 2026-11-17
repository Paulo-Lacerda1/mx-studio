"""Validated, deterministic JSON -> LogiOps configuration. No shell commands."""
import json

MODELS = {
    'mx3': {'label': 'MX Master 3', 'name': 'Wireless Mouse MX Master 3', 'dpiMax': 4000},
    'mx3s': {'label': 'MX Master 3S', 'name': 'MX Master 3S', 'dpiMax': 8000},
    'mx4': {'label': 'MX Master 4', 'name': 'MX Master 4', 'dpiMax': 8000},
}
BUTTONS = [
    {'id': 'left', 'label': 'Clique esquerdo', 'native': True},
    {'id': 'right', 'label': 'Clique direito', 'native': True},
    {'id': 'middle', 'label': 'Clique da roda', 'cid': 0x52},
    {'id': 'shift', 'label': 'Botão superior', 'cid': 0xc4},
    {'id': 'back', 'label': 'Recuar', 'cid': 0x53},
    {'id': 'forward', 'label': 'Avançar', 'cid': 0x56},
    {'id': 'gesture', 'label': 'Botão de gestos', 'cid': 0xc3},
    {'id': 'thumb', 'label': 'Apoio do polegar', 'cid': 0x1a0, 'model': 'mx4'},
]
ACTIONS = [
    ('default', 'Predefinição do rato', 'Rato', []),
    ('screenshot', 'Captura de ecrã', 'Ubuntu', ['KEY_SYSRQ']),
    ('overview', 'Vista de atividades', 'Ubuntu', ['KEY_LEFTMETA']),
    ('apps', 'Mostrar aplicações', 'Ubuntu', ['KEY_LEFTMETA', 'KEY_A']),
    ('switch-app', 'Alternar aplicações', 'Ubuntu', ['KEY_LEFTALT', 'KEY_TAB']),
    ('desktop', 'Mostrar ambiente de trabalho', 'Ubuntu', ['KEY_LEFTMETA', 'KEY_D']),
    ('lock', 'Bloquear ecrã', 'Ubuntu', ['KEY_LEFTMETA', 'KEY_L']),
    ('terminal', 'Abrir terminal', 'Ubuntu', ['KEY_LEFTCTRL', 'KEY_LEFTALT', 'KEY_T']),
    ('workspace-left', 'Área de trabalho anterior', 'Ubuntu', ['KEY_LEFTMETA', 'KEY_PAGEUP']),
    ('workspace-right', 'Área de trabalho seguinte', 'Ubuntu', ['KEY_LEFTMETA', 'KEY_PAGEDOWN']),
    ('maximize', 'Maximizar janela', 'Janelas', ['KEY_LEFTMETA', 'KEY_UP']),
    ('minimize', 'Minimizar janela', 'Janelas', ['KEY_LEFTMETA', 'KEY_H']),
    ('tile-left', 'Janela à esquerda', 'Janelas', ['KEY_LEFTMETA', 'KEY_LEFT']),
    ('tile-right', 'Janela à direita', 'Janelas', ['KEY_LEFTMETA', 'KEY_RIGHT']),
    ('close', 'Fechar janela', 'Janelas', ['KEY_LEFTALT', 'KEY_F4']),
    ('copy', 'Copiar', 'Edição', ['KEY_LEFTCTRL', 'KEY_C']),
    ('paste', 'Colar', 'Edição', ['KEY_LEFTCTRL', 'KEY_V']),
    ('cut', 'Cortar', 'Edição', ['KEY_LEFTCTRL', 'KEY_X']),
    ('undo', 'Desfazer', 'Edição', ['KEY_LEFTCTRL', 'KEY_Z']),
    ('redo', 'Refazer', 'Edição', ['KEY_LEFTCTRL', 'KEY_LEFTSHIFT', 'KEY_Z']),
    ('select-all', 'Selecionar tudo', 'Edição', ['KEY_LEFTCTRL', 'KEY_A']),
    ('find', 'Procurar', 'Edição', ['KEY_LEFTCTRL', 'KEY_F']),
    ('back', 'Página anterior', 'Navegação', ['KEY_LEFTALT', 'KEY_LEFT']),
    ('forward', 'Página seguinte', 'Navegação', ['KEY_LEFTALT', 'KEY_RIGHT']),
    ('new-tab', 'Novo separador', 'Navegação', ['KEY_LEFTCTRL', 'KEY_T']),
    ('close-tab', 'Fechar separador', 'Navegação', ['KEY_LEFTCTRL', 'KEY_W']),
    ('next-tab', 'Separador seguinte', 'Navegação', ['KEY_LEFTCTRL', 'KEY_TAB']),
    ('previous-tab', 'Separador anterior', 'Navegação', ['KEY_LEFTCTRL', 'KEY_LEFTSHIFT', 'KEY_TAB']),
    ('zoom-in', 'Aumentar zoom', 'Navegação', ['KEY_LEFTCTRL', 'KEY_EQUAL']),
    ('zoom-out', 'Diminuir zoom', 'Navegação', ['KEY_LEFTCTRL', 'KEY_MINUS']),
    ('play', 'Reproduzir / pausa', 'Multimédia', ['KEY_PLAYPAUSE']),
    ('next-track', 'Faixa seguinte', 'Multimédia', ['KEY_NEXTSONG']),
    ('previous-track', 'Faixa anterior', 'Multimédia', ['KEY_PREVIOUSSONG']),
    ('volume-up', 'Aumentar volume', 'Multimédia', ['KEY_VOLUMEUP']),
    ('volume-down', 'Diminuir volume', 'Multimédia', ['KEY_VOLUMEDOWN']),
    ('mute', 'Silenciar áudio', 'Multimédia', ['KEY_MUTE']),
    ('mic-mute', 'Silenciar microfone', 'Multimédia', ['KEY_MICMUTE']),
    ('brightness-up', 'Aumentar brilho', 'Multimédia', ['KEY_BRIGHTNESSUP']),
    ('brightness-down', 'Diminuir brilho', 'Multimédia', ['KEY_BRIGHTNESSDOWN']),
    ('smartshift', 'Alternar SmartShift', 'Rato', []),
    ('cycle-dpi', 'Alternar DPI', 'Rato', []),
    ('none', 'Sem ação', 'Rato', []),
    ('custom', 'Atalho personalizado', 'Personalizado', []),
]
ACTION_MAP = {a[0]: a for a in ACTIONS}
DIRECTIONS = ('None', 'Up', 'Down', 'Left', 'Right')
KEYS = set('KEY_' + c for c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
KEYS.update('KEY_F' + str(i) for i in range(1, 25))
KEYS.update(('KEY_' + k) for k in ('LEFTCTRL','RIGHTCTRL','LEFTALT','RIGHTALT','LEFTSHIFT','RIGHTSHIFT','LEFTMETA','RIGHTMETA','SPACE','ENTER','ESC','TAB','BACKSPACE','DELETE','INSERT','HOME','END','PAGEUP','PAGEDOWN','UP','DOWN','LEFT','RIGHT','SYSRQ','MINUS','EQUAL','COMMA','DOT','SLASH','SEMICOLON','APOSTROPHE','LEFTBRACE','RIGHTBRACE','BACKSLASH','GRAVE'))
KEYS.update(k for a in ACTIONS for k in a[3])


def default_profile(model='mx3s'):
    return {'model': model, 'name': 'Pessoal', 'buttons': {}, 'dpi': None,
            'scroll': {'enabled': False, 'smartshift': True, 'threshold': 30,
                       'hires': True, 'invert': False, 'thumbInvert': False,
                       'thumbMode': 'default'}}


def validate_action(value, gestures=True):
    if not isinstance(value, dict):
        raise ValueError('A ação tem de ser um objeto.')
    action = value.get('action', 'default')
    if action == 'gestures' and gestures:
        mappings = value.get('directions')
        if not isinstance(mappings, dict) or set(mappings) != set(DIRECTIONS):
            raise ValueError('Define o clique e as quatro direções do gesto.')
        return {'action': action, 'directions': {d: validate_action(mappings[d], False) for d in DIRECTIONS}}
    if action not in ACTION_MAP:
        raise ValueError('Ação desconhecida.')
    result = {'action': action}
    if action == 'custom':
        keys = value.get('keys', [])
        if not isinstance(keys, list) or not 1 <= len(keys) <= 6 or any(not isinstance(k, str) or k not in KEYS for k in keys):
            raise ValueError('O atalho deve conter entre 1 e 6 teclas válidas.')
        result['keys'] = list(dict.fromkeys(keys))
    return result


def validate_profile(value):
    if not isinstance(value, dict) or not isinstance(value.get('model'), str) or value.get('model') not in MODELS:
        raise ValueError('Modelo de rato inválido.')
    result = default_profile(value['model'])
    name = value.get('name', 'Pessoal')
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 40 or any(ord(c) < 32 for c in name):
        raise ValueError('O nome do perfil deve ter entre 1 e 40 caracteres.')
    result['name'] = name.strip()
    buttons = value.get('buttons', {})
    valid = {b['id'] for b in BUTTONS if not b.get('native') and b.get('model', value['model']) == value['model']}
    if not isinstance(buttons, dict) or set(buttons) - valid:
        raise ValueError('Um dos botões não está disponível neste modelo.')
    result['buttons'] = {b: validate_action(a) for b, a in buttons.items()}
    dpi = value.get('dpi')
    if dpi is not None and (type(dpi) is not int or not 200 <= dpi <= MODELS[value['model']]['dpiMax'] or dpi % 50):
        raise ValueError('DPI fora do intervalo do rato (passos de 50).')
    result['dpi'] = dpi
    scroll = value.get('scroll', {})
    if not isinstance(scroll, dict) or set(scroll) - set(result['scroll']):
        raise ValueError('Opções da roda inválidas.')
    for key in ['enabled', 'smartshift', 'hires', 'invert', 'thumbInvert']:
        if key in scroll:
            if type(scroll[key]) is not bool:
                raise ValueError('Opção de roda inválida.')
            result['scroll'][key] = scroll[key]
    if 'threshold' in scroll:
        if type(scroll['threshold']) is not int or not 1 <= scroll['threshold'] <= 255:
            raise ValueError('O limiar de SmartShift deve estar entre 1 e 255.')
        result['scroll']['threshold'] = scroll['threshold']
    if scroll.get('thumbMode', 'default') not in ['default', 'volume', 'tabs', 'zoom']:
        raise ValueError('Modo da roda lateral inválido.')
    result['scroll']['thumbMode'] = scroll.get('thumbMode', 'default')
    return result


def action_config(spec):
    action = spec['action']
    if action in ('none', 'default'):
        return 'type: "None";'
    if action == 'smartshift':
        return 'type: "ToggleSmartshift";'
    if action == 'cycle-dpi':
        return 'type: "CycleDPI"; dpis: [800, 1600, 2400];'
    if action == 'gestures':
        parts = [f'{{ direction: "{d}"; mode: "OnRelease"; threshold: 50; action: {{ {action_config(spec["directions"][d])} }}; }}' for d in DIRECTIONS]
        return 'type: "Gestures"; gestures: (\n        ' + ',\n        '.join(parts) + '\n      );'
    keys = spec['keys'] if action == 'custom' else ACTION_MAP[action][3]
    return 'type: "Keypress"; keys: ' + json.dumps(keys) + ';'


def device_config(profile):
    p = validate_profile(profile)
    parts = ['  {', f'    name: {json.dumps(MODELS[p["model"]]["name"])};']
    if p['dpi'] is not None:
        parts.append(f'    dpi: {p["dpi"]};')
    s = p['scroll']
    boolean = lambda v: str(v).lower()
    if s['enabled']:
        parts.extend([f'    smartshift: {{ on: {boolean(s["smartshift"])}; threshold: {s["threshold"]}; }};',
                      f'    hiresscroll: {{ hires: {boolean(s["hires"])}; invert: {boolean(s["invert"])}; target: false; }};'])
        thumb = f'    thumbwheel: {{ invert: {boolean(s["thumbInvert"])}; divert: {boolean(s["thumbMode"] != "default")};'
        modes = {'volume': ('volume-down', 'volume-up'), 'tabs': ('previous-tab', 'next-tab'), 'zoom': ('zoom-out', 'zoom-in')}
        if s['thumbMode'] in modes:
            for direction, a in zip(['left', 'right'], modes[s['thumbMode']]):
                thumb += f' {direction}: {{ mode: "OnInterval"; interval: 12; action: {{ {action_config({"action": a})} }}; }};'
        parts.append(thumb + ' };')
    buttons = []
    for b in BUTTONS:
        spec = p['buttons'].get(b['id'], {'action': 'default'})
        if spec['action'] != 'default':
            buttons.append(f'      {{ cid: 0x{b["cid"]:04x}; action: {{ {action_config(spec)} }}; }}')
    if buttons:
        parts.append('    buttons: (\n' + ',\n'.join(buttons) + '\n    );')
    parts.append('  }')
    return '\n'.join(parts)


MARKER = '// Managed by MX Studio. Backups: /var/lib/mx-studio/backups\n'


def compile_config(profiles):
    if not profiles:
        raise ValueError('Não há perfis para aplicar.')
    return MARKER + 'devices: (\n' + ',\n'.join(device_config(p) for p in profiles) + '\n);\n'
