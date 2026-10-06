/**
 * Concept giao diện của màn Khám phá.
 *
 * Mỗi concept là một cách kể chuyện cho cùng một lộ trình học. Chỉ **một**
 * concept được bật tại một thời điểm, nên đây là một lựa chọn đơn (radio), không
 * phải danh sách bật/tắt từng cái — hai người học mở app phải thấy cùng một thế
 * giới.
 *
 * Đổi concept không đụng tới nội dung hay tiến độ: cùng thứ tự bài, cùng luật mở
 * khoá, cùng số bài đã học.
 */
import { el, mount } from '/shared/client.js';

/**
 * Ảnh xem trước dựng lại bằng chính bố cục màn chủ thật, không phải ảnh chụp:
 * thanh hồ sơ heo, hàng 5 nút chức năng tròn, rồi mấy thẻ số liệu. Bản Colors
 * khác đúng ở chỗ màn thật khác: nền chuyển sắc và mỗi nút một màu.
 */
const loverPreview = (variant) => () => el(`div.cpreview.cpreview--lover${variant ? `.cpreview--${variant}` : ''}`, {}, [
  el('span.cpreview__profile', {}, [el('i.cpreview__avatar')]),
  el('span.cpreview__tabs', {}, ['explore', 'goals', 'budget', 'expenses', 'savings']
    .map((tone) => el('i.cpreview__tab', { dataset: { tone } }))),
  el('span.cpreview__card'),
  el('span.cpreview__card.cpreview__card--short'),
]);

/** Simple mode: lời chào, nút "Nói để ghi" to, rồi danh sách chức năng hàng to. */
const simplePreview = () => el('div.cpreview.cpreview--simple', {}, [
  el('span.cpreview__hello', {}, [el('i.cpreview__avatar')]),
  el('span.cpreview__voice', {}, [el('i.cpreview__mic')]),
  el('span.cpreview__row'),
  el('span.cpreview__row'),
]);

const PREVIEW = {
  lover: loverPreview(''),
  'lover-colors': loverPreview('colors'),
  simple: simplePreview,
};

export default async function conceptsPage(ctx) {
  const host = el('div');

  async function load() {
    const concepts = await ctx.api.get('/api/admin/concepts');
    draw(concepts);
  }

  async function activate(code) {
    try {
      draw(await ctx.api.put('/api/admin/concepts/active', { code }));
      ctx.notify('Đã đổi concept cho màn Khám phá', 'success');
    } catch (err) {
      ctx.notify(err.message, 'error');
    }
  }

  function draw(concepts) {
    mount(host, [
      el('div.page-head', {}, [
        el('div', {}, [
          el('h1', {}, 'Concept'),
          el('p', {}, 'Cách kể chuyện của màn Khám phá. Chỉ một concept được bật tại một thời điểm; đổi concept không ảnh hưởng nội dung bài học hay tiến độ của người học.'),
        ]),
      ]),

      el('div.cgrid', {}, concepts.map((concept) => el('div.ccard', { dataset: { active: String(concept.active) } }, [
        (PREVIEW[concept.code] || PREVIEW.lover)(),

        el('div.ccard__body', {}, [
          el('div.ccard__head', {}, [
            el('span.ccard__index', {}, `Concept ${concept.order_index}`),
            concept.active ? el('span.ekko-badge.ekko-badge--success', {}, 'Đang bật') : null,
          ]),
          el('h2', {}, concept.name),
          el('p.ccard__tagline', {}, concept.tagline),
          el('p.hint', {}, concept.description),
          el('ul.ccard__list', {}, concept.highlights.map((line) => el('li', {}, line))),
        ]),

        el('div.ccard__foot', {}, [
          concept.active
            ? el('span.hint', {}, 'Người học đang thấy concept này.')
            : el('button.ekko-btn.ekko-btn--primary.ekko-btn--md', {
              type: 'button',
              onclick: () => activate(concept.code),
            }, 'Bật concept này'),
        ]),
      ]))),

      el('p.hint', { style: { marginTop: 'var(--spacing-16)' } },
        'Người học đang mở app cần tải lại màn Khám phá để thấy concept mới.'),
    ]);
  }

  mount(host, el('p.hint', {}, 'Đang tải…'));
  load();
  return host;
}
