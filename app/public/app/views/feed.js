/**
 * EkkoFeed — góp ý / phàn nàn / yêu cầu gửi tới doanh nghiệp nơi mình làm
 * (server/services/ekkoFeed.js). Hai phần:
 *  - Gửi góp ý: viết (hoặc nói) → "Xem trước" (đúng bản doanh nghiệp sẽ thấy:
 *    đã che SĐT, CCCD, tên người…; AI gợi ý loại & chủ đề) → "Gửi".
 *  - Góp ý của tôi: trạng thái + phản hồi của doanh nghiệp (chỉ mình thấy).
 * Mỗi ngày gửi được 1 góp ý; góp ý đầu tiên mỗi tuần +10 XP.
 */
import { api, el, formatDay, guard, mount, singleFlight, spriteIcon, toast, uiIcon } from '/shared/client.js';
import { t } from '../i18n.js';
import { celebrateRewards } from '../ui.js';

const STATUS = {
  sent: ['Đã gửi', 'neutral'],
  received: ['Đã tiếp nhận', 'brand'],
  in_progress: ['Đang xử lý', 'warning'],
  replied: ['Đã phản hồi', 'success'],
  closed: ['Đã đóng', 'neutral'],
};

export default async function feedView(ctx) {
  const root = el('div.feedview');
  const draw = async () => {
    const data = await guard(() => api.get('/api/feed'), t('Không tải được EkkoFeed'));
    if (!data) return;
    mount(root, intro(data), composer(ctx, data, draw), myPosts(data));
    // Mở trang là đã xem các phản hồi mới.
    if (data.posts.some((p) => p.unread)) api.post('/api/feed/replies/seen', {}).then(() => ctx.refreshWorld?.()).catch(() => {});
  };
  await draw();
  return root;
}

function intro(data) {
  return el('div.feedintro', {}, [
    el('span.feedintro__icon', { 'aria-hidden': 'true' }, uiIcon('bubble-chat', 24)),
    el('div', {}, [
      el('h2', {}, t('Góp ý tới công ty')),
      el('p.muted', {}, data.company
        ? t('Chia sẻ hoặc góp ý điều cần giải quyết tới {company}. Bạn chọn gửi ẩn danh hay ghi tên.', { company: data.company })
        : t('Chia sẻ hoặc góp ý điều cần giải quyết tới công ty bạn đang làm. Bạn chọn gửi ẩn danh hay ghi tên.')),
    ]),
  ]);
}

// --- gửi góp ý -------------------------------------------------------------------

function composer(ctx, data, redraw) {
  if (!data.canPostToday) {
    return el('div.card.feeddone', {}, [
      uiIcon('tick-02', 20),
      el('div', {}, [
        el('b', {}, t('Hôm nay bạn đã gửi góp ý')),
        el('p.muted', {}, t('Mỗi ngày gửi được 1 góp ý — mai bạn gửi tiếp nhé. Phản hồi của công ty sẽ hiện ở bên dưới.')),
      ]),
    ]);
  }

  const text = el('textarea.input.feedtext', {
    rows: 5, maxlength: '1000',
    placeholder: t('VD: Nhà ăn ca đêm thường hết suất trước 1h sáng, anh em ca muộn phải nhịn đói…'),
  });
  const counter = el('small.muted.feedcount', {}, '0/1000');
  text.addEventListener('input', () => { counter.textContent = `${text.value.length}/1000`; });

  const anonymous = el('input', { type: 'checkbox', checked: true });
  const consent = el('input', { type: 'checkbox' });

  // Hai loại, người gửi tự chọn: Chia sẻ · Góp ý / Cần giải quyết.
  let type = null;
  const typePicker = typeSelect(data.types, null, (v) => { type = v; });

  const preview = singleFlight(async () => {
    if (!type) return toast(t('Bạn chọn loại: Chia sẻ hay Góp ý / Cần giải quyết nhé'), 'error');
    if (text.value.trim().length < 10) return toast(t('Bạn viết thêm chút nữa nhé (ít nhất 10 ký tự)'), 'error');
    const result = await guard(() => api.post('/api/feed/preview', { text: text.value, anonymous: anonymous.checked, type }), t('Chưa xem trước được, thử lại nhé'));
    if (!result) return;
    mount(box, review(ctx, data, result.draft, anonymous.checked, () => mount(box, form), redraw));
  });

  const form = el('div.card.feedform', {}, [
    el('label.field.feedtypefield', {}, [el('span', {}, t('Loại')), typePicker]),
    el('label.field', {}, [el('span', {}, t('Bạn muốn công ty biết điều gì?')), text, counter]),
    el('label.feedcheck', {}, [anonymous, el('span', {}, [el('b', {}, t('Gửi ẩn danh')), el('small.muted', {}, t('Công ty không thấy tên, email hay mã nhân viên của bạn. Bỏ chọn nếu muốn công ty liên hệ lại với bạn.'))])]),
    el('label.feedcheck', {}, [consent, el('small.muted', {}, t('Tôi đồng ý gửi nội dung này (đã che số điện thoại, CCCD, tên người) tới công ty qua Ekko, theo điều khoản sử dụng EkkoFeed.'))]),
    el('button.btn.btn--block', {
      type: 'button',
      onclick: () => (consent.checked ? preview() : toast(t('Bạn đánh dấu đồng ý điều khoản trước khi gửi nhé'), 'error')),
    }, t('Xem trước')),
    data.weeklyXp ? el('small.muted.feedxp', {}, t('Góp ý đầu tiên trong tuần: +{xp} XP', { xp: data.weeklyXp })) : null,
  ]);
  const box = el('div', {}, [form]);
  return box;
}

/** Ô chọn loại gọn: Chia sẻ · Góp ý / Cần giải quyết. */
function typeSelect(types, current, onPick) {
  const select = el('select.input.feedselect', { onchange: (e) => onPick(e.target.value || null) }, [
    current ? null : el('option', { value: '', disabled: true, selected: true }, t('Chọn loại…')),
    ...types.map((item) => el('option', { value: item.code, selected: item.code === current }, t(item.label))),
  ]);
  return select;
}

function review(ctx, data, draft, anonymousChecked, back, redraw) {
  let type = draft.type;
  let topic = draft.topic;
  const chips = (items, current, onPick) => {
    const row = el('div.chips');
    const paint = (value) => [...row.children].forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.code === value)));
    items.forEach((item) => row.append(el('button.chip', {
      type: 'button', dataset: { code: item.code }, 'aria-pressed': String(item.code === current),
      onclick: () => { onPick(item.code); paint(item.code); },
    }, t(item.label))));
    return row;
  };
  const anonymous = el('input', { type: 'checkbox', checked: anonymousChecked });

  const send = singleFlight(async () => {
    const result = await guard(() => api.post(`/api/feed/${draft.id}/submit`, { type, topic, anonymous: anonymous.checked }), t('Chưa gửi được, thử lại nhé'));
    if (!result) return;
    toast(t('Đã gửi góp ý tới công ty'), 'success');
    if (result.rewards?.xp) await celebrateRewards(result.rewards, { title: t('Cảm ơn bạn đã lên tiếng!') });
    await ctx.refreshWorld?.();
    redraw();
  });

  return el('div.card.feedreview', {}, [
    el('h3', {}, t('Xem trước — công ty sẽ thấy')),
    el('blockquote.feedquote', {}, draft.redactedText),
    el('small.muted', {}, t('Số điện thoại, CCCD, số tài khoản và tên người được nhắc tới đã được che.')),
    el('label.field.feedtypefield', {}, [el('span', {}, t('Loại')), typeSelect(data.types, type, (v) => { type = v; })]),
    el('div.field', {}, [el('span', {}, t('Chủ đề (tự gợi ý — chạm để đổi)')), chips(data.topics, topic, (v) => { topic = v; })]),
    el('label.feedcheck', {}, [anonymous, el('span', {}, [el('b', {}, t('Gửi ẩn danh')), el('small.muted', {}, draft.hasCompany
      ? t('Bỏ chọn thì {company} thấy tên bạn.', { company: draft.companyName })
      : t('Bỏ chọn thì công ty thấy tên bạn.'))])]),
    el('div.feedactions', {}, [
      el('button.btn.btn--ghost', { type: 'button', onclick: back }, t('Sửa lại')),
      el('button.btn', { type: 'button', onclick: send }, t('Gửi góp ý')),
    ]),
  ]);
}

// --- góp ý của tôi ----------------------------------------------------------------

function myPosts(data) {
  return el('section.feedmine', {}, [
    el('h3.section-title', {}, [t('Góp ý của tôi'), el('span', {}, t('Chỉ bạn thấy'))]),
    data.posts.length
      ? el('div.feedlist', {}, data.posts.map(postCard))
      : el('p.muted', {}, t('Bạn chưa gửi góp ý nào.')),
  ]);
}

function postCard(p) {
  const [label, tone] = STATUS[p.status] || STATUS.sent;
  return el(`div.card.feedpost${p.unread ? '.is-new' : ''}`, {}, [
    el('div.feedpost__head', {}, [
      el(`span.feedstatus.is-${tone}`, {}, t(label)),
      el('small.muted', {}, `${formatDay(p.createdAt.slice(0, 10))} · ${p.anonymous ? t('Ẩn danh') : t('Có ghi tên')}`),
    ]),
    el('p.feedpost__text', {}, p.text),
    ...p.replies.map((r) => el('div.feedreply', {}, [
      el('b', {}, r.fromCompany ? t('Công ty phản hồi') : t('Ekko phản hồi')),
      el('p', {}, r.text),
      el('small.muted', {}, formatDay(r.createdAt.slice(0, 10))),
    ])),
  ]);
}
