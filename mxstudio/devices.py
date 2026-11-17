"""Read-only discovery. A USB receiver alone is never treated as a mouse."""
import os
from pathlib import Path
import re
import shutil
import subprocess
from .config import MODELS


def model_from_name(name):
    match = re.search(r'MX\s*Master\s*(3S|3|4)(?!\w)', name, re.I)
    return {'3s': 'mx3s', '4': 'mx4'}.get(match.group(1).lower()) if match else None


def run(command, timeout=8):
    try:
        p = subprocess.run(command, capture_output=True, text=True, timeout=timeout,
                           env={**os.environ, 'LC_ALL': 'C'})
        return p.returncode, p.stdout, p.stderr
    except (OSError, subprocess.TimeoutExpired) as e:
        return -1, '', str(e)


def parse_solaar(text):
    devices = []
    headings = list(re.finditer(r'(?m)^(?: {0,2}\d+: +|(?=[^ \n]))([^\n]*MX\s*Master\s*(?:3S|3|4)[^\n]*)\n', text, re.I))
    for i, match in enumerate(headings):
        name = match.group(1)
        end = headings[i + 1].start() if i + 1 < len(headings) else len(text)
        body = text[match.end():end]
        # A subsequent numbered non-MX device must not supply this mouse's battery.
        # Device headings are indented at most 2 spaces; deeper numbered lines are the
        # device's own HID++ feature list (e.g. "8: UNIFIED BATTERY"), which holds the battery.
        body = re.split(r'(?m)^ {0,3}\d+:\s+', body)[0]
        model = model_from_name(name)
        if not model or re.search(r'(device is offline|device is not online|not responding)', body, re.I):
            continue
        # Paired devices that are asleep must not be presented as connected.
        if not re.search(r'(Protocol|Battery|HID\+\+)', body, re.I):
            continue
        battery = re.search(r'Battery:\s*(\d+)%', body)
        devices.append({'model': model, 'name': name.strip(), 'source': 'Solaar',
                        'connection': 'Ligação direta' if not re.match(r'^\s*\d+:', match.group(0)) else 'Recetor Logitech',
                        'battery': int(battery.group(1)) if battery else None})
    return devices


def discover():
    found = []
    diagnostics = []
    receiver = False
    for path in Path('/sys/bus/hid/devices').glob('*/uevent'):
        try:
            data = dict(line.split('=', 1) for line in path.read_text().splitlines() if '=' in line)
        except OSError:
            continue
        name = data.get('HID_NAME', '')
        if 'Logitech' in name and 'Receiver' in name:
            receiver = True
        model = model_from_name(name)
        if model:
            found.append({'model': model, 'name': name, 'source': 'Linux HID',
                          'connection': 'Bluetooth' if data.get('HID_ID', '').startswith('0005') else 'Recetor Logitech',
                          'battery': None})
    if shutil.which('solaar'):
        code, output, error = run(['solaar', 'show'])
        if code == 0:
            found.extend(parse_solaar(output))
        else:
            diagnostics.append('O Solaar não conseguiu consultar o rato. Verifica a ligação e as permissões de /dev/hidraw.')
    devices = {}
    for d in found:
        key = d['model']  # LogiOps applies settings by model, not serial number.
        if key in devices and d['connection'] == 'Ligação direta':
            d['connection'] = devices[key]['connection']
        if key not in devices or d['battery'] is not None:
            devices[key] = {**d, 'id': key}
    if receiver and not devices:
        diagnostics.append('Recetor Logitech encontrado; o recetor, por si só, não identifica o modelo do rato.')
    _, service, _ = run(['systemctl', 'is-active', 'logid'], timeout=3)
    return {'devices': list(devices.values()), 'receiver': receiver, 'diagnostics': diagnostics,
            'session': os.environ.get('XDG_SESSION_TYPE', 'desconhecida'),
            'desktop': os.environ.get('XDG_CURRENT_DESKTOP', 'desconhecido'),
            'logiops': bool(shutil.which('logid')), 'serviceActive': service.strip() == 'active',
            'helperInstalled': Path('/usr/local/lib/mx-studio/apply.py').is_file(),
            'solaar': bool(shutil.which('solaar'))}
