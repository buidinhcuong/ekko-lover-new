/**
 * Thông tin chi tiết & thành tích — mở từ thanh nav ở màn chủ. Đầu trang là
 * thẻ hồ sơ (nhân vật, cấp, XP tới cấp sau, chuỗi ngày, bài học, huy hiệu),
 * dưới là huy hiệu, các cấp độ heo và hoạt động gần đây.
 */
import { api, dataIcon, el, formatDay, mount, toast, uiIcon } from '/shared/client.js';
import { accountCard } from '../auth.js';
import { bar, celebrate, clearClaimRedirect, closeSheet, friendCodeChip, sheet } from '../ui.js';
import { t } from '../i18n.js';

/** Tab nhóm huy hiệu đang chọn (Ekko Lover), giữ khi trang vẽ lại sau lúc nhận thưởng. */
let currentGroup = 'all';

export default async function badgesView(ctx) {
  const world = ctx.world;
  // Thử thách và huy hiệu theo nhóm là phần riêng của Ekko Lover; concept khác giữ trang như cũ.
  const lover = world.concept === 'lover';
  const [board, activity] = await Promise.all([
    api.get('/api/me/badges'),
    lover ? [] : api.get('/api/me/activity?limit=20'),
  ]);
  clearClaimRedirect();   // đã tới trang Huy hiệu: thôi giữ hướng chuyển trang

  // Ekko Lover: nhận XP của huy hiệu đã đạt, rồi vẽ lại trang với số XP mới.
  const claim = async (badge, button) => {
    button.disabled = true;
    try {
      const result = await api.post(`/api/me/badges/${encodeURIComponent(badge.code)}/claim`, {});
      closeSheet();
      await celebrate({
        title: t('Nhận thưởng thành công'),
        subtitle: t('Huy hiệu {name}', { name: badge.name }),
        stats: result.xp ? [`+${result.xp} XP`] : [],
        badges: result.badges || [],
        levelUp: result.levelUp || null,
      });
      await ctx.refreshWorld();
      ctx.navigate('/badges');
    } catch (err) {
      button.disabled = false;
      toast(err.message || t('Không nhận được thưởng, thử lại nhé'), 'error');
    }
  };

  const reward = (badge) => {
    if (!badge.xp_reward) return null;
    if (badge.claimable) {
      const button = el('button.btn.btn--block.badge-claim', { type: 'button' }, t('Nhận thưởng ngay: {xp} XP', { xp: badge.xp_reward }));
      button.addEventListener('click', () => claim(badge, button));
      return button;
    }
    // Đã nhận: vẫn là nút (cùng chỗ, cùng cỡ) nhưng tắt, để thấy rõ phần thưởng đã về.
    if (world.concept === 'lover' && badge.earned && badge.claimed_at) {
      return el('button.btn.btn--block.badge-claim', { type: 'button', disabled: true }, t('Đã nhận thưởng {xp} XP', { xp: badge.xp_reward }));
    }
    return el('p.muted', { style: { textAlign: 'center' } }, t('Thưởng {xp} XP', { xp: badge.xp_reward }));
  };

  const openBadge = (badge) => sheet({
    title: badge.name,
    body: [
      el('div', { style: { textAlign: 'center', fontSize: 'var(--font-size-display-lg)', lineHeight: '64px', filter: badge.earned ? 'none' : 'grayscale(1)', opacity: badge.earned ? '1' : '.45' } }, badge.icon || '🏅'),
      el('p', { style: { textAlign: 'center' } }, badge.description || ''),
      el('p.muted', { style: { textAlign: 'center' } }, badge.earned
        ? t('Đạt được ngày {day}', { day: formatDay(badge.awarded_at?.slice(0, 10)) })
        : t('Điều kiện: {rule}', { rule: ruleText(badge) })),
      reward(badge),
    ],
  });

  const plainGrid = () => el('div.badge-grid', {}, board.all.map((badge) => el('button.badge-tile', {
    dataset: { earned: String(badge.earned), claimable: String(Boolean(badge.claimable)) },
    'aria-label': badge.claimable ? t('{name} — có phần thưởng chưa nhận', { name: badge.name }) : null,
    onclick: () => openBadge(badge),
  }, [
    el('div.badge-tile__icon', {}, badge.icon || '🏅'),
    el('div.badge-tile__name', {}, badge.name),
  ])));

  // Ekko Lover: trang này chỉ là bộ sưu tập huy hiệu (kèm thử thách). Hồ sơ heo,
  // các cấp và hoạt động gần đây nằm ở trang Cấp độ heo (`levelView`).
  if (lover) {
    return el('div.badgespage', {}, [
      el('div.section-title', {}, [t('Huy hiệu'), el('span', {}, `${board.earned}/${board.total}`)]),
      groupedBadges(board, { claim, reward, ruleText }),
    ]);
  }

  return el('div', {}, [
    profileCard(world, board),

    el('div.section-title', {}, [t('Huy hiệu')]),
    plainGrid(),

    // Chỉ cấp đang đứng. Năm cấp còn lại nằm sau "Xem tất cả" — trang này là bộ
    // sưu tập, không phải bảng xếp hạng cấp độ.
    el('div.section-title', {}, [
      t('Cấp độ heo'),
      el('button.linkbtn', { onclick: () => openLevels(world) }, t('Xem tất cả')),
    ]),
    currentLevelCard(world),

    el('div.section-title', {}, [t('Hoạt động gần đây')]),
    activity.length
      ? el('div.card', { style: { paddingTop: '0' } }, activity.map(activityRow))
      : el('p.muted', {}, t('Chưa có hoạt động nào được ghi lại.')),

    el('div.section-title', {}, [t('Tài khoản')]),
    accountCard(ctx.user),
  ]);
}

// --- Ekko Lover: trang Cấp độ heo -------------------------------------------

/**
 * Mở khi bấm con heo trên thanh đầu hoặc thẻ heo ở màn chính: hồ sơ heo, đủ
 * mười cấp (cấp đang đứng được đánh dấu) và hoạt động gần đây. Ô "Huy hiệu"
 * trong thẻ hồ sơ dẫn sang trang Huy hiệu.
 */
export async function levelView(ctx) {
  const world = ctx.world;
  const activity = await api.get('/api/me/activity?limit=20');

  const card = profileCard(world);
  for (const [stat, route, label] of [['badges', '/badges', 'Xem huy hiệu'], ['challenges', '/challenges', 'Xem thử thách']]) {
    const node = card.querySelector(`[data-stat="${stat}"]`);
    if (!node) continue;
    node.setAttribute('aria-label', t(label));
    node.addEventListener('click', () => ctx.navigate(route));
  }

  return el('div', {}, [
    card,

    el('div.section-title', {}, [t('Cấp độ heo'), el('span', {}, t('Cấp {n}/{total}', { n: world.level?.order_index ?? 1, total: world.levels.length }))]),
    el('div.card.levellist', {}, world.levels.map((level) => el('div.levelrow', {
      dataset: { locked: String(!level.unlocked), current: String(level.id === world.level?.id) },
    }, [
      levelArt(level),
      el('div', { style: { flex: '1', minWidth: '0' } }, [
        el('div', { style: { fontSize: 'var(--font-size-text-md)', fontWeight: 'var(--font-weight-semibold)' } }, levelName(level)),
        el('div.muted', {}, level.unlocked
          ? (level.perk || `${level.xp_required} XP`)
          : [uiIcon('square-lock-02', 16), ` ${t('Cần {xp} XP', { xp: level.xp_required })}`]),
      ]),
      level.id === world.level?.id ? el('span.pill', {}, t('Đang ở đây')) : null,
    ]))),

    el('div.section-title', {}, [t('Hoạt động gần đây')]),
    activity.length
      ? el('div.card', { style: { paddingTop: '0' } }, activity.map(activityRow))
      : el('p.muted', {}, t('Chưa có hoạt động nào được ghi lại.')),

    el('div.section-title', {}, [t('Tài khoản')]),
    accountCard(ctx.user),
  ]);
}

// --- Ekko Lover: trang Thử thách --------------------------------------------

/** Mở từ ô "Thử thách" ở thẻ heo: chặng khởi đầu, thử thách hôm nay và tuần này. */
export async function challengesView(ctx) {
  const board = await api.get('/api/me/challenges');
  return el('div.badgespage', {}, [
    challengeSection(ctx, board) || el('div.empty', {}, [
      el('img', { src: '/assets/mascot/bot-9.png', alt: '' }),
      el('h3', {}, t('Chưa có thử thách nào')),
      el('p.muted', {}, t('Thử thách mới sẽ xuất hiện ở đây. Quay lại sau nhé!')),
    ]),
  ]);
}

// --- Ekko Lover: thử thách --------------------------------------------------

/** Ba khối thử thách: chặng khởi đầu (người mới), hôm nay, tuần này. */
function challengeSection(ctx, board) {
  // Admin tắt hết thử thách thì bỏ cả khối, không để lại tiêu đề trống.
  if (!board || (!board.onboarding && !board.daily.items.length && !board.weekly.items.length)) return null;

  const after = async (result, title) => {
    await celebrate({
      title,
      stats: result.xp ? [`+${result.xp} XP`] : [],
      badges: result.badges || [],
      levelUp: result.levelUp || null,
    });
    await ctx.refreshWorld();
    // Người dùng đã bấm "Đến nhận thưởng" (huy hiệu) trong màn ăn mừng thì đã sang
    // trang Huy hiệu rồi — đừng kéo về đây; còn ở lại thì vẽ lại trang Thử thách.
    if (location.hash.slice(1) === '/challenges') ctx.navigate('/challenges');
  };

  const claimItem = async (item, button) => {
    button.disabled = true;
    try {
      const result = await api.post(`/api/me/challenges/${item.id}/claim`, {});
      await after(result, t('Xong thử thách: {name}', { name: item.name }));
    } catch (err) {
      button.disabled = false;
      toast(err.message || t('Không nhận được thưởng, thử lại nhé'), 'error');
    }
  };

  const claimBonus = async (period, button) => {
    button.disabled = true;
    try {
      const result = await api.post(`/api/me/challenges/bonus/${period}`, {});
      await after(result, period === 'daily' ? t('Xong cả thử thách hôm nay') : t('Xong chặng khởi đầu'));
    } catch (err) {
      button.disabled = false;
      toast(err.message || t('Không nhận được thưởng, thử lại nhé'), 'error');
    }
  };

  const row = (item) => {
    let action;
    if (item.claimable) {
      action = el('button.btn.btn--sm.challenge__claim', { type: 'button' }, t('Nhận +{xp}', { xp: item.xp_reward }));
      action.addEventListener('click', () => claimItem(item, action));
    } else if (item.claimed) {
      action = el('span.challenge__done', {}, [uiIcon('tick-02', 16), ` ${t('Đã nhận')}`]);
    } else {
      action = el('span.challenge__xp', {}, `+${item.xp_reward} XP`);
    }
    return el('div.challenge', { dataset: { state: item.claimed ? 'claimed' : item.claimable ? 'claimable' : 'open' } }, [
      el('span.challenge__icon', {}, item.icon || '⭐'),
      el('div.challenge__main', {}, [
        el('div.challenge__name', {}, item.name),
        // Thử thách một bước thì mô tả nói rõ hơn thanh "0/1"; nhiều bước thì hiện tiến độ.
        item.target > 1
          ? el('div.challenge__progress', {}, [
            bar(Math.round((item.progress / item.target) * 100), item.done ? 'good' : ''),
            el('small', {}, `${item.progress}/${item.target}`),
          ])
          : el('small.muted', {}, item.description || ''),
      ]),
      action,
    ]);
  };

  const bonusRow = (s, label) => {
    if (!s.bonus) return null;
    let action;
    if (s.bonus.claimable) {
      action = el('button.btn.btn--sm.challenge__claim', { type: 'button' }, t('Nhận +{xp}', { xp: s.bonus.xp }));
      action.addEventListener('click', () => claimBonus(s.period, action));
    } else if (s.bonus.claimed) {
      action = el('span.challenge__done', {}, [uiIcon('tick-02', 16), ` ${t('Đã nhận')}`]);
    } else {
      action = el('span.challenge__xp', {}, `+${s.bonus.xp} XP`);
    }
    return el('div.challenge.challenge--bonus', { dataset: { state: s.bonus.claimed ? 'claimed' : s.bonus.claimable ? 'claimable' : 'open' } }, [
      el('span.challenge__icon', {}, '🎁'),
      el('div.challenge__main', {}, [el('div.challenge__name', {}, label)]),
      action,
    ]);
  };

  const block = (title, meta, s, bonusLabel) => el('div.card.challenge-card', {}, [
    el('div.challenge-card__head', {}, [el('b', {}, title), meta ? el('small.muted', {}, meta) : null]),
    ...s.items.map(row),
    bonusRow(s, bonusLabel),
  ]);

  const onboarding = board.onboarding;
  const doneSteps = onboarding ? onboarding.items.filter((i) => i.done).length : 0;

  return el('div', {}, [
    el('div.section-title', {}, [t('Thử thách'), board.claimable ? el('span', {}, t('{n} phần thưởng chờ nhận', { n: board.claimable })) : null]),
    onboarding
      ? block(t('Chặng khởi đầu'), t('{done}/{total} bước', { done: doneSteps, total: onboarding.items.length }), onboarding, t('Xong cả chặng khởi đầu'))
      : null,
    board.daily.items.length ? block(t('Hôm nay'), t('Làm mới lúc 0 giờ'), board.daily, t('Xong cả {n} thử thách hôm nay', { n: board.daily.items.length })) : null,
    board.weekly.items.length ? block(t('Tuần này'), t('Đến hết {day}', { day: formatDay(board.weekly.endsOn) }), board.weekly, '') : null,
  ]);
}

// --- Ekko Lover: huy hiệu theo nhóm và chuỗi ------------------------------

/**
 * Huy hiệu cùng nhóm + cùng điều kiện + cùng phạm vi là một chuỗi (Đồng → Bạc →
 * Vàng). Mỗi chuỗi hiện MỘT ô: bậc đang chờ nhận thưởng, nếu không thì bậc kế
 * tiếp còn thiếu, nếu đã xong hết thì bậc cao nhất. Bấm vào để xem cả chuỗi.
 *
 * Thứ tự: chờ nhận thưởng → đang làm (gần xong lên trước) → đã xong cả chuỗi.
 */
function groupedBadges(board, helpers) {
  const groups = (board.groups || []).filter((g) => board.all.some((b) => b.group_code === g.code));
  if (!groups.some((g) => g.code === currentGroup)) currentGroup = 'all';

  const chains = new Map();
  for (const badge of board.all) {
    const key = `${badge.group_code}|${badge.rule_type}|${badge.rule_target || ''}`;
    if (!chains.has(key)) chains.set(key, []);
    chains.get(key).push(badge);
  }
  const tiles = [...chains.values()].map((list) => {
    list.sort((a, b) => a.rule_value - b.rule_value || a.order_index - b.order_index);
    const current = list.find((b) => b.claimable) || list.find((b) => !b.earned) || list[list.length - 1];
    const earned = list.filter((b) => b.earned).length;
    const state = current.claimable ? 0 : !current.earned ? 1 : 2;
    const ratio = current.earned ? 1 : (current.progress || 0) / Math.max(1, current.rule_value);
    return { list, current, earned, state, ratio, group: current.group_code };
  }).sort((a, b) => a.state - b.state || b.ratio - a.ratio || a.current.order_index - b.current.order_index);

  const host = el('div');
  const chips = el('div.chips.badge-groups');

  const draw = () => {
    mount(chips, [['all', t('Tất cả')], ...groups.map((g) => [g.code, g.name])].map(([code, label]) => {
      const pending = tiles.filter((x) => (code === 'all' || x.group === code) && x.current.claimable).length;
      return el('button.chip', {
        type: 'button',
        'aria-pressed': String(code === currentGroup),
        onclick: () => { currentGroup = code; draw(); },
      }, [label, pending ? el('span.badge-groups__dot', { 'aria-label': t('{n} phần thưởng chờ nhận', { n: pending }) }) : null]);
    }));
    const shown = tiles.filter((x) => currentGroup === 'all' || x.group === currentGroup);
    mount(host, el('div.badgerows', {}, shown.map((tile) => chainTile(tile, helpers))));
  };
  draw();

  return el('div', {}, [chips, host]);
}

/**
 * Ô huy hiệu gọn 2 dòng: icon vừa bên trái; dòng 1 là tên, dòng 2 là tiến độ
 * tới bậc kế tiếp ("7/10"), "Nhận thưởng" khi có XP chờ, hoặc "Đã đạt". Chuỗi
 * nhiều bậc có thêm mấy chấm nhỏ cuối dòng 2.
 */
function chainTile({ list, current, earned }, helpers) {
  const tiers = list.length > 1
    ? el('span.badgerow__tiers', { 'aria-label': t('Bậc {n}/{total}', { n: earned, total: list.length }) },
      list.map((b) => el('i', { dataset: { on: String(b.earned) } })))
    : null;
  let status;
  if (current.claimable) status = el('span.badgerow__claim', {}, t('Nhận thưởng'));
  else if (current.earned) status = el('span.badgerow__done', {}, t('Đã đạt'));
  else {
    status = el('span.badgerow__progress', {}, [
      bar(Math.round(((current.progress || 0) / Math.max(1, current.rule_value)) * 100)),
      el('small', {}, `${current.progress || 0}/${current.rule_value}`),
    ]);
  }
  return el('button.badgerow', {
    type: 'button',
    dataset: { earned: String(current.earned), claimable: String(Boolean(current.claimable)) },
    'aria-label': current.claimable ? t('{name} — có phần thưởng chưa nhận', { name: current.name }) : current.name,
    onclick: () => openChain(list, current, helpers),
  }, [
    el('span.badgerow__icon', { 'aria-hidden': 'true' }, current.icon || '🏅'),
    el('span.badgerow__main', {}, [
      el('span.badgerow__name', {}, current.name),
      el('span.badgerow__sub', {}, [status, tiers]),
    ]),
  ]);
}

function openChain(list, current, { reward, ruleText }) {
  sheet({
    title: current.name,
    body: [
      el('div', { style: { textAlign: 'center', fontSize: 'var(--font-size-display-lg)', lineHeight: '64px', filter: current.earned ? 'none' : 'grayscale(1)', opacity: current.earned ? '1' : '.45' } }, current.icon || '🏅'),
      el('p', { style: { textAlign: 'center' } }, current.description || ''),
      el('p.muted', { style: { textAlign: 'center' } }, current.earned
        ? t('Đạt được ngày {day}', { day: formatDay(current.awarded_at?.slice(0, 10)) })
        : t('Điều kiện: {rule}', { rule: ruleText(current) })),
      reward(current),
      list.length > 1 ? el('div.section-title', {}, [t('Các bậc trong chuỗi')]) : null,
      list.length > 1
        ? el('div.card', { style: { paddingTop: '0', paddingBottom: '0' } }, list.map((b) => el('div.row', {}, [
          el('span.row__icon', { style: { fontSize: '20px', filter: b.earned ? 'none' : 'grayscale(1)', opacity: b.earned ? '1' : '.5' } }, b.icon || '🏅'),
          el('div.row__main', {}, [
            el('div.row__title', {}, b.name),
            el('div.row__sub', {}, b.earned
              ? t('Đạt được ngày {day}', { day: formatDay(b.awarded_at?.slice(0, 10)) })
              : `${b.progress || 0}/${b.rule_value} · ${ruleText(b)}`),
          ]),
          el('span.row__value', { style: { color: b.claimable ? 'var(--text-brand-500)' : 'var(--text-secondary)' } },
            b.claimable ? t('Chờ nhận') : `+${b.xp_reward} XP`),
        ])))
        : null,
    ],
  });
}

/** Thẻ hồ sơ đầu trang: ai, đang ở cấp nào, còn bao xa tới cấp sau, và ba con số chính. */
/**
 * Thẻ hồ sơ: chú heo, cấp, XP tới cấp sau, chuỗi ngày, bài học, huy hiệu.
 * Dùng ở đầu màn này và ở đầu màn chủ Ekko Lover (`board` chỉ cần earned/total).
 */
export function profileCard(world, board = world.badges, { compact = world.concept === 'lover' } = {}) {
  const { level, nextLevel, progress, streak, learning } = world;
  const toNext = nextLevel
    ? t('Còn {xp} XP nữa lên {name}', { xp: progress.xpToNextLevel, name: nextLevel.name })
    : t('Bạn đã ở cấp cao nhất');
  const stat = (icon, value, label, key = null) => el('div.profilecard__stat', { dataset: key ? { stat: key } : {} }, [
    el('span.profilecard__staticon', {}, uiIcon(icon, 20)),
    el('b', {}, value),
    el('small', {}, label),
  ]);

  return el('div.profilecard', {}, [
    el('div.profilecard__head', {}, [
      el('img.profilecard__avatar', { src: level?.character_image || '/assets/levels/pig-1.png', alt: '' }),
      el('div.profilecard__who', {}, [
        el('span.profilecard__level', {}, [uiIcon('flash', 16), t('Cấp {n}', { n: level?.order_index ?? 1 })]),
        el('span.profilecard__name', {}, level?.name || ''),
        el('span.profilecard__xp', {}, `${progress.xp} XP`),
        // Ekko Lover: mã ID để bạn bè mời vào Heo Dream Team — bấm để chép.
        compact && world.me?.friendCode ? friendCodeChip(world.me.friendCode, { compact: true }) : null,
      ]),
    ]),
    xpBar('div.profilecard__bar', progress),
    el('div.profilecard__next', {}, [
      el('span', {}, toNext),
      progress.teamXpIntoLevel
        ? el('span.profilecard__teamxp', {}, [el('i', { 'aria-hidden': 'true' }), t('{xp} XP từ Dream Team', { xp: progress.teamXpIntoLevel })])
        : null,
    ]),
    compact
      // Ekko Lover: hai ô ngang hàng — Huy hiệu (mở trang Huy hiệu) và Thử thách
      // (mở trang Thử thách), mỗi ô một lối vào (data-stat).
      ? el('div.profilecard__chips', {}, [
        el('button.profilecard__badgechip', { type: 'button', dataset: { stat: 'badges' } }, [
          el('span.profilecard__staticon', {}, uiIcon('medal-01', 20)),
          el('span', {}, [el('b', {}, `${board.earned}/${board.total}`), el('small', {}, t('Huy hiệu'))]),
          el('span.profilecard__chev', { 'aria-hidden': 'true' }, '›'),
        ]),
        el('button.profilecard__badgechip', { type: 'button', dataset: { stat: 'challenges' } }, [
          el('span.profilecard__staticon', {}, uiIcon('target-02', 20)),
          el('span', {}, [
            el('b', {}, world.challenges?.claimable ? t('{n} chờ nhận', { n: world.challenges.claimable }) : t('Xem')),
            el('small', {}, t('Thử thách')),
          ]),
          el('span.profilecard__chev', { 'aria-hidden': 'true' }, '›'),
        ]),
      ])
      : el('div.profilecard__stats', {}, [
        stat(streak.status === 'frozen' ? 'snow' : 'fire', t('{n} ngày', { n: streak.count }), t('Kỷ lục {n} ngày', { n: streak.best ?? streak.count })),
        stat('book-open-01', `${learning.lessonsDone}/${learning.lessonsTotal}`, t('Bài học đã xong')),
        stat('medal-01', `${board.earned}/${board.total}`, t('Huy hiệu'), 'badges'),
      ]),
  ]);
}

/** Cấp độ người học đang đứng, hiển thị thẳng trên trang. */
function currentLevelCard(world) {
  const level = world.levels.find((l) => l.id === world.level?.id) || world.levels[0];
  if (!level) return null;

  return el('div.card', {}, [
    el('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } }, [
      levelArt(level),
      el('div', { style: { flex: '1' } }, [
        el('div', { style: { fontSize: 'var(--font-size-text-md)', fontWeight: 'var(--font-weight-semibold)' } }, levelName(level)),
        el('div.muted', {}, level.perk || `${level.xp_required} XP`),
      ]),
      el('span.pill', {}, t('Đang ở đây')),
    ]),
  ]);
}

/**
 * Tất cả các cấp trong một bottom sheet — đây là chỗ duy nhất trong app xem được trọn
 * bộ nhân vật.
 */
function openLevels(world) {
  sheet({
    title: t('Cấp độ heo'),
    body: [
      el('p.muted', { style: { marginTop: '0' } }, t('Mỗi cấp độ là một chú heo riêng. Học bài và dùng ba chức năng để lên cấp.')),
      ...world.levels.map((level) => el('div.levelrow', { dataset: { locked: String(!level.unlocked) } }, [
        levelArt(level),
        el('div', { style: { flex: '1', minWidth: '0' } }, [
          el('div', { style: { fontSize: 'var(--font-size-text-md)', fontWeight: 'var(--font-weight-semibold)' } }, levelName(level)),
          el('div.muted', {}, level.unlocked ? (level.perk || `${level.xp_required} XP`) : [uiIcon('square-lock-02', 16), ` ${t('Cần {xp} XP', { xp: level.xp_required })}`]),
        ]),
        level.id === world.level?.id ? el('span.pill', {}, t('Đang ở đây')) : null,
      ])),
    ],
  });
}

const levelName = (level) => el('span.withicon', {}, [`${level.order_index}.`, level.emoji ? dataIcon(level.emoji, 'piggy-bank', 16) : null, level.name]);

/** Ô hình của một cấp: chính chú heo của cấp đó. Thiếu ảnh thì hiện icon heo. */
function levelArt(level) {
  return el('div.levelart.levelart--pig', {}, [
    level.character_image
      ? el('img.levelart__isle', { src: level.character_image, alt: '', loading: 'lazy' })
      : dataIcon('piggy-bank', 'piggy-bank', 40),
  ]);
}

/**
 * Thanh tiến độ lên cấp: phần XP tự kiếm (xanh lá) rồi tới phần bạn cùng Dream
 * Team kiếm hộ (vàng). Dùng chung cho thẻ heo và thanh HUD.
 */
export function xpBar(spec, progress) {
  const total = Math.min(100, progress.percent || 0);
  const team = Math.min(total, progress.teamPercent || 0);
  return el(spec, {
    role: 'img',
    'aria-label': team
      ? t('{p}% lên cấp, trong đó {xp} XP từ Dream Team', { p: total, xp: progress.teamXpIntoLevel })
      : t('{p}% lên cấp', { p: total }),
  }, [
    el('i', { style: { width: `${total - team}%` } }),
    team ? el('i.xpbar__team', { style: { width: `${team}%` } }) : null,
  ]);
}

const KIND_LABEL = {
  lesson_completed: ['book-open-01', 'Hoàn thành bài học'],
  module_completed: ['mortarboard-02', 'Hoàn thành mô đun'],
  module_quiz: ['help-circle', 'Làm trắc nghiệm mô đun'],
  feature_used: ['compass-01', 'Dùng chức năng'],
  badge_awarded: ['medal-01', 'Nhận huy hiệu'],
  level_up: ['chart-increase', 'Lên cấp'],
  streak_recovered: ['fire', 'Cứu chuỗi streak'],
  news_read: ['news', 'Đọc tin tức'],
  daily_checkin: ['tick-02', 'Check-in hằng ngày'],
  challenge_claimed: ['target-02', 'Hoàn thành thử thách'],
  challenge_bonus: ['party', 'Thưởng thêm thử thách'],
  team_xp: ['user-multiple', 'XP từ Dream Team'],
};

const FEATURE_LABEL = {
  budget: 'Lập ngân sách',
  goals: 'Mục tiêu tài chính',
  expenses: 'Ghi chép chi tiêu',
  explore: 'Khám phá',
  plans: 'Nhiệm vụ',
  savings: 'Tiết kiệm',
};

const featureLabel = (code) => (FEATURE_LABEL[code] ? t(FEATURE_LABEL[code]) : '');

function activityRow(entry) {
  const [icon, kind] = KIND_LABEL[entry.kind] || ['sparkles', entry.kind];
  const label = KIND_LABEL[entry.kind] ? t(kind) : kind;
  const detail = entry.meta?.title
    || entry.meta?.name
    || featureLabel(entry.ref)
    || '';

  return el('div.row', {}, [
    el('span.row__icon', {}, uiIcon(icon, 20)),
    el('div.row__main', {}, [
      el('div.row__title', {}, detail || label),
      el('div.row__sub', {}, `${label} · ${formatDay(entry.day)}`),
    ]),
    entry.xp ? el('span.row__value', { style: { color: 'var(--text-brand-500)' } }, `+${entry.xp} XP`) : null,
  ]);
}

function ruleText(badge) {
  const n = badge.rule_value;
  const map = {
    lessons_completed: t('hoàn thành {n} bài học', { n }),
    modules_completed: badge.rule_target ? t('học xong mô đun này') : t('hoàn thành {n} mô đun', { n }),
    quiz_perfect: t('đúng hết {n} bài trắc nghiệm mô đun', { n }),
    streak_recovered: t('cứu chuỗi streak {n} lần', { n }),
    features_distinct: t('dùng {n} chức năng khác nhau', { n }),
    expense_days_streak: t('ghi chi tiêu {n} ngày liền', { n }),
    quick_logs: t('ghi nhanh {n} khoản', { n }),
    budget_months_kept: t('{n} tháng không vượt ngân sách', { n }),
    goal_deposits: t('nạp tiền vào mục tiêu {n} lần', { n }),
    news_read: t('đọc {n} tin tức', { n }),
    streak_days: t('giữ chuỗi {n} ngày', { n }),
    feature_used: t('dùng chức năng {name} {n} lần', { name: featureLabel(badge.rule_target), n }),
    expenses_logged: t('ghi {n} khoản chi tiêu', { n }),
    goals_created: t('tạo {n} mục tiêu', { n }),
    goals_completed: t('hoàn thành {n} mục tiêu', { n }),
    budgets_created: t('lập {n} ngân sách', { n }),
    level_reached: t('đạt cấp độ {n}', { n }),
    xp_total: t('tích luỹ {n} XP', { n }),
    bot_chats: t('trò chuyện với Ekko bot {n} lần', { n }),
  };
  return map[badge.rule_type] || t('chưa xác định');
}

