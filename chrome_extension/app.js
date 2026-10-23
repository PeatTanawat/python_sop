const DB_NAME = 'python-sop-workspace';
const STORE = 'steps';
const DESCRIPTION_GROUPS_KEY = 'python-sop-descriptions';
const EDITOR_TAB_KEY = 'sara-sop-editor-tab-id';
const state = { steps: [], stream: null, directory: null, editing: null, mode: 'crop', boxes: [], crop: null, undoStack: [], drag: null, image: null, scale: 1, offsetX: 0, offsetY: 0, toastTimer: null, previewTimer: null, previewRetryTimer: null, previewBusy: false, previewFailures: 0, previewGeneration: 0, activeTabId: null, urls: new Map() };
const $ = (id) => document.getElementById(id);
const dbPromise = new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function db(action, value) {
  const database = await dbPromise;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, action === 'getAll' ? 'readonly' : 'readwrite');
    const store = transaction.objectStore(STORE);
    const request = action === 'getAll' ? store.getAll() : action === 'put' ? store.put(value) : store.delete(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function makeId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function toast(message) {
  const el = $('toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function nextName() {
  let max = -1;
  for (const item of state.steps) {
    const match = item.name.match(/^(\d+)\.(\d+)(?:\.[^.]+)?$/);
    if (match) max = Math.max(max, Number(match[1]) * 100 + Number(match[2]));
  }
  const value = max < 0 ? 101 : max + 1;
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}
function blobUrl(step) {
  if (!state.urls.has(step.id)) state.urls.set(step.id, URL.createObjectURL(step.blob));
  return state.urls.get(step.id);
}
function refreshBlobUrl(step) { const old=state.urls.get(step.id); if(old)URL.revokeObjectURL(old);state.urls.delete(step.id); }
function render() {
  const grid = $('stepsGrid'); grid.replaceChildren();
  $('stepCount').textContent = state.steps.length;
  $('emptyState').hidden = state.steps.length > 0;
  $('clearAllButton').hidden = state.steps.length === 0;
  for (const [index, step] of state.steps.entries()) {
    const row = document.createElement('article'); row.className = 'step-row';
    const image = document.createElement('img'); image.className = 'step-thumb'; image.src = blobUrl(step); image.alt = step.name; image.title = 'Click to edit in full page';
    image.addEventListener('click', () => openEditor(step.id));
    const name = document.createElement('input'); name.className = 'step-name'; name.value = step.name.replace(/\.png$/i, ''); name.setAttribute('aria-label', `Image ${index + 1} name`);
    name.addEventListener('change', async () => {
      const clean = name.value.trim() || nextName(); step.name = clean.toLowerCase().endsWith('.png') ? clean : `${clean}.png`;
      name.value = step.name.replace(/\.png$/i, ''); await db('put', step);
    });
    const remove = document.createElement('button'); remove.className = 'delete-row'; remove.type = 'button'; remove.textContent = '×'; remove.title = 'Remove image';
    remove.addEventListener('click', async () => { await db('delete', step.id); removeDescriptionGroupsForImage(step.id); const url = state.urls.get(step.id); if (url) URL.revokeObjectURL(url); state.urls.delete(step.id); state.steps = state.steps.filter(item => item.id !== step.id); state.steps.forEach((item,index)=>{item.sortOrder=index;}); await Promise.all(state.steps.map(item=>db('put',item))); render(); });
    row.append(image, name, remove); grid.append(row);
  }
  renderDescriptionGroups();
}
function readDescriptionGroups() {
  try { return JSON.parse(localStorage.getItem(DESCRIPTION_GROUPS_KEY) || '[]').filter(group => group && group.startId && group.endId && group.text); }
  catch { return []; }
}
function writeDescriptionGroups(groups) { localStorage.setItem(DESCRIPTION_GROUPS_KEY, JSON.stringify(groups)); }
function removeDescriptionGroupsForImage(id) {
  const groups = readDescriptionGroups().filter(group => group.startId !== id && group.endId !== id);
  writeDescriptionGroups(groups);
}
function renderDescriptionGroups() {
  const list = $('descriptionGroupsList'); list.replaceChildren();
  const indices = new Map(state.steps.map((step, index) => [step.id, index]));
  const groups = readDescriptionGroups().filter(group => indices.has(group.startId) && indices.has(group.endId))
    .sort((a, b) => indices.get(a.endId) - indices.get(b.endId));
  $('descriptionGroupsEmpty').hidden = groups.length > 0;
  for (const group of groups) {
    const start = indices.get(group.startId); const end = indices.get(group.endId);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'description-group-button';
    const range = document.createElement('span'); range.className = 'description-group-range'; range.textContent = `Images ${start + 1}${start === end ? '' : `–${end + 1}`}`;
    const description = document.createElement('span'); description.className = 'description-group-text'; description.textContent = group.text;
    button.append(range, description); button.addEventListener('click', () => openEditor(group.endId)); list.append(button);
  }
}
function migrateLegacyDescription() {
  const legacy = localStorage.getItem('python-sop-description');
  if (!legacy || readDescriptionGroups().length || !state.steps.length) return;
  writeDescriptionGroups([{ startId: state.steps[0].id, endId: state.steps[state.steps.length - 1].id, text: legacy }]);
  localStorage.removeItem('python-sop-description');
}
async function addImage(blob, name = '', description = '') {
  const safeBlob = blob.type === 'image/png' ? blob : await convertToPng(blob);
  const item = { id: makeId(), name: name || `${nextName()}.png`, description, blob: safeBlob, createdAt: Date.now(), sortOrder: state.steps.length };
  state.steps.push(item); await db('put', item); render();
  return item;
}
async function convertToPng(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close?.();
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}
async function saveToFolder(item) {
  const base = item.name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'image';
  const filename = base.toLowerCase().endsWith('.png') ? base : `${base}.png`;
  const handle = await state.directory.getFileHandle(filename, { create: true });
  const writer = await handle.createWritable(); await writer.write(item.blob); await writer.close();
}
async function chooseFolder() {
  if (!window.showDirectoryPicker) { toast('Folder access requires Chrome or Edge. Images remain saved in this browser.'); return; }
  try { state.directory = await window.showDirectoryPicker({ mode: 'readwrite' }); toast(`Save folder: ${state.directory.name}`); }
  catch (error) { if (error.name !== 'AbortError') toast('Could not open this folder.'); }
}
async function saveImagesToFolder() {
  if (!state.steps.length) { toast('Capture an image first.'); return; }
  if (!state.directory) { await chooseFolder(); if (!state.directory) return; }
  try { for (const step of state.steps) await saveToFolder(step); toast(`${state.steps.length} image(s) saved to ${state.directory.name}.`); }
  catch (error) { toast(error.message || 'Could not save images to this folder.'); }
}
function showWorkspace() { $('privacyScreen').hidden = true; $('homeScreen').hidden = true; $('workspace').hidden = false; startLiveTabPreview(); }
function restartWorkspace() {
  sessionStorage.setItem('sara-sop-reopen-workspace', '1');
  window.location.reload();
}
async function startWorkspace(button) {
  if (button.disabled) return;
  button.disabled = true;
  const label = button.querySelector('.start-label'); const spinner = button.querySelector('.start-spinner');
  label.hidden = true; spinner.hidden = false;
  await new Promise(resolve => setTimeout(resolve, 700));
  showWorkspace();
}
function stopLiveTabPreview() {
  clearInterval(state.previewTimer); state.previewTimer = null;
  clearTimeout(state.previewRetryTimer); state.previewRetryTimer = null;
}
function startLiveTabPreview() {
  stopLiveTabPreview();
  state.previewTimer = setInterval(() => refreshTabPreview(true), 1000);
  refreshTabPreview(true);
}
async function refreshTabPreview(silent = false) {
  if (state.previewBusy) return false;
  state.previewBusy = true;
  const generation = state.previewGeneration;
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab();
    if (generation !== state.previewGeneration) return false;
    $('tabPreview').src = dataUrl; $('tabPreview').hidden = false; $('previewPlaceholder').hidden = true;
    state.previewFailures = 0;
    return true;
  } catch (error) {
    if (generation !== state.previewGeneration) return false;
    state.previewFailures += 1;
    $('tabPreview').hidden = true;
    $('previewPlaceholder').textContent = state.previewFailures < 2
      ? 'Updating preview for the selected tab…'
      : 'Preview not showing? Close this panel, then click the Sara SOP icon on this tab to reopen it.';
    $('previewPlaceholder').hidden = false;
    if (!silent) toast('Preview not showing? Close this panel, then click the Sara SOP icon on this tab to reopen it.');
    return false;
  } finally { state.previewBusy = false; }
}
function scheduleTabPreviewRefresh() {
  if ($('workspace').hidden) return;
  state.previewGeneration += 1;
  clearTimeout(state.previewRetryTimer);
  $('tabPreview').hidden = true;
  $('previewPlaceholder').textContent = 'Updating preview for the selected tab…';
  $('previewPlaceholder').hidden = false;
  state.previewRetryTimer = setTimeout(() => refreshTabPreview(true), 250);
}
async function shareScreen() {
  try {
    state.stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
    $('screenVideo').srcObject = state.stream; $('sharePreview').hidden = false;
    $('captureButton').disabled = false; $('stopShareButton').hidden = false;
    state.stream.getVideoTracks()[0].addEventListener('ended', stopScreenShare);
    $('captureHint').textContent = 'Select an app window, then click Capture here.';
  } catch (error) { if (error.name !== 'NotAllowedError') toast(error.message || 'Could not share the screen.'); }
}
function stopScreenShare() {
  state.stream?.getTracks().forEach(track => track.stop()); state.stream = null;
  $('screenVideo').srcObject = null; $('sharePreview').hidden = true; $('captureButton').disabled = true; $('stopShareButton').hidden = true;
  $('captureHint').textContent = 'Your images stay in this browser.';
}
async function captureScreen() {
  if (!state.stream) return;
  const layer = $('countdown'); const number = $('countdownNumber'); layer.hidden = false;
  for (let value = 3; value > 0; value--) { number.textContent = value; await new Promise(resolve => setTimeout(resolve, 700)); }
  layer.hidden = true;
  const video = $('screenVideo');
  if (!video.videoWidth) { toast('Screen is not ready yet.'); return; }
  const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0); canvas.toBlob(async blob => { if (blob) { await addImage(blob); toast('Screenshot added.'); } }, 'image/png');
}
async function captureCurrentTab() {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab();
    $('tabPreview').src = dataUrl; $('tabPreview').hidden = false; $('previewPlaceholder').hidden = true;
    const blob = await (await fetch(dataUrl)).blob();
    await addImage(blob);
    toast('Captured current tab.');
  } catch {
    toast('Preview not showing? Close this panel, then click the Sara SOP icon on this tab to reopen it.');
  }
}
async function uploadFiles(files) {
  for (const file of [...files].filter(file => file.type.startsWith('image/'))) await addImage(file, file.name.replace(/\.[^.]+$/, ''));
  render(); toast('Images added.');
}
async function openEditor(id) {
  if (!state.steps.some(item => item.id === id)) return;
  const editorUrl = `${chrome.runtime.getURL('editor.html')}?step=${encodeURIComponent(id)}`;
  const existingId = Number(localStorage.getItem(EDITOR_TAB_KEY));
  if (Number.isInteger(existingId) && existingId > 0) {
    try {
      const tab = await chrome.tabs.get(existingId);
      await chrome.tabs.update(existingId, { active: true });
      if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
      const delivered = await chrome.runtime.sendMessage({ type: 'SARA_OPEN_EDITOR_IMAGE', stepId: id }).then(response => response?.ok === true, () => false);
      if (delivered) return;
      await chrome.tabs.update(existingId, { url: editorUrl, active: true });
      return;
    } catch { localStorage.removeItem(EDITOR_TAB_KEY); }
  }
  const tab = await chrome.tabs.create({ url: editorUrl, active: true });
  if (tab.id !== undefined) localStorage.setItem(EDITOR_TAB_KEY, String(tab.id));
}
function loadEditorImage() {
  const step = state.steps[state.editing]; const image = new Image();
  image.onload = () => {
    state.image = image;
    const canvas = $('editorCanvas'); const maxWidth = Math.max(280, canvas.parentElement.clientWidth - 30); const maxHeight = Math.max(200, Math.min(window.innerHeight * .58, 620));
    state.scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
    canvas.width = Math.round(image.naturalWidth * state.scale); canvas.height = Math.round(image.naturalHeight * state.scale);
    state.offsetX = 0; state.offsetY = 0; drawEditor();
  };
  image.src = blobUrl(step);
  $('editStepNumber').textContent = String(state.editing + 1).padStart(2, '0'); $('imagePosition').textContent = `${state.editing + 1} of ${state.steps.length}`;
  $('previousButton').disabled = state.editing === 0; $('nextButton').disabled = state.editing === state.steps.length - 1;
}
function drawEditor(active = null) {
  const canvas = $('editorCanvas'); const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height); if (!state.image) return;
  ctx.drawImage(state.image, 0, 0, canvas.width, canvas.height);
  if (state.crop) { const [x1,y1,x2,y2] = state.crop; ctx.strokeStyle = '#741b35'; ctx.lineWidth = 3; ctx.strokeRect(x1*state.scale,y1*state.scale,(x2-x1)*state.scale,(y2-y1)*state.scale); }
  ctx.strokeStyle = '#ed3434'; ctx.lineWidth = Math.max(3, 3/state.scale);
  for (const [x1,y1,x2,y2] of state.boxes) ctx.strokeRect(x1*state.scale,y1*state.scale,(x2-x1)*state.scale,(y2-y1)*state.scale);
  if (active) { ctx.strokeStyle = state.mode === 'red' ? '#ed3434' : '#741b35'; ctx.lineWidth = 3; ctx.strokeRect(active.x,active.y,active.w,active.h); }
}
function updateEditorControls() {
  $('cropModeButton').classList.toggle('selected', state.mode === 'crop'); $('redModeButton').classList.toggle('selected', state.mode === 'red');
  $('toolNote').textContent = state.mode === 'red' ? 'Drag on the image to add red boxes.' : 'Drag on the image to select a crop area.';
  $('undoButton').disabled = state.undoStack.length === 0;
}
function saveCurrentEditor() {
  const original = state.image; const box = state.crop;
  const left = box ? box[0] : 0, top = box ? box[1] : 0, right = box ? box[2] : original.naturalWidth, bottom = box ? box[3] : original.naturalHeight;
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1,right-left); canvas.height = Math.max(1,bottom-top);
  const ctx = canvas.getContext('2d'); ctx.drawImage(original,left,top,canvas.width,canvas.height,0,0,canvas.width,canvas.height);
  ctx.strokeStyle = '#ed3434'; ctx.lineWidth = Math.max(3, canvas.width / 500);
  for (const [x1,y1,x2,y2] of state.boxes) { const x=Math.max(left,x1),y=Math.max(top,y1),r=Math.min(right,x2),b=Math.min(bottom,y2); if(r>x&&b>y)ctx.strokeRect(x-left,y-top,r-x,b-y); }
  canvas.toBlob(async blob => {
    if (!blob) { toast('Could not save this image.'); return; }
    const step=state.steps[state.editing]; step.name=$('imageName').value.trim(); if(!step.name.toLowerCase().endsWith('.png'))step.name+='.png';
    step.description=$('imageDescription').value.trim(); step.blob=blob; refreshBlobUrl(step); await db('put',step); render();
    if(state.directory)saveToFolder(step).catch(()=>{});
    toast('Changes saved.'); $('editDialog').close();
  },'image/png');
}
async function moveEditor(delta) {
  if (state.editing + delta < 0 || state.editing + delta >= state.steps.length) return;
  await saveCurrentEditorForNavigation(); state.editing += delta; state.boxes=[]; state.crop=null; state.undoStack=[];
  const step=state.steps[state.editing]; $('imageName').value=step.name.replace(/\.[^.]+$/,''); $('imageDescription').value=step.description||'';
  loadEditorImage(); updateEditorControls();
}
async function saveCurrentEditorForNavigation() {
  const image=state.image, box=state.crop; const left=box?box[0]:0,top=box?box[1]:0,right=box?box[2]:image.naturalWidth,bottom=box?box[3]:image.naturalHeight;
  const canvas=document.createElement('canvas');canvas.width=right-left;canvas.height=bottom-top;const ctx=canvas.getContext('2d');ctx.drawImage(image,left,top,canvas.width,canvas.height,0,0,canvas.width,canvas.height);
  ctx.strokeStyle='#ed3434';ctx.lineWidth=Math.max(3,canvas.width/500);for(const [x1,y1,x2,y2] of state.boxes){const x=Math.max(left,x1),y=Math.max(top,y1),r=Math.min(right,x2),b=Math.min(bottom,y2);if(r>x&&b>y)ctx.strokeRect(x-left,y-top,r-x,b-y);}
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  const step=state.steps[state.editing];step.name=$('imageName').value.trim();if(!step.name.toLowerCase().endsWith('.png'))step.name+='.png';step.description=$('imageDescription').value.trim();step.blob=blob;refreshBlobUrl(step);await db('put',step);render();
}
async function copyForDocument() {
  if (!state.steps.length) { toast('Add images first.'); return; }
  const htmlParts=[]; const plain=[];
  const indices = new Map(state.steps.map((step,index)=>[step.id,index]));
  const groupsByEnd = new Map();
  for (const group of readDescriptionGroups()) {
    if (!indices.has(group.startId) || !indices.has(group.endId)) continue;
    if (!groupsByEnd.has(group.endId)) groupsByEnd.set(group.endId, []);
    groupsByEnd.get(group.endId).push(group);
  }
  for(const step of state.steps){const data=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(step.blob);});const title=step.name.replace(/\.[^.]+$/,'');htmlParts.push(`<p><img src="${data}" style="max-width:100%;height:auto"></p><p>${escapeHtml(title)}</p><br>`);plain.push(`[Image]\n${title}`);for(const group of groupsByEnd.get(step.id)||[]){const start=indices.get(group.startId)+1,end=indices.get(group.endId)+1,label=`Description (Images ${start}${start===end?'':`–${end}`})`;htmlParts.push(`<p><strong>${label}</strong><br>${escapeHtml(group.text).replace(/\n/g,'<br>')}</p>`);plain.push(`${label}\n${group.text}`);}}
  try { await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([`<html><body style="font-family:Tahoma,Arial,sans-serif">${htmlParts.join('')}</body></html>`],{type:'text/html'}),'text/plain':new Blob([plain.join('\n\n')],{type:'text/plain'})})]); toast('Copied. Paste into your document with Ctrl+V.'); }
  catch(error){toast('Clipboard access was blocked. Allow clipboard access and try again.');}
}
function escapeHtml(text){return text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
async function deleteCurrent() {
  if (!confirm('Delete this image?')) return;
  const step=state.steps.splice(state.editing,1)[0]; await db('delete',step.id);const url=state.urls.get(step.id);if(url)URL.revokeObjectURL(url);state.urls.delete(step.id); $('editDialog').close(); state.editing=null; render();
}
async function clearAll() {
  if (!confirm('Delete all images from this browser?')) return;
  for(const step of state.steps){await db('delete',step.id);const url=state.urls.get(step.id);if(url)URL.revokeObjectURL(url);}state.urls.clear();state.steps=[];writeDescriptionGroups([]);localStorage.removeItem('python-sop-description');render();toast('Workspace cleared.');
}
  $('privacyConsent').addEventListener('change',event=>{$('startButton').disabled=!event.target.checked;});
  $('startButton').addEventListener('click',()=>startWorkspace($('startButton')));
  $('startNewSopButton').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;button.textContent='';button.classList.add('is-loading');await new Promise(resolve=>setTimeout(resolve,700));showWorkspace();});
$('previewRefreshButton').addEventListener('click',restartWorkspace);$('captureTabButton').addEventListener('click',captureCurrentTab);
chrome.tabs.onActivated.addListener(({ tabId }) => {
  state.activeTabId = tabId;
  scheduleTabPreviewRefresh();
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete' && (state.activeTabId === null || tabId === state.activeTabId)) scheduleTabPreviewRefresh();
});
 $('folderButton').addEventListener('click',chooseFolder);$('saveImagesButton').addEventListener('click',saveImagesToFolder);$('copyDocumentButton').addEventListener('click',copyForDocument);$('clearAllButton').addEventListener('click',clearAll);
window.addEventListener('beforeunload',()=>{stopLiveTabPreview();state.stream?.getTracks().forEach(track=>track.stop());});
window.addEventListener('storage', async event => {
  if (event.key !== DESCRIPTION_GROUPS_KEY && event.key !== 'python-sop-image-order') return;
  try {
    state.steps = await db('getAll');
    const hasOrder = state.steps.every(step => Number.isFinite(step.sortOrder));
    state.steps.sort((a,b)=>hasOrder ? a.sortOrder-b.sortOrder : a.createdAt-b.createdAt);
    render();
  }
  catch { renderDescriptionGroups(); }
});
if (sessionStorage.getItem('sara-sop-reopen-workspace') === '1') {
  sessionStorage.removeItem('sara-sop-reopen-workspace');
  showWorkspace();
}
(async()=>{try{state.steps=await db('getAll');state.steps.sort((a,b)=>a.createdAt-b.createdAt);if(state.steps.some(step=>!Number.isFinite(step.sortOrder))){state.steps.forEach((step,index)=>{step.sortOrder=index;});await Promise.all(state.steps.map(item=>db('put',item)));}else state.steps.sort((a,b)=>a.sortOrder-b.sortOrder);migrateLegacyDescription();render();}catch(error){toast('Browser storage is unavailable.');}})();
