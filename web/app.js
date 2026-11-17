import { MouseScene } from './scene.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const paths={chevron:'m9 18 6-6-6-6',close:'m6 6 12 12 M18 6 6 18',mouse:'M9 3h6a5 5 0 0 1 5 5v8a8 8 0 0 1-16 0V8a5 5 0 0 1 5-5Z M12 3v6',layers:'m12 3 9 5-9 5-9-5 9-5Z M3 12l9 5 9-5 M3 16l9 5 9-5',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M10 3h4l1 3 3 1 3 3v4l-3 1-1 3-3 3h-4l-1-3-3-1-3-3v-4l3-1 1-3 3-3Z',refresh:'M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 13 3 M5 15a8 8 0 0 0 13 3',check:'m5 12 4 4L19 6',info:'M12 16v-4 M12 8h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',rotate:'M3 8h5V3 M4 8a9 9 0 1 1-1 8',download:'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',save:'M4 3h13l4 4v14H3V3h1Z M7 3v6h9V3 M7 21v-8h10v8',capture:'M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5 M7 7h10v10H7V7Z',windows:'M3 4h8v7H3V4Z M14 4h7v7h-7V4Z M3 14h8v7H3v-7Z M14 14h7v7h-7v-7Z',music:'M9 18V5l11-2v13 M9 5l11-2 M9 18a3 3 0 1 1-3-3h3 M20 16a3 3 0 1 1-3-3h3'};
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(e=>{e.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[e.dataset.icon]||paths.mouse}"/></svg>`})}
icons();
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=v=>structuredClone(v);
// Published dimensions (length × width × height) and weight.
const DIMENSIONS = {mx3: '124,9 × 84,3 × 51 mm, 141 g', mx3s: '124,9 × 84,3 × 51 mm, 141 g', mx4: '128,2 × 88,4 × 50,8 mm, 150 g'};
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* optional */ } },
};
let boot, profile, selected = 'gesture', scene, dirty = false, exported = '', busy = false, recording, toastTimer;
const label=id=>boot.actions.find(a=>a.id===id)?.label || (id==='gestures'?'Gestos direcionais':'Predefinição');
const buttons=()=>boot.buttons.filter(b=>!b.model||b.model===profile.model);
function toast(message,error=false){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').className='show'+(error?' error':'');toastTimer=setTimeout(()=>$('#toast').className='',error?8500:4500)}
async function api(path,value){const response=await fetch('/api/'+path,{method:value===undefined?'GET':'POST',headers:value===undefined?{}:{'Content-Type':'application/json','X-MX-Token':boot.token},body:value===undefined?undefined:JSON.stringify(value)});const data=await response.json();if(!response.ok)throw Error(data.error||'O pedido falhou.');return data}
function setProfileState(state, message) {
  const status = $('#dirty-state');
  status.dataset.state = state;
  status.textContent = message;
}

function markDirty() {
  dirty = true;
  setProfileState('dirty', 'Alterações por guardar');
  updateSummary();
  updateApply();
}

function updateSummary() {
  $('#dpi-summary').textContent = profile.dpi ? `${profile.dpi.toLocaleString('pt-PT')} DPI` : 'Predefinida';
  $('#scroll-summary').textContent = profile.scroll.enabled
    ? (profile.scroll.smartshift ? 'SmartShift' : 'Rotação livre')
    : 'Predefinida';
}

function updateApply() {
  const button = $('#apply');
  const available = boot.status.devices.some(device => device.model === profile.model);
  const ready = boot.status.logiops && boot.status.helperInstalled;
  button.disabled = busy || !available || !ready;
  button.title = !available ? 'Liga este rato para aplicar' : !ready ? 'Conclui a instalação em Sistema' : 'Aplicar este perfil ao rato';
  $('#apply-label').textContent = busy ? 'A aplicar…' : 'Aplicar ao rato';
}

function updateStatus() {
  const status = boot.status;
  const device = status.devices.find(d => d.model === profile.model);
  const ready = status.logiops && status.helperInstalled;
  const banner = $('#connection-banner');
  banner.hidden = Boolean(device && ready);
  const message = device
    ? 'Conclui a instalação do LogiOps em Sistema para aplicar alterações.'
    : 'Liga este modelo para aplicar alterações. Podes configurar e guardar o perfil em pré-visualização.';
  if (banner.lastElementChild.textContent !== message) banner.lastElementChild.textContent = message;

  $('#connection-badge').textContent = device ? 'Detetado' : 'Pré-visualização';
  $('#connection-badge').classList.toggle('connected', Boolean(device));
  $('#connection-detail').textContent = device?.connection || '';
  $('#battery-summary').textContent = device?.battery != null ? `${device.battery}%` : 'Indisponível';
  updateApply();
  if ($('#system-page').hidden === false) renderSystem();
}

function renderModel() {
  if (!buttons().some(button => button.id === selected)) selected = 'gesture';
  const model = boot.models[profile.model];
  $('#model-name').textContent = model.label;
  $('#model-dims').textContent = DIMENSIONS[profile.model] || '';
  $('#breadcrumb-model').textContent = model.label;
  $('#model-select').value = profile.model;
  $('#profile-name').value = profile.name;
  scene?.build(profile.model, buttons());
  updateSelection();
  renderButtons();
  renderEditor();
  renderScroll();
  updateSummary();
  updateStatus();
}

function updateSelection() {
  const index = buttons().findIndex(button => button.id === selected);
  scene?.select(selected);
  const selection = $('#scene-selection');
  selection.hidden = !scene || index === -1;
  if (!selection.hidden) {
    $('#scene-number').textContent = index + 1;
    $('#scene-label').textContent = buttons()[index].label;
  }
}

function selectButton(id) {
  const focusRow = document.activeElement?.matches('#button-list [data-button]');
  selected = id;
  setTab('buttons');
  updateSelection();
  renderButtons();
  renderEditor();
  if (focusRow) $('#button-list [data-button="' + id + '"]')?.focus();
}

function renderButtons() {
  const list = $('#button-list');
  list.innerHTML = buttons().map((button, index) => {
    const active = selected === button.id;
    const action = profile.buttons[button.id]?.action || 'default';
    const value = button.native ? 'Gerido pelo Ubuntu' : action === 'default' ? 'Predefinido' : label(action);
    return `<button class="button-row ${active ? 'selected' : ''}" data-button="${button.id}" aria-pressed="${active}">
      <span class="number" aria-hidden="true">${index + 1}</span>
      <span class="button-name">${esc(button.label)}</span>
      <span class="button-value">${esc(value)}</span>
      <span class="row-chevron" data-icon="chevron"></span>
    </button>`;
  }).join('');
  icons(list);
  list.querySelectorAll('[data-button]').forEach(row => {
    row.onclick = () => selectButton(row.dataset.button);
  });
}
function actionOptions(value,gesture=false){let html='',group='';for(const a of boot.actions){if(gesture&&a.id==='default')continue;if(a.group!==group){if(group)html+='</optgroup>';group=a.group;html+=`<optgroup label="${group}">`}html+=`<option value="${a.id}" ${a.id===value?'selected':''}>${a.label}</option>`}html+='</optgroup>';if(!gesture)html+=`<optgroup label="Gestos"><option value="gestures" ${value==='gestures'?'selected':''}>Gestos direcionais</option></optgroup>`;return html}
const emptyGestures=()=>Object.fromEntries(['None','Up','Down','Left','Right'].map(d=>[d,{action:'none'}]));
function newAction(action){return action==='gestures'?{action,directions:emptyGestures()}:action==='custom'?{action,keys:['KEY_LEFTCTRL','KEY_C']}:{action}}
function renderEditor() {
  finishRecording();
  const button = buttons().find(item => item.id === selected);
  const editor = $('#action-editor');
  const heading = `<h3 class="editor-heading">${esc(button.label)}</h3>`;
  if (button.native) {
    editor.innerHTML = heading + '<p class="editor-note">Para trocar os cliques principais, abre Definições → Rato e painel tátil → Botão principal.</p>';
    return;
  }

  const spec = profile.buttons[selected] || {action: 'default'};
  const notes = {
    default: 'Usa o comportamento original do botão.',
    screenshot: 'Usa o atalho de captura configurado no Ubuntu.',
    gestures: 'Mantém o botão premido, move o rato e solta para executar a ação.',
  };
  editor.innerHTML = `${heading}
    <label class="field-label" for="action-select">Ação</label>
    <select id="action-select">${actionOptions(spec.action)}</select>
    <div id="custom-editor"></div>
    <div id="gesture-editor"></div>
    ${notes[spec.action] ? `<p class="editor-note">${notes[spec.action]}</p>` : ''}`;

  $('#action-select').onchange = event => {
    profile.buttons[selected] = newAction(event.target.value);
    markDirty();
    renderButtons();
    renderEditor();
    $('#action-select').focus();
  };

  if (spec.action === 'custom') renderCustom($('#custom-editor'), spec, markDirty);
  if (spec.action !== 'gestures') return;

  const directions = {None: 'Clique sem movimento', Up: '↑ Para cima', Down: '↓ Para baixo', Left: '← Esquerda', Right: '→ Direita'};
  const fields = Object.entries(directions).map(([id, name]) => `
    <div class="gesture-field">
      <label class="field-label" for="direction-${id}">${name}</label>
      <select id="direction-${id}" data-direction="${id}">${actionOptions(spec.directions[id].action, true)}</select>
      <div id="custom-${id}"></div>
    </div>`);
  $('#gesture-editor').innerHTML = `<div class="gesture-grid">${fields.join('')}</div>`;

  $$('[data-direction]').forEach(control => {
    const direction = control.dataset.direction;
    control.onchange = () => {
      spec.directions[direction] = newAction(control.value);
      markDirty();
      renderEditor();
      $('#direction-' + direction).focus();
    };
    const action = spec.directions[direction];
    if (action.action === 'custom') renderCustom($('#custom-' + direction), action, markDirty);
  });
}
function keycaps(keys) {
  const labels = {
    LEFTCTRL: 'Ctrl', RIGHTCTRL: 'Ctrl', LEFTALT: 'Alt', RIGHTALT: 'Alt',
    LEFTSHIFT: 'Shift', RIGHTSHIFT: 'Shift', LEFTMETA: 'Super', RIGHTMETA: 'Super',
    SYSRQ: 'Print Screen', SPACE: 'Espaço', ENTER: 'Enter', ESC: 'Esc',
    LEFT: '←', RIGHT: '→', UP: '↑', DOWN: '↓',
  };
  return keys.map(code => {
    const key = code.replace(/^KEY_/, '');
    return `<kbd>${esc(labels[key] || key)}</kbd>`;
  }).join('<span aria-hidden="true">+</span>');
}

function finishRecording() {
  if (!recording) return;
  recording.output.innerHTML = keycaps(recording.spec.keys);
  recording.button.textContent = 'Gravar atalho';
  recording = null;
}

function renderCustom(element, spec, onChange) {
  element.innerHTML = `<div class="key-recorder">
    <div class="key-caps" aria-label="Teclas do atalho" aria-live="polite">${keycaps(spec.keys)}</div>
    <button class="button secondary record-key" type="button">Gravar atalho</button>
  </div>`;
  const button = element.querySelector('button');
  const output = element.querySelector('.key-caps');
  button.onclick = () => {
    if (recording?.button === button) {
      finishRecording();
      return;
    }
    finishRecording();
    recording = {spec, onChange, output, button};
    button.textContent = 'Cancelar';
    output.textContent = 'Prime a combinação';
    button.focus();
  };
  button.addEventListener('blur', () => {
    if (recording?.button === button) finishRecording();
  });
}
function eventKey(event){const c=event.code;const map={Space:'SPACE',Enter:'ENTER',Escape:'ESC',Tab:'TAB',Backspace:'BACKSPACE',Delete:'DELETE',Insert:'INSERT',Home:'HOME',End:'END',PageUp:'PAGEUP',PageDown:'PAGEDOWN',ArrowUp:'UP',ArrowDown:'DOWN',ArrowLeft:'LEFT',ArrowRight:'RIGHT',PrintScreen:'SYSRQ',Minus:'MINUS',Equal:'EQUAL',Comma:'COMMA',Period:'DOT',Slash:'SLASH',Semicolon:'SEMICOLON',Quote:'APOSTROPHE',BracketLeft:'LEFTBRACE',BracketRight:'RIGHTBRACE',Backslash:'BACKSLASH',Backquote:'GRAVE'};return map[c]?'KEY_'+map[c]:/^Key[A-Z]$/.test(c)?'KEY_'+c.slice(3):/^Digit[0-9]$/.test(c)?'KEY_'+c.slice(5):/^F\d{1,2}$/.test(c)?'KEY_'+c:null}
document.addEventListener('keydown', event => {
  if (!recording) return;
  event.preventDefault();
  event.stopPropagation();
  const key = eventKey(event);
  if (!key || event.repeat) return;
  const keys = [];
  if (event.ctrlKey) keys.push('KEY_LEFTCTRL');
  if (event.altKey) keys.push('KEY_LEFTALT');
  if (event.shiftKey) keys.push('KEY_LEFTSHIFT');
  if (event.metaKey) keys.push('KEY_LEFTMETA');
  keys.push(key);
  recording.spec.keys = keys;
  recording.onChange();
  finishRecording();
}, true);
function renderScroll(){
 const p=profile,s=p.scroll;
 $('#scroll-panel').innerHTML=`<div class="setting"><h3>Sensibilidade do ponteiro</h3><label class="setting-line">Personalizar DPI<input id="dpi-enabled" type="checkbox" ${p.dpi?'checked':''}></label><div class="setting-line"><span>Mais precisão</span><output id="dpi-output">${p.dpi||1000} DPI</output><span>Mais rapidez</span></div><input id="dpi-range" aria-label="Sensibilidade DPI" type="range" min="200" max="${boot.models[p.model].dpiMax}" step="50" value="${p.dpi||1000}" ${p.dpi?'':'disabled'}><p>O valor predefinido é preservado enquanto esta opção estiver desligada.</p></div><div class="setting"><h3>Rodas de deslocamento</h3><label class="setting-line">Personalizar rodas<input id="scroll-enabled" type="checkbox" ${s.enabled?'checked':''}></label><div id="wheel-settings"><label class="setting-line">SmartShift automático<input data-setting="smartshift" type="checkbox" ${s.smartshift?'checked':''}></label><label class="field-label" for="threshold">Limiar de rotação livre · <output id="threshold-output">${s.threshold}</output></label><input id="threshold" type="range" min="1" max="255" value="${s.threshold}" aria-label="Limiar SmartShift"><label class="setting-line">Deslocamento de alta resolução<input data-setting="hires" type="checkbox" ${s.hires?'checked':''}></label><label class="setting-line">Inverter roda principal<input data-setting="invert" type="checkbox" ${s.invert?'checked':''}></label><label class="setting-line">Inverter roda lateral<input data-setting="thumbInvert" type="checkbox" ${s.thumbInvert?'checked':''}></label><label class="field-label" for="thumb-mode">Roda lateral</label><select id="thumb-mode">${[['default','Deslocamento horizontal'],['volume','Controlar volume'],['tabs','Mudar de separador'],['zoom','Aumentar / diminuir zoom']].map(([id,name])=>`<option value="${id}" ${s.thumbMode===id?'selected':''}>${name}</option>`).join('')}</select></div><p>A disponibilidade depende do firmware e da versão do LogiOps.</p></div>`;
 $('#dpi-enabled').onchange=e=>{p.dpi=e.target.checked?1000:null;markDirty();renderScroll()};
 $('#dpi-range').oninput=e=>{p.dpi=+e.target.value;$('#dpi-output').textContent=p.dpi+' DPI';markDirty()};
 $('#scroll-enabled').onchange=e=>{s.enabled=e.target.checked;markDirty();renderScroll()};
 $$('#wheel-settings input, #wheel-settings select').forEach(e=>e.disabled=!s.enabled);
 $$('[data-setting]').forEach(e=>e.onchange=()=>{s[e.dataset.setting]=e.checked;markDirty()});
 $('#threshold').oninput=e=>{s.threshold=+e.target.value;$('#threshold-output').textContent=s.threshold;markDirty()};
 $('#thumb-mode').onchange=e=>{s.thumbMode=e.target.value;markDirty()};
}
function setTab(tab) {
  finishRecording();
  $$('[data-tab]').forEach(button => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active);
    button.tabIndex = active ? 0 : -1;
  });
  $('#buttons-panel').hidden = tab !== 'buttons';
  $('#scroll-panel').hidden = tab !== 'scroll';
}

function setPage(page) {
  finishRecording();
  const titles = {device: 'Dispositivos', profiles: 'Perfis', system: 'Sistema'};
  $('#breadcrumb-section').textContent = titles[page];
  $('#breadcrumb-context').hidden = page !== 'device';
  $$('[data-page]').forEach(button => {
    const active = button.dataset.page === page;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  Object.keys(titles).forEach(name => {
    $('#' + name + '-page').hidden = name !== page;
  });
  if (page === 'device') scene?.resize();
  if (page === 'profiles') renderProfiles();
  if (page === 'system') renderSystem();
}
function renderProfiles(){
 $('#profile-count').textContent = boot.profiles.length || '';
 $('#profiles-grid').innerHTML=boot.profiles.length?boot.profiles.map((p,i)=>`<article class="saved-profile"><div class="profile-model">${boot.models[p.model].label}</div><h2>${esc(p.name)}</h2><p>${Object.values(p.buttons).filter(b=>b.action!=='default').length} botões personalizados · ${p.dpi?p.dpi+' DPI':'DPI predefinido'}</p><button class="button secondary" data-load="${i}">Carregar perfil</button></article>`).join(''):'<div class="empty-state">Ainda não há perfis guardados.<br>Configura o teu rato e escolhe «Guardar perfil».</div>';
 $$('[data-load]').forEach(b=>b.onclick=()=>{if(!mayDiscard())return;profile=clone(boot.profiles[+b.dataset.load]);dirty=false;setProfileState('saved','Perfil guardado');renderModel();setPage('device');toast('Perfil carregado. Usa «Aplicar ao rato» para o ativar.')});
}
function renderSystem(){
 const s=boot.status;if(!s)return;
 $('#system-content').innerHTML=`<div class="system-grid"><article class="system-card"><h2>Estado da ligação</h2>${[['Sessão',s.session],['Ambiente',s.desktop],['Ratos detetados',s.devices.length?s.devices.map(d=>d.name).join(', '):'Nenhum'],['Recetor Logitech',s.receiver?'Encontrado':'Não encontrado'],['Solaar',s.solaar?'Instalado':'Não instalado'],['LogiOps',s.logiops?'Instalado':'Não instalado'],['Serviço logid',s.serviceActive?'Ativo':'Inativo'],['Integração MX Studio',s.helperInstalled?'Instalada':'Por instalar']].map(([a,b])=>`<div class="system-line"><span>${a}</span><b>${esc(b)}</b></div>`).join('')}</article><article class="system-card"><h2>Preparar a aplicação</h2><p>A interface funciona sem privilégios. Para aplicar configurações, é necessário instalar o LogiOps e a integração local. O Ubuntu pede a tua palavra-passe ao aplicar.</p><p>Para MX Master 3 / 3S, no Ubuntu:</p><pre>sudo apt install logiops solaar\nsudo bash scripts/install-system.sh</pre><p>Executa o segundo comando na pasta deste projeto. Para MX Master 4, usa uma versão recente do <a href="https://github.com/PixlOne/logiops" target="_blank" rel="noreferrer">LogiOps</a> com suporte ao modelo; a versão do Ubuntu 24.04 pode ser anterior.</p><p>Evita remapear os mesmos botões simultaneamente no Solaar e no LogiOps.</p></article><article class="system-card full"><h2>O que esta versão permite</h2><p>Botões laterais, clique da roda, botão superior, gestos em quatro direções, atalhos personalizados, DPI, SmartShift e roda lateral. Os cliques principais são geridos nas Definições do Ubuntu. O apoio do polegar do MX Master 4 tem um mapeamento próprio.</p><p>O feedback háptico e o Actions Ring da Logitech não são implementados nesta versão. Os perfis são selecionados manualmente e aplicam-se a todos os ratos com o mesmo nome de modelo. A configuração é guardada no Ubuntu, não na memória interna do rato.</p>${s.diagnostics.map(d=>`<p>• ${esc(d)}</p>`).join('')}<p>O estado «aplicado» confirma que o serviço aceitou o arranque com a configuração. A resposta dos botões deve ser verificada fisicamente.</p><p>Referências: <a href="https://github.com/PixlOne/logiops/wiki/Configuration" target="_blank" rel="noreferrer">Configuração LogiOps</a> · <a href="https://github.com/PixlOne/logiops/wiki/CIDs" target="_blank" rel="noreferrer">Identificadores dos botões</a></p></article></div>`;
}
function mayDiscard(){return !dirty||window.confirm('Tens alterações por guardar. Queres descartá-las?')}
function preset(kind){
 if(!mayDiscard())return;const model=profile.model;profile=clone(boot.defaults[model]);const thumb=model==='mx4'?'thumb':'gesture';
 if(kind==='screenshot'){profile.name='Captura num clique';profile.buttons[thumb]={action:'screenshot'};selected=thumb}
 if(kind==='productivity'){profile.name='Janelas e áreas de trabalho';profile.buttons.gesture={action:'gestures',directions:{None:{action:'overview'},Up:{action:'maximize'},Down:{action:'desktop'},Left:{action:'workspace-left'},Right:{action:'workspace-right'}}};profile.buttons.back={action:'copy'};profile.buttons.forward={action:'paste'};selected='gesture'}
 if(kind==='media'){profile.name='Multimédia';profile.buttons.gesture={action:'gestures',directions:{None:{action:'play'},Up:{action:'volume-up'},Down:{action:'volume-down'},Left:{action:'previous-track'},Right:{action:'next-track'}}};selected='gesture'}
 markDirty();renderModel();setTab('buttons');toast('Sugestão carregada. Podes ajustar antes de aplicar.');
}
async function initialize(){
 try{
  boot=await api('bootstrap');const detected=boot.status.devices[0]?.model;profile=clone(boot.defaults[detected||'mx3s']);
  try {
    scene = new MouseScene($('#scene'), $('#hotspots'), selectButton);
    $('#scene-toolbar').hidden = false;
    $('#finish-controls').hidden = false;
    const setFinish = finish => {
      scene.setFinish(finish);
      storage.set('mx-studio-finish', finish);
      $$('[data-finish]').forEach(button => button.setAttribute('aria-pressed', button.dataset.finish === finish));
    };
    setFinish(storage.get('mx-studio-finish') === 'pale' ? 'pale' : 'graphite');
    $$('[data-finish]').forEach(button => { button.onclick = () => setFinish(button.dataset.finish); });
  } catch (error) {
    console.error(error);
    $('#scene').innerHTML = '<p class="no-webgl"><strong>Vista 3D indisponível</strong><span>Seleciona um botão na lista para o configurar.</span></p>';
  }
  renderModel();
  renderProfiles();

  $$('[data-tab]').forEach(button => {
    button.onclick = () => setTab(button.dataset.tab);
    button.onkeydown = event => {
      const tabs = $$('[data-tab]');
      const index = tabs.indexOf(button);
      const offsets = {ArrowLeft: -1, ArrowRight: 1, Home: -index, End: tabs.length - 1 - index};
      if (!Object.hasOwn(offsets, event.key)) return;
      event.preventDefault();
      const next = tabs[(index + offsets[event.key] + tabs.length) % tabs.length];
      setTab(next.dataset.tab);
      next.focus();
    };
  });
  $$('[data-page]').forEach(button => {
    button.onclick = () => setPage(button.dataset.page);
  });
  $$('#model-select, #profile-name, #refresh, #reset, #export, #save, [data-preset]').forEach(control => {
    control.disabled = false;
  });
  $('#model-select').onchange=e=>{if(!mayDiscard()){e.target.value=profile.model;return}profile=clone(boot.defaults[e.target.value]);dirty=false;setProfileState('clean','Sem alterações');renderModel()};
  $('#profile-name').oninput=e=>{profile.name=e.target.value;markDirty()};
  const views = ['perspective', 'top', 'side'];
  for (const view of views) {
    $('#view-' + view).onclick = () => {
      for (const option of views) {
        const button = $('#view-' + option);
        button.classList.toggle('active', option === view);
        button.setAttribute('aria-pressed', option === view);
      }
      scene?.setView(view);
    };
  }
  $('#view-reset').onclick=()=>$('#view-perspective').click();
  $$('[data-preset]').forEach(b=>b.onclick=()=>preset(b.dataset.preset));
  $('#reset').onclick=()=>{if(!mayDiscard())return;const name=profile.name;profile=clone(boot.defaults[profile.model]);profile.name=name;markDirty();renderModel();toast('Predefinições preparadas. Aplica para as ativar no rato.')};
  $('#save').onclick = async () => {
    const button = $('#save');
    const sent = clone(profile);
    button.disabled = true;
    try {
      const result = await api('save', sent);
      boot.profiles = result.profiles;
      if (JSON.stringify(profile) === JSON.stringify(sent)) {
        dirty = false;
        setProfileState('saved', 'Perfil guardado');
      }
      renderProfiles();
      toast('Perfil guardado');
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  };
  $('#export').onclick=async()=>{try{const result=await api('export',profile);exported=result.config;$('#config-output').textContent=exported;$('#config-dialog').showModal()}catch(e){toast(e.message,true)}};
  $('#close-dialog').onclick=()=>$('#config-dialog').close();
  $('#download-config').onclick=()=>{const url=URL.createObjectURL(new Blob([exported],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='logid.cfg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
  $('#refresh').onclick=async()=>{const b=$('#refresh');b.disabled=true;try{boot.status=await api('refresh',{});const detected=boot.status.devices[0];if(detected&&!dirty&&!boot.status.devices.some(device=>device.model===profile.model)){profile=clone(boot.defaults[detected.model]);setProfileState('clean','Sem alterações');renderModel()}updateStatus();toast(boot.status.devices.length?'Dispositivos atualizados.':'Nenhum MX Master identificado. Consulta o estado em Sistema.')}catch(e){toast(e.message,true)}finally{b.disabled=false}};
  $('#apply').onclick=async()=>{busy=true;updateApply();toast('A aguardar a autorização do Ubuntu…');try{const sent=clone(profile);const result=await api('apply',sent);boot.profiles=result.profiles;if(JSON.stringify(profile)===JSON.stringify(sent)){dirty=false;setProfileState('applied','Aplicado ao rato')}renderProfiles();toast(result.message);boot.status=await api('status');updateStatus()}catch(e){toast(e.message,true)}finally{busy=false;updateApply()}};
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
  setInterval(async()=>{if(document.hidden||busy)return;try{boot.status=await api('status');updateStatus()}catch{}},20000);
 }catch(e){$('#connection-banner').lastElementChild.textContent='Não foi possível iniciar a aplicação: '+e.message;toast(e.message,true)}
}
initialize();
