const DB_NAME = 'python-sop-workspace';
const STORE = 'steps';
const state = { steps: [], stream: null, directory: null, editing: null, mode: 'crop', boxes: [], crop: null, undoStack: [], drag: null, image: null, scale: 1, offsetX: 0, offsetY: 0, toastTimer: null, previewTimer: null, previewBusy: false, urls: new Map() };
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
    const image = document.createElement('img'); image.className = 'step-thumb'; image.src = blobUrl(step); image.alt = step.name; image.title = 'Click to crop or mark up';
    image.addEventListener('click', () => openEditor(step.id));
    const name = document.createElement('input'); name.className = 'step-name'; name.value = step.name.replace(/\.png$/i, ''); name.setAttribute('aria-label', `Image ${index + 1} name`);
    name.addEventListener('change', async () => {
      const clean = name.value.trim() || nextName(); step.name = clean.toLowerCase().endsWith('.png') ? clean : `${clean}.png`;
      name.value = step.name.replace(/\.png$/i, ''); await db('put', step);
    });
    const remove = document.createElement('button'); remove.className = 'delete-row'; remove.type = 'button'; remove.textContent = '×'; remove.title = 'Remove image';
    remove.addEventListener('click', async () => { await db('delete', step.id); const url = state.urls.get(step.id); if (url) URL.revokeObjectURL(url); state.urls.delete(step.id); state.steps = state.steps.filter(item => item.id !== step.id); render(); });
    row.append(image, name, remove); grid.append(row);
  }
}
async function addImage(blob, name = '', description = '') {
  const safeBlob = blob.type === 'image/png' ? blob : await convertToPng(blob);
  const item = { id: makeId(), name: name || `${nextName()}.png`, description, blob: safeBlob, createdAt: Date.now() };
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
function showWorkspace() { $('homeScreen').hidden = true; $('workspace').hidden = false; startLiveTabPreview(); }
function stopLiveTabPreview() { clearInterval(state.previewTimer); state.previewTimer = null; }
function startLiveTabPreview() {
  stopLiveTabPreview();
  state.previewTimer = setInterval(async () => {
    const updated = await refreshTabPreview(true);
    if (!updated) {
      stopLiveTabPreview();
      $('previewPlaceholder').textContent = 'Preview paused. Click refresh to try again.';
      $('previewPlaceholder').hidden = false;
      $('tabPreview').hidden = true;
    }
  }, 600);
  refreshTabPreview(true);
}
async function refreshTabPreview(silent = false) {
  if (state.previewBusy) return true;
  state.previewBusy = true;
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab();
    $('tabPreview').src = dataUrl; $('tabPreview').hidden = false; $('previewPlaceholder').hidden = true;
    return true;
  } catch (error) {
    if (!silent) toast('Click the Python SOP toolbar icon on the page you want to preview, then refresh.');
    return false;
  } finally { state.previewBusy = false; }
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
  } catch (error) {
    toast(error.message || 'Could not capture this tab. Click the extension icon, then try again.');
  }
}
async function uploadFiles(files) {
  for (const file of [...files].filter(file => file.type.startsWith('image/'))) await addImage(file, file.name.replace(/\.[^.]+$/, ''));
  render(); toast('Images added.');
}
function openEditor(id) {
  const index = state.steps.findIndex(item => item.id === id); if (index < 0) return;
  state.editing = index; state.boxes = []; state.crop = null; state.undoStack = []; state.mode = 'crop';
  $('imageName').value = state.steps[index].name.replace(/\.[^.]+$/, '');
  $('imageDescription').value = state.steps[index].description || '';
  $('editDialog').showModal(); loadEditorImage(); updateEditorControls();
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
  if (state.crop) { const [x1,y1,x2,y2] = state.crop; ctx.strokeStyle = '#3478f6'; ctx.lineWidth = 3; ctx.strokeRect(x1*state.scale,y1*state.scale,(x2-x1)*state.scale,(y2-y1)*state.scale); }
  ctx.strokeStyle = '#ed3434'; ctx.lineWidth = Math.max(3, 3/state.scale);
  for (const [x1,y1,x2,y2] of state.boxes) ctx.strokeRect(x1*state.scale,y1*state.scale,(x2-x1)*state.scale,(y2-y1)*state.scale);
  if (active) { ctx.strokeStyle = state.mode === 'red' ? '#ed3434' : '#3478f6'; ctx.lineWidth = 3; ctx.strokeRect(active.x,active.y,active.w,active.h); }
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
async function copyForWord() {
  if (!state.steps.length) { toast('Add images first.'); return; }
  const htmlParts=[]; const plain=[];
  for(const step of state.steps){const data=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(step.blob);});const title=step.name.replace(/\.[^.]+$/,'');htmlParts.push(`<p><img src="${data}" style="max-width:100%;height:auto"></p><p>${escapeHtml(title)}</p><br>`);plain.push(`[Image]\n${title}`);}
  const description=$('sopDescription').value.trim();
  if(description){htmlParts.push(`<p>${escapeHtml(description).replace(/\n/g,'<br>')}</p>`);plain.push(`Description\n${description}`);}
  try { await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([`<html><body style="font-family:Tahoma,Arial,sans-serif">${htmlParts.join('')}</body></html>`],{type:'text/html'}),'text/plain':new Blob([plain.join('\n\n')],{type:'text/plain'})})]); toast('Copied. Paste into Word with Ctrl+V.'); }
  catch(error){toast('Clipboard access was blocked. Allow clipboard access and try again.');}
}
function escapeHtml(text){return text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
async function deleteCurrent() {
  if (!confirm('Delete this image?')) return;
  const step=state.steps.splice(state.editing,1)[0]; await db('delete',step.id);const url=state.urls.get(step.id);if(url)URL.revokeObjectURL(url);state.urls.delete(step.id); $('editDialog').close(); state.editing=null; render();
}
async function clearAll() {
  if (!confirm('Delete all images from this browser?')) return;
  for(const step of state.steps){await db('delete',step.id);const url=state.urls.get(step.id);if(url)URL.revokeObjectURL(url);}state.urls.clear();state.steps=[];render();toast('Workspace cleared.');
}
const editorCanvas=$('editorCanvas');
editorCanvas.addEventListener('pointerdown',event=>{if(!state.image)return;const rect=editorCanvas.getBoundingClientRect();const x=(event.clientX-rect.left)*editorCanvas.width/rect.width,y=(event.clientY-rect.top)*editorCanvas.height/rect.height;state.drag={x,y};editorCanvas.setPointerCapture(event.pointerId);});
editorCanvas.addEventListener('pointermove',event=>{if(!state.drag)return;const rect=editorCanvas.getBoundingClientRect();const x=(event.clientX-rect.left)*editorCanvas.width/rect.width,y=(event.clientY-rect.top)*editorCanvas.height/rect.height;drawEditor({x:state.drag.x,y:state.drag.y,w:x-state.drag.x,h:y-state.drag.y});});
editorCanvas.addEventListener('pointerup',event=>{if(!state.drag)return;const rect=editorCanvas.getBoundingClientRect();const x=(event.clientX-rect.left)*editorCanvas.width/rect.width,y=(event.clientY-rect.top)*editorCanvas.height/rect.height;const start=state.drag;state.drag=null;const before={boxes:structuredClone(state.boxes),crop:state.crop&&[...state.crop]};if(Math.abs(x-start.x)>5&&Math.abs(y-start.y)>5){const coords=[Math.round(Math.min(start.x,x)/state.scale),Math.round(Math.min(start.y,y)/state.scale),Math.round(Math.max(start.x,x)/state.scale),Math.round(Math.max(start.y,y)/state.scale)];if(state.mode==='red')state.boxes.push(coords);else state.crop=coords;state.undoStack.push(before);}drawEditor();updateEditorControls();});
$('startButton').addEventListener('click',showWorkspace);$('homeButton').addEventListener('click',()=>{stopLiveTabPreview();$('workspace').hidden=true;$('homeScreen').hidden=false;});
$('previewRefreshButton').addEventListener('click',async()=>{if(await refreshTabPreview())startLiveTabPreview();});$('captureTabButton').addEventListener('click',captureCurrentTab);
$('addRowButton').addEventListener('click',()=>$('fileInput').click());$('fileInput').addEventListener('change',event=>{uploadFiles(event.target.files);event.target.value='';});
$('folderButton').addEventListener('click',chooseFolder);$('saveImagesButton').addEventListener('click',saveImagesToFolder);$('copyWordButton').addEventListener('click',copyForWord);$('clearAllButton').addEventListener('click',clearAll);
$('sopDescription').value=localStorage.getItem('python-sop-description')||'';$('sopDescription').addEventListener('input',event=>localStorage.setItem('python-sop-description',event.target.value));
$('cropModeButton').addEventListener('click',()=>{state.mode='crop';updateEditorControls();});$('redModeButton').addEventListener('click',()=>{state.mode='red';updateEditorControls();});
$('undoButton').addEventListener('click',()=>{const previous=state.undoStack.pop();if(previous){state.boxes=previous.boxes;state.crop=previous.crop;drawEditor();updateEditorControls();}});
$('previousButton').addEventListener('click',()=>moveEditor(-1));$('nextButton').addEventListener('click',()=>moveEditor(1));$('deleteImageButton').addEventListener('click',deleteCurrent);
$('editForm').addEventListener('submit',event=>{event.preventDefault();saveCurrentEditor();});
$('closeEditButton').addEventListener('click',()=>$('editDialog').close());$('cancelEditButton').addEventListener('click',()=>$('editDialog').close());
window.addEventListener('beforeunload',()=>{stopLiveTabPreview();state.stream?.getTracks().forEach(track=>track.stop());});
(async()=>{try{state.steps=await db('getAll');state.steps.sort((a,b)=>a.createdAt-b.createdAt);render();}catch(error){toast('Browser storage is unavailable.');}})();
