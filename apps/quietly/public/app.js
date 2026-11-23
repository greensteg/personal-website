'use strict';

const byId = (id) => document.getElementById(id);
const ui = {
  entry: byId('entry'),
  login: byId('login-form'),
  password: byId('password'),
  entryStatus: byId('entry-status'),
  wall: byId('wall'),
  logout: byId('logout'),
  timeline: byId('timeline'),
  wallHeading: byId('wall-heading'),
  wallStatus: byId('wall-status'),
  writerActions: byId('writer-actions'),
  views: byId('views'),
  write: byId('write'),
  notes: byId('notes'),
  noteTemplate: byId('note-template'),
  editor: byId('editor'),
  editorHeading: byId('editor-heading'),
  back: byId('back'),
  noteForm: byId('note-form'),
  title: byId('note-title'),
  body: byId('note-body'),
  photo: byId('note-photo'),
  photoPreview: byId('photo-preview'),
  removePhoto: byId('remove-photo'),
  editorStatus: byId('editor-status'),
  draft: byId('save-draft'),
  publish: byId('publish'),
  delete: byId('delete'),
  confirm: byId('confirm-dialog'),
  confirmTitle: byId('confirm-title'),
  confirmCopy: byId('confirm-copy'),
  confirmAction: byId('confirm-action'),
};

const state = {
  role: null,
  notes: [],
  view: 'published',
  editing: null,
  photoUpdate: undefined,
  photoUrl: null,
  photoPending: false,
  busy: false,
  editorVersion: 0,
  sessionVersion: 0,
  notesRequest: 0,
};

const dateFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

function message(target, text = '', error = false) {
  target.textContent = text.toLowerCase();
  target.classList.toggle('error', error);
}

function loginMessage(text = '', invalid = false) {
  ui.entryStatus.textContent = text.toLowerCase();
  ui.password.setAttribute('aria-invalid', String(invalid));
}

async function request(path, method = 'GET', payload) {
  const options = { method, credentials: 'same-origin', cache: 'no-store' };
  if (payload !== undefined) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(payload);
  }
  const response = await fetch(path, options);
  const result = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && state.role) setSession(null);
    throw new Error(result?.error || 'something went wrong. please try again.');
  }
  return result;
}

function setSession(role) {
  state.sessionVersion += 1;
  state.role = role;
  state.notes = [];
  state.view = 'published';
  ui.notes.replaceChildren();
  resetEditor();
  ui.password.value = '';
  ui.entry.hidden = Boolean(role);
  ui.login.hidden = Boolean(role);
  ui.wall.hidden = !role;
  loginMessage();
  message(ui.wallStatus);

  if (role) {
    showTimeline();
    void refreshNotes();
  }
}

async function refreshNotes(feedback = '') {
  const version = state.sessionVersion;
  const requestNumber = ++state.notesRequest;
  message(ui.wallStatus, feedback || 'opening notes…');
  try {
    const result = await request('/api/notes');
    if (version !== state.sessionVersion || requestNumber !== state.notesRequest) return;
    state.notes = result.notes;
    renderNotes();
    message(ui.wallStatus, feedback);
  } catch (error) {
    if (version === state.sessionVersion && requestNumber === state.notesRequest) {
      message(ui.wallStatus, error.message, true);
    }
  }
}

function showTimeline(focus = false) {
  ui.writerActions.hidden = state.role !== 'author';
  ui.back.hidden = true;
  ui.timeline.hidden = false;
  ui.editor.hidden = true;
  if (focus) ui.wallHeading.focus();
}

function photoPath(id) {
  return '/api/notes/' + encodeURIComponent(id) + '/photo';
}

function renderNotes() {
  const notes = state.notes.filter((note) => note.status === state.view);
  ui.notes.replaceChildren();
  for (const button of ui.views.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.view === state.view));
  }

  if (!notes.length) {
    const empty = document.createElement('div');
    const heading = document.createElement('h2');
    empty.className = 'empty';
    if (state.view === 'draft') {
      heading.textContent = 'no drafts yet';
    } else {
      heading.textContent = state.role === 'author' ? 'no published notes yet' : 'no notes here yet';
    }
    empty.append(heading);
    ui.notes.append(empty);
    return;
  }

  for (const note of notes) {
    const card = ui.noteTemplate.content.cloneNode(true);
    const date = note.status === 'draft' ? note.updatedAt : (note.publishedAt || note.createdAt);
    const time = card.querySelector('time');
    if (date) {
      time.dateTime = date;
      time.textContent = dateFormat.format(new Date(date)).toLocaleLowerCase();
    }
    const title = card.querySelector('.note-title');
    title.textContent = note.title;
    title.hidden = !note.title;

    const body = card.querySelector('.note-body');
    body.textContent = note.body;
    body.hidden = !note.body;

    const photo = card.querySelector('.note-photo');
    if (note.hasPhoto) {
      photo.src = photoPath(note.id);
      photo.hidden = false;
    }

    if (state.role === 'author') {
      const edit = card.querySelector('.note-edit');
      edit.hidden = false;
      edit.setAttribute('aria-label', 'edit ' + (note.title || 'note from ' + time.textContent));
      edit.addEventListener('click', () => openEditor(note));
    }
    ui.notes.append(card);
  }
}

function resetEditor() {
  state.editorVersion += 1;
  state.editing = null;
  state.photoUpdate = undefined;
  state.photoPending = false;
  state.busy = false;
  ui.noteForm.reset();
  showPhoto(null);
  message(ui.editorStatus);
  setEditorBusy(false);
}

function openEditor(note = null) {
  if (state.role !== 'author') return;
  resetEditor();
  state.editing = note;
  ui.title.value = note?.title || '';
  ui.body.value = note?.body || '';
  ui.editorHeading.textContent = note ? 'edit note' : 'new note';
  ui.publish.textContent = note?.status === 'published' ? 'save changes' : 'publish';
  ui.draft.textContent = note?.status === 'published' ? 'move to drafts' : 'save draft';
  ui.delete.hidden = !note;
  if (note?.hasPhoto) showPhoto(photoPath(note.id));
  ui.writerActions.hidden = true;
  ui.back.hidden = false;
  ui.timeline.hidden = true;
  ui.editor.hidden = false;
  ui.editorHeading.focus();
}

function setEditorBusy(busy) {
  state.busy = busy;
  ui.publish.disabled = busy || state.photoPending;
  ui.draft.disabled = busy || state.photoPending;
  ui.title.disabled = busy;
  ui.body.disabled = busy;
  ui.photo.disabled = busy || state.photoPending;
  ui.removePhoto.disabled = busy || state.photoPending;
  ui.delete.disabled = busy;
  ui.back.disabled = busy;
  ui.logout.disabled = busy;
}

function showPhoto(source, objectUrl = false) {
  if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
  state.photoUrl = objectUrl ? source : null;
  if (source) ui.photoPreview.src = source;
  else ui.photoPreview.removeAttribute('src');
  ui.photoPreview.hidden = !source;
  ui.removePhoto.hidden = !source;
}

function editorChanged() {
  return ui.title.value !== (state.editing?.title || '') ||
    ui.body.value !== (state.editing?.body || '') ||
    state.photoUpdate !== undefined ||
    state.photoPending;
}

function confirmAction(title, copy, accept) {
  if (ui.confirm.open) return Promise.resolve(false);
  ui.confirmTitle.textContent = title;
  ui.confirmCopy.textContent = copy;
  ui.confirmAction.textContent = accept;
  ui.confirm.returnValue = 'cancel';

  return new Promise((resolve) => {
    ui.confirm.addEventListener('close', () => resolve(ui.confirm.returnValue === 'confirm'), { once: true });
    ui.confirm.showModal();
  });
}

async function canLeaveEditor() {
  return ui.editor.hidden || !editorChanged() ||
    confirmAction('discard unsaved changes?', 'changes since your last save will be lost.', 'discard changes');
}

async function leaveEditor() {
  if (state.busy || !await canLeaveEditor()) return;
  resetEditor();
  showTimeline(true);
}

async function saveNote(status) {
  if (state.busy || state.photoPending || state.role !== 'author') return;
  const version = state.editorVersion;
  const note = state.editing;
  const payload = { title: ui.title.value, body: ui.body.value, status };
  if (state.photoUpdate !== undefined) payload.photo = state.photoUpdate;

  const hasPhoto = state.photoUpdate === undefined ? note?.hasPhoto : Boolean(state.photoUpdate);
  if (status === 'published' && !payload.title.trim() && !payload.body.trim() && !hasPhoto) {
    message(ui.editorStatus, 'add a title, note, or photo to publish.', true);
    ui.body.focus();
    return;
  }
  if (note?.status === 'published' && status === 'draft' &&
      !await confirmAction('move this note to drafts?', 'only you can view drafts.', 'move to drafts')) {
    return;
  }

  setEditorBusy(true);
  message(ui.editorStatus, 'saving…');
  try {
    await request(note ? '/api/notes/' + encodeURIComponent(note.id) : '/api/notes', note ? 'PUT' : 'POST', payload);
    if (version !== state.editorVersion) return;
    resetEditor();
    state.view = status;
    showTimeline(true);
    const feedback = status === 'draft' ? 'draft saved.' : note?.status === 'published' ? 'changes saved.' : 'note published.';
    await refreshNotes(feedback);
  } catch (error) {
    if (version === state.editorVersion) message(ui.editorStatus, error.message, true);
  } finally {
    if (version === state.editorVersion) setEditorBusy(false);
  }
}

async function deleteNote() {
  if (!state.editing || state.busy) return;
  const version = state.editorVersion;
  const note = state.editing;
  if (!await confirmAction('delete this note?', 'this permanently removes the note and its photo.', 'delete note')) return;

  setEditorBusy(true);
  message(ui.editorStatus, 'deleting…');
  try {
    await request('/api/notes/' + encodeURIComponent(note.id), 'DELETE');
    if (version !== state.editorVersion) return;
    resetEditor();
    state.view = note.status;
    showTimeline(true);
    await refreshNotes('note deleted.');
  } catch (error) {
    if (version === state.editorVersion) message(ui.editorStatus, error.message, true);
  } finally {
    if (version === state.editorVersion) setEditorBusy(false);
  }
}

async function preparePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 25 * 1024 * 1024) {
    throw new Error('choose a jpeg, png, or webp photo under 25 mb.');
  }

  const originalUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = originalUrl;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('this photo could not be opened.');

    const ratio = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fcfbf5';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    // The browser encodes the pixels into a new file without the camera metadata.
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .86));
    if (!blob || blob.size > 4 * 1024 * 1024) throw new Error('this photo is too large.');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { blob, attachment: { type: 'image/jpeg', data: dataUrl.split(',')[1] } };
  } finally {
    URL.revokeObjectURL(originalUrl);
  }
}

ui.photo.addEventListener('change', async () => {
  const file = ui.photo.files[0];
  if (!file) return;
  const version = state.editorVersion;
  state.photoPending = true;
  setEditorBusy(state.busy);
  message(ui.editorStatus, 'preparing photo…');
  try {
    const { blob, attachment } = await preparePhoto(file);
    if (version !== state.editorVersion) return;
    state.photoUpdate = attachment;
    showPhoto(URL.createObjectURL(blob), true);
    message(ui.editorStatus);
  } catch (error) {
    if (version === state.editorVersion) {
      message(ui.editorStatus, error.message || 'this photo could not be opened.', true);
    }
  } finally {
    if (version === state.editorVersion) {
      state.photoPending = false;
      ui.photo.value = '';
      setEditorBusy(false);
    }
  }
});

ui.removePhoto.addEventListener('click', () => {
  state.photoUpdate = state.editing?.hasPhoto ? null : undefined;
  ui.photo.value = '';
  showPhoto(null);
  message(ui.editorStatus);
});

ui.noteForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void saveNote('published');
});
ui.draft.addEventListener('click', () => void saveNote('draft'));
ui.delete.addEventListener('click', () => void deleteNote());
ui.write.addEventListener('click', () => openEditor());
ui.back.addEventListener('click', () => void leaveEditor());

ui.views.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-view]');
  if (!button) return;
  state.view = button.dataset.view;
  message(ui.wallStatus);
  renderNotes();
});

ui.password.addEventListener('input', () => loginMessage());

ui.login.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (ui.password.readOnly) return;
  if (!ui.password.value) {
    loginMessage('enter a password.', true);
    return;
  }
  ui.password.readOnly = true;
  loginMessage('signing in…');
  try {
    const result = await request('/api/login', 'POST', { password: ui.password.value });
    setSession(result.role);
    ui.wallHeading.focus();
  } catch (error) {
    loginMessage(error.message, true);
    ui.password.select();
  } finally {
    ui.password.readOnly = false;
  }
});

ui.logout.addEventListener('click', async () => {
  if (state.busy || !await canLeaveEditor()) return;
  ui.logout.disabled = true;
  try {
    await request('/api/logout', 'POST', {});
    setSession(null);
    ui.password.focus();
  } catch (error) {
    message(ui.editor.hidden ? ui.wallStatus : ui.editorStatus, error.message, true);
  } finally {
    ui.logout.disabled = false;
  }
});

async function init() {
  try {
    const result = await request('/api/session');
    setSession(result.role);
    if (!result.role) ui.password.focus({ preventScroll: true });
  } catch (error) {
    ui.login.hidden = false;
    loginMessage(error.message, true);
    ui.password.focus({ preventScroll: true });
  }
}

window.addEventListener('pagehide', (event) => {
  if (event.persisted && state.role) setSession(null);
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) void init();
});

void init();
