#!/usr/bin/env python3
"""Root-owned privileged boundary. Only allowlisted settings are accepted."""
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('mx_config', HERE / 'config.py')
config = importlib.util.module_from_spec(spec)
spec.loader.exec_module(config)


def comment_only(text):
    """The packaged logid.cfg may contain nothing but a commented example.

    Match comments only at the next non-whitespace position. In particular,
    comment-looking text inside an active setting must never hide that setting.
    An unterminated block comment is rejected rather than repaired implicitly.
    """
    remaining = text.lstrip()
    while remaining:
        comment = re.match(r'(?:\#[^\n]*(?:\n|$)|//[^\n]*(?:\n|$)|/\*[\s\S]*?\*/)', remaining)
        if not comment:
            return False
        remaining = remaining[comment.end():].lstrip()
    return True


def atomic_write(path, data):
    fd, temp = tempfile.mkstemp(prefix='.mx-studio-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temp, 0o644)
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def main():
    if os.geteuid() != 0:
        raise ValueError('É necessária autorização de administrador.')
    raw = sys.stdin.read(65537)
    if len(raw) > 65536:
        raise ValueError('Pedido demasiado grande.')
    profile = config.validate_profile(json.loads(raw))
    state = Path('/var/lib/mx-studio')
    state.mkdir(mode=0o755, exist_ok=True)
    with (state / 'apply.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        target = Path('/etc/logid.cfg')
        if target.is_symlink():
            raise ValueError('/etc/logid.cfg é uma ligação simbólica; a configuração não foi alterada.')
        old = target.read_text() if target.exists() else None
        if old and not old.startswith(config.MARKER) and not comment_only(old):
            raise ValueError('Já existe uma configuração LogiOps externa. Exporta o perfil e integra-o manualmente; o ficheiro existente foi preservado.')
        state_file = state / 'active.json'
        profiles = json.loads(state_file.read_text()) if state_file.exists() else {}
        profiles[profile['model']] = profile
        generated = config.compile_config(list(profiles.values()), allow_legacy=True)
        backup_dir = state / 'backups'
        backup_dir.mkdir(exist_ok=True)
        if old is not None:
            atomic_write(backup_dir / f'logid-{time.time_ns()}.cfg', old)
        atomic_write(target, generated)
        try:
            subprocess.run(['/usr/bin/systemctl', 'restart', 'logid.service'], check=True, capture_output=True, timeout=25)
            time.sleep(1)
            subprocess.run(['/usr/bin/systemctl', 'is-active', '--quiet', 'logid.service'], check=True, timeout=5)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            if old is None:
                target.unlink(missing_ok=True)
            else:
                atomic_write(target, old)
            subprocess.run(['/usr/bin/systemctl', 'restart', 'logid.service'], capture_output=True, timeout=25)
            raise ValueError('O serviço não arrancou. A configuração anterior foi reposta. Consulta journalctl -u logid.')
        atomic_write(state_file, json.dumps(profiles, ensure_ascii=False, indent=2))
        print('Configuração aplicada.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
