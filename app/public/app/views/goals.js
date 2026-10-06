/**
 * Mục tiêu — tab thứ hai của thẻ 5 chức năng ở màn chủ (thay chỗ "Nhiệm vụ").
 *
 * Ba màn nối nhau, không có thanh tab: danh sách mục tiêu (nút viền đứt "Thêm
 * mục tiêu mới" ở đầu) → bộ mục tiêu gợi ý xếp theo nhóm → màn thiết lập với
 * tên, số tiền và thời hạn đã điền trước. Người chưa có mục tiêu nào mở thẳng
 * vào bộ gợi ý.
 *
 * Toàn bộ phép tính thời hạn neo theo `today` do server trả về (ngày ở Việt
 * Nam), không theo đồng hồ của thiết bị.
 */
import { api, dataIcon, el, formatDay, getScrollRoot, guard, mount, singleFlight, spriteIcon, toast, uiIcon, vnd } from '/shared/client.js';
import { bar, celebrate, celebrateRewards, closeSheet, confirmSheet, moneyInput, readMoney, sheet } from '../ui.js';
import { getLang, t } from '../i18n.js';

const QUICK_AMOUNTS = [100000, 500000, 1000000];

/** Kết luận tư vấn mục tiêu → [sắc thái, nhãn]. */
const VERDICT = {
  kha_thi: ['good', 'Khả thi'],
  can_co_gang: ['warn', 'Cần cố gắng'],
  kho_dat: ['over', 'Khó đạt đúng hạn'],
};

/** Tab nhóm mục tiêu đang chọn ở trang thêm mục tiêu (Ekko Lover), giữ khi trang vẽ lại. */
let goalTab = 'free';

export default async function goalsView(ctx) {
  const board = el('div.skyboard');
  let data = await api.get('/api/goals');

  const toTop = () => getScrollRoot().scrollTo({ top: 0 });

  // Người chưa có mục tiêu nào thì mở thẳng vào bộ gợi ý: danh sách rỗng không có gì để xem.
  let view = data.goals.length ? 'mine' : 'new';

  const reload = async () => { data = await api.get('/api/goals'); };

  // Nút "←" trên thanh đầu lùi từng bước trong màn này (chi tiết / form / tư vấn
  // → danh sách), chỉ rời màn khi đang ở danh sách. Xem setInnerBack ở main.js.
  // Chỉ Ekko Lover; concept khác giữ cách cũ: "←" rời hẳn màn.
  const backTo = (fn) => (ctx.world.concept === 'lover' ? ctx.setInnerBack?.(fn ? () => { fn(); return true; } : null) : null);
  /** Về màn xem tư vấn của mục tiêu `id` (vừa tạo / vừa sửa), hoặc danh sách nếu không còn. */
  const toGoal = async (id) => {
    await reload();
    const found = data.goals.find((g) => g.id === id);
    if (found) showGoalAdvice(found); else { view = 'mine'; showList(); toTop(); }
  };
  const listBack = () => backTo(view === 'new' && data.goals.length ? () => go('mine') : null);

  const showList = () => { mount(board, ...(view === 'mine' ? mineBody() : catalogueBody())); listBack(); };
  const showForm = (spec) => {
    mount(board, ...formBody(spec));
    toTop();
    // Sửa một mục tiêu đã có: về màn xem tư vấn (Ekko Lover) hoặc danh sách; tạo mới: về bộ gợi ý.
    if (spec.goal) backTo(() => showGoalAdvice(spec.goal));
    else if (spec.goalId) backTo(() => toGoal(spec.goalId));
    else backTo(() => go('new'));
  };
  const go = (next) => { view = next; showList(); toTop(); };

  const back = async () => { await reload(); showList(); toTop(); };

  function mineBody() {
    const { goals } = data;

    if (!goals.length) {
      return [el('div.empty', {}, [
        el('img', { src: '/assets/lessons/muc-tieu-tiet-kiem.svg', alt: '' }),
        el('h3', {}, t('Chưa có mục tiêu nào')),
        el('p.muted', {}, t('Mục tiêu đầu tiên nên là một tháng chi phí thiết yếu. Đạt mốc đó rồi mới nâng dần lên ba tháng.')),
        el('button.btn', { style: { marginTop: '16px' }, onclick: () => go('new') }, t('Xem mục tiêu gợi ý')),
      ])];
    }

    return [
      el('button.goaladd', { type: 'button', onclick: () => go('new') }, [uiIcon('add-01', 24), t('Thêm mục tiêu mới')]),
      ...goals.map((goal) => goalCard(goal)),
      goals.length > 3
        ? el('p.skynote', {}, t('Bạn đang chạy nhiều mục tiêu cùng lúc. Ba mục tiêu là tối đa nếu muốn thực sự về đích.'))
        : null,
    ];
  }

  function catalogueBody() {
    const nodes = [
      el('div.goalstart', {}, [
        el('div.goalstart__title', {}, [uiIcon('target-02', 32), t('Chọn mục tiêu để bắt đầu')]),
        el('p.goalstart__sub', {}, t('Chọn mẫu phổ biến hoặc tạo mục tiêu tự do của riêng bạn.')),
      ]),
    ];

    const templateGrid = (group) => el('div.goalgrid', {}, group.templates.map((template) => el('button.tplcard', {
      type: 'button',
      'aria-label': `${template.name} · ${template.hint}`,
      onclick: () => showForm({ template: { ...template, group: group.label } }),
    }, [
      el('span.tplcard__emoji', {}, dataIcon(template.emoji, 'target-02', 32)),
      el('span.tplcard__name', {}, template.name),
      el('span.tplcard__hint', {}, template.hint),
    ])));

    if (ctx.world.concept === 'lover') {
      // Ekko Lover: các nhóm mục tiêu là một hàng tab, "Tự do" đứng đầu, các
      // nhóm còn lại giữ thứ tự như trước; bên dưới chỉ hiện mẫu của tab đang chọn.
      const groups = [
        ...data.templates.filter((g) => g.code === 'free'),
        ...data.templates.filter((g) => g.code !== 'free'),
      ];
      if (!groups.some((g) => g.code === goalTab)) goalTab = groups[0]?.code;
      const tabs = el('div.chips.goaltabs', { role: 'tablist' });
      const panel = el('div.goaltabs__panel');
      const draw = () => {
        mount(tabs, groups.map((group) => el('button.chip', {
          type: 'button',
          role: 'tab',
          'aria-pressed': String(group.code === goalTab),
          'aria-selected': String(group.code === goalTab),
          onclick: () => { goalTab = group.code; draw(); },
        }, [spriteIcon(group.icon, 16), group.label])));
        const group = groups.find((g) => g.code === goalTab);
        mount(panel, group ? templateGrid(group) : null);
      };
      draw();
      nodes.push(tabs, panel);
    } else {
      for (const group of data.templates) {
        nodes.push(el('div.goalgroup', {}, [spriteIcon(group.icon, 20), el('span', {}, group.label)]));
        nodes.push(templateGrid(group));
      }
    }

    // Không còn thanh tab: đã có mục tiêu thì cần một lối quay về danh sách.
    if (data.goals.length) {
      nodes.push(el('button.btn.btn--pill.btn--white.btn--block', { style: { marginTop: '20px' }, onclick: () => go('mine') }, t('Quay lại mục tiêu của bạn')));
    }
    return nodes;
  }

  // --------------------------------------------------------------- goal card
  /**
   * Thẻ một mục tiêu: đầu thẻ (icon, tên, hạn, thùng rác) → đã có / mục tiêu →
   * thanh tiến độ → % hoàn thành → ô "cần bao nhiêu mỗi kỳ" → ba nút nạp nhanh.
   * Chạm vào đầu thẻ để sửa mục tiêu.
   */
  function goalCard(goal) {
    const done = goal.status === 'done';
    // Ekko Lover không nạp tiền vào mục tiêu: tính trên trọn số tiền mục tiêu.
    const saved = ctx.world.concept === 'lover' ? 0 : goal.saved_amount;
    const plan = savingPlan({ ...goal, target: goal.target_amount, saved, today: data.today });
    const percent = Math.min(100, Math.round(goal.percent || 0));

    const advice = done
      ? t('Đã cán đích. Chúc mừng bạn!')
      : !plan ? t('Đặt thời hạn để Ekko chia số tiền theo từng kỳ.')
        : plan.expired ? t('Đã quá hạn. Sửa thời hạn để Ekko tính lại.')
          : [
            `${t('Cần')} `, el('b', {}, vnd(plan.perPeriod)),
            goal.period === 'week' ? t('/tuần') : t('/tháng'),
            ` ${t('trong {n} {unit} còn lại.', { unit: periodUnit(goal.period), n: plan.periods })}`,
          ];

    return el(`div.goalcard${done ? '.is-done' : ''}`, {}, [
      el('div.goalcard__head', {}, [
        el('button.goalcard__open', {
          type: 'button',
          // Ekko Lover: bấm vào mục tiêu để xem lại lời tư vấn; sửa nằm trong màn đó.
          'aria-label': ctx.world.concept === 'lover' ? t('Xem tư vấn của mục tiêu') : t('Sửa mục tiêu'),
          onclick: () => (ctx.world.concept === 'lover' ? showGoalAdvice(goal) : showForm({ goal })),
        }, [
          el('span.goalcard__icon', {}, dataIcon(goal.icon, 'target-02', 32)),
          el('span.goalcard__meta', {}, [
            el('span.goalcard__name', {}, goal.name),
            goal.deadline ? el('span.goalcard__due', {}, t('Hạn: {day}', { day: formatDay(goal.deadline) })) : null,
          ]),
        ]),
        el('button.goalcard__delete', { type: 'button', 'aria-label': t('Xoá mục tiêu'), onclick: () => remove(goal) }, [uiIcon('delete-02', 24)]),
      ]),
      // Lời tư vấn lúc tạo mục tiêu (Ekko Lover): kết luận + câu tóm tắt.
      goal.advice ? el('button.goalcard__ai', {
        type: 'button',
        dataset: { tone: VERDICT[goal.advice.verdict]?.[0] || 'over' },
        onclick: () => showGoalAdvice(goal),
      }, [
        el('span.goalcard__aiverdict', {}, t((VERDICT[goal.advice.verdict] || VERDICT.kho_dat)[1])),
        el('span.goalcard__aitext', {}, goal.advice.headline),
      ]) : null,
      // Ekko Lover không nạp tiền vào mục tiêu, nên không có số đã có / thanh tiến
      // độ / % hoàn thành — chỉ hiện số tiền mục tiêu.
      ...(ctx.world.concept === 'lover'
        ? [el('div.goalcard__amounts', {}, [el('span', {}, `${t('Số tiền mục tiêu')} `), el('b', {}, vnd(goal.target_amount))])]
        : [
          el('div.goalcard__amounts', {}, [
            el('b', {}, vnd(goal.saved_amount)),
            el('span', {}, `/ ${vnd(goal.target_amount)}`),
          ]),
          bar(goal.percent, done ? 'good' : ''),
          el('div.goalcard__percent', {}, t('{p}% hoàn thành', { p: percent })),
        ]),
      el('div.goalcard__advice', {}, advice),
      // Ekko Lover: thẻ mục tiêu chỉ để theo dõi, không có nút nạp tiền.
      done || ctx.world.concept === 'lover' ? null : el('div.goalcard__quick', {}, QUICK_AMOUNTS.map((amount) => el('button.goalcard__chip', {
        type: 'button', onclick: () => deposit(goal, amount),
      }, `+ ${amount.toLocaleString(getLang() === 'en' ? 'en-US' : 'vi-VN')}`))),
      done || ctx.world.concept === 'lover' ? null : el('button.goalcard__other', { type: 'button', onclick: () => openDeposit(goal) }, t('Nạp số khác')),
    ]);
  }

  // --------------------------------------------------------------- setup form
  function formBody({ template = null, goal = null, draft: restored = null, goalId = null }) {
    const editing = Boolean(goal);
    // Ekko Lover: tạo mục tiêu mới đi qua bước Tư vấn trước khi lưu, và không hỏi kỳ tiết kiệm.
    const lover = ctx.world.concept === 'lover';
    const emoji = goal?.icon || template?.emoji || 'target-02';
    const groupLabel = editing ? (goal.group || t('Mục tiêu của bạn')) : template.group;
    // Mục tiêu tự do cố tình để trống tên và số tiền: đó là phần người dùng tự đặt.
    const blank = template?.code === 'custom';

    const nameInput = el('input.input', {
      value: restored ? restored.name : editing ? goal.name : (blank ? '' : template.name),
      placeholder: t('VD: Học tiếng Anh'),
      maxlength: '120',
    });
    const amountInput = moneyInput(restored ? restored.targetAmount : editing ? goal.target_amount : (blank ? 0 : template.amount));
    const deadlineInput = el('input.input', {
      type: 'date',
      min: data.today,
      value: restored ? (restored.deadline || '') : editing ? (goal.deadline || '') : addMonths(data.today, template.months),
    });

    let period = editing ? (goal.period || 'month') : 'month';
    const periodPick = el('div.periodpick', {}, Object.entries(data.periods).map(([code, label]) => el('button', {
      type: 'button',
      'aria-pressed': String(code === period),
      onclick: (event) => {
        period = code;
        [...periodPick.children].forEach((child) => child.setAttribute('aria-pressed', String(child === event.currentTarget)));
        refresh();
      },
    }, t(label))));

    const calcBody = el('div.ekkocalc__body');
    const read = () => ({
      name: nameInput.value.trim(),
      targetAmount: readMoney(amountInput),
      deadline: deadlineInput.value || null,
      period,
    });

    const refresh = () => {
      const draft = read();
      mount(calcBody, ...calcLines({
        target: draft.targetAmount,
        saved: lover ? 0 : (goal?.saved_amount ?? 0),
        deadline: draft.deadline,
        period,
        today: data.today,
      }));
    };
    amountInput.addEventListener('input', refresh);
    deadlineInput.addEventListener('change', refresh);
    refresh();

    // singleFlight: một lần bấm "Lưu mục tiêu" không được tạo thành hai mục tiêu.
    const save = singleFlight(async () => {
      const draft = read();
      if (!draft.name) return toast(t('Hãy đặt tên cho mục tiêu'), 'error');
      if (!draft.targetAmount) return toast(t('Nhập số tiền mục tiêu'), 'error');

      const result = editing
        ? await guard(() => api.patch(`/api/goals/${goal.id}`, draft), t('Không lưu được'))
        : await guard(() => api.post('/api/goals', { ...draft, template: template.code, icon: emoji }), t('Không tạo được mục tiêu'));
      if (!result) return;

      toast(editing ? t('Đã lưu mục tiêu') : t('Đã tạo mục tiêu'), 'success');
      if (!editing) await celebrateRewards(result.rewards, { title: t('Mục tiêu đã được đặt') });
      await ctx.refreshWorld();
      // Lưu xong thì về danh sách có mục tiêu vừa đặt, không phải về lại bộ gợi ý.
      view = 'mine';
      await back();
    });

    // Tạo mới ở Ekko Lover: "Tư vấn" mở màn phân tích; lưu mục tiêu nằm ở màn đó.
    const advise = () => {
      const draft = read();
      if (!draft.name) return toast(t('Hãy đặt tên cho mục tiêu'), 'error');
      if (!draft.targetAmount) return toast(t('Nhập số tiền mục tiêu'), 'error');
      // Sửa một mục tiêu đã có cũng đi qua Tư vấn: lời tư vấn luôn khớp với số mới.
      showAdvice({ template: template || templateOf(goal), emoji, groupLabel, draft, goalId: goalId || goal?.id || null });
    };

    return [
      el('div.goalhero', {}, [
        el('span.goalhero__emoji', {}, dataIcon(emoji, 'target-02', 32)),
        el('span.goalhero__meta', {}, [
          el('span.goalhero__group', {}, groupLabel),
          el('span.goalhero__name', {}, editing ? goal.name : (blank ? t('Mục tiêu của riêng bạn') : template.name)),
        ]),
      ]),

      el('div.card.goalform', {}, [
        el('label.field', {}, [el('span', {}, t('Tên mục tiêu')), nameInput]),
        el('label.field', {}, [el('span', {}, t('Số tiền mục tiêu (VNĐ)')), amountInput]),
        el('label.field', lover ? { style: { marginBottom: '0' } } : {}, [el('span', {}, t('Thời hạn hoàn thành')), deadlineInput]),
        lover ? null : el('div.field', { style: { marginBottom: '0' } }, [el('span', {}, t('Kỳ tiết kiệm')), periodPick]),
      ]),

      el('div.ekkocalc', {}, [
        el('div.ekkocalc__head', {}, [spriteIcon('star-stroke', 20), el('span', {}, t('Ekko tính giúp bạn'))]),
        calcBody,
      ]),

      el('div.formactions', {}, [
        el('button.btn.btn--pill.btn--white', { onclick: () => go(editing || data.goals.length ? 'mine' : 'new') }, t('Huỷ')),
        !lover
          ? el('button.btn.btn--pill', { onclick: save }, editing ? t('Lưu thay đổi') : t('Lưu mục tiêu'))
          : el('button.btn.btn--pill', { onclick: advise }, [spriteIcon('star-stroke', 20), ` ${t(editing ? 'Tư vấn & lưu' : 'Tư vấn')}`]),
      ]),
    ];
  }

  // ------------------------------------------- xem lại tư vấn của một mục tiêu
  /** Mẫu (kèm tên nhóm) mà một mục tiêu đã chọn lúc tạo — để sửa / tư vấn lại. */
  function templateOf(goal) {
    for (const group of data.templates) {
      const found = group.templates.find((tpl) => tpl.code === goal.template);
      if (found) return { ...found, group: group.label };
    }
    return { code: 'custom', name: goal.name, emoji: goal.icon, months: 12, amount: goal.target_amount, group: t('Mục tiêu của bạn') };
  }

  /** Bấm vào một mục tiêu (Ekko Lover): tóm tắt mục tiêu + lời tư vấn đã lưu lúc tạo. */
  function showGoalAdvice(goal) {
    adviceHost = null;
    const template = templateOf(goal);
    const spec = {
      template,
      emoji: goal.icon || template.emoji,
      groupLabel: goal.group || template.group,
      draft: { name: goal.name, targetAmount: goal.target_amount, deadline: goal.deadline },
      goalId: goal.id,
    };
    const a = goal.advice;
    const [tone, label] = a ? (VERDICT[a.verdict] || VERDICT.kho_dat) : [];
    mount(board, ...[
      el('div.goalhero', {}, [
        el('span.goalhero__emoji', {}, dataIcon(spec.emoji, 'target-02', 32)),
        el('span.goalhero__meta', {}, [
          el('span.goalhero__group', {}, spec.groupLabel),
          el('span.goalhero__name', {}, goal.name),
        ]),
      ]),
      el('div.card.advice__goal', {}, [
        el('div.advice__row', {}, [el('span', {}, t('Số tiền mục tiêu')), el('b', {}, vnd(goal.target_amount))]),
        el('div.advice__row', {}, [el('span', {}, t('Thời hạn')), el('b', {}, goal.deadline ? formatDay(goal.deadline) : t('Chưa đặt'))]),
      ]),
      el('div.advice__host', {}, [a
        ? el('div.card.advice__result', { dataset: { tone } }, [
          el('div.advice__verdictrow', {}, [
            el('span.advice__verdict', {}, t(label)),
            el('span.advice__source', {}, [
              a.source === 'ai' ? t('Phân tích bởi AI') : t('Ekko tính'),
              a.at ? ` · ${formatDay(a.at.slice(0, 10))}` : '',
            ]),
          ]),
          el('p.advice__headline', {}, a.headline),
          el('ul.advice__points', {}, (a.points || []).map((p) => el('li', {}, p))),
          a.tip ? el('p.advice__tip', {}, [spriteIcon('star-stroke', 16), a.tip]) : null,
          a.reachDate ? el('div.advice__reach', {}, [
            el('span', {}, t('Dự kiến đạt')),
            el('b', {}, t('{n} tháng · {day}', { n: a.monthsNeeded, day: formatDay(a.reachDate) })),
          ]) : null,
        ])
        : el('div.card.advice__loading', {}, [el('span', {}, t('Mục tiêu này chưa có tư vấn.'))])]),
      // Hai nút: Sửa mục tiêu (trái), Tư vấn lại (phải). Quay lại danh sách bằng "←" trên thanh đầu.
      el('div.formactions', {}, [
        el('button.btn.btn--pill.btn--white', { onclick: () => showForm({ goal }) }, t('Sửa mục tiêu')),
        el('button.btn.btn--pill', { onclick: () => showAdvice(spec) }, [
          spriteIcon('star-stroke', 20), ` ${a ? t('Tư vấn lại') : t('Tư vấn ngay')}`,
        ]),
      ]),
    ]);
    toTop();
    backTo(() => go('mine'));
  }

  // ------------------------------------------------------- tư vấn (Ekko Lover)
  /**
   * Màn tư vấn trước khi tạo mục tiêu: tóm tắt mục tiêu, số liệu dùng để phân
   * tích (thu nhập, khả năng để dành), rồi nhận xét khả thi và thời gian đạt.
   * Chưa có số liệu thì hỏi hai con số ước tính trước. Lưu mục tiêu ở cuối màn.
   */
  function showAdvice(spec) {
    mount(board, ...adviceBody(spec));
    toTop();
    // Đã lưu thành mục tiêu thì về danh sách; chưa lưu thì về form với số đã nhập.
    backTo(() => {
      adviceHost = null;
      if (spec.goalId) toGoal(spec.goalId); else showForm({ template: spec.template, draft: spec.draft });
    });
    runAdvice(spec);
  }

  function adviceBody(spec) {
    const { emoji, groupLabel, draft } = spec;
    const host = el('div.advice__host', {}, [adviceLoading()]);
    adviceHost = host;
    adviceActions = el('div.formactions');
    drawAdviceActions(spec);
    return [
      el('div.goalhero', {}, [
        el('span.goalhero__emoji', {}, dataIcon(emoji, 'target-02', 32)),
        el('span.goalhero__meta', {}, [
          el('span.goalhero__group', {}, groupLabel),
          el('span.goalhero__name', {}, draft.name),
        ]),
      ]),
      el('div.card.advice__goal', {}, [
        el('div.advice__row', {}, [el('span', {}, t('Số tiền mục tiêu')), el('b', {}, vnd(draft.targetAmount))]),
        el('div.advice__row', {}, [el('span', {}, t('Thời hạn')), el('b', {}, draft.deadline ? formatDay(draft.deadline) : t('Chưa đặt'))]),
      ]),
      host,
      adviceActions,
    ];
  }

  let adviceHost = null;
  let adviceActions = null;

  /** Nút cuối màn tư vấn: chưa lưu thì Huỷ / Sửa; đã lưu vào danh sách thì Sửa / Xem danh sách. */
  function drawAdviceActions(spec) {
    mount(adviceActions, [
      el('button.btn.btn--pill.btn--white', {
        onclick: () => showForm({ template: spec.template, draft: spec.draft, goalId: spec.goalId }),
      }, t('Sửa mục tiêu')),
      spec.goalId
        ? el('button.btn.btn--pill', { onclick: async () => { adviceHost = null; view = 'mine'; await back(); } }, t('Xem mục tiêu của bạn'))
        : el('button.btn.btn--pill.btn--white', { onclick: () => { adviceHost = null; go(data.goals.length ? 'mine' : 'new'); } }, t('Huỷ')),
    ]);
  }

  const adviceLoading = () => el('div.card.advice__loading', {}, [
    el('span.advice__spinner', { 'aria-hidden': 'true' }),
    el('span', {}, t('Ekko đang phân tích mục tiêu của bạn…')),
  ]);

  // Nút Phân tích / Thử lại bị khoá ngay khi bấm (xem askFinances, adviceRetry),
  // nên không gửi hai yêu cầu cùng lúc từ một màn.
  async function runAdvice(spec, extra = {}) {
    const host = adviceHost;
    mount(host, adviceLoading());
    const result = await guard(() => api.post('/api/goals/advice', {
      ...spec.draft, ...extra, template: spec.template?.code, icon: spec.emoji, goalId: spec.goalId,
    }), t('Chưa tư vấn được, thử lại nhé'));
    // Server đã lưu mục tiêu thì nhớ id ngay, kể cả khi người dùng đã rời màn —
    // nếu không, quay lại form rồi Tư vấn lần nữa sẽ tạo mục tiêu thứ hai.
    if (result?.goal) spec.goalId = result.goal.id;
    if (host !== adviceHost) { if (result?.goal) await reload(); return; }   // người dùng đã rời màn này
    if (!result) { mount(host, adviceRetry(spec)); return; }
    mount(host, result.needsInfo.length ? askFinances(spec, result) : adviceResult(spec, result));
    if (result.goal) {
      // Có tư vấn là mục tiêu đã nằm trong danh sách (server tạo hoặc cập nhật).
      drawAdviceActions(spec);
      toast(result.created ? t('Đã thêm vào danh sách mục tiêu') : t('Đã cập nhật mục tiêu'), 'success');
      if (result.created) await celebrateRewards(result.rewards, { title: t('Mục tiêu đã được đặt') });
      await reload();
      await ctx.refreshWorld();
    }
  }

  const adviceRetry = (spec) => el('div.card.advice__loading', {}, [
    el('span', {}, t('Chưa tư vấn được lúc này.')),
    el('button.linkbtn', { onclick: (e) => { e.currentTarget.disabled = true; runAdvice(spec); } }, t('Thử lại')),
  ]);

  /** Chưa đủ số liệu: hỏi thu nhập và số tiền có thể để dành ước tính mỗi tháng. */
  function askFinances(spec, result) {
    const incomeInput = moneyInput(result.finances.income ?? 0, t('VD: 10.000.000'));
    const savingInput = moneyInput(result.finances.saving ?? 0, t('VD: 2.000.000'));
    const submit = () => {
      const monthlyIncome = readMoney(incomeInput);
      const monthlySaving = readMoney(savingInput);
      if (!monthlyIncome) return toast(t('Nhập thu nhập ước tính hằng tháng'), 'error');
      if (monthlySaving > monthlyIncome) return toast(t('Số tiền tiết kiệm không nên lớn hơn thu nhập'), 'error');
      button.disabled = true;
      runAdvice(spec, { monthlyIncome, monthlySaving });
    };
    const button = el('button.btn.btn--block', { onclick: () => submit() }, t('Phân tích'));
    return el('div.card.advice__ask', {}, [
      el('div.advice__title', {}, [spriteIcon('star-stroke', 20), t('Cho Ekko biết thêm một chút')]),
      el('p.muted', {}, t('Ekko chưa có đủ dữ liệu thu nhập và chi tiêu của bạn. Nhập hai con số ước tính để Ekko phân tích nhé.')),
      el('label.field', {}, [el('span', {}, t('Tổng thu nhập ước tính hằng tháng')), incomeInput]),
      el('label.field', {}, [el('span', {}, t('Tổng tiền có thể tiết kiệm ước tính hằng tháng')), savingInput]),
      button,
    ]);
  }


  function adviceResult(spec, result) {
    const { finances, facts, analysis } = result;
    const [tone, label] = VERDICT[analysis.verdict] || VERDICT.kho_dat;
    const sourceLabel = (source) => (source === 'data' ? t('theo dữ liệu ghi chép') : t('ước tính của bạn'));
    return el('div', {}, [
      el('div.card.advice__result', { dataset: { tone } }, [
        el('div.advice__verdictrow', {}, [
          el('span.advice__verdict', {}, t(label)),
          el('span.advice__source', {}, analysis.source === 'ai' ? t('Phân tích bởi AI') : t('Ekko tính')),
        ]),
        el('p.advice__headline', {}, analysis.headline),
        el('ul.advice__points', {}, analysis.points.map((p) => el('li', {}, p))),
        analysis.tip ? el('p.advice__tip', {}, [spriteIcon('star-stroke', 16), analysis.tip]) : null,
        facts.reachDate ? el('div.advice__reach', {}, [
          el('span', {}, t('Dự kiến đạt')),
          el('b', {}, t('{n} tháng · {day}', { n: facts.monthsNeeded, day: formatDay(facts.reachDate) })),
        ]) : null,
      ]),
      el('div.card.advice__basis', {}, [
        el('div.advice__row', {}, [
          el('span', {}, [t('Thu nhập mỗi tháng'), el('small', {}, sourceLabel(finances.incomeSource))]),
          el('b', {}, vnd(finances.income)),
        ]),
        el('div.advice__row', {}, [
          el('span', {}, [t('Có thể tiết kiệm mỗi tháng'), el('small', {}, sourceLabel(finances.savingSource))]),
          el('b', {}, vnd(finances.saving)),
        ]),
        el('button.linkbtn', { onclick: () => mount(adviceHost, askFinances(spec, result)) }, t('Cập nhật số ước tính')),
      ]),
    ]);
  }



  // ------------------------------------------------------------------ actions
  /** singleFlight: bấm nhanh hai lần vào "+500k" không được nạp thành hai lần. */
  const deposit = singleFlight(async (goal, amount) => {
    const result = await guard(() => api.post(`/api/goals/${goal.id}/deposit`, { amount }), t('Không nạp được'));
    if (!result) return;

    if (result.justCompleted) {
      await celebrate({
        title: t('Cán đích!'),
        subtitle: t('Bạn đã hoàn thành mục tiêu "{name}".', { name: goal.name }),
        image: '/assets/mascot/bot-1.png',
        stats: [vnd(goal.target_amount)],
      });
    } else {
      toast({
        title: t('Đã nạp {amount}', { amount: vnd(amount) }),
        body: t('vào "{name}"', { name: goal.name }),
      }, 'success');
    }
    await ctx.refreshWorld();
    await reload();
    showList();
  });

  function openDeposit(goal) {
    const input = moneyInput(0, t('VD: 350.000'));
    sheet({
      title: t('Nạp vào "{name}"', { name: goal.name }),
      body: [
        el('label.field', {}, [el('span', {}, t('Số tiền')), input]),
        el('button.btn.btn--block', {
          onclick: async () => {
            const amount = readMoney(input);
            if (!amount) return toast(t('Nhập số tiền lớn hơn 0'), 'error');
            closeSheet();
            await deposit(goal, amount);
          },
        }, t('Nạp')),
      ],
    });
  }

  async function remove(goal) {
    const ok = await confirmSheet({
      title: t('Xoá mục tiêu'),
      message: ctx.world.concept === 'lover'
        ? t('Xoá "{name}"? Lời tư vấn của mục tiêu này cũng sẽ mất.', { name: goal.name })
        : t('Xoá "{name}"? Lịch sử nạp tiền của mục tiêu này cũng sẽ mất.', { name: goal.name }),
    });
    if (!ok) return;
    if (!await guard(() => api.delete(`/api/goals/${goal.id}`), t('Không xoá được'))) return;
    toast(t('Đã xoá mục tiêu'));
    await reload();
    showList();
  }

  showList();
  return el('div.screen__body.screen__body--sky', {}, [board]);
}

// ------------------------------------------------------------------ helpers
const periodEvery = (period) => (period === 'week' ? t('mỗi tuần') : t('mỗi tháng'));
const periodUnit = (period) => (period === 'week' ? t('tuần') : t('tháng'));

/**
 * Số tiền phải để dành mỗi kỳ để kịp hạn.
 *
 * Đếm theo tháng/tuần dương lịch giữa hôm nay và thời hạn, nên "18 tháng" nghĩa
 * là 18 lần để dành thật, không phải 18 × 30 ngày.
 */
function savingPlan({ target, saved = 0, deadline, period = 'month', today }) {
  if (!target || !deadline || !today) return null;
  const remaining = Math.max(0, Number(target) - Number(saved));
  if (deadline < today) return { expired: true, remaining, period };

  const periods = Math.max(1, period === 'week'
    ? Math.floor(daysBetween(today, deadline) / 7)
    : monthsBetween(today, deadline));

  return { periods, perPeriod: Math.round(remaining / periods), remaining, period };
}

function calcLines({ target, saved, deadline, period, today }) {
  if (!target) return [el('p.ekkocalc__hint', {}, t('Nhập số tiền mục tiêu để Ekko tính giúp bạn.'))];
  if (!deadline) return [el('p.ekkocalc__hint', {}, t('Chọn thời hạn để Ekko chia số tiền theo từng kỳ.'))];

  const plan = savingPlan({ target, saved, deadline, period, today });
  if (plan.expired) return [el('p.ekkocalc__hint', {}, t('Thời hạn đã qua. Chọn một mốc trong tương lai để Ekko tính lại.'))];

  return [
    el('p.ekkocalc__line', {}, [
      `${t('Cần tiết kiệm')} `,
      el('b', {}, vnd(plan.perPeriod)),
      ` ${periodEvery(period)}`,
    ]),
    el('p.ekkocalc__sub', {}, saved > 0
      ? t('trong {n} {unit} để bù {amount} còn thiếu',
        { n: plan.periods, unit: periodUnit(period), amount: vnd(plan.remaining) })
      : t('trong {n} {unit} để đạt {amount}',
        { n: plan.periods, unit: periodUnit(period), amount: vnd(target) })),
  ];
}

// --- lịch: tính trên chuỗi YYYY-MM-DD để không lệ thuộc múi giờ thiết bị ---
const parseDay = (key) => key.split('-').map(Number);

const daysBetween = (from, to) => Math.round(
  (Date.UTC(...shiftMonth(parseDay(to))) - Date.UTC(...shiftMonth(parseDay(from)))) / 86400000,
);

/** [y, m, d] của lịch sang [y, mIndex, d] của Date.UTC. */
const shiftMonth = ([y, m, d]) => [y, m - 1, d];

function monthsBetween(from, to) {
  const [fy, fm, fd] = parseDay(from);
  const [ty, tm, td] = parseDay(to);
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
}

/** Cộng tháng và giữ ngày trong tháng, kẹp lại nếu tháng đích ngắn hơn. */
function addMonths(key, months) {
  const [y, m, d] = parseDay(key);
  const lastDay = new Date(Date.UTC(y, m + months, 0)).getUTCDate();
  const date = new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay)));
  return date.toISOString().slice(0, 10);
}
