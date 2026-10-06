/** Admin-side primitives: form fields wired to the Ekko component CSS, drawers, toasts. */
import { dataIcon, el, spriteIcon, UI_SPRITE, uiIcon } from '/shared/client.js';

// --- fields --------------------------------------------------------------
export function textField({ label, value = '', placeholder = '', hint, required, type = 'text', size = 'md' }) {
  const input = el('input', { type, value: value ?? '', placeholder });
  const node = el('label.ekko-field', {}, [
    el('span.ekko-field__label', {}, [label, required ? el('i', {}, ' *') : null]),
    el(`span.ekko-input.ekko-input--${size}`, {}, [input]),
    hint ? el('span.ekko-field__hint', {}, hint) : null,
  ]);
  return { node, input, get: () => input.value, set: (v) => { input.value = v ?? ''; } };
}

/**
 * Chọn biểu tượng từ bộ icon của app (`UI_SPRITE`, xuất từ trang Icons của
 * Figma). Không có ô gõ tự do: app không dùng emoji, nên admin chỉ chọn được
 * đúng những icon có trong sprite. Danh sách đọc thẳng từ tệp sprite, nên thêm
 * icon vào sprite là nó hiện ở đây, không phải sửa code.
 */
let spriteIds = null;
async function loadSpriteIds() {
  if (!spriteIds) {
    spriteIds = fetch(UI_SPRITE).then((r) => r.text())
      .then((text) => [...text.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]).sort());
  }
  return spriteIds;
}

export function iconPicker({ value = '', fallback = 'package', label = 'Biểu tượng' } = {}) {
  const valid = (v) => /^[a-z0-9-]+$/.test(String(v || ''));
  let current = valid(value) ? value : fallback;
  const face = el('span.iconpick__face');
  const grid = el('div.iconpick__grid', { hidden: true });
  const trigger = el('button.iconpick__trigger', {
    type: 'button', 'aria-label': `${label}: đổi icon`, 'aria-expanded': 'false',
    onclick: async () => {
      const open = grid.hidden;
      grid.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
      if (open && !grid.childElementCount) drawGrid(await loadSpriteIds());
    },
  }, [face, spriteIcon('chevron-down-01-stroke', 16)]);

  function drawFace() { face.replaceChildren(uiIcon(current, 24), el('code', {}, current)); }
  function drawGrid(ids) {
    grid.replaceChildren(...ids.map((id) => el('button.iconpick__cell', {
      type: 'button', title: id, 'aria-label': id, 'aria-pressed': String(id === current),
      onclick: () => {
        current = id;
        [...grid.children].forEach((c) => c.setAttribute('aria-pressed', String(c.title === id)));
        drawFace();
        grid.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
      },
    }, [uiIcon(id, 24)])));
  }
  drawFace();
  const node = el('div.iconpick', {}, [trigger, grid]);
  return { node, get: () => current, set: (v) => { current = valid(v) ? v : fallback; drawFace(); } };
}

/** `iconPicker` trong khung field chuẩn của form admin. */
export function iconField({ label = 'Biểu tượng', value, fallback, hint }) {
  const picker = iconPicker({ value, fallback, label });
  const node = el('div.ekko-field', {}, [
    el('span.ekko-field__label', {}, label),
    picker.node,
    hint ? el('span.ekko-field__hint', {}, hint) : null,
  ]);
  return { node, get: picker.get, set: picker.set };
}

/** Biểu tượng lưu trong dữ liệu, cỡ vừa ô bảng. */
export const cellIcon = (value, fallback) => dataIcon(value, fallback, 24);

export function numberField(options) {
  const field = textField({ ...options, type: 'number' });
  field.input.setAttribute('inputmode', 'numeric');
  return { ...field, get: () => (field.input.value === '' ? null : Number(field.input.value)) };
}

export function textAreaField({ label, value = '', placeholder = '', hint, rows = 4 }) {
  const input = el('textarea', { placeholder, rows }, value ?? '');
  const node = el('label.ekko-field', {}, [
    el('span.ekko-field__label', {}, label),
    input,
    hint ? el('span.ekko-field__hint', {}, hint) : null,
  ]);
  return { node, input, get: () => input.value, set: (v) => { input.value = v ?? ''; } };
}

export function selectField({ label, value, options, hint }) {
  const select = el('select', {}, options.map(([optionValue, optionLabel]) => el('option', {
    value: optionValue,
    selected: String(optionValue) === String(value) ? true : null,
  }, optionLabel)));
  const node = el('label.ekko-field', {}, [
    el('span.ekko-field__label', {}, label),
    select,
    hint ? el('span.ekko-field__hint', {}, hint) : null,
  ]);
  return { node, input: select, get: () => select.value, set: (v) => { select.value = v; } };
}

export function toggleField({ label, value = true, hint }) {
  const input = el('input.ekko-checkbox', { type: 'checkbox', checked: value ? true : null });
  const node = el('div.ekko-field', {}, [
    el('label.ekko-choice', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [input, el('span', {}, label)]),
    hint ? el('span.ekko-field__hint', {}, hint) : null,
  ]);
  return { node, input, get: () => (input.checked ? 1 : 0), set: (v) => { input.checked = Boolean(v); } };
}

/**
 * A single image slot. No gallery to scroll: click the tile (or the button) to
 * pick a file, click the red cross to clear it. Clicking an image that is already
 * set replaces it, which is the whole interaction.
 */
export function assetField({ label, value = '', hint, uploader, onChange }) {
  let current = value || '';

  const file = el('input', {
    type: 'file',
    accept: 'image/png,image/jpeg,image/webp,image/svg+xml',
    style: { display: 'none' },
  });

  const preview = el('img', { alt: '' });
  const placeholder = el('span.assettile__empty', {}, 'Chưa có ảnh');
  const tile = el('button.assettile', {
    type: 'button',
    onclick: () => file.click(),
    'aria-label': `${label}: chọn ảnh`,
  }, [preview, placeholder, el('span.assettile__hover', {}, 'Đổi ảnh')]);

  const clear = el('button.assettile__clear', {
    type: 'button',
    title: 'Bỏ ảnh',
    'aria-label': `${label}: bỏ ảnh`,
    onclick: (event) => { event.stopPropagation(); setValue(''); },
  }, uiIcon('cancel-01', 16));

  const upload = el('button.ekko-btn.ekko-btn--secondary.ekko-btn--md', {
    type: 'button',
    onclick: () => file.click(),
  }, [uiIcon('upload-01', 16), ' Tải ảnh lên']);

  function setValue(next) {
    current = next || '';
    preview.src = current;
    tile.dataset.filled = String(Boolean(current));
    clear.hidden = !current;
    onChange?.(current);
  }

  file.addEventListener('change', async () => {
    const picked = file.files?.[0];
    file.value = '';   // so choosing the same file twice still fires
    if (!picked || !uploader) return;

    tile.classList.add('is-busy');
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Không đọc được tệp'));
        reader.readAsDataURL(picked);
      });
      const result = await uploader({ filename: picked.name, dataUrl });
      if (result?.url) setValue(result.url);
    } catch (err) {
      notify(err.message || 'Tải ảnh lên không thành công', 'error');
    } finally {
      tile.classList.remove('is-busy');
    }
  });

  setValue(current);

  const node = el('div.ekko-field', {}, [
    el('span.ekko-field__label', {}, label),
    el('div.assetslot', {}, [
      el('div.assetslot__tile', {}, [tile, clear]),
      el('div', {}, [upload, hint ? el('span.ekko-field__hint', { style: { display: 'block', marginTop: '8px' } }, hint) : null]),
    ]),
    file,
  ]);

  return { node, get: () => current || null, set: setValue };
}

/**
 * Inline on/off switch that saves straight away, so a status can be flipped from
 * the list without opening the edit dialog. Optimistic: it flips at once and
 * rolls back if the request fails, so the row never lies about what was saved.
 */
export function statusToggle(ctx, { entity, id, field, value, on = 'Đang bật', off = 'Đã tắt', name }) {
  let saved = Boolean(value);

  const input = el('input', { type: 'checkbox', role: 'switch', checked: saved ? true : null });
  const label = el('span.statustoggle__label', {}, saved ? on : off);
  const node = el('label.statustoggle', {}, [
    el('span.ekko-switch', {}, [
      input,
      el('span.ekko-switch__track'),
      el('span.ekko-switch__thumb'),
    ]),
    label,
  ]);

  input.addEventListener('change', async () => {
    const next = input.checked;
    input.disabled = true;
    label.textContent = next ? on : off;

    try {
      await ctx.api.patch(`/api/admin/${entity}/${id}`, { [field]: next ? 1 : 0 });
      saved = next;
      ctx.notify(`${next ? 'Đã bật' : 'Đã tắt'}${name ? `: ${name}` : ''}`, 'success');
    } catch (err) {
      input.checked = saved;
      label.textContent = saved ? on : off;
      ctx.notify(err.message, 'error');
    } finally {
      input.disabled = false;
    }
  });

  return node;
}

// --- drawer --------------------------------------------------------------
let openDrawer = null;

export function drawer({ title, fields, onSave, saveLabel = 'Lưu', extra }) {
  closeDrawer();

  const backdrop = el('div.drawer-backdrop', { onclick: closeDrawer });
  const saveButton = el('button.ekko-btn.ekko-btn--primary.ekko-btn--md', {}, saveLabel);

  const panel = el('aside.drawer', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
    el('div.drawer__head', {}, [
      el('h2', {}, title),
      el('button.ekko-btn.ekko-btn--secondary.ekko-btn--sm', { onclick: closeDrawer }, 'Đóng'),
    ]),
    el('div.drawer__body', {}, [...fields.map((f) => f.node ?? f), extra].filter(Boolean)),
    el('div.drawer__foot', {}, [
      el('button.ekko-btn.ekko-btn--secondary.ekko-btn--md', { onclick: closeDrawer }, 'Huỷ'),
      saveButton,
    ]),
  ]);

  saveButton.addEventListener('click', async () => {
    saveButton.disabled = true;
    try {
      const ok = await onSave();
      if (ok !== false) closeDrawer();
    } finally {
      saveButton.disabled = false;
    }
  });

  document.body.append(backdrop, panel);
  document.body.style.overflow = 'hidden';
  openDrawer = { backdrop, panel };
  panel.querySelector('input, textarea, select')?.focus();
  return panel;
}

export function closeDrawer() {
  if (!openDrawer) return;
  openDrawer.backdrop.remove();
  openDrawer.panel.remove();
  openDrawer = null;
  document.body.style.overflow = '';
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeDrawer();
  closeModal();
});

// --- modal ---------------------------------------------------------------
let openModal = null;

/**
 * Centred dialog. Used where the form reads better in two columns than in the
 * 560px side drawer. `rows` is a list of field arrays: a row with two fields
 * renders them side by side.
 */
export function modal({ title, rows, onSave, saveLabel = 'Lưu', width = 840 }) {
  closeModal();

  const backdrop = el('div.modal-backdrop', { onclick: closeModal });
  const saveButton = el('button.ekko-btn.ekko-btn--primary.ekko-btn--md', {}, saveLabel);

  const panel = el('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: { maxWidth: `${width}px` } }, [
    el('div.modal__head', {}, [
      el('h2', {}, title),
      el('button.iconbtn', { onclick: closeModal, 'aria-label': 'Đóng' }, uiIcon('cancel-01', 20)),
    ]),
    el('div.modal__body', {}, rows.map((row) => el(
      `div.formrow${row.length > 1 ? `.formrow--${row.length}` : ''}`,
      {},
      row.map((f) => f.node ?? f),
    ))),
    el('div.modal__foot', {}, [
      el('button.ekko-btn.ekko-btn--secondary.ekko-btn--md', { onclick: closeModal }, 'Hủy'),
      saveButton,
    ]),
  ]);

  saveButton.addEventListener('click', async () => {
    saveButton.disabled = true;
    try {
      if (await onSave() !== false) closeModal();
    } finally {
      saveButton.disabled = false;
    }
  });

  document.body.append(backdrop, panel);
  document.body.style.overflow = 'hidden';
  openModal = { backdrop, panel };
  panel.querySelector('input:not([type="file"]), textarea, select')?.focus();
  return panel;
}

/**
 * Tab strip for a dialog. `panels` is [[label, node], ...]; a single panel gets
 * no strip at all, so a one-subject dialog stays plain.
 */
export function tabbed(panels) {
  const live = panels.filter(([, node]) => node);
  if (live.length <= 1) return live[0]?.[1] ?? el('div');

  const bodies = live.map(([, node], i) => el('div', { hidden: i > 0 ? true : null }, [node]));
  const strip = el('div.dialogtabs', { role: 'tablist' }, live.map(([label], i) => el('button', {
    type: 'button',
    role: 'tab',
    'aria-selected': String(i === 0),
    onclick: () => {
      [...strip.children].forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
      bodies.forEach((b, j) => { b.hidden = j !== i; });
    },
  }, label)));

  return el('div', {}, [strip, ...bodies]);
}

export function closeModal() {
  if (!openModal) return;
  openModal.backdrop.remove();
  openModal.panel.remove();
  openModal = null;
  document.body.style.overflow = '';
}

/**
 * Small square icon action for the edit / delete columns. `name` is an id from
 * the Ekko icon sprite, so these are real line icons inheriting currentColor
 * rather than emoji glyphs that ignore the theme.
 */
export function iconAction(name, { label, tone = '', onclick }) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `/shared/icons-core.svg#${name}`);
  svg.append(use);

  return el(
    `button.iconaction${tone ? `.iconaction--${tone}` : ''}`,
    { type: 'button', title: label, 'aria-label': label, onclick },
    [svg],
  );
}

// --- toasts --------------------------------------------------------------
let toastHost = null;

export function notify(message, tone = 'info') {
  if (!toastHost) {
    toastHost = el('div.toasts', { role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const node = el(`div.atoast.atoast--${tone}`, {}, message);
  toastHost.append(node);
  setTimeout(() => node.remove(), 3200);
}

/**
 * Hộp xác nhận trước khi xoá. Tự vẽ trong trang thay vì `window.confirm`: hộp
 * thoại gốc của trình duyệt bị chặn im lặng trong khung nhúng (khung xem trước,
 * trình duyệt trong app) và luôn trả về "không", làm mọi nút Xoá không chạy.
 * Không dùng chung `modal()` để không đóng hộp thoại đang mở bên dưới.
 * @returns {Promise<boolean>} true khi người dùng bấm Xoá
 */
export function confirmAction(message, { confirmLabel = 'Xoá', title = 'Xác nhận xoá' } = {}) {
  return new Promise((resolve) => {
    const cancelButton = el('button.ekko-btn.ekko-btn--secondary.ekko-btn--md', { type: 'button' }, 'Hủy');
    const okButton = el('button.ekko-btn.ekko-btn--primary.ekko-btn--md.confirm__ok', { type: 'button' }, confirmLabel);
    const backdrop = el('div.modal-backdrop.confirm-backdrop');
    const panel = el('div.modal.confirm', { role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title }, [
      el('div.modal__head', {}, [el('h2', {}, title)]),
      el('div.modal__body', {}, [el('p.confirm__text', {}, message)]),
      el('div.modal__foot', {}, [cancelButton, okButton]),
    ]);

    const done = (answer) => {
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      panel.remove();
      resolve(answer);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); done(false); }
    };
    backdrop.addEventListener('click', () => done(false));
    cancelButton.addEventListener('click', () => done(false));
    okButton.addEventListener('click', () => done(true));
    document.addEventListener('keydown', onKey, true);

    document.body.append(backdrop, panel);
    // Tiêu điểm vào "Hủy": lỡ nhấn Enter cũng không xoá mất dữ liệu.
    cancelButton.focus();
  });
}

// --- table ---------------------------------------------------------------
export function table(columns, rows, renderRow) {
  if (!rows.length) return el('div.empty-state', {}, 'Chưa có dữ liệu nào.');
  return el('div.ekko-table-wrap', {}, [
    el('table.ekko-table', {}, [
      el('thead', {}, [el('tr', {}, columns.map((c) => el('th', { class: c.align === 'right' ? 'num' : null }, c.label)))]),
      el('tbody', {}, rows.map(renderRow)),
    ]),
  ]);
}

export const badge = (text, tone = 'neutral') => el(`span.ekko-badge.ekko-badge--${tone}.ekko-badge--sm`, {}, text);
