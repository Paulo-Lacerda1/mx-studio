# Calibrar os marcadores da vista Realista

Os modelos do Sketchfab não podem ser descarregados, por isso as posições dos botões
(`anchors` em `web/app.js`) são medidas lançando raios no próprio visualizador.

1. Serve a raiz do projeto: `python3 -m http.server 48800 --bind 127.0.0.1`
2. Corre (o Sketchfab exige GPU real, por isso o Chrome abre uma janela fora do ecrã):

```bash
HEADFUL=1 GL=--ignore-gpu-blocklist TMPDIR_CHROME=/tmp/mx-cal SHOT=/tmp/cal.png \
  node tools/sketchfab/cdp.mjs "http://127.0.0.1:48800/tools/sketchfab/calib.html?id=<model id>" tools/sketchfab/calibrate.js
```

O resultado traz as âncoras `[x, y, z]` + normal em coordenadas do Sketchfab (metros, Z para cima,
frente em +Y, polegar em −X) e a captura mostra cada ponto sobre o modelo para confirmar.
Ajusta `specs` em `calibrate.js` (posições de referência do CAD, em mm) se algum ponto falhar.
Nota: `pickFromScreen` usa o y medido a partir do topo.
