const DB_NAME = 'python-sop-workspace';
const STORE = 'steps';
const state = { steps: [], stream: null, directory: null, editing: null, mode: 'crop', boxes: [], crop: null, undoStack: [], drag: null, image: null, scale: 1, offsetX: 0, offsetY: 0, toastTimer: null, urls: new Map() };
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
    const card = document.createElement('article'); card.className = 'step-card'; card.tabIndex = 0;
    const imageWrap = document.createElement('div'); imageWrap.className = 'step-image';
    const image = document.createElement('img'); image.src = blobUrl(step); image.alt = step.name; imageWrap.append(image);
    const info = document.createElement('div'); info.className = 'step-info';
    const top = document.createElement('div'); top.className = 'step-topline';
    const number = document.createElement('span'); number.className = 'step-index'; number.textContent = String(index + 1).padStart(2, '0');
    const title = document.createElement('span'); title.className = 'step-title'; title.textContent = step.name;
    const description = document.createElement('div'); description.className = 'step-description'; description.textContent = step.description || 'Add a description';
    top.append(number, title); info.append(top, description); card.append(imageWrap, info);
    card.addEventListener('click', () => openEditor(step.id));
    card.addEventListener('keydown', (event) => { if (event.key === 'Enter') openEditor(step.id); });
    grid.append(card);
  }
}
async function addImage(blob, name = '', description = '') {
  const safeBlob = blob.type === 'image/png' ? blob : await convertToPng(blob);
  const item = { id: makeId(), name: name || `${nextName()}.png`, description, blob: safeBlob, createdAt: Date.now() };
  state.steps.push(item); await db('put', item); render();
  if (state.directory) saveToFolder(item).catch(() => toast('Saved in browser. Folder access is unavailable.'));
  return item;
}
async function convertToPng(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close?.();
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}
async function saveToFolder(item) {
  const filename = item.name.toLowerCase().endsWith('.png') ? item.name : `${item.name}.png`;
  const handle = await state.directory.getFileHandle(filename, { create: true });
  const writer = await handle.createWritable(); await writer.write(item.blob); await writer.close();
}
async function chooseFolder() {
  if (!window.showDirectoryPicker) { toast('Folder access requires Chrome or Edge. Images remain saved in this browser.'); return; }
  try { state.directory = await window.showDirectoryPicker({ mode: 'readwrite' }); toast(`Folder selected: ${state.directory.name}`); }
  catch (error) { if (error.name !== 'AbortError') toast('Could not open this folder.'); }
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
  for(const step of state.steps){const data=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(step.blob);});htmlParts.push(`<p><img src="${data}" style="max-width:100%;height:auto"></p><p>${escapeHtml(step.name.replace(/\.[^.]+$/,''))}</p><p>${escapeHtml(step.description).replace(/\n/g,'<br>')}</p>`);plain.push(`[Image]\n${step.name}\n${step.description}`);}
  try { await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([`<html><body>${htmlParts.join('')}</body></html>`],{type:'text/html'}),'text/plain':new Blob([plain.join('\n\n')],{type:'text/plain'})})]); toast('Copied. Paste into Word with Ctrl+V.'); }
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
$('shareButton').addEventListener('click',shareScreen);$('captureButton').addEventListener('click',captureScreen);$('stopShareButton').addEventListener('click',stopScreenShare);
$('captureTabButton').addEventListener('click',captureCurrentTab);
$('uploadButton').addEventListener('click',()=>$('fileInput').click());$('fileInput').addEventListener('change',event=>uploadFiles(event.target.files));
$('folderButton').addEventListener('click',chooseFolder);$('copyWordButton').addEventListener('click',copyForWord);$('clearAllButton').addEventListener('click',clearAll);
$('cropModeButton').addEventListener('click',()=>{state.mode='crop';updateEditorControls();});$('redModeButton').addEventListener('click',()=>{state.mode='red';updateEditorControls();});
$('undoButton').addEventListener('click',()=>{const previous=state.undoStack.pop();if(previous){state.boxes=previous.boxes;state.crop=previous.crop;drawEditor();updateEditorControls();}});
$('previousButton').addEventListener('click',()=>moveEditor(-1));$('nextButton').addEventListener('click',()=>moveEditor(1));$('deleteImageButton').addEventListener('click',deleteCurrent);
$('editForm').addEventListener('submit',event=>{event.preventDefault();saveCurrentEditor();});
$('closeEditButton').addEventListener('click',()=>$('editDialog').close());$('cancelEditButton').addEventListener('click',()=>$('editDialog').close());
window.addEventListener('keydown',event=>{
  const target=event.target;
  const typing=target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  if(event.code==='Space'&&state.stream&&!typing&&!$('editDialog').open){event.preventDefault();captureScreen();}
});
window.addEventListener('beforeunload',stopScreenShare);
(async()=>{try{state.steps=await db('getAll');state.steps.sort((a,b)=>a.createdAt-b.createdAt);render();}catch(error){toast('Browser storage is unavailable.');}})();
