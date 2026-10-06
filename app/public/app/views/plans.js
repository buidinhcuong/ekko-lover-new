/**
 * Nhiệm vụ (trước đây gọi là "Kế hoạch"; route, bảng và API vẫn giữ tên `plans`).
 *
 * Sao chép y nguyên cấu trúc của Mục tiêu tài chính (goals.js): màn đầu là bộ
 * nhiệm vụ gợi ý xếp theo nhóm (Học tập, Tài chính, Lối sống, Tự do). Chọn một
 * cái là sang màn thiết lập với tên và số việc đã điền trước — chỉ cần sửa
 * cho khớp hoàn cảnh của mình.
 *
 * Khác với mục tiêu tài chính (tích luỹ tiền), nhiệm vụ tích luỹ bằng việc
 * làm xong từng việc (task) trong danh sách.
 */
import { api, dataIcon, el, formatDay, getScrollRoot, guard, mount, singleFlight, spriteIcon, toast, uiIcon } from '/shared/client.js';
import { bar, celebrate, celebrateRewards, closeSheet, confirmSheet, sheet } from '../ui.js';
import { t } from '../i18n.js';

export default async function plansView(ctx) {
  const board = el('div.skyboard');
  let data = await api.get('/api/plans');

  const toTop = () => getScrollRoot().scrollTo({ top: 0 });

  // Người chưa có nhiệm vụ nào thì mở thẳng vào bộ gợi ý: tab rỗng không có gì để xem.
  let tab = data.plans.length ? 'mine' : 'new';

  const TABS = [
    { key: 'mine', label: 'Nhiệm vụ của bạn' },
    { key: 'new', label: 'Thêm nhiệm vụ mới' },
  ];

  const head = () => el('div.skytabs', {}, [
    el('div.skytabs__track', { role: 'tablist' }, TABS.map((item) => el('button', {
      role: 'tab',
      type: 'button',
      'aria-selected': String(item.key === tab),
      onclick: () => {
        tab = item.key;
        showList();
        toTop();
      },
    }, t(item.label)))),
  ]);

  const reload = async () => { data = await api.get('/api/plans'); };

  const showList = () => mount(board, head(), ...(tab === 'mine' ? mineBody() : catalogueBody()));
  const showForm = (spec) => { mount(board, head(), ...formBody(spec)); toTop(); };
  const showTasks = (plan) => { mount(board, head(), ...tasksBody(plan)); toTop(); };

  const back = async () => { await reload(); showList(); toTop(); };

  function mineBody() {
    const { plans, totals } = data;

    if (!plans.length) {
      return [el('div.empty', {}, [
        el('img', { src: '/assets/lessons/muc-tieu-tiet-kiem.svg', alt: '' }),
        el('h3', {}, t('Chưa có nhiệm vụ nào')),
        el('p.muted', {}, t('Nhiệm vụ đầu tiên nên chia nhỏ thành vài việc dễ làm. Xong rồi mới nâng dần lên.')),
        el('button.btn', {
          style: { marginTop: '16px' },
          onclick: () => { tab = 'new'; showList(); toTop(); },
        }, t('Xem nhiệm vụ gợi ý')),
      ])];
    }

    return [
      el('p.skynote', {}, t('Đã hoàn thành {done} / {total} việc', { done: totals.completed_tasks, total: totals.total_tasks })),
      ...plans.map((plan) => planCard(plan)),
      plans.length > 3
        ? el('p.skynote', {}, t('Bạn đang chạy nhiều nhiệm vụ cùng lúc. Ba nhiệm vụ là tối đa nếu muốn thực sự hoàn thành.'))
        : null,
    ];
  }

  function catalogueBody() {
    const nodes = [el('p.skynote', {}, t('Chọn một gợi ý, Ekko điền sẵn số việc và thời hạn cho bạn.'))];

    for (const group of data.templates) {
      nodes.push(el('div.goalgroup', {}, [spriteIcon(group.icon, 20), el('span', {}, group.label)]));
      nodes.push(el('div.goalgrid', {}, group.templates.map((template) => el('button.tplcard', {
        type: 'button',
        'aria-label': `${template.name} · ${template.hint}`,
        onclick: () => showForm({ template: { ...template, group: group.label } }),
      }, [
        el('span.tplcard__emoji', {}, dataIcon(template.emoji, 'task-01', 32)),
        el('span.tplcard__name', {}, template.name),
        el('span.tplcard__hint', {}, template.hint),
      ]))));
    }

    return nodes;
  }

  // --------------------------------------------------------------- plan card
  function planCard(plan) {
    const done = plan.status === 'done';

    return el('div.card', {}, [
      el('div.card__head', {}, [
        el('span.cardicon', {}, dataIcon(plan.icon, 'task-01', 24)),
        el('h3', {}, plan.name),
        done ? el('span.pill.pill--done', {}, [uiIcon('tick-02', 16), ` ${t('Xong')}`]) : null,
      ]),
      el('div.stat-row', {}, [
        el('b', {}, t('{done} / {total} việc', { done: plan.completed_tasks, total: plan.total_tasks })),
      ]),
      el('div', { style: { marginTop: '8px' } }, [bar(plan.percent, done ? 'good' : '')]),
      el('div.stat-row', { style: { marginTop: '10px' } }, [
        el('small', {}, done ? t('Đã hoàn thành') : t('Còn {n} việc', { n: plan.remaining })),
        el('small', {}, plan.deadline ? t('Hạn {day}', { day: formatDay(plan.deadline) }) : ''),
      ]),

      el('div', { style: { display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' } }, [
        el('button.chip', { onclick: () => showTasks(plan) }, t('Xem các việc')),
      ]),

      el('div', { style: { display: 'flex', gap: '8px', marginTop: '12px' } }, [
        el('button.btn.btn--sm.btn--ghost', { onclick: () => showForm({ plan }) }, t('Sửa')),
        el('button.btn.btn--sm.btn--danger', { onclick: () => remove(plan) }, t('Xoá')),
      ]),
    ]);
  }

  // -------------------------------------------------------------- task list
  function tasksBody(plan) {
    return [
      el('div.goalhero', {}, [
        el('span.goalhero__emoji', {}, dataIcon(plan.icon, 'task-01', 32)),
        el('span.goalhero__meta', {}, [
          el('span.goalhero__group', {}, plan.group || t('Nhiệm vụ của bạn')),
          el('span.goalhero__name', {}, plan.name),
        ]),
      ]),

      el('div', { style: { marginTop: '8px' } }, [bar(plan.percent, plan.status === 'done' ? 'good' : '')]),

      el('div.card', { style: { marginTop: '14px' } }, [
        ...(plan.tasks && plan.tasks.length
          ? plan.tasks.map((task) => taskRow(plan, task))
          : [el('p.muted', {}, t('Chưa có việc nào. Thêm việc đầu tiên bên dưới.'))]),
      ]),

      el('button.btn.btn--block', { style: { marginTop: '12px' }, onclick: () => openAddTask(plan) }, t('+ Thêm việc')),

      el('div', { style: { display: 'flex', gap: '8px', marginTop: '16px' } }, [
        el('button.btn.btn--pill.btn--white', { onclick: () => { tab = 'mine'; back(); } }, t('Quay lại')),
      ]),
    ];
  }

  function taskRow(plan, task) {
    const completed = task.status === 'completed';
    return el('div.stat-row', { style: { padding: 'var(--spacing-8) 0', borderBottom: '1px solid var(--border-secondary)' } }, [
      el('label', { style: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-10)', flex: '1', cursor: 'pointer' } }, [
        el('input', {
          type: 'checkbox',
          checked: completed,
          onchange: () => toggleTask(plan, task),
        }),
        el('span', { style: completed ? { textDecoration: 'line-through', color: 'var(--text-tertiary)' } : {} }, task.title),
      ]),
      el('button.btn.btn--sm.btn--ghost', { onclick: () => removeTask(plan, task) }, t('Xoá')),
    ]);
  }

  function openAddTask(plan) {
    const input = el('input.input', { placeholder: t('VD: Đọc chương 1'), maxlength: '200' });
    sheet({
      title: t('Thêm việc cho "{name}"', { name: plan.name }),
      body: [
        el('label.field', {}, [el('span', {}, t('Tên việc')), input]),
        el('button.btn.btn--block', {
          onclick: async () => {
            const title = input.value.trim();
            if (!title) return toast(t('Nhập tên việc'), 'error');
            closeSheet();
            await addTask(plan, title);
          },
        }, t('Thêm')),
      ],
    });
  }

  // --------------------------------------------------------------- setup form
  function formBody({ template = null, plan = null }) {
    const editing = Boolean(plan);
    const emoji = plan?.icon || template?.emoji || 'task-01';
    const groupLabel = editing ? (plan.group || t('Nhiệm vụ của bạn')) : template.group;
    const blank = template?.code === 'free';

    const nameInput = el('input.input', {
      value: editing ? plan.name : (blank ? '' : template.name),
      placeholder: t('VD: Học tiếng Anh 3 tháng'),
      maxlength: '120',
    });
    const tasksInput = el('input.input', {
      type: 'number',
      min: '0',
      value: editing ? plan.total_tasks : (blank ? '' : template.tasks),
      placeholder: t('VD: 8'),
    });
    const deadlineInput = el('input.input', {
      type: 'date',
      min: data.today,
      value: editing ? (plan.deadline || '') : addMonths(data.today, template.months),
    });

    let period = editing ? (plan.period || 'month') : 'month';
    const periodPick = el('div.periodpick', {}, Object.entries(data.periods).map(([code, label]) => el('button', {
      type: 'button',
      'aria-pressed': String(code === period),
      onclick: (event) => {
        period = code;
        [...periodPick.children].forEach((child) => child.setAttribute('aria-pressed', String(child === event.currentTarget)));
      },
    }, t(label))));

    const read = () => ({
      name: nameInput.value.trim(),
      totalTasks: Math.max(0, Math.round(Number(tasksInput.value) || 0)),
      deadline: deadlineInput.value || null,
      period,
    });

    // singleFlight: một lần bấm "Lưu nhiệm vụ" không được tạo thành hai nhiệm vụ.
    const save = singleFlight(async () => {
      const draft = read();
      if (!draft.name) return toast(t('Hãy đặt tên cho nhiệm vụ'), 'error');

      const result = editing
        ? await guard(() => api.patch(`/api/plans/${plan.id}`, draft), t('Không lưu được'))
        : await guard(() => api.post('/api/plans', { ...draft, template: template.code, icon: emoji }), t('Không tạo được nhiệm vụ'));
      if (!result) return;

      toast(editing ? t('Đã lưu nhiệm vụ') : t('Đã tạo nhiệm vụ'), 'success');
      if (!editing) await celebrateRewards(result.rewards, { title: t('Nhiệm vụ đã được đặt') });
      await ctx.refreshWorld();
      tab = 'mine';
      await back();
    });

    return [
      el('div.goalhero', {}, [
        el('span.goalhero__emoji', {}, dataIcon(emoji, 'task-01', 32)),
        el('span.goalhero__meta', {}, [
          el('span.goalhero__group', {}, groupLabel),
          el('span.goalhero__name', {}, editing ? plan.name : (blank ? t('Nhiệm vụ của riêng bạn') : template.name)),
        ]),
      ]),

      el('div.card.goalform', {}, [
        el('label.field', {}, [el('span', {}, t('Tên nhiệm vụ')), nameInput]),
        el('label.field', {}, [el('span', {}, t('Số việc dự kiến')), tasksInput]),
        el('label.field', {}, [el('span', {}, t('Thời hạn hoàn thành')), deadlineInput]),
        el('div.field', { style: { marginBottom: '0' } }, [el('span', {}, t('Kỳ thực hiện')), periodPick]),
      ]),

      el('div.formactions', {}, [
        el('button.btn.btn--pill.btn--white', { onclick: () => { showList(); toTop(); } }, t('Huỷ')),
        el('button.btn.btn--pill', { onclick: save }, editing ? t('Lưu thay đổi') : t('Lưu nhiệm vụ')),
      ]),
    ];
  }

  // ------------------------------------------------------------------ actions
  const addTask = singleFlight(async (plan, title) => {
    const result = await guard(() => api.post(`/api/plans/${plan.id}/tasks`, { title }), t('Không thêm được việc'));
    if (!result) return;
    await reload();
    const fresh = data.plans.find((p) => p.id === plan.id);
    if (fresh) showTasks(fresh);
  });

  const toggleTask = singleFlight(async (plan, task) => {
    const nextStatus = task.status === 'completed' ? 'pending' : 'completed';
    const result = await guard(() => api.patch(`/api/plans/${plan.id}/tasks/${task.id}`, { status: nextStatus }), t('Không cập nhật được'));
    if (!result) return;

    await reload();
    const fresh = data.plans.find((p) => p.id === plan.id);
    if (fresh && fresh.status === 'done' && nextStatus === 'completed') {
      await celebrate({
        title: t('Hoàn thành!'),
        subtitle: t('Bạn đã hoàn thành nhiệm vụ "{name}".', { name: plan.name }),
        image: '/assets/mascot/bot-1.png',
      });
      if (result.rewards) await celebrateRewards(result.rewards, {});
      await ctx.refreshWorld();
      tab = 'mine';
      showList();
      return;
    }
    if (fresh) showTasks(fresh);
  });

  const removeTask = singleFlight(async (plan, task) => {
    await guard(() => api.delete(`/api/plans/${plan.id}/tasks/${task.id}`), t('Không xoá được'));
    await reload();
    const fresh = data.plans.find((p) => p.id === plan.id);
    if (fresh) showTasks(fresh);
  });

  async function remove(plan) {
    const ok = await confirmSheet({
      title: t('Xoá nhiệm vụ'),
      message: t('Xoá "{name}"? Toàn bộ việc trong nhiệm vụ này cũng sẽ mất.', { name: plan.name }),
    });
    if (!ok) return;
    await guard(() => api.delete(`/api/plans/${plan.id}`), t('Không xoá được'));
    toast(t('Đã xoá nhiệm vụ'));
    await reload();
    showList();
  }

  showList();
  return el('div.screen__body.screen__body--sky', {}, [board]);
}

// --- lịch: tính trên chuỗi YYYY-MM-DD để không lệ thuộc múi giờ thiết bị ---
const parseDay = (key) => key.split('-').map(Number);

/** Cộng tháng và giữ ngày trong tháng, kẹp lại nếu tháng đích ngắn hơn. */
function addMonths(key, months) {
  const [y, m, d] = parseDay(key);
  const lastDay = new Date(Date.UTC(y, m + months, 0)).getUTCDate();
  const date = new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay)));
  return date.toISOString().slice(0, 10);
}
