#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ $EUID -ne 0 ]]; then
  echo 'Executa: sudo bash scripts/install-system.sh'
  exit 1
fi
if ! command -v logid >/dev/null; then
  echo 'Para MX Master 3 / 3S: sudo apt install logiops solaar'
  echo 'Para MX Master 4, instala uma versão recente do LogiOps com suporte ao modelo.'
  echo 'Instala primeiro o LogiOps: https://github.com/PixlOne/logiops#building'
  echo 'Dependências Ubuntu: sudo apt install cmake libevdev-dev libudev-dev libconfig++-dev build-essential git'
  echo 'Depois: git clone https://github.com/PixlOne/logiops.git; cd logiops; cmake -S . -B build; cmake --build build; sudo cmake --install build'
  exit 1
fi
install -d -o root -g root -m 755 /usr/local/lib/mx-studio
install -o root -g root -m 644 "$project_dir/scripts/apply.py" /usr/local/lib/mx-studio/apply.py
install -o root -g root -m 644 "$project_dir/mxstudio/config.py" /usr/local/lib/mx-studio/config.py
systemctl daemon-reload
systemctl enable logid.service
echo 'Integração instalada. Abre o MX Studio e escolhe Aplicar ao rato.'
