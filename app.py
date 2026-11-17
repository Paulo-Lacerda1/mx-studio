#!/usr/bin/env python3
"""Local-only HTTP app. No third-party Python dependencies."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import threading
import time
import webbrowser

from mxstudio.config import MODELS, BUTTONS, ACTIONS, default_profile, validate_profile, compile_config
from mxstudio.devices import discover
from mxstudio.shortcuts import resolve_profile_shortcuts

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('MX_STUDIO_DATA_DIR', str(ROOT / 'data')))
TOKEN = secrets.token_urlsafe(32)
LOCK = threading.Lock()
DISCOVERY_LOCK = threading.Lock()
CACHE = {'time': 0, 'value': None}


def status(force=False):
    with DISCOVERY_LOCK:
        if force or time.monotonic() - CACHE['time'] > 15:
            CACHE['value'] = discover()
            CACHE['time'] = time.monotonic()
        return CACHE['value']


def stored_profiles():
    if not (DATA / 'profiles.json').exists():
        return []
    return [validate_profile(p, allow_legacy=True) for p in json.loads((DATA / 'profiles.json').read_text())]


def load_profiles():
    return [p for p in stored_profiles() if p['model'] in MODELS]


def save_profile(profile):
    with LOCK:
        profiles = stored_profiles()
        profiles = [p for p in profiles if (p['model'], p['name']) != (profile['model'], profile['name'])]
        profiles.append(profile)
        DATA.mkdir(parents=True, exist_ok=True)
        target = DATA / 'profiles.json'
        temp = target.with_suffix('.tmp')
        temp.write_text(json.dumps(profiles, ensure_ascii=False, indent=2) + '\n')
        temp.replace(target)
    return [p for p in profiles if p['model'] in MODELS]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'web'), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src https://sketchfab.com; object-src 'none'; frame-ancestors 'none'")
        super().end_headers()

    def local_request(self, mutation=False):
        expected = f'127.0.0.1:{self.server.server_port}'
        if self.headers.get('Host') != expected:
            return False
        origin = self.headers.get('Origin')
        if origin and origin != f'http://{expected}':
            return False
        return not mutation or secrets.compare_digest(self.headers.get('X-MX-Token', ''), TOKEN)

    def respond(self, value, code=200):
        body = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.local_request():
            return self.respond({'error': 'Origem não autorizada.'}, 403)
        try:
            if self.path == '/api/bootstrap':
                return self.respond({'token': TOKEN, 'models': MODELS, 'buttons': BUTTONS,
                                     'actions': [{'id': a[0], 'label': a[1], 'group': a[2], 'keys': a[3]} for a in ACTIONS],
                                     'defaults': {m: default_profile(m) for m in MODELS},
                                     'profiles': load_profiles(), 'status': status()})
            if self.path == '/api/status':
                return self.respond(status())
            if self.path.startswith('/api/'):
                return self.respond({'error': 'Não encontrado.'}, 404)
            return super().do_GET()
        except (ValueError, OSError) as e:
            self.respond({'error': str(e)}, 500)

    def do_POST(self):
        if not self.local_request(True):
            return self.respond({'error': 'Pedido não autorizado.'}, 403)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 65536:
                raise ValueError('Pedido demasiado grande ou vazio.')
            value = json.loads(self.rfile.read(length))
            if self.path == '/api/refresh':
                return self.respond(status(True))
            profile = validate_profile(value)
            if self.path == '/api/save':
                return self.respond({'profiles': save_profile(profile)})
            if self.path == '/api/export':
                return self.respond({'config': compile_config([resolve_profile_shortcuts(profile)])})
            if self.path == '/api/apply':
                state = status(True)
                if profile['model'] not in [d['model'] for d in state['devices']]:
                    raise ValueError('Liga o rato selecionado antes de aplicar. Podes guardar ou exportar em pré-visualização.')
                if not state['helperInstalled'] or not state['logiops']:
                    raise ValueError('É necessário concluir a instalação do controlador. Consulta a página Sistema.')
                resolved_profile = resolve_profile_shortcuts(profile)
                if not LOCK.acquire(blocking=False):
                    raise ValueError('Já está a ser aplicada uma configuração.')
                try:
                    result = subprocess.run(['pkexec', '/usr/bin/python3', '-I', '/usr/local/lib/mx-studio/apply.py'],
                                            input=json.dumps(resolved_profile), capture_output=True, text=True, timeout=120)
                finally:
                    LOCK.release()
                if result.returncode:
                    raise ValueError(result.stderr.strip() or 'A autorização foi cancelada ou a configuração falhou.')
                profiles = save_profile(profile)
                CACHE['time'] = 0
                return self.respond({'message': 'Configuração aplicada e serviço reiniciado. Experimenta os botões no rato.', 'profiles': profiles})
            self.respond({'error': 'Não encontrado.'}, 404)
        except (ValueError, TypeError, KeyError, OSError, subprocess.TimeoutExpired) as e:
            self.respond({'error': str(e)}, 400)


def main():
    parser = argparse.ArgumentParser(description='MX Studio — configuração do rato no Ubuntu')
    parser.add_argument('--port', type=int, default=48731)
    parser.add_argument('--no-open', action='store_true')
    args = parser.parse_args()
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    except OSError as error:
        parser.exit(1, f'Não foi possível abrir o servidor local na porta {args.port}: {error}\nSe a porta estiver ocupada, usa --port 48732.\n')
    url = f'http://127.0.0.1:{server.server_port}'
    print(f'MX Studio: {url}', flush=True)
    if not args.no_open:
        chrome = shutil.which('google-chrome') or shutil.which('chromium')
        if chrome:
            subprocess.Popen([chrome, f'--app={url}', '--window-size=1440,950'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
