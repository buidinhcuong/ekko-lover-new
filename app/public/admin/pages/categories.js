/**
 * Nhóm chi tiêu, as a panel rather than a page: it lives inside the edit dialog
 * of the "Ghi chép chi tiêu" feature, because that is the only place the groups
 * mean anything.
 *
 * Rows edit in place. A nested modal would have to close the feature dialog it
 * was opened from, so expanding the row is the only sane option here.
 *
 * `keywords` is the column that lets Ekko bot turn "cà phê 35k" into the right
 * group, which is why it gets the most room.
 */
import { el, mount } from '/shared/client.js';
import { cellIcon, confirmAction, iconAction, iconPicker } from '../ui.js';

/**
 * `<input type="color">` chỉ nhận một mã hex thật, không nhận `var(--token)`, nên đọc
 * giá trị token lúc chạy. Đổi màu thương hiệu trong design system thì màu mặc
 * định của nhóm mới đổi theo, không phải sửa ở đây.
 */
const brandHex = () => getComputedStyle(document.documentElement).getPropertyValue('--ekko-payday-blue').trim();

/** Ba nhóm level 1 cố định — xem `CATEGORY_GROUPS` ở server/seed/catalogue.js. */
const GROUPS = [['needs', 'Nhu cầu'], ['wants', 'Mong muốn'], ['incident', 'Sự cố']];
const groupLabel = (code) => GROUPS.find(([c]) => c === code)?.[1] || code;

const EMPTY = { code: '', name: '', icon: 'package', color: '', keywords: '', group_code: 'needs', daily_limit: null, order_index: null };

const vnd = (amount) => `${Number(amount).toLocaleString('vi-VN')}đ`;

export function categoriesPanel(ctx) {
  const host = el('div.catpanel');
  let rows = [];
  let editing = null;   // category id, or 'new'

  async function load() {
    rows = await ctx.api.get('/api/admin/categories');
    draw();
  }

  function draw() {
    mount(host, [
      el('p.hint', { style: { marginBottom: '12px' } },
        'Dùng chung cho Lập ngân sách và Ghi chép chi tiêu. Danh sách từ khoá quyết định Ekko bot xếp một câu như "cà phê 35k" vào nhóm nào.'),

      ...rows.map((row) => (editing === row.id ? form(row) : summary(row))),

      editing === 'new'
        ? form({ ...EMPTY, order_index: Math.max(0, ...rows.map((r) => r.order_index)) + 1 })
        : el('button.ekko-btn.ekko-btn--secondary.ekko-btn--md', {
          type: 'button',
          style: { marginTop: '12px' },
          onclick: () => { editing = 'new'; draw(); },
        }, ['+', ' Thêm nhóm']),
    ]);
  }

  function summary(row) {
    return el('div.catrow', {}, [
      el('span.catrow__icon', {}, cellIcon(row.icon, 'package')),
      el('div.catrow__main', {}, [
        el('div.catrow__name', {}, [
          el('i.catrow__swatch', { style: { background: row.color || 'var(--bg-grey-500)' } }),
          row.name,
          el('code', {}, row.code),
          row.group_code ? el('span.ekko-badge.ekko-badge--sm.ekko-badge--neutral', {}, groupLabel(row.group_code)) : null,
        ]),
        el('div.catrow__keywords', {}, row.keywords || '(chưa có từ khoá)'),
        el('div.catrow__limit', {}, row.daily_limit > 0
          ? `Cảnh báo khi một khoản vượt ${vnd(row.daily_limit)}`
          : 'Không cảnh báo theo ngưỡng'),
      ]),
      el('div.actions', {}, [
        iconAction('edit-02-stroke', { label: `Sửa ${row.name}`, onclick: () => { editing = row.id; draw(); } }),
        iconAction('delete-02-stroke', { label: `Xoá ${row.name}`, tone: 'danger', onclick: () => remove(row) }),
      ]),
    ]);
  }

  function form(row) {
    const isNew = !row.id;

    const name = el('input.optioninput', { type: 'text', value: row.name, placeholder: 'Tên nhóm' });
    const icon = iconPicker({ value: row.icon, fallback: 'package', label: 'Biểu tượng nhóm' });
    const color = el('input', { type: 'color', value: row.color || brandHex(), class: 'catrow__color' });
    const code = el('input.optioninput', {
      type: 'text', value: row.code, placeholder: 'ma_nhom',
      disabled: isNew ? null : true,
      title: isNew ? '' : 'Mã không đổi được vì dữ liệu cũ tham chiếu tới nó',
    });
    const group = el('select.optioninput', {}, GROUPS.map(([value, label]) => el('option', {
      value, selected: (row.group_code || 'needs') === value ? true : null,
    }, label)));
    const keywords = el('textarea.optioninput', { rows: 3, placeholder: 'cà phê, ăn trưa, quán, ship đồ ăn' }, row.keywords || '');
    const limit = el('input.optioninput', {
      type: 'number', min: '0', step: '50000', placeholder: 'Để trống = không cảnh báo',
      value: row.daily_limit > 0 ? String(row.daily_limit) : '',
    });

    const save = el('button.ekko-btn.ekko-btn--primary.ekko-btn--sm', { type: 'button' }, 'Lưu');
    save.addEventListener('click', async () => {
      const body = {
        name: name.value.trim(),
        icon: icon.get(),
        color: color.value,
        keywords: keywords.value.trim(),
        group_code: group.value,
        group_label: groupLabel(group.value),
        daily_limit: limit.value.trim() === '' ? null : Math.max(0, Number(limit.value)) || null,
        order_index: row.order_index,
      };
      if (!body.name) return ctx.notify('Cần nhập tên nhóm', 'error');

      if (isNew) {
        body.code = code.value.trim();
        if (!/^[a-z0-9_]+$/.test(body.code)) return ctx.notify('Mã nhóm chỉ gồm chữ thường, số và dấu gạch dưới', 'error');
      }

      save.disabled = true;
      try {
        if (isNew) await ctx.api.post('/api/admin/categories', body);
        else await ctx.api.patch(`/api/admin/categories/${row.id}`, body);
        ctx.notify('Đã lưu nhóm chi tiêu', 'success');
        editing = null;
        await load();
      } catch (err) {
        ctx.notify(err.message, 'error');
        save.disabled = false;
      }
      return undefined;
    });

    return el('div.catrow.catrow--editing', {}, [
      el('div.catrow__grid', {}, [
        field('Biểu tượng', icon.node),
        field('Tên nhóm', name),
        field('Màu', color),
        field('Mã', code),
      ]),
      field('Nhóm level 1', group),
      field('Từ khoá cho Ekko bot', keywords),
      field('Ngưỡng cảnh báo cho một khoản (VNĐ)', limit),
      el('p.hint', { style: { margin: '-4px 0 0' } },
        'Ghi một khoản vượt ngưỡng này sẽ hiện cảnh báo cho người học — dùng cho các nhóm chi thường ngày, nơi số quá lớn thường là gõ nhầm. Để trống với các nhóm vốn đã lớn như tiền nhà hay học phí.'),
      el('div.catrow__foot', {}, [
        el('button.ekko-btn.ekko-btn--secondary.ekko-btn--sm', {
          type: 'button',
          onclick: () => { editing = null; draw(); },
        }, 'Huỷ'),
        save,
      ]),
    ]);
  }

  async function remove(row) {
    if (!await confirmAction(`Xoá nhóm "${row.name}"? Chỉ xoá được khi chưa có khoản chi hay dòng ngân sách nào dùng nhóm này.`)) return;
    try {
      await ctx.api.delete(`/api/admin/categories/${row.id}`);
      ctx.notify('Đã xoá nhóm');
      await load();
    } catch {
      ctx.notify('Không xoá được vì đang có dữ liệu tham chiếu tới nhóm này.', 'error');
    }
  }

  mount(host, el('p.hint', {}, 'Đang tải…'));
  load();
  return host;
}

const field = (label, control) => el('label.catfield', {}, [
  el('span', {}, label),
  control,
]);

/** The standalone page is gone; anyone with the old link lands on the feature. */
export default async function categoriesPage(ctx) {
  ctx.navigate('/features');
  return el('div.empty-state', {}, 'Nhóm chi tiêu giờ nằm trong phần Sửa của Ghi chép chi tiêu…');
}
