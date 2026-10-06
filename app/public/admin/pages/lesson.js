/**
 * Lesson editor, opened as a modal from a module card.
 *
 * Một bài học là **một danh sách trang có thứ tự**, trộn ba loại tuỳ ý:
 *   text_image  - trang chữ kèm ảnh
 *   interactive - ảnh có các điểm chạm để mở nội dung
 *   slide       - ảnh toàn trang, tỉ lệ 1 : 1,371
 *
 * Trước đây có hai tab "Văn bản" / "Slide ảnh" và mỗi tab chỉ thấy một phần các
 * trang. Nhưng người học luôn xem theo đúng một mạch từ trang 1 đến trang cuối,
 * nên chia tab làm người soạn không thấy được thứ tự thật. Giờ chỉ còn một danh
 * sách, ba nút thêm nằm cạnh nhau.
 */
import { el, mount, renderText } from '/shared/client.js';
import { assetField, confirmAction, iconAction, modal, numberField, selectField, textAreaField, textField } from '../ui.js';

const MAX_SLIDE_BYTES = 1_500_000;
const ACCEPTED = 'image/png,image/jpeg,image/webp';

export async function openLessonModal(ctx, lesson, module) {
  const isNew = !lesson;
  const frames = isNew ? [] : await ctx.api.get(`/api/admin/frames?lesson_id=${lesson.id}`);

  const order = numberField({ label: 'Thứ tự', value: lesson?.order_index ?? (module.lessons.length + 1), required: true });
  const minutes = numberField({ label: 'Thời lượng', value: lesson?.est_minutes ?? 5, hint: 'Số phút ước tính' });
  const title = textField({ label: 'Tiêu đề', value: lesson?.title, required: true });

  const body = el('div');

  // Frames are edited live against the API, so a new lesson must exist first.
  const requireSaved = () => {
    if (!isNew) return true;
    ctx.notify('Lưu bài học trước đã, rồi thêm nội dung.', 'error');
    return false;
  };

  const reloadFrames = async () => {
    const fresh = await ctx.api.get(`/api/admin/frames?lesson_id=${lesson.id}`);
    frames.length = 0;
    frames.push(...fresh);
    draw();
  };

  function draw() {
    mount(body, contentPages(ctx, { lesson, frames, isNew, requireSaved, reloadFrames }));
  }
  draw();

  modal({
    title: isNew ? `Thêm bài học vào "${module.title}"` : 'Sửa bài học',
    width: 960,
    rows: [
      // XP của bài học là một mức chung, đặt ở trang Chức năng → XP học tập.
      [order, minutes],
      [title],
      [body],
    ],
    onSave: async () => {
      const payload = {
        module_id: module.id,
        order_index: order.get(),
        est_minutes: minutes.get(),
        title: title.get().trim(),
        // Không còn ô chọn kiểu nội dung: kiểu là hệ quả của các trang đang có.
        // Bài học chỉ gồm slide thì là "slides", còn lại là "text".
        content_type: deriveContentType(frames),
      };
      if (!payload.title) { ctx.notify('Cần nhập tiêu đề bài học', 'error'); return false; }
      payload.slug = slugify(payload.title);

      try {
        if (isNew) await ctx.api.post('/api/admin/lessons', payload);
        else await ctx.api.patch(`/api/admin/lessons/${lesson.id}`, payload);
        ctx.notify('Đã lưu bài học', 'success');
        await ctx.reload();
      } catch (err) { ctx.notify(err.message, 'error'); return false; }
      return true;
    },
  });
}

const slugify = (text) => String(text || '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Không đọc được tệp'));
  reader.readAsDataURL(file);
});

// ------------------------------------------------------------------- pages
const PAGE_LABEL = { text_image: 'Chữ + hình', interactive: 'Hình tương tác', slide: 'Slide ảnh' };

/** Những màn trong app mà nút hành động trên slide được phép mở tới. */
const CTA_ROUTES = [
  ['/goals', 'Mục tiêu'],
  ['/budget', 'Ngân sách'],
  ['/expenses', 'Ghi chép chi tiêu'],
  ['/savings', 'Tiết kiệm'],
  ['/explore', 'Học tập'],
];

/** Bài học chỉ gồm slide thì là bộ slide; trộn thêm bất cứ gì là bài văn bản. */
const deriveContentType = (frames) => (
  frames.length && frames.every((f) => f.kind === 'slide') ? 'slides' : 'text'
);

function contentPages(ctx, { lesson, frames, isNew, requireSaved, reloadFrames }) {
  const move = async (index, delta) => {
    const reordered = [...frames];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(index + delta, 0, moved);
    await ctx.api.post('/api/admin/frames/reorder', { ids: reordered.map((f) => f.id) });
    await reloadFrames();
  };

  const remove = async (frame, index) => {
    if (!await confirmAction(`Xoá trang #${index + 1}?`)) return;
    await ctx.api.delete(`/api/admin/frames/${frame.id}`);
    await reloadFrames();
  };

  const meta = (frame) => {
    if (frame.kind === 'interactive') return `${PAGE_LABEL.interactive} · ${(frame.payload.hotspots || []).length} điểm`;
    if (frame.kind === 'slide') return `${PAGE_LABEL.slide} · tỉ lệ 1:1,371`;
    return `${PAGE_LABEL.text_image} · ${(frame.payload.body || '').length} ký tự`;
  };

  const label = (frame) => frame.payload.title
    || frame.payload.caption
    || (frame.kind === 'slide' ? 'Slide không có chú thích' : '(chưa có tiêu đề)');

  // Tải nhiều slide một lượt: một bộ slide thường được xuất ra hàng loạt ảnh.
  const file = el('input', { type: 'file', accept: ACCEPTED, multiple: true, style: { display: 'none' } });
  const addSlides = el('button.ekko-btn.ekko-btn--secondary.ekko-btn--md', {
    type: 'button',
    onclick: () => { if (requireSaved()) file.click(); },
  }, ['+', ' Thêm slide ảnh']);

  file.addEventListener('change', async () => {
    const picked = [...(file.files || [])];
    file.value = '';
    if (!picked.length) return;

    addSlides.disabled = true;
    let next = Math.max(0, ...frames.map((f) => f.order_index));
    try {
      for (const image of picked) {
        if (image.size > MAX_SLIDE_BYTES) {
          ctx.notify(`"${image.name}" vượt quá 1,5 MB, hãy nén lại.`, 'error');
          continue;
        }
        const uploaded = await ctx.uploader({ filename: image.name, dataUrl: await readAsDataUrl(image) });
        next += 1;
        await ctx.api.post('/api/admin/frames', {
          lesson_id: lesson.id,
          order_index: next,
          kind: 'slide',
          payload: { image: uploaded.url, alt: '' },
        });
      }
      await reloadFrames();
    } catch (err) {
      ctx.notify(err.message || 'Tải slide lên không thành công', 'error');
    } finally {
      addSlides.disabled = false;
    }
  });

  return el('div.ekko-field', {}, [
    el('span.ekko-field__label', {}, 'Các trang nội dung'),
    el('span.ekko-field__hint', { style: { display: 'block', marginBottom: '8px' } },
      'Người học xem lần lượt từ trên xuống. Trộn trang chữ, hình tương tác và slide ảnh tuỳ ý.'),

    isNew
      ? el('p.hint', {}, 'Lưu bài học trước, rồi mở lại để thêm trang.')
      : el('div.pagelist', {}, frames.length
        ? frames.map((frame, index) => el('div.pagerow', {}, [
          el('span.pagerow__num', {}, String(index + 1)),
          el('div.pagerow__main', {}, [
            el('div.pagerow__title', {}, label(frame)),
            el('span.cellmeta', {}, meta(frame)),
          ]),
          frame.payload.image ? el('img.thumb', { src: frame.payload.image, alt: '', loading: 'lazy' }) : null,
          el('div.actions', {}, [
            index > 0 ? iconAction('arrow-up-02-stroke', { label: 'Lên trước', onclick: () => move(index, -1) }) : null,
            index < frames.length - 1 ? iconAction('arrow-down-02-stroke', { label: 'Xuống sau', onclick: () => move(index, 1) }) : null,
            iconAction('edit-02-stroke', { label: 'Sửa trang', onclick: () => editPage(ctx, frame, lesson, frames, reloadFrames) }),
            iconAction('delete-02-stroke', { label: 'Xoá trang', tone: 'danger', onclick: () => remove(frame, index) }),
          ]),
        ]))
        : [el('p.hint', {}, 'Chưa có trang nào.')]),

    el('div', { style: { display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' } }, [
      el('button.ekko-btn.ekko-btn--secondary.ekko-btn--md', {
        type: 'button',
        onclick: () => { if (requireSaved()) editPage(ctx, null, lesson, frames, reloadFrames, 'text_image'); },
      }, ['+', ' Thêm trang chữ']),
      el('button.ekko-btn.ekko-btn--secondary.ekko-btn--md', {
        type: 'button',
        onclick: () => { if (requireSaved()) editPage(ctx, null, lesson, frames, reloadFrames, 'interactive'); },
      }, ['+', ' Thêm hình tương tác']),
      addSlides,
      file,
    ]),
  ]);
}

/** Một trang: chữ + hình, hình tương tác, hoặc một slide ảnh. */
function editPage(ctx, frame, lesson, frames, reloadFrames, forcedKind) {
  const isNew = !frame;
  const kind = frame?.kind || forcedKind || 'text_image';
  const payload = frame?.payload ?? {};

  const title = textField({ label: 'Tiêu đề', value: payload.title });
  const image = assetField({ label: 'Ảnh', value: payload.image, uploader: ctx.uploader });
  // Slide không có tiêu đề: nó là một ảnh toàn trang.
  const rows = kind === 'slide' ? [] : [[title]];
  let read;

  if (kind === 'slide') {
    const slide = assetField({
      label: 'Ảnh slide',
      value: payload.image,
      uploader: ctx.uploader,
      hint: 'Tỉ lệ 1:1,371 (ví dụ 1080 × 1481). Ảnh lệch tỉ lệ sẽ được kẻ viền hai bên chứ không bị cắt.',
    });
    const caption = textField({ label: 'Chú thích dưới slide', value: payload.caption });
    const alt = textField({ label: 'Mô tả ảnh', value: payload.alt, hint: 'Dành cho trình đọc màn hình' });
    // Nút hành động (tuỳ chọn) nằm trên đáy slide: dẫn người học sang chức năng
    // thật để thực hành. Ở slide cuối, bấm nút là hoàn thành bài luôn.
    const ctaLabel = textField({ label: 'Nút hành động', value: payload.cta?.label, placeholder: 'VD: Tạo mục tiêu ngay', hint: 'Để trống nếu slide không có nút. Nhớ chừa khoảng trống ở đáy ảnh slide.' });
    const ctaRoute = selectField({ label: 'Nút mở tới', value: payload.cta?.route || '/goals', options: CTA_ROUTES });

    rows.push([slide], [caption], [alt], [ctaLabel, ctaRoute]);
    read = () => {
      const label = ctaLabel.get().trim();
      return {
        image: slide.get(), caption: caption.get(), alt: alt.get(),
        ...(label ? { cta: { label, route: ctaRoute.get() } } : {}),
      };
    };
  } else if (kind === 'interactive') {
    const intro = textAreaField({ label: 'Câu dẫn', value: payload.intro, rows: 2 });
    const spots = [];
    const list = el('div.hotspot-editor');

    const addSpot = (spot = { x: 50, y: 50, label: '', text: '' }) => {
      const x = el('input', { type: 'number', min: '0', max: '100', value: String(spot.x), title: 'X (%)' });
      const y = el('input', { type: 'number', min: '0', max: '100', value: String(spot.y), title: 'Y (%)' });
      const label = el('input', { type: 'text', value: spot.label, placeholder: 'Nhãn' });
      const text = el('textarea', { placeholder: 'Nội dung hiện ra khi chạm' }, spot.text || '');
      const row = el('div.hotspot-editor__row', {}, [
        x, y,
        el('div', { style: { display: 'grid', gap: '6px' } }, [label, text]),
        iconAction('delete-02-stroke', {
          label: 'Bỏ điểm',
          tone: 'danger',
          onclick: () => { row.remove(); spots.splice(spots.indexOf(entry), 1); },
        }),
      ]);
      const entry = { read: () => ({ x: Number(x.value), y: Number(y.value), label: label.value, text: text.value }) };
      spots.push(entry);
      list.append(row);
    };

    (payload.hotspots || []).forEach(addSpot);
    if (!spots.length) addSpot();

    rows.push([intro], [image], [el('div.ekko-field', {}, [
      el('span.ekko-field__label', {}, 'Điểm tương tác'),
      el('span.ekko-field__hint', { style: { display: 'block', marginBottom: '8px' } },
        'X và Y tính theo phần trăm ảnh, nên đổi ảnh không làm lệch điểm.'),
      list,
      el('button.ekko-btn.ekko-btn--secondary.ekko-btn--sm', { type: 'button', onclick: () => addSpot() }, '+ Thêm điểm'),
    ])]);

    read = () => ({
      title: title.get(), intro: intro.get(), image: image.get(), alt: title.get(),
      hotspots: spots.map((s) => s.read()).filter((h) => h.label || h.text),
    });
  } else {
    const text = textAreaField({
      label: 'Nội dung', value: payload.body, rows: 10,
      hint: 'Dòng trống tách đoạn. **đậm**, "- " cho gạch đầu dòng, "> " cho trích dẫn.',
    });
    const caption = textField({ label: 'Chú thích dưới ảnh', value: payload.caption });
    const preview = el('div.panel', { style: { background: 'var(--bg-secondary)' } });
    const refresh = () => mount(preview, el('div', { html: renderText(text.get()) }));
    text.input.addEventListener('input', refresh);
    refresh();

    rows.push(
      [text],
      [el('div', {}, [el('span.ekko-field__label', {}, 'Xem trước'), preview])],
      [image],
      [caption],
    );
    read = () => ({ title: title.get(), body: text.get(), image: image.get(), imageAlt: title.get(), caption: caption.get() });
  }

  const KIND_LABEL = { interactive: 'hình tương tác', slide: 'slide ảnh', text_image: 'trang chữ' };

  modal({
    title: `${isNew ? 'Thêm' : 'Sửa'} ${KIND_LABEL[kind] || 'trang'}`,
    width: 820,
    rows,
    onSave: async () => {
      const nextPayload = read();
      if (kind === 'text_image' && !String(nextPayload.body || '').trim()) {
        ctx.notify('Trang chữ cần có nội dung', 'error');
        return false;
      }
      if (kind === 'slide' && !nextPayload.image) {
        ctx.notify('Slide cần một ảnh', 'error');
        return false;
      }
      if (kind === 'interactive') {
        if (!nextPayload.image) { ctx.notify('Hình tương tác cần một ảnh nền', 'error'); return false; }
        if (!nextPayload.hotspots.length) { ctx.notify('Cần ít nhất một điểm tương tác', 'error'); return false; }
      }

      const request = {
        lesson_id: lesson.id,
        kind,
        order_index: frame?.order_index ?? (Math.max(0, ...frames.map((f) => f.order_index)) + 1),
        payload: nextPayload,
      };
      try {
        if (isNew) await ctx.api.post('/api/admin/frames', request);
        else await ctx.api.patch(`/api/admin/frames/${frame.id}`, request);
        ctx.notify('Đã lưu trang', 'success');
        await reloadFrames();
      } catch (err) { ctx.notify(err.message, 'error'); return false; }
      return true;
    },
  });
}

/** Lessons no longer have their own page; the old route just bounces back. */
export default async function lessonPage(ctx) {
  ctx.navigate('/content');
  return el('div.empty-state', {}, 'Đang chuyển tới Mô-đun học tập…');
}
