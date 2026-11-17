#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
install_root="${DESTDIR:-}"
if [[ -n "$install_root" && "$install_root" != /* ]]; then
  echo 'DESTDIR deve ser um caminho absoluto.' >&2
  exit 1
fi
if [[ $EUID -ne 0 && -z "$install_root" ]]; then
  echo 'Executa: sudo bash scripts/install-system.sh'
  exit 1
fi
if [[ -z "$install_root" ]] && ! command -v logid >/dev/null; then
  echo 'Para MX Master 3S: sudo apt install logiops solaar'
  echo 'Para MX Master 4, instala uma versão recente do LogiOps com suporte ao modelo.'
  echo 'Instala primeiro o LogiOps: https://github.com/PixlOne/logiops#building'
  echo 'Dependências Ubuntu: sudo apt install cmake libevdev-dev libudev-dev libconfig++-dev build-essential git'
  echo 'Depois: git clone https://github.com/PixlOne/logiops.git; cd logiops; cmake -S . -B build; cmake --build build; sudo cmake --install build'
  exit 1
fi
install -d -m 755 "$install_root/usr/local/lib/mx-studio"
install -m 644 "$project_dir/scripts/apply.py" "$install_root/usr/local/lib/mx-studio/apply.py"
install -m 644 "$project_dir/mxstudio/config.py" "$install_root/usr/local/lib/mx-studio/config.py"

app_dir="$install_root/usr/local/share/mx-studio"
install -d -m 755 "$app_dir"
install -m 644 "$project_dir/app.py" "$app_dir/app.py"
while IFS= read -r -d '' file; do
  relative="${file#"$project_dir/"}"
  install -D -m 644 "$file" "$app_dir/$relative"
done < <(find "$project_dir/web" "$project_dir/mxstudio" -type f ! -path '*/__pycache__/*' ! -name '*.pyc' -print0)
install -D -m 755 "$project_dir/scripts/mx-studio" "$install_root/usr/local/bin/mx-studio"
install -D -m 644 "$project_dir/packaging/mx-studio.desktop" "$install_root/usr/local/share/applications/mx-studio.desktop"
install -D -m 644 "$project_dir/web/icon.svg" "$install_root/usr/local/share/icons/hicolor/scalable/apps/mx-studio.svg"

if [[ -z "$install_root" ]]; then
  systemctl daemon-reload
  systemctl enable logid.service
  if command -v update-desktop-database >/dev/null; then
    update-desktop-database /usr/local/share/applications || true
  fi
  if command -v gtk-update-icon-cache >/dev/null; then
    gtk-update-icon-cache -q -t /usr/local/share/icons/hicolor || true
  fi
  echo 'MX Studio instalado. Procura «MX Studio» no menu de aplicações do Ubuntu.'
else
  echo "Ficheiros de instalação preparados em $install_root"
fi
