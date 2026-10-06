/**
 * Màn chủ của concept "Simple mode" — cho người dùng khoảng 40–50 tuổi.
 *
 * Cùng dữ liệu với Ekko Lover nhưng chỉ giữ những gì cần mỗi ngày, xếp dọc từ
 * trên xuống, mỗi khối một việc:
 *   1. Lời chào + chú heo, cấp độ và chuỗi ngày — viết thành câu, không có số XP.
 *   2. Nút to "Nói để ghi chi tiêu" — việc làm thường xuyên nhất, đặt ngay đầu.
 *   3. Hôm nay đã chi bao nhiêu (vài khoản gần nhất).
 *   4. Ngân sách tháng này: một con số, một thanh, một câu "còn / vượt".
 *   5. Năm chức năng thành danh sách hàng to, mỗi hàng có một dòng giải thích.
 * Bỏ biểu đồ chồng nhiều màu, carousel tin tức và các banner tổng kết — đều là
 * thông tin phụ, gây rối hơn là giúp ở nhóm người dùng này.
 */
import { APP_SPRITE, api, el, mount, spriteIcon, uiIcon, vnd } from '/shared/client.js';
import { t } from '../i18n.js';
import { micIcon, openVoiceNote } from '../voice.js';

const FEATURES = [
  { tone: 'explore', icon: 'books-02', label: 'Học tập', hint: 'Bài học ngắn về tiền bạc', route: '/explore' },
  { tone: 'expenses', icon: 'note', label: 'Ghi chép', hint: 'Xem lại các khoản đã chi', route: '/expenses' },
  { tone: 'budget', icon: 'briefcase-dollar', label: 'Ngân sách', hint: 'Đặt mức chi cho mỗi tháng', route: '/budget' },
  { tone: 'goals', icon: 'analytics-02', label: 'Mục tiêu', hint: 'Để dành cho những việc lớn', route: '/goals' },
  { tone: 'savings', icon: 'savings', label: 'Tiết kiệm', hint: 'Theo dõi tiền tiết kiệm và tiền lãi', route: '/savings' },
];

/** Tên gọi trong lời chào: tên riêng (chữ cuối) của họ tên tiếng Việt. */
const givenName = (name) => String(name || '').trim().split(/\s+/).pop() || '';

export default async function simpleHome(ctx) {
  const container = el('div.screen__body.simplehome-shell');
  const rerender = async () => mount(container, await body(ctx, rerender));
  mount(container, await body(ctx, rerender));
  return container;
}

async function body(ctx, rerender) {
  const { level, streak } = ctx.world;
  const [today, budget] = await Promise.all([
    api.get('/api/expenses?range=today'),
    api.get('/api/budget'),
  ]);

  const name = givenName(ctx.user?.name);
  const header = el('button.simplehome__hello', {
    type: 'button', dataset: { tour: 'profile' },
    onclick: () => ctx.navigate('/badges'),
    'aria-label': t('Xem thông tin và thành tích'),
  }, [
    el('img.simplehome__pig', { src: level?.character_image || '/assets/levels/pig-1.png', alt: '' }),
    el('span.simplehome__hellotext', {}, [
      el('span.simplehome__greet', {}, name ? t('Xin chào, {name}', { name }) : t('Xin chào')),
      el('strong.simplehome__level', {}, `${t('Cấp {n}', { n: level?.order_index ?? 1 })} · ${level?.name || ''}`),
      el('span.simplehome__streak', {}, [
        uiIcon(streak.status === 'frozen' ? 'snow' : 'fire', 20),
        streak.count
          ? t('{n} ngày liên tiếp', { n: streak.count })
          : t('Học một bài hôm nay để bắt đầu chuỗi ngày'),
      ]),
    ]),
    el('span.simplehome__go', { 'aria-hidden': 'true' }, spriteIcon('chevron-right-01-stroke', 24)),
  ]);

  const voice = el('button.simplehome__voice', {
    type: 'button', dataset: { tour: 'voice' },
    onclick: () => openVoiceNote(ctx, { onSaved: rerender }),
  }, [
    el('span.simplehome__voicemic', {}, [micIcon(36)]),
    el('span.simplehome__voicetext', {}, [
      el('strong', {}, t('Nói để ghi chi tiêu')),
      el('span', {}, t('Bấm rồi nói: “Cà phê ba mươi lăm nghìn”')),
    ]),
  ]);
  const typeInstead = el('button.simplehome__typelink', {
    type: 'button', onclick: () => openVoiceNote(ctx, { onSaved: rerender, typing: true }),
  }, t('Hoặc gõ chữ'));

  const items = today.expenses || [];
  const todayCard = el('section.simplehome__card', { dataset: { tour: 'today' } }, [
    el('h2.simplehome__title', {}, t('Hôm nay bạn đã chi')),
    el('p.simplehome__big', {}, vnd(today.totals?.total ?? items.reduce((s, e) => s + e.amount, 0))),
    items.length
      ? el('ul.simplehome__list', {}, items.slice(0, 3).map((e) => el('li', {}, [
        el('span', {}, e.note || e.category_name || t('Khoản chi')),
        el('strong', {}, vnd(e.amount)),
      ])))
      : el('p.simplehome__empty', {}, t('Chưa có khoản chi nào hôm nay.')),
    el('button.btn.btn--ghost.btn--block', { type: 'button', onclick: () => ctx.navigate('/expenses') }, t('Xem sổ chi tiêu')),
  ]);

  const spent = budget.totals?.spent ?? 0;
  const planned = budget.totals?.planned ?? 0;
  const percent = planned ? Math.round((spent / planned) * 100) : 0;
  const tone = spent > planned ? 'over' : percent >= 80 ? 'warn' : 'ok';
  const budgetCard = el('section.simplehome__card', { dataset: { tour: 'budget' } }, [
    el('h2.simplehome__title', {}, t('Ngân sách tháng này')),
    planned
      ? el('div', {}, [
        el('p.simplehome__line', {}, t('Đã chi {spent} trên {planned}', { spent: vnd(spent), planned: vnd(planned) })),
        el(`div.simplehome__bar.is-${tone}`, {
          role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.min(100, percent)),
        }, [el('span', { style: { width: `${Math.min(100, percent)}%` } })]),
        el(`p.simplehome__left.is-${tone}`, {}, spent <= planned
          ? t('Còn {amount}', { amount: vnd(planned - spent) })
          : t('Vượt {amount}', { amount: vnd(spent - planned) })),
      ])
      : el('div', {}, [
        el('p.simplehome__empty', {}, t('Bạn chưa đặt ngân sách cho tháng này.')),
        el('button.btn.btn--ghost.btn--block', { type: 'button', onclick: () => ctx.navigate('/budget') }, t('Đặt ngân sách')),
      ]),
  ]);

  const features = el('section.simplehome__features', { dataset: { tour: 'features' } }, [
    el('h2.simplehome__title', {}, t('Các chức năng')),
    el('ul.simplehome__menu', {}, FEATURES.map((f) => el('li', {}, [
      el('button.simplehome__item', { type: 'button', dataset: { tone: f.tone }, onclick: () => ctx.navigate(f.route) }, [
        el('span.simplehome__itemicon', {}, spriteIcon(f.icon, 28, APP_SPRITE)),
        el('span.simplehome__itemtext', {}, [el('strong', {}, t(f.label)), el('span', {}, t(f.hint))]),
        el('span.simplehome__go', { 'aria-hidden': 'true' }, spriteIcon('chevron-right-01-stroke', 24)),
      ]),
    ]))),
  ]);

  return el('div.simplehome', {}, [header, voice, typeInstead, todayCard, budgetCard, features]);
}
