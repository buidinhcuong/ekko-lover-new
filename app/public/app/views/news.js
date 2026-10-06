/**
 * Tin tức — carousel ở màn chủ của concept "Ekko Lover".
 *
 * `openNewsDetail` mở một lớp phủ toàn màn hình (giống trình phát bài học ở
 * lesson.js): ảnh lớn tràn viền phía trên, các nút nổi (quay lại / lưu / chia
 * sẻ / thêm) đè lên ảnh, rồi tới nội dung. Không có số lượt xem hay bình luận
 * giả — nội dung này do Ekko biên soạn, không phải mạng xã hội, nên không bịa
 * số liệu tương tác.
 *
 * `newsListView` là màn "Xem tất cả": tìm kiếm theo tiêu đề + lọc theo nhãn,
 * mở bằng route `/news`.
 */
import { api, el, getOverlayRoot, guard, lockScroll, mount, renderText, spriteIcon, toast, uiIcon, unlockScroll } from '/shared/client.js';
import { closeSheet, sheet } from '../ui.js';
import { t } from '../i18n.js';

let saved = new Set();   // lưu tạm trong phiên — chưa có API lưu tin ở server

export async function openNewsDetail(newsId, ctx) {
  const item = await guard(() => api.get(`/api/news/${newsId}`), t('Không mở được tin này'));
  if (!item) return;

  const isSaved = () => saved.has(item.id);

  const bookmarkBtn = el('button.newsdetail__iconbtn', { onclick: toggleSave, 'aria-label': t('Lưu tin') }, [
    spriteIcon(isSaved() ? 'star' : 'star-stroke', 20),
  ]);

  function toggleSave() {
    if (isSaved()) { saved.delete(item.id); toast(t('Đã bỏ lưu tin')); } else { saved.add(item.id); toast(t('Đã lưu tin'), 'success'); }
    mount(bookmarkBtn, [spriteIcon(isSaved() ? 'star' : 'star-stroke', 20)]);
  }

  function share() {
    if (navigator.share) {
      navigator.share({ title: item.title, text: item.summary || item.title }).catch(() => {});
    } else {
      toast(t('Chia sẻ chưa khả dụng ở bản xem trước này'));
    }
  }

  function openMore() {
    moreSheet();
  }

  const panel = el('div.newsdetail', { role: 'dialog', 'aria-modal': 'true', 'aria-label': item.title }, [
    el('div.newsdetail__hero', {}, [
      item.image ? el('img', { src: item.image, alt: '' }) : null,
      el('div.newsdetail__herotop', {}, [
        el('button.newsdetail__iconbtn', { onclick: close, 'aria-label': t('Đóng') }, [spriteIcon('arrow-left-02-stroke', 20)]),
        el('div.newsdetail__herotopright', {}, [
          bookmarkBtn,
          el('button.newsdetail__iconbtn', { onclick: share, 'aria-label': t('Chia sẻ') }, [spriteIcon('share-01-stroke', 20)]),
          el('button.newsdetail__iconbtn', { onclick: openMore, 'aria-label': t('Thêm') }, [spriteIcon('more-vertical-stroke', 20)]),
        ]),
      ]),
    ]),
    el('div.newsdetail__body', {}, [
      item.category ? el('span.newsdetail__cat', {}, item.category) : null,
      el('h1', {}, item.title),
      el('div.newsdetail__meta', {}, [
        el('span.newsdetail__source', {}, [
          el('span.newsdetail__sourcedot', {}, uiIcon('piggy-bank', 16)),
          'Ekko',
        ]),
        el('span', {}, `${item.read_minutes} ${t('phút đọc')}`),
      ]),
      el('div.newsdetail__content', { html: renderText(item.body || item.summary || '') }),
    ]),
  ]);

  function close() {
    panel.remove();
    unlockScroll();
  }

  getOverlayRoot().append(panel);
  lockScroll();
  return panel;
}

/** Bảng "..." — các mục chưa có hậu thuẫn thật (chưa cần cho bản xem trước này). */
function moreSheet() {
  sheet({
    title: t('Thêm'),
    body: [
      menuRow('settings-01-stroke', t('Cài đặt hiển thị'), () => { closeSheet(); toast(t('Chưa có tuỳ chỉnh nào ở bản xem trước này')); }),
      menuRow('alert-circle-stroke', t('Báo cáo'), () => { closeSheet(); toast(t('Đã ghi nhận, cảm ơn bạn')); }),
      menuRow('message-01-stroke', t('Gửi phản hồi'), () => { closeSheet(); toast(t('Đã ghi nhận phản hồi của bạn'), 'success'); }),
    ],
  });
}

const menuRow = (icon, label, onclick) => el('button.newsmenurow', { onclick }, [
  spriteIcon(icon, 20), el('span', {}, label),
]);

const CATEGORY_ALL = '__all__';

export default async function newsListView(ctx) {
  const items = await api.get('/api/news');
  let query = '';
  let activeCat = CATEGORY_ALL;

  const categories = [CATEGORY_ALL, ...new Set(items.map((i) => i.category).filter(Boolean))];

  const list = el('div.newslist__items');

  const render = () => {
    const q = query.trim().toLowerCase();
    const rows = items.filter((i) => (activeCat === CATEGORY_ALL || i.category === activeCat)
      && (!q || i.title.toLowerCase().includes(q)));

    mount(list, rows.length
      ? rows.map((item) => el('button.newslist__row', { onclick: () => openNewsDetail(item.id, ctx) }, [
        item.image ? el('img.newslist__thumb', { src: item.image, alt: '' }) : el('div.newslist__thumb'),
        el('div.newslist__rowmeta', {}, [
          item.category ? el('span.newslist__cat', {}, item.category) : null,
          el('span.newslist__title', {}, item.title),
          el('span.newslist__sub', {}, `${item.read_minutes} ${t('phút đọc')}`),
        ]),
      ]))
      : [el('p.muted', { style: { padding: '0 var(--gutter)' } }, t('Không tìm thấy tin phù hợp.'))]);
  };

  const search = el('input.newslist__search', {
    type: 'search',
    placeholder: t('Tìm tin tức...'),
    oninput: (e) => { query = e.target.value; render(); },
  });

  const tabs = el('div.newslist__tabs', {}, categories.map((cat) => el('button', {
    type: 'button',
    'aria-pressed': String(cat === activeCat),
    onclick: (e) => {
      activeCat = cat;
      [...tabs.children].forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
      render();
    },
  }, cat === CATEGORY_ALL ? t('Tất cả') : cat)));

  render();

  return el('div.screen__body', {}, [
    el('div.newslist', {}, [
      el('div.newslist__searchwrap', {}, [spriteIcon('search-01-stroke', 18), search]),
      tabs,
      list,
    ]),
  ]);
}
