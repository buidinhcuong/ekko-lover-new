/**
 * Mô-đun học tập.
 *
 * One expandable card per module. Expanded, it shows the module's lessons and
 * its end-of-module quiz, so the whole shape of a module is visible in one place
 * instead of behind a separate page.
 */
import { el, uiIcon } from '/shared/client.js';
import { cellIcon, confirmAction, iconAction, iconField, modal, numberField, selectField, statusToggle, textAreaField, textField } from '../ui.js';
import { openLessonModal } from './lesson.js';

/** Which cards are open survives a re-render, so saving does not collapse them. */
const expanded = new Set();

export default async function content(ctx) {
  const tree = await ctx.api.get('/api/admin/content/tree');

  return el('div', {}, [
    el('div.page-head', {}, [
      el('div', {}, [
        el('h1', {}, 'Mô-đun học tập'),
        el('p', {}, `${tree.length} mục`),
      ]),
      el('div.page-head__actions', {}, [
        el('button.ekko-btn.ekko-btn--primary.ekko-btn--md', { onclick: () => editModule(ctx, null, tree) }, ['+', ' Thêm mới']),
      ]),
    ]),

    el('div.modlist', {}, tree.map((module) => moduleCard(ctx, module, tree))),
  ]);
}

function moduleCard(ctx, module, tree) {
  const isOpen = expanded.has(module.id);

  const head = el('div.modcard__head', {}, [
    el('span.modcard__emoji', {}, cellIcon(module.emoji, 'books-01')),
    el('div.modcard__text', {}, [
      el('div.modcard__eyebrow', {}, `Mô-đun ${module.order_index}`),
      el('div.modcard__title', {}, module.title),
      module.summary ? el('div.modcard__summary', {}, module.summary) : null,
    ]),
    statusToggle(ctx, {
      entity: 'modules', id: module.id, field: 'is_published', value: module.is_published,
      on: 'Đã xuất bản', off: 'Bản nháp', name: module.title,
    }),
    iconAction(isOpen ? 'chevron-up-01-stroke' : 'chevron-down-01-stroke', {
      label: isOpen ? 'Thu gọn' : 'Mở rộng',
      onclick: () => {
        if (isOpen) expanded.delete(module.id);
        else expanded.add(module.id);
        ctx.reload();
      },
    }),
    iconAction('edit-02-stroke', { label: `Sửa ${module.title}`, onclick: () => editModule(ctx, module, tree) }),
    iconAction('delete-02-stroke', { label: `Xoá ${module.title}`, tone: 'danger', onclick: () => removeModule(ctx, module) }),
  ]);

  return el(`div.modcard${isOpen ? '.is-open' : ''}`, {}, [
    head,
    isOpen ? el('div.modcard__body', {}, [lessonsSection(ctx, module), quizSection(ctx, module)]) : null,
  ]);
}

// ------------------------------------------------------------------ lessons
function lessonsSection(ctx, module) {
  return el('div.modsection', {}, [
    el('div.modsection__head', {}, [
      el('span.modsection__icon', {}, uiIcon('book-open-01', 20)),
      el('h3', {}, 'Bài học'),
    ]),

    module.lessons.length
      ? el('div.ekko-table-wrap', {}, [
        el('table.ekko-table', {}, [
          el('thead', {}, [el('tr', {}, [
            el('th', {}, '#'),
            el('th', {}, 'Tiêu đề'),
            el('th', {}, 'Thời lượng'),
            el('th', {}, 'Trạng thái'),
            el('th', {}, ''),
          ])]),
          el('tbody', {}, module.lessons.map((lesson) => el('tr', {}, [
            el('td', {}, String(lesson.order_index)),
            el('td', {}, [
              lesson.title,
              // Một bài học trộn được cả ba loại trang, nên nhãn nói thành phần
              // thật thay vì gán nhãn "Văn bản" hay "Slide ảnh" cho cả bài.
              el('span.cellmeta', {}, [
                `${lesson.frameCount} trang`,
                lesson.slideCount ? ` · ${lesson.slideCount} slide ảnh` : '',
              ].join('')),
            ]),
            el('td', {}, String(lesson.est_minutes)),
            el('td', {}, [statusToggle(ctx, {
              entity: 'lessons', id: lesson.id, field: 'is_published', value: lesson.is_published,
              on: 'Đã xuất bản', off: 'Bản nháp', name: lesson.title,
            })]),
            el('td', {}, [el('div.actions', {}, [
              iconAction('edit-02-stroke', {
                label: `Sửa ${lesson.title}`,
                onclick: () => openLessonModal(ctx, lesson, module),
              }),
              iconAction('delete-02-stroke', {
                label: `Xoá ${lesson.title}`,
                tone: 'danger',
                onclick: () => removeLesson(ctx, lesson),
              }),
            ])]),
          ]))),
        ]),
      ])
      : el('p.hint', {}, 'Mô-đun này chưa có bài học nào.'),

    el('button.ekko-btn.ekko-btn--secondary.ekko-btn--md.modsection__add', {
      onclick: () => openLessonModal(ctx, null, module),
    }, ['+', ' Thêm bài học']),
  ]);
}

// --------------------------------------------------------------------- quiz
function quizSection(ctx, module) {
  return el('div.modsection', {}, [
    el('div.modsection__head', {}, [
      el('span.modsection__icon', {}, uiIcon('help-circle', 20)),
      el('h3', {}, 'Trắc nghiệm cuối mô-đun'),
    ]),

    ...module.questions.map((q) => el('div.qcard', {}, [
      el('div.qcard__main', {}, [
        el('div.qcard__eyebrow', {}, `Câu ${q.order_index}`),
        el('div.qcard__question', {}, q.question),
        el('ul.qcard__options', {}, (q.options || []).map((o) => el(
          `li${o.correct ? '.is-correct' : ''}`,
          {},
          o.correct ? [uiIcon('tick-02', 16), ` ${o.text}`] : o.text,
        ))),
      ]),
      el('div.actions', {}, [
        iconAction('edit-02-stroke', { label: `Sửa câu ${q.order_index}`, onclick: () => editQuestion(ctx, q, module) }),
        iconAction('delete-02-stroke', { label: `Xoá câu ${q.order_index}`, tone: 'danger', onclick: () => removeQuestion(ctx, q) }),
      ]),
    ])),

    module.questions.length ? null : el('p.hint', {}, 'Chưa có câu hỏi nào. Người học sẽ bỏ qua bước trắc nghiệm.'),

    el('button.ekko-btn.ekko-btn--secondary.ekko-btn--md.modsection__add', {
      onclick: () => editQuestion(ctx, null, module),
    }, ['+', ' Thêm câu hỏi']),
  ]);
}

function editQuestion(ctx, row, module) {
  const isNew = !row;
  const question = textAreaField({ label: 'Câu hỏi', value: row?.question, rows: 2 });
  const order = numberField({ label: 'Số thứ tự', value: row?.order_index ?? (module.questions.length + 1) });

  const entries = [];
  const list = el('div');

  const addOption = (option = { text: '', correct: false, explain: '' }) => {
    const radio = el('input', { type: 'radio', name: 'mq-correct', checked: option.correct ? true : null });
    const text = el('input.optioninput', { type: 'text', value: option.text, placeholder: 'Nội dung lựa chọn' });
    const explain = el('input.optioninput', { type: 'text', value: option.explain || '', placeholder: 'Giải thích sau khi chọn (tuỳ chọn)' });

    const wrapper = el('div.optionrow', {}, [
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
        radio,
        text,
        iconAction('delete-02-stroke', {
          label: 'Bỏ lựa chọn',
          tone: 'danger',
          onclick: () => { wrapper.remove(); entries.splice(entries.indexOf(entry), 1); },
        }),
      ]),
      el('div', { style: { paddingLeft: '26px', marginTop: '6px' } }, [explain]),
    ]);

    const entry = { read: () => ({ text: text.value.trim(), correct: radio.checked, explain: explain.value.trim() }) };
    entries.push(entry);
    list.append(wrapper);
  };

  (row?.options || []).forEach(addOption);
  while (entries.length < 2) addOption();

  const options = el('div.ekko-field', {}, [
    el('span.ekko-field__label', {}, 'Lựa chọn'),
    el('span.ekko-field__hint', { style: { display: 'block', marginBottom: '8px' } }, 'Chọn nút tròn ở đáp án đúng.'),
    list,
    el('button.ekko-btn.ekko-btn--secondary.ekko-btn--sm', { type: 'button', onclick: () => addOption() }, '+ Thêm lựa chọn'),
  ]);

  modal({
    title: isNew ? 'Thêm câu hỏi' : `Sửa câu ${row.order_index}`,
    width: 720,
    rows: [[order], [question], [options]],
    onSave: async () => {
      const payload = {
        module_id: module.id,
        order_index: order.get(),
        question: question.get().trim(),
        options: entries.map((e) => e.read()).filter((o) => o.text),
      };
      if (!payload.question) { ctx.notify('Cần nhập câu hỏi', 'error'); return false; }
      try {
        if (isNew) await ctx.api.post('/api/admin/questions', payload);
        else await ctx.api.patch(`/api/admin/questions/${row.id}`, payload);
        ctx.notify('Đã lưu câu hỏi', 'success');
        await ctx.reload();
      } catch (err) { ctx.notify(err.message, 'error'); return false; }
      return true;
    },
  });
}

async function removeQuestion(ctx, q) {
  if (!await confirmAction(`Xoá câu ${q.order_index}?`)) return;
  try {
    await ctx.api.delete(`/api/admin/questions/${q.id}`);
    ctx.notify('Đã xoá câu hỏi');
    await ctx.reload();
  } catch (err) { ctx.notify(err.message, 'error'); }
}

// ------------------------------------------------------------------- module
const slugify = (text) => String(text || '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

function editModule(ctx, row, tree) {
  const isNew = !row;
  const fields = {
    order_index: numberField({ label: 'Số thứ tự', value: row?.order_index ?? (tree.length + 1), required: true }),
    emoji: iconField({ label: 'Biểu tượng', value: row?.emoji, fallback: 'books-01' }),
    title: textField({ label: 'Tên mô-đun', value: row?.title, required: true }),
    summary: textAreaField({ label: 'Mô tả ngắn', value: row?.summary, rows: 2 }),
    unlock_level: selectField({
      label: 'Mở khoá ở cấp độ', value: row?.unlock_level ?? 1,
      options: ctx.meta.levels.map((l) => [l.order_index, `Cấp ${l.order_index} — ${l.name}`]),
    }),
    slug: textField({ label: 'Slug', value: row?.slug, hint: 'Để trống sẽ tự tạo từ tên.' }),
  };

  modal({
    title: isNew ? 'Thêm mô-đun' : 'Sửa mô-đun',
    rows: [
      [fields.order_index, fields.emoji],
      [fields.title],
      [fields.summary],
      [fields.unlock_level],
      [fields.slug],
    ],
    onSave: async () => {
      const body = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.get()]));
      body.slug = slugify(body.slug || body.title);
      if (!body.title || !body.slug) { ctx.notify('Cần nhập tên mô-đun', 'error'); return false; }
      try {
        if (isNew) {
          const created = await ctx.api.post('/api/admin/modules', body);
          expanded.add(created.id);
        } else {
          await ctx.api.patch(`/api/admin/modules/${row.id}`, body);
        }
        ctx.notify('Đã lưu mô-đun', 'success');
        await ctx.reload();
      } catch (err) { ctx.notify(err.message, 'error'); return false; }
      return true;
    },
  });
}

async function removeModule(ctx, module) {
  const detail = `${module.lessons.length} bài học và ${module.questions.length} câu hỏi`;
  if (!await confirmAction(`Xoá mô-đun "${module.title}"? Toàn bộ ${detail} bên trong sẽ mất.`)) return;
  try {
    await ctx.api.delete(`/api/admin/modules/${module.id}`);
    expanded.delete(module.id);
    ctx.notify('Đã xoá mô-đun');
    await ctx.reload();
  } catch (err) { ctx.notify(err.message, 'error'); }
}

async function removeLesson(ctx, lesson) {
  if (!await confirmAction(`Xoá bài học "${lesson.title}"? Nội dung bên trong sẽ mất.`)) return;
  try {
    await ctx.api.delete(`/api/admin/lessons/${lesson.id}`);
    ctx.notify('Đã xoá bài học');
    await ctx.reload();
  } catch (err) { ctx.notify(err.message, 'error'); }
}
