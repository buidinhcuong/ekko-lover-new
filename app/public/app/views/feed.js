/**
 * EkkoFeed — góp ý / phàn nàn / yêu cầu gửi tới doanh nghiệp nơi mình làm
 * (server/services/ekkoFeed.js). Hai phần:
 *  - Gửi góp ý: viết (hoặc nói) → "Xem trước" (đúng bản doanh nghiệp sẽ thấy:
 *    đã che SĐT, CCCD, tên người…; AI gợi ý loại & chủ đề) → "Gửi".
 *  - Góp ý của tôi: trạng thái + phản hồi của doanh nghiệp (chỉ mình thấy).
 * Mỗi ngày gửi được tối đa `dailyLimit` lần (Super admin đặt); bài đầu tiên mỗi tuần +10 XP.
 */
import { api, el, formatDay, guard, mount, singleFlight, spriteIcon, toast, uiIcon } from '/shared/client.js';
import { moodFace } from '/shared/moods.js';
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
        el('p.muted', {}, t('Mỗi ngày gửi được {n} lần — mai bạn gửi tiếp nhé. Phản hồi của công ty sẽ hiện ở bên dưới.', { n: data.dailyLimit || 1 })),
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
  let mood = null;
  const typePicker = typeSelect(data.types, null, (v) => { type = v; });
  const moodPicker = moodSelect(data.moods || [], null, (v) => { mood = v; });

  const preview = singleFlight(async () => {
    if (!type) return toast(t('Bạn chọn loại: Chia sẻ hay Góp ý / Cần giải quyết nhé'), 'error');
    if (text.value.trim().length < 10) return toast(t('Bạn viết thêm chút nữa nhé (ít nhất 10 ký tự)'), 'error');
    const result = await guard(() => api.post('/api/feed/preview', { text: text.value, anonymous: anonymous.checked, type, mood }), t('Chưa xem trước được, thử lại nhé'));
    if (!result) return;
    mount(box, review(ctx, data, result.draft, anonymous.checked, () => mount(box, form), redraw));
  });

  const form = el('div.card.feedform', {}, [
    el('div.feedtyperow', {}, [
      el('div.field.feedtypefield', {}, [el('span', {}, t('Loại')), typePicker]),
      el('div.field.feedmoodfield', {}, [el('span', {}, t('Cảm xúc')), moodPicker]),
    ]),
    el('label.field', {}, [el('span', {}, t('Bạn muốn công ty biết điều gì?')), text, counter]),
    el('div.feedchecks', {}, [
      checkRow(anonymous, t('Gửi ẩn danh'), t('Công ty không thấy tên, email hay mã nhân viên của bạn. Bỏ chọn nếu muốn công ty liên hệ lại với bạn.')),
      checkRow(consent, t('Tôi đồng ý điều khoản EkkoFeed'), t('Tôi đồng ý gửi nội dung này (đã che số điện thoại, CCCD, tên người) tới công ty qua Ekko, theo điều khoản sử dụng EkkoFeed.')),
    ]),
    el('button.btn.btn--block', {
      type: 'button',
      onclick: () => (consent.checked ? preview() : toast(t('Bạn đánh dấu đồng ý điều khoản trước khi gửi nhé'), 'error')),
    }, t('Xem trước')),
    data.weeklyXp ? el('small.muted.feedxp', {}, t('Góp ý đầu tiên trong tuần: +{xp} XP', { xp: data.weeklyXp })) : null,
  ]);
  const box = el('div', {}, [form]);
  return box;
}

/**
 * Một dòng ô đánh dấu gọn: chỉ nhãn ngắn, phần giải thích ẩn trong nút (?) —
 * chạm để mở / đóng bong bóng, chạm ra ngoài hoặc Esc để đóng.
 */
let tipSeq = 0;
function checkRow(input, label, tip) {
  const id = `feedtip-${(tipSeq += 1)}`;
  const bubble = el('div.feedtip__bubble', { id, role: 'tooltip', hidden: true }, tip);
  const onOutside = (e) => { if (!row.contains(e.target)) toggle(false); };
  const toggle = (show = bubble.hidden) => {
    bubble.hidden = !show;
    // Mũi nhọn của bong bóng chỉ đúng vào nút (?).
    if (show) bubble.style.setProperty('--arrow-x', `${button.offsetLeft + 9}px`);
    button.setAttribute('aria-expanded', String(show));
    if (show) document.addEventListener('pointerdown', onOutside, true);
    else document.removeEventListener('pointerdown', onOutside, true);
  };
  const button = el('button.feedtip', {
    type: 'button', 'aria-label': t('Giải thích: {label}', { label }), 'aria-expanded': 'false', 'aria-controls': id,
    onclick: () => toggle(),
  }, uiIcon('help-circle', 18));
  input.setAttribute('aria-describedby', id);
  const row = el('div.feedcheckrow', {
    onkeydown: (e) => { if (e.key === 'Escape' && !bubble.hidden) { e.preventDefault(); toggle(false); button.focus(); } },
  }, [
    el('label.feedcheck', {}, [input, el('b', {}, label)]),
    button,
    bubble,
  ]);
  return row;
}

/**
 * Ô chọn loại gọn: Chia sẻ · Góp ý / Cần giải quyết. Tự vẽ (không dùng menu hệ
 * thống) để khớp giao diện app; bàn phím: mũi tên lên/xuống, Enter, Esc.
 */
const TYPE_HINT = {
  share: 'Cảm nhận, lời khen, câu chuyện',
  issue: 'Điều chưa ổn, đề xuất, việc cần giải quyết',
};
let pickerSeq = 0;
const typeSelect = (types, current, onPick) => pickSelect(types, current, onPick, { placeholder: t('Chọn loại…'), hints: TYPE_HINT });
/** Ô chọn cảm xúc gọn (tuỳ chọn): Vui · Bình thường · Buồn · Phẫn nộ, có thể bỏ chọn. */
const moodSelect = (moods, current, onPick) => pickSelect(
  [...moods, { code: '', label: 'Không chọn' }], current || '', (v) => onPick(v || null),
  { placeholder: t('Cảm xúc'), icon: (code) => moodFace(code, 24), compact: true, emptyCode: '' },
);
function pickSelect(types, current, onPick, { placeholder, hints = {}, icon = null, compact = false, emptyCode = null } = {}) {
  let value = current;
  let active = -1;
  const id = `feedpick-${(pickerSeq += 1)}`;
  const label = el('span.feedpick__value');
  const chevron = el('span.feedpick__chevron', { 'aria-hidden': 'true' });
  chevron.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 7.5 5 5 5-5"/></svg>';
  const button = el('button.feedpick__button', {
    type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': id,
  }, [label, chevron]);
  const options = types.map((item, i) => el('li.feedpick__option', {
    role: 'option', id: `${id}-${item.code}`, dataset: { code: item.code },
    onclick: () => choose(i),
    onmousemove: () => highlight(i),
  }, [
    icon ? el('span.feedpick__icon', {}, icon(item.code) || el('span.feedpick__none', { 'aria-hidden': 'true' })) : null,
    el('span.feedpick__text', {}, [el('b', {}, t(item.label)), hints[item.code] ? el('small', {}, t(hints[item.code])) : null]),
    uiIcon('tick-02', 18),
  ]));
  const list = el('ul.feedpick__list', { role: 'listbox', id, tabindex: '-1', hidden: true }, options);
  const root = el(`div.feedpick${compact ? '.feedpick--compact' : ''}`, {}, [button, list]);

  const paint = () => {
    const item = types.find((x) => x.code === value && x.code !== emptyCode);
    const face = item && icon ? icon(item.code) : null;
    // Ô gọn (cảm xúc) chưa chọn: một vòng tròn nét đứt thay cho chữ — nhãn đã nằm ngay trên.
    const empty = compact && icon ? el('span.feedpick__none', { 'aria-hidden': 'true' }) : placeholder;
    label.replaceChildren(...(face ? [face, el('span.feedpick__label', {}, t(item.label))] : [item ? t(item.label) : empty]));
    button.setAttribute('aria-label', `${placeholder}: ${item ? t(item.label) : t('chưa chọn')}`);
    root.classList.toggle('is-empty', !item);
    options.forEach((o, i) => {
      o.setAttribute('aria-selected', String(types[i].code === value));
      o.classList.toggle('is-active', i === active);
    });
  };
  const highlight = (i) => { active = i; paint(); };
  const onOutside = (e) => { if (!root.contains(e.target)) close(); };
  function open() {
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    active = Math.max(0, types.findIndex((x) => x.code === value));
    paint();
    document.addEventListener('pointerdown', onOutside, true);
  }
  function close(focus = false) {
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    if (focus) button.focus();
  }
  function choose(i) {
    value = types[i].code;
    paint();
    close(true);
    onPick(value);
  }
  button.addEventListener('click', () => (list.hidden ? open() : close()));
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !list.hidden) { e.preventDefault(); close(true); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) { open(); return; }
      highlight((active + (e.key === 'ArrowDown' ? 1 : types.length - 1)) % types.length);
    } else if ((e.key === 'Enter' || e.key === ' ') && !list.hidden && active >= 0) {
      e.preventDefault();
      choose(active);
    }
  });
  paint();
  return root;
}

function review(ctx, data, draft, anonymousChecked, back, redraw) {
  let type = draft.type;
  let topic = draft.topic;
  let mood = draft.mood || null;
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
    const result = await guard(() => api.post(`/api/feed/${draft.id}/submit`, { type, topic, mood, anonymous: anonymous.checked }), t('Chưa gửi được, thử lại nhé'));
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
    el('div.feedtyperow', {}, [
      el('div.field.feedtypefield', {}, [el('span', {}, t('Loại')), typeSelect(data.types, type, (v) => { type = v; })]),
      el('div.field.feedmoodfield', {}, [el('span', {}, t('Cảm xúc')), moodSelect(data.moods || [], mood, (v) => { mood = v; })]),
    ]),
    el('div.field', {}, [el('span', {}, t('Chủ đề (tự gợi ý — chạm để đổi)')), chips(data.topics, topic, (v) => { topic = v; })]),
    checkRow(anonymous, t('Gửi ẩn danh'), draft.hasCompany
      ? t('Bỏ chọn thì {company} thấy tên bạn.', { company: draft.companyName })
      : t('Bỏ chọn thì công ty thấy tên bạn.')),
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
      ? el('div.feedlist', {}, data.posts.map((p) => postCard(p)))
      : el('p.muted', {}, t('Bạn chưa gửi góp ý nào.')),
  ]);
}

// Ngón cái lên / xuống (bộ icon chưa có — vẽ nét cùng kiểu 24px stroke).
const THUMB = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3Zm0 0 4.4-7.3A1.6 1.6 0 0 1 14.3 4l-.8 5h5.6a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17.7 20H7"/></svg>';
const thumb = (down) => {
  const span = el(`span.feedrate__icon${down ? '.is-down' : ''}`);
  span.innerHTML = THUMB;
  return span;
};
const timeOf = (iso) => `${formatDay(iso.slice(0, 10))} · ${new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;

/** Tệp HR đính kèm: ảnh hiện thu nhỏ (chạm để mở lớn), PDF là thẻ tệp mở trong trình duyệt. */
function attachments(files) {
  if (!files?.length) return null;
  return el('div.feedfiles', {}, files.map((f) => (f.image
    ? el('a.feedfiles__img', { href: f.url, target: '_blank', rel: 'noopener', 'aria-label': t('Mở ảnh {name}', { name: f.name }) }, [
      el('img', { src: f.url, alt: f.name, loading: 'lazy' }),
    ])
    : el('a.feedfiles__doc', { href: f.url, target: '_blank', rel: 'noopener' }, [
      el('span.feedfiles__badge', { 'aria-hidden': 'true' }, 'PDF'),
      el('span.feedfiles__name', {}, [el('b', {}, f.name), el('small', {}, `${Math.max(1, Math.round(f.size / 1024))} KB · ${t('Chạm để xem')}`)]),
    ]))));
}

/**
 * Một góp ý = một đoạn chat: bên phải là lời của bạn, bên trái là phản hồi của
 * công ty (kèm tệp). Sau khi có phản hồi chỉ đánh giá Hài lòng / Chưa hài lòng —
 * không nhắn qua lại.
 */
function postCard(p) {
  const [label, tone] = STATUS[p.status] || STATUS.sent;
  const isShare = p.type === 'share';
  const overdue = !isShare && !p.replies.length && p.replyDue && new Date(p.replyDue) < new Date();
  const thread = el('div.feedthread', {}, [
    el('div.feedbubble.is-me', {}, [
      el('p', {}, p.redactedText || p.text),
      el('small', {}, `${timeOf(p.createdAt)} · ${p.anonymous ? t('Ẩn danh') : t('Có ghi tên')}`),
    ]),
    ...(p.replies.length
      ? p.replies.map((r) => el('div.feedbubble.is-company', {}, [
        el('b.feedbubble__who', {}, r.fromCompany ? t('Công ty phản hồi') : t('Ekko phản hồi')),
        r.text ? el('p', {}, r.text) : null,
        attachments(r.files),
        el('small', {}, timeOf(r.createdAt)),
      ]))
      : [el(`div.feedsys${overdue ? '.is-late' : ''}`, {}, isShare
        ? t('Chia sẻ đã tới công ty — không cần phản hồi')
        : overdue
          ? t('Đã quá hạn phản hồi ({date}) — góp ý được đánh dấu quá hạn để công ty ưu tiên', { date: formatDay(p.replyDue.slice(0, 10)) })
          : t('Công ty sẽ phản hồi trước {date}', { date: formatDay(p.replyDue.slice(0, 10)) }))]),
  ]);

  let rating = p.rating;
  const rateRow = p.canRate ? (() => {
    const row = el('div.feedrate');
    const btn = (value, text, down) => el('button.feedrate__btn', {
      type: 'button', 'aria-pressed': String(rating === value),
      onclick: async () => {
        const next = rating === value ? null : value;
        const result = await guard(() => api.post(`/api/feed/${p.id}/rate`, { rating: next }), t('Chưa lưu được đánh giá'));
        if (!result) return;
        rating = next;
        draw();
        if (next) toast(next === 'like' ? t('Cảm ơn bạn đã đánh giá!') : t('Cảm ơn bạn — công ty sẽ thấy phản hồi chưa làm bạn hài lòng'), 'success');
      },
    }, [thumb(down), text]);
    const draw = () => row.replaceChildren(
      el('span.feedrate__q', {}, rating ? t('Bạn đã đánh giá phản hồi này') : t('Phản hồi này có giúp bạn không?')),
      el('div.feedrate__btns', {}, [btn('like', t('Hài lòng'), false), btn('dislike', t('Chưa hài lòng'), true)]),
    );
    draw();
    return row;
  })() : null;

  return el(`div.card.feedpost${p.unread ? '.is-new' : ''}`, {}, [
    el('div.feedpost__head', {}, [
      el('span.feedpost__badges', {}, [el(`span.feedstatus.is-${tone}`, {}, t(isShare ? 'Đã gửi' : label)), p.mood ? moodFace(p.mood, 20) : null]),
      el('small.muted', {}, isShare ? t('Chia sẻ') : t('Góp ý / Cần giải quyết')),
    ]),
    thread,
    rateRow,
  ]);
}
