const DB_NAME = 'python-sop-workspace';
const STORE = 'steps';
const DESCRIPTION_GROUPS_KEY = 'python-sop-descriptions';
const EDITOR_TAB_KEY = 'sara-sop-editor-tab-id';
const state = { steps: [], selectedId: new URLSearchParams(location.search).get('step'), image: null, boxes: [], drag: null, editingGroup: null, draggingId: null, dragJustEnded: false, editorTabId: null, toastTimer: null };
let editorReady = Promise.resolve();
const $ = id => document.getElementById(id);
const dbPromise = new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
function dbGetAll() {
  return dbPromise.then(database => new Promise((resolve, reject) => {
    const request = database.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
function dbPut(step) {
  return dbPromise.then(database => new Promise((resolve, reject) => {
    const request = database.transaction(STORE, 'readwrite').objectStore(STORE).put(step);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }));
}
function readDescriptionGroups() {
  try { return JSON.parse(localStorage.getItem(DESCRIPTION_GROUPS_KEY) || '[]').filter(group => group && group.startId && group.endId && group.text); }
  catch { return []; }
}
function writeDescriptionGroups(groups) { localStorage.setItem(DESCRIPTION_GROUPS_KEY, JSON.stringify(groups)); }
async function sortSteps() {
  const hasOrder = state.steps.every(step => Number.isFinite(step.sortOrder));
  state.steps.sort((a, b) => hasOrder ? a.sortOrder - b.sortOrder : a.createdAt - b.createdAt);
  if (!hasOrder) {
    state.steps.forEach((step, index) => { step.sortOrder = index; });
    await Promise.all(state.steps.map(dbPut));
  }
}
function migrateLegacyDescription() {
  const legacy = localStorage.getItem('python-sop-description');
  if (!legacy || readDescriptionGroups().length || !state.steps.length) return;
  writeDescriptionGroups([{ startId: state.steps[0].id, endId: state.steps[state.steps.length - 1].id, text: legacy }]);
  localStorage.removeItem('python-sop-description');
}
function groupForImage(id) {
  const index = state.steps.findIndex(step => step.id === id);
  return readDescriptionGroups().find(group => {
    const start = state.steps.findIndex(step => step.id === group.startId);
    const end = state.steps.findIndex(step => step.id === group.endId);
    return start >= 0 && end >= start && index >= start && index <= end;
  }) || null;
}
function populateDescriptionEditor() {
  const startSelect = $('descriptionStart'); const endSelect = $('descriptionEnd');
  startSelect.replaceChildren(); endSelect.replaceChildren();
  state.steps.forEach(step => {
    const optionText = step.name.replace(/\.png$/i, '');
    for (const select of [startSelect, endSelect]) {
      const option = document.createElement('option'); option.value = step.id; option.textContent = optionText; select.append(option);
    }
  });
  const group = groupForImage(state.selectedId);
  const selectedIndex = Math.max(0, state.steps.findIndex(step => step.id === state.selectedId));
  state.editingGroup = group ? { startId: group.startId, endId: group.endId } : null;
  startSelect.value = group?.startId || state.steps[selectedIndex]?.id || '';
  endSelect.value = group?.endId || state.steps[selectedIndex]?.id || '';
  $('sopDescription').value = group?.text || '';
}
function saveDescriptionGroup() {
  const text = $('sopDescription').value.trim();
  const startId = $('descriptionStart').value; const endId = $('descriptionEnd').value;
  let groups = readDescriptionGroups();
  if (state.editingGroup) groups = groups.filter(group => !(group.startId === state.editingGroup.startId && group.endId === state.editingGroup.endId));
  const startIndex = state.steps.findIndex(step => step.id === startId);
  const endIndex = state.steps.findIndex(step => step.id === endId);
  if (text && startIndex >= 0 && endIndex >= startIndex) {
    groups = groups.filter(group => {
      const existingStart = state.steps.findIndex(step => step.id === group.startId);
      const existingEnd = state.steps.findIndex(step => step.id === group.endId);
      return existingStart < 0 || existingEnd < existingStart || existingEnd < startIndex || existingStart > endIndex;
    });
    groups.push({ startId, endId, text });
    state.editingGroup = { startId, endId };
  } else {
    state.editingGroup = null;
  }
  writeDescriptionGroups(groups);
}
function selectedIndex() { return state.steps.findIndex(step => step.id === state.selectedId); }
function selectedStep() { return state.steps[selectedIndex()]; }
function imageUrl(step) { return URL.createObjectURL(step.blob); }
function showToast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2200);
}
async function fileToPng(file) {
  if (file.type === 'image/png') return file;
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close?.();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error(`Could not read ${file.name}.`);
  return blob;
}
function nextImportedImageName() {
  const used = new Set(state.steps.map(step => step.name.replace(/\.png$/i, '').toLowerCase()));
  let index = 0;
  while (used.has(index === 0 ? 'new' : `new(${index})`)) index += 1;
  return index === 0 ? 'new.png' : `new(${index}).png`;
}
function renderGallery() {
  const gallery = $('imageGallery');
  for (const img of gallery.querySelectorAll('img')) URL.revokeObjectURL(img.src);
  gallery.replaceChildren();
  $('imageCount').textContent = `${state.steps.length} image${state.steps.length === 1 ? '' : 's'}`;
  $('emptyMessage').hidden = state.steps.length > 0;
  $('editLayout').hidden = state.steps.length === 0;
  for (const step of state.steps) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `gallery-item${step.id === state.selectedId ? ' selected' : ''}`;
    button.setAttribute('aria-pressed', String(step.id === state.selectedId));
    const img = document.createElement('img');
    img.src = imageUrl(step);
    img.alt = step.name;
    const name = document.createElement('span');
    name.className = 'gallery-name';
    name.textContent = step.name.replace(/\.png$/i, '');
    button.append(img, name);
    button.draggable = true;
    button.addEventListener('click', () => { if (state.dragJustEnded) return; selectImage(step.id); });
    button.addEventListener('dragstart', event => {
      state.draggingId = step.id;
      state.dragJustEnded = false;
      button.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', step.id);
    });
    button.addEventListener('dragover', event => { event.preventDefault(); if (state.draggingId && state.draggingId !== step.id) button.classList.add('drop-target'); });
    button.addEventListener('dragleave', () => button.classList.remove('drop-target'));
    button.addEventListener('drop', event => {
      event.preventDefault(); button.classList.remove('drop-target');
      const fromId = event.dataTransfer.getData('text/plain') || state.draggingId;
      if (fromId && fromId !== step.id) reorderImages(fromId, step.id);
    });
    button.addEventListener('dragend', () => {
      button.classList.remove('dragging');
      document.querySelectorAll('.gallery-item.drop-target').forEach(item => item.classList.remove('drop-target'));
      state.draggingId = null; state.dragJustEnded = true;
      setTimeout(() => { state.dragJustEnded = false; }, 250);
    });
    gallery.append(button);
  }
  const addCard = document.createElement('button');
  addCard.type = 'button'; addCard.className = 'gallery-item add-image-card';
  addCard.setAttribute('aria-label', 'Add images from your device'); addCard.title = 'Add images from your device';
  addCard.innerHTML = '<span class="add-image-plus" aria-hidden="true">+</span><span class="add-image-label">Add images</span>';
  addCard.addEventListener('click', () => $('addImageInput').click());
  gallery.append(addCard);
}
function groupsWithIndices() {
  return readDescriptionGroups().map(group => ({
    ...group,
    start: state.steps.findIndex(step => step.id === group.startId),
    end: state.steps.findIndex(step => step.id === group.endId)
  })).filter(group => group.start >= 0 && group.end >= group.start);
}
function descriptionGroupForImage(id) {
  const index = state.steps.findIndex(step => step.id === id);
  return groupsWithIndices().find(group => index >= group.start && index <= group.end) || null;
}
function showGroupAlert(group) {
  const range = `Images ${group.start + 1}${group.start === group.end ? '' : `–${group.end + 1}`}`;
  $('alertRange').textContent = `${range} are linked to this Description:`;
  $('alertDescription').textContent = group.text;
  $('groupAlert').showModal();
}
async function reorderImages(fromId, toId) {
  try { await saveCurrentImage(); }
  catch { showToast('Save the current image before reordering.'); return; }
  const fromIndex = state.steps.findIndex(step => step.id === fromId);
  const toIndex = state.steps.findIndex(step => step.id === toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
  const linkedGroup = descriptionGroupForImage(fromId) || descriptionGroupForImage(toId);
  if (linkedGroup) { showGroupAlert(linkedGroup); return; }
  const [moving] = state.steps.splice(fromIndex, 1);
  state.steps.splice(toIndex, 0, moving);
  state.steps.forEach((step, index) => { step.sortOrder = index; });
  try {
    await Promise.all(state.steps.map(dbPut));
    localStorage.setItem('python-sop-image-order', JSON.stringify(state.steps.map(step => step.id)));
    renderGallery(); populateDescriptionEditor(); updateControls();
    showToast('Image order updated.');
  } catch (error) {
    showToast('Could not save the new image order.');
    state.steps.splice(toIndex, 1); state.steps.splice(fromIndex, 0, moving);
    state.steps.forEach((step, index) => { step.sortOrder = index; });
    renderGallery(); populateDescriptionEditor(); updateControls();
  }
}
function drawCanvas(activeBox = null) {
  if (!state.image) return;
  const canvas = $('markupCanvas');
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(state.image, 0, 0);
  context.strokeStyle = '#ed3434';
  context.lineWidth = Math.max(4, canvas.width / 450);
  for (const box of state.boxes) context.strokeRect(box.x, box.y, box.w, box.h);
  if (activeBox) context.strokeRect(activeBox.x, activeBox.y, activeBox.w, activeBox.h);
}
function updateControls() {
  const index = selectedIndex();
  $('previousImage').disabled = index <= 0;
  $('nextImage').disabled = index < 0 || index >= state.steps.length - 1;
  $('undoButton').disabled = state.boxes.length === 0;
  const step = selectedStep();
  if (!step) return;
  $('imagePosition').textContent = `IMAGE ${index + 1} OF ${state.steps.length}`;
  $('imageTitle').textContent = step.name.replace(/\.png$/i, '');
  $('imageName').value = step.name.replace(/\.png$/i, '');
}
function loadSelectedImage() {
  const step = selectedStep();
  if (!step) return;
  state.boxes = [];
  populateDescriptionEditor();
  const image = new Image();
  image.onload = () => {
    state.image = image;
    const canvas = $('markupCanvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    drawCanvas();
    URL.revokeObjectURL(image.src);
  };
  image.onerror = () => showToast('Could not load this image.');
  image.src = imageUrl(step);
  updateControls();
  renderGallery();
}
async function saveCurrentImage(showMessage = false) {
  const step = selectedStep();
  if (!step) return;
  const enteredName = $('imageName').value.trim();
  if (enteredName) step.name = enteredName.toLowerCase().endsWith('.png') ? enteredName : `${enteredName}.png`;
  if (state.image) {
    const canvas = document.createElement('canvas');
    canvas.width = state.image.naturalWidth;
    canvas.height = state.image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(state.image, 0, 0);
    context.strokeStyle = '#ed3434';
    context.lineWidth = Math.max(4, canvas.width / 450);
    for (const box of state.boxes) context.strokeRect(box.x, box.y, box.w, box.h);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not save the marked image.');
    step.blob = blob;
  }
  await dbPut(step);
  saveDescriptionGroup();
  $('saveStatus').textContent = 'Changes are saved on this device';
  if (showMessage) showToast('Changes saved.');
}
async function selectImage(id) {
  if (id === state.selectedId) return;
  try {
    await saveCurrentImage();
    state.selectedId = id;
    loadSelectedImage();
  } catch (error) { showToast(error.message || 'Could not save this image.'); }
}
async function moveImage(delta) {
  const next = state.steps[selectedIndex() + delta];
  if (next) await selectImage(next.id);
}
function canvasPoint(event) {
  const rect = $('markupCanvas').getBoundingClientRect();
  return { x: (event.clientX - rect.left) * $('markupCanvas').width / rect.width, y: (event.clientY - rect.top) * $('markupCanvas').height / rect.height };
}
const canvas = $('markupCanvas');
canvas.addEventListener('pointerdown', event => {
  if (!state.image) return;
  state.drag = canvasPoint(event);
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  if (!state.drag) return;
  const point = canvasPoint(event);
  drawCanvas({ x: Math.min(point.x, state.drag.x), y: Math.min(point.y, state.drag.y), w: Math.abs(point.x - state.drag.x), h: Math.abs(point.y - state.drag.y) });
});
canvas.addEventListener('pointerup', event => {
  if (!state.drag) return;
  const start = state.drag;
  const end = canvasPoint(event);
  state.drag = null;
  if (Math.abs(end.x - start.x) > 5 && Math.abs(end.y - start.y) > 5) {
    state.boxes.push({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y) });
    $('saveStatus').textContent = 'Unsaved changes';
  }
  drawCanvas();
  updateControls();
});
$('undoButton').addEventListener('click', () => {
  if (!state.boxes.length) return;
  state.boxes.pop();
  $('saveStatus').textContent = 'Unsaved changes';
  drawCanvas();
  updateControls();
});
$('previousImage').addEventListener('click', () => moveImage(-1));
$('nextImage').addEventListener('click', () => moveImage(1));
$('saveButton').addEventListener('click', async () => {
  try { await saveCurrentImage(true); renderGallery(); drawCanvas(); updateControls(); }
  catch (error) { showToast(error.message || 'Could not save changes.'); }
});
$('sopDescription').addEventListener('input', () => {
  $('saveStatus').textContent = 'Unsaved changes';
});
$('imageName').addEventListener('change', () => {
  const step = selectedStep();
  if (!step) return;
  const enteredName = $('imageName').value.trim();
  if (!enteredName) { $('imageName').value = step.name.replace(/\.png$/i, ''); return; }
  step.name = enteredName.toLowerCase().endsWith('.png') ? enteredName : `${enteredName}.png`;
  $('imageName').value = step.name.replace(/\.png$/i, '');
  $('imageTitle').textContent = $('imageName').value;
  const optionText = step.name.replace(/\.png$/i, '');
  for (const select of [$('descriptionStart'), $('descriptionEnd')]) {
    const option = [...select.options].find(item => item.value === step.id);
    if (option) option.textContent = optionText;
  }
  renderGallery();
  $('saveStatus').textContent = 'Unsaved changes';
});
function normalizeDescriptionRange(changed) {
  const startIndex = state.steps.findIndex(step => step.id === $('descriptionStart').value);
  const endIndex = state.steps.findIndex(step => step.id === $('descriptionEnd').value);
  if (startIndex > endIndex) {
    if (changed === 'start') $('descriptionEnd').value = $('descriptionStart').value;
    else $('descriptionStart').value = $('descriptionEnd').value;
  }
  $('saveStatus').textContent = 'Unsaved changes';
}
$('descriptionStart').addEventListener('change', () => normalizeDescriptionRange('start'));
$('descriptionEnd').addEventListener('change', () => normalizeDescriptionRange('end'));
$('closeGroupAlert').addEventListener('click', () => $('groupAlert').close());
$('groupAlert').addEventListener('click', event => { if (event.target === $('groupAlert')) $('groupAlert').close(); });
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'SARA_OPEN_EDITOR_IMAGE') return;
  editorReady.then(async () => {
    if (!state.steps.some(step => step.id === message.stepId)) { sendResponse({ ok: false }); return; }
    await selectImage(message.stepId);
    sendResponse({ ok: state.selectedId === message.stepId });
  }).catch(() => sendResponse({ ok: false }));
  return true;
});
$('addImageInput').addEventListener('change', async event => {
  const files = [...event.target.files].filter(file => file.type.startsWith('image/'));
  if (!files.length) return;
  try {
    await saveCurrentImage();
    for (const file of files) {
      const blob = await fileToPng(file);
      const step = { id: crypto.randomUUID(), name: nextImportedImageName(), description: '', blob, createdAt: Date.now(), sortOrder: state.steps.length };
      state.steps.push(step);
      await dbPut(step);
    }
    await sortSteps();
    state.selectedId = state.steps[state.steps.length - 1].id;
    loadSelectedImage();
    showToast(`${files.length} image${files.length === 1 ? '' : 's'} added.`);
  } catch (error) { showToast(error.message || 'Could not add those images.'); }
  finally { event.target.value = ''; }
});
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.key === 'ArrowLeft') moveImage(-1);
  if (event.key === 'ArrowRight') moveImage(1);
});
window.addEventListener('beforeunload', () => {
  for (const img of document.querySelectorAll('.gallery-item img')) URL.revokeObjectURL(img.src);
  if (state.editorTabId !== null && localStorage.getItem(EDITOR_TAB_KEY) === String(state.editorTabId)) localStorage.removeItem(EDITOR_TAB_KEY);
});
chrome.tabs.getCurrent(tab => {
  if (tab?.id !== undefined) {
    state.editorTabId = tab.id;
    localStorage.setItem(EDITOR_TAB_KEY, String(tab.id));
  }
});
editorReady = (async () => {
  try {
    state.steps = await dbGetAll();
    await sortSteps();
    migrateLegacyDescription();
    if (!state.steps.some(step => step.id === state.selectedId)) state.selectedId = state.steps[0]?.id || null;
    renderGallery();
    if (state.selectedId) loadSelectedImage();
  } catch (error) {
    showToast('Browser storage is unavailable.');
  }
})();
