/**
 * The three tool islands: Lập ngân sách, Mục tiêu tài chính, Ghi chép chi tiêu.
 *
 * Mở một chức năng KHÔNG được thưởng gì: đọc dữ liệu chỉ là đọc dữ liệu. Chỉ khi
 * người dùng thực sự làm một việc — lưu ngân sách, đặt hoặc nạp mục tiêu, ghi một
 * khoản chi — mới đi qua `useFeature`, và cũng chỉ lần đầu trong ngày mới trả
 * thưởng. Nhờ vậy không thể cày XP hay streak bằng cách vào ra một màn hình.
 */
import { readFileSync } from 'node:fs';
import { all, get, run, tx } from '../db.js';
import { bad, HttpError, notFound, Router } from '../lib/http.js';
import { dayKey, endOfMonth, endOfWeek, monthKey, nowIso, startOfMonth, startOfWeek } from '../lib/time.js';
import { evaluateBadges, useFeature } from '../services/progression.js';
import { adviseGoal } from '../services/goalAdvisor.js';
import { readExpenses, reviewedItems } from '../services/expenseReader.js';
import { takeAiCall } from '../services/aiQuota.js';
import { extractNote, guessCategory, parseAmount, spokenToDigits } from '../services/nlp.js';
import { appendMessages, expenseLoggedReply } from '../services/botLog.js';
import { GOAL_GROUPS, GOAL_PERIODS, templateByCode } from '../services/goalTemplates.js';
import { PLAN_GROUPS, PLAN_PERIODS, templateByCode as planTemplateByCode } from '../services/planTemplates.js';
import { createRecurringTemplate, materializeDueRecurring } from '../services/recurring.js';
import { createIncomeRecurringTemplate, materializeDueIncomeRecurring } from '../services/incomeRecurring.js';
import {
  createEkkoDeposit, createManualSource, createRecapSource, deleteSavingsSource,
  dismissSavingsRecap, savingsChannels, savingsPayload, savingsRecap, savingsTerms, updateSavingsSource,
} from '../services/savings.js';
import { bankInterestRates, goldPrices } from '../services/market.js';
import {
  assertMonth, budgetComparison, budgetLimitsPayload, budgetRecap, budgetSummary,
  createBudgetLimit, deleteBudgetLimit, dismissBudgetRecap, updateBudgetLimit,
} from '../services/budgetLimits.js';
import { alertLine, expenseAlerts } from '../services/spendingAlerts.js';
import { langOf } from '../i18n/index.js';
import { receiptFile, removeReceipt, saveReceipt, checkReceipt } from '../services/receipts.js';
import { keyState, readReceipt } from '../services/receiptAI.js';

export const featureRouter = new Router();

const MONTH_RE = /^\d{4}-\d{2}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const categories = () => all('SELECT * FROM categories ORDER BY order_index, id');

function resolveCategory(body) {
  if (body.categoryId) {
    const row = get('SELECT * FROM categories WHERE id = ?', Number(body.categoryId));
    if (row) return row;
  }
  if (body.categoryCode) {
    const row = get('SELECT * FROM categories WHERE code = ?', String(body.categoryCode));
    if (row) return row;
  }
  // Không có mã 'other' trong bảng — nhóm "Khác" đặt mã theo nhóm level 1.
  return get('SELECT * FROM categories WHERE code = ?', 'wants_other');
}

function positiveAmount(value, field = 'Số tiền') {
  const amount = Math.round(Number(value));
  if (!Number.isFinite(amount) || amount <= 0) throw bad(`${field} phải là một số dương`);
  if (amount > 100_000_000_000) throw bad(`${field} vượt quá giới hạn cho phép`);
  return amount;
}

// ---------------------------------------------------------------- categories
featureRouter.get('/api/categories', () => categories());

// ---------------------------------------------------------------------- news
featureRouter.get('/api/news', () => all(
  'SELECT id, title, summary, category, image, read_minutes FROM news WHERE is_published = 1 ORDER BY order_index, id',
));

featureRouter.get('/api/news/:id', ({ user, params }) => {
  const item = get('SELECT * FROM news WHERE id = ? AND is_published = 1', Number(params.id));
  if (!item) throw notFound('Không tìm thấy tin này');
  // Mở đọc một tin: ghi lại cho huy hiệu "Mọt tin" và thử thách "Đọc 1 tin".
  // Không XP, không streak; mỗi tin chỉ ghi một lần mỗi ngày.
  const day = dayKey();
  if (!get("SELECT 1 ok FROM activity_log WHERE user_id = ? AND kind = 'news_read' AND ref = ? AND day = ?", user.id, String(item.id), day)) {
    run('INSERT INTO activity_log (user_id, kind, ref, day, xp, meta, created_at) VALUES (?,?,?,?,0,?,?)',
      user.id, 'news_read', String(item.id), day, JSON.stringify({ title: item.title }), nowIso());
    evaluateBadges(user.id);
  }
  return item;
});

// ------------------------------------------------------------------- budget
// Gọn cho hai màn khác (widget ở màn chủ Ekko Lover, gauge ở Ghi chép chi
// tiêu) — chi tiết đầy đủ (sửa/xoá từng dòng, banner tổng kết…) nằm ở nhóm
// route `/api/budget/limits` bên dưới, phục vụ riêng màn Lập ngân sách.
featureRouter.get('/api/budget', ({ user, url }) => {
  const month = url.searchParams.get('month') || monthKey();
  return budgetSummary(user.id, assertMonth(month));
});

featureRouter.get('/api/budget/limits', ({ user, url }) => {
  const month = url.searchParams.get('month') || monthKey();
  return budgetLimitsPayload(user.id, assertMonth(month));
});

featureRouter.post('/api/budget/limits', ({ user, body }) => {
  const line = createBudgetLimit(user.id, body);
  const rewards = useFeature(user.id, 'budget');
  return { ...budgetLimitsPayload(user.id, line.month), rewards };
});

featureRouter.patch('/api/budget/limits/:id', ({ user, params, body }) => {
  const line = updateBudgetLimit(user.id, Number(params.id), body);
  const rewards = useFeature(user.id, 'budget');
  return { ...budgetLimitsPayload(user.id, line.month), rewards };
});

featureRouter.delete('/api/budget/limits/:id', ({ user, params, url }) => {
  deleteBudgetLimit(user.id, Number(params.id));
  const month = url.searchParams.get('month') || monthKey();
  return budgetLimitsPayload(user.id, assertMonth(month));
});

featureRouter.get('/api/budget/recap', ({ user }) => budgetRecap(user.id));

featureRouter.post('/api/budget/recap/dismiss', ({ user, body }) => {
  dismissBudgetRecap(user.id, String(body.month));
  return { ok: true };
});

featureRouter.get('/api/budget/comparison', ({ user, url }) => {
  const month = url.searchParams.get('month') || monthKey();
  return budgetComparison(user.id, assertMonth(month));
});

// -------------------------------------------------------------------- goals
const goalPeriod = (value, fallback = 'month') => (
  Object.hasOwn(GOAL_PERIODS, String(value)) ? String(value) : fallback
);

function goalPayload(userId) {
  const goals = all('SELECT * FROM goals WHERE user_id = ? AND status <> ? ORDER BY status, created_at DESC', userId, 'archived')
    .map((g) => ({
      ...g,
      percent: g.target_amount > 0 ? Math.min(100, Math.round((g.saved_amount / g.target_amount) * 100)) : 0,
      remaining: Math.max(0, g.target_amount - g.saved_amount),
      group: templateByCode(g.template)?.group ?? null,
      deposits: all('SELECT * FROM goal_deposits WHERE goal_id = ? ORDER BY id DESC LIMIT 5', g.id),
      advice: g.advice ? JSON.parse(g.advice) : null,
    }));
  return {
    goals,
    templates: GOAL_GROUPS,
    periods: GOAL_PERIODS,
    // Mọi phép tính thời hạn trên màn hình neo theo ngày ở Việt Nam, không theo
    // đồng hồ của thiết bị.
    today: dayKey(),
    totals: {
      target: goals.reduce((s, g) => s + g.target_amount, 0),
      saved: goals.reduce((s, g) => s + g.saved_amount, 0),
      active: goals.filter((g) => g.status === 'active').length,
      done: goals.filter((g) => g.status === 'done').length,
    },
  };
}

featureRouter.get('/api/goals', ({ user }) => goalPayload(user.id));

/** Gộp phần thưởng của nhiều hành động liên tiếp thành một (XP cộng dồn, huy hiệu nối nhau). */
function mergeRewards(list) {
  const parts = list.filter(Boolean);
  if (!parts.length) return null;
  const last = parts[parts.length - 1];
  return {
    ...parts[0],
    xp: parts.reduce((sum, r) => sum + (r.xp || 0), 0),
    badges: parts.flatMap((r) => r.badges || []),
    levelUp: [...parts].reverse().find((r) => r.levelUp)?.levelUp || null,
    progress: last.progress ?? parts[0].progress,
    totals: last.totals ?? parts[0].totals,
  };
}

/** Tạo một mục tiêu (dùng chung cho nút Lưu và cho bước Tư vấn). Trả về dòng goals vừa tạo. */
function insertGoal(userId, body, advice = null) {
  const template = templateByCode(body.template);
  const name = String(body.name || '').trim();
  if (!name) throw bad('Hãy đặt tên cho mục tiêu');
  if (name.length > 120) throw bad('Tên mục tiêu quá dài');
  const target = positiveAmount(body.targetAmount ?? body.target_amount, 'Số tiền mục tiêu');
  const deadline = body.deadline && DAY_RE.test(body.deadline) ? body.deadline : null;

  const info = run(
    `INSERT INTO goals (user_id, name, target_amount, saved_amount, deadline, icon, period, template, status, advice, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    userId, name, target, 0, deadline,
    body.icon || template?.emoji || 'target-02',
    goalPeriod(body.period),
    template?.code ?? null,
    'active', advice ? JSON.stringify(advice) : null, nowIso(),
  );
  return get('SELECT * FROM goals WHERE id = ?', Number(info.lastInsertRowid));
}

featureRouter.post('/api/goals', ({ user, body }) => {
  const goal = insertGoal(user.id, body);
  const rewards = useFeature(user.id, 'goals');
  return { goal, ...goalPayload(user.id), rewards };
});

/**
 * Tư vấn trước khi tạo mục tiêu: khả thi không, bao lâu thì đạt. Không lưu mục
 * tiêu. Thiếu thu nhập / khả năng để dành thì trả `needsInfo` để app hỏi thêm;
 * số người dùng nhập vào được nhớ cho lần sau.
 */
featureRouter.post('/api/goals/advice', async ({ user, body }) => {
  const name = String(body.name || '').trim();
  if (!name) throw bad('Hãy đặt tên cho mục tiêu');
  const targetAmount = positiveAmount(body.targetAmount, 'Số tiền mục tiêu');
  const deadline = body.deadline && DAY_RE.test(body.deadline) ? body.deadline : null;
  const optional = (value) => {
    if (value === undefined || value === null || value === '') return undefined;
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < 0) throw bad('Số tiền ước tính phải là số không âm');
    return n;
  };
  const result = await adviseGoal(user.id, {
    name, targetAmount, deadline,
    monthlyIncome: optional(body.monthlyIncome),
    monthlySaving: optional(body.monthlySaving),
  });
  if (!result.analysis) return result;

  // Có kết quả tư vấn là mục tiêu được ghi ngay vào danh sách, kèm lời tư vấn.
  // Tư vấn lại (sửa số rồi bấm lần nữa) thì cập nhật đúng mục tiêu đã tạo,
  // không tạo thêm mục tiêu mới.
  const advice = {
    ...result.analysis,
    monthsNeeded: result.facts.monthsNeeded,
    reachDate: result.facts.reachDate,
    at: nowIso(),
  };
  const existing = body.goalId
    ? get("SELECT * FROM goals WHERE id = ? AND user_id = ? AND status = 'active'", Number(body.goalId), user.id)
    : null;
  if (existing) {
    run('UPDATE goals SET name = ?, target_amount = ?, deadline = ?, advice = ? WHERE id = ?',
      name, targetAmount, deadline, JSON.stringify(advice), existing.id);
    return { ...result, goal: get('SELECT * FROM goals WHERE id = ?', existing.id), created: false, rewards: null };
  }
  const goal = insertGoal(user.id, { ...body, name, targetAmount, deadline }, advice);
  const rewards = useFeature(user.id, 'goals');
  return { ...result, goal, created: true, rewards };
});

featureRouter.post('/api/goals/:id/deposit', ({ user, params, body }) => {
  const goal = get('SELECT * FROM goals WHERE id = ? AND user_id = ?', Number(params.id), user.id);
  if (!goal) throw notFound('Không tìm thấy mục tiêu này');
  const amount = positiveAmount(body.amount, 'Số tiền nạp');

  const result = tx(() => {
    run('INSERT INTO goal_deposits (goal_id, amount, note, created_at) VALUES (?,?,?,?)', goal.id, amount, body.note ?? null, nowIso());
    const saved = goal.saved_amount + amount;
    const justCompleted = saved >= goal.target_amount && goal.status !== 'done';
    run(
      'UPDATE goals SET saved_amount = ?, status = ?, completed_at = ? WHERE id = ?',
      saved,
      justCompleted ? 'done' : goal.status,
      justCompleted ? nowIso() : goal.completed_at,
      goal.id,
    );
    return { justCompleted };
  });

  const rewards = useFeature(user.id, 'goals');
  return { ...goalPayload(user.id), justCompleted: result.justCompleted, rewards };
});

featureRouter.patch('/api/goals/:id', ({ user, params, body }) => {
  const goal = get('SELECT * FROM goals WHERE id = ? AND user_id = ?', Number(params.id), user.id);
  if (!goal) throw notFound('Không tìm thấy mục tiêu này');
  run(
    'UPDATE goals SET name = ?, target_amount = ?, deadline = ?, icon = ?, period = ?, status = ? WHERE id = ?',
    body.name ? String(body.name).trim() : goal.name,
    body.targetAmount ? positiveAmount(body.targetAmount, 'Số tiền mục tiêu') : goal.target_amount,
    body.deadline && DAY_RE.test(body.deadline) ? body.deadline : goal.deadline,
    body.icon ?? goal.icon,
    goalPeriod(body.period, goal.period),
    ['active', 'done', 'archived'].includes(body.status) ? body.status : goal.status,
    goal.id,
  );
  return goalPayload(user.id);
});

featureRouter.delete('/api/goals/:id', ({ user, params }) => {
  const goal = get('SELECT * FROM goals WHERE id = ? AND user_id = ?', Number(params.id), user.id);
  if (!goal) throw notFound('Không tìm thấy mục tiêu này');
  run('DELETE FROM goals WHERE id = ?', goal.id);
  return goalPayload(user.id);
});

// -------------------------------------------------------------------- plans
const planPeriod = (value, fallback = 'month') => (
  Object.hasOwn(PLAN_PERIODS, String(value)) ? String(value) : fallback
);

function planPayload(userId) {
  const plans = all('SELECT * FROM plans WHERE user_id = ? AND status <> ? ORDER BY status, created_at DESC', userId, 'archived')
    .map((p) => ({
      ...p,
      percent: p.total_tasks > 0 ? Math.min(100, Math.round((p.completed_tasks / p.total_tasks) * 100)) : 0,
      remaining: Math.max(0, p.total_tasks - p.completed_tasks),
      group: planTemplateByCode(p.template)?.group ?? null,
      tasks: all('SELECT * FROM plan_tasks WHERE plan_id = ? ORDER BY id DESC LIMIT 10', p.id),
    }));
  return {
    plans,
    templates: PLAN_GROUPS,
    periods: PLAN_PERIODS,
    today: dayKey(),
    totals: {
      total_tasks: plans.reduce((s, p) => s + p.total_tasks, 0),
      completed_tasks: plans.reduce((s, p) => s + p.completed_tasks, 0),
      active: plans.filter((p) => p.status === 'active').length,
      done: plans.filter((p) => p.status === 'done').length,
    },
  };
}

featureRouter.get('/api/plans', ({ user }) => planPayload(user.id));

featureRouter.post('/api/plans', ({ user, body }) => {
  const template = planTemplateByCode(body.template);
  const name = String(body.name || '').trim();
  if (!name) throw bad('Hãy đặt tên cho nhiệm vụ');
  if (name.length > 120) throw bad('Tên nhiệm vụ quá dài');
  const totalTasks = Math.max(0, Math.round(Number(body.totalTasks ?? body.total_tasks) || 0));
  const deadline = body.deadline && DAY_RE.test(body.deadline) ? body.deadline : null;

  const info = run(
    `INSERT INTO plans (user_id, name, total_tasks, completed_tasks, deadline, icon, period, template, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    user.id, name, totalTasks, 0, deadline,
    body.icon || template?.emoji || 'task-01',
    planPeriod(body.period),
    template?.code ?? null,
    'active', nowIso(),
  );
  const rewards = useFeature(user.id, 'plans');
  return { plan: get('SELECT * FROM plans WHERE id = ?', Number(info.lastInsertRowid)), ...planPayload(user.id), rewards };
});

featureRouter.post('/api/plans/:id/tasks', ({ user, params, body }) => {
  const plan = get('SELECT * FROM plans WHERE id = ? AND user_id = ?', Number(params.id), user.id);
  if (!plan) throw notFound('Không tìm thấy nhiệm vụ này');
  const title = String(body.title || '').trim();
  if (!title) throw bad('Hãy nhập tên việc');
  if (title.length > 200) throw bad('Tên việc quá dài');

  const result = tx(() => {
    run('INSERT INTO plan_tasks (plan_id, title, status, note, created_at) VALUES (?,?,?,?,?)', plan.id, title, 'pending', body.note ?? null, nowIso());
    run('UPDATE plans SET total_tasks = total_tasks + 1 WHERE id = ?', plan.id);
  });

  const rewards = useFeature(user.id, 'plans');
  return { ...planPayload(user.id), rewards };
});

featureRouter.patch('/api/plans/:id/tasks/:taskId', ({ user, params, body }) => {
  const plan = get('SELECT * FROM plans WHERE id = ? AND user_id = ?', Number(params.id), user.id);
  if (!plan) throw notFound('Không tìm thấy nhiệm vụ này');
  const task = get('SELECT * FROM plan_tasks WHERE id = ? AND plan_id = ?', Number(params.taskId), plan.id);
  if (!task) throw notFound('Không tìm thấy việc này');

  const newStatus = ['pending', 'completed'].includes(body.status) ? body.status : task.status;
  const wasCompleted = task.status === 'completed';
  const isNowCompleted = newStatus === 'completed';
  const justCompleted = !wasCompleted && isNowCompleted;

  run(
    'UPDATE plan_tasks SET status = ?, title = ? WHERE id = ?',
    newStatus,
    body.title ? String(body.title).trim() : task.title,
    task.id,
  );

  if (justCompleted) {
    run('UPDATE plans SET completed_tasks = completed_tasks + 1 WHERE id = ?', plan.id);
    const updated = get('SELECT * FROM plans WHERE id = ?', plan.id);
    if (updated.completed_tasks >= updated.total_tasks && updated.status !== 'done') {
      run('UPDATE plans SET status = ?, completed_at = ? WHERE id = ?', 'done', nowIso(), plan.id);
    }
  } else if (wasCompleted && !isNowCompleted) {
    run('UPDATE plans SET completed_tasks = completed_tasks - 1 WHERE id = ?', plan.id);
  }

  const rewards = justCompleted ? useFeature(user.id, 'plans') : null;
  return { ...planPayload(user.id), rewards };
});

featureRouter.delete('/api/plans/:id/tasks/:taskId', ({ user, params }) => {
  const plan = get('SELECT * FROM plans WHERE id = ? AND user_id = ?', Number(params.id), user.id);
  if (!plan) throw notFound('Không tìm thấy nhiệm vụ này');
  const task = get('SELECT * FROM plan_tasks WHERE id = ? AND plan_id = ?', Number(params.taskId), plan.id);
  if (!task) throw notFound('Không tìm thấy việc này');

  tx(() => {
    if (task.status === 'completed') {
      run('UPDATE plans SET completed_tasks = completed_tasks - 1 WHERE id = ?', plan.id);
    }
    run('UPDATE plans SET total_tasks = total_tasks - 1 WHERE id = ?', plan.id);
    run('DELETE FROM plan_tasks WHERE id = ?', task.id);
  });

  return planPayload(user.id);
});

featureRouter.patch('/api/plans/:id', ({ user, params, body }) => {
  const plan = get('SELECT * FROM plans WHERE id = ? AND user_id = ?', Number(params.id), user.id);
  if (!plan) throw notFound('Không tìm thấy nhiệm vụ này');
  run(
    'UPDATE plans SET name = ?, total_tasks = ?, deadline = ?, icon = ?, period = ?, status = ? WHERE id = ?',
    body.name ? String(body.name).trim() : plan.name,
    body.totalTasks ? Math.max(0, Math.round(Number(body.totalTasks))) : plan.total_tasks,
    body.deadline && DAY_RE.test(body.deadline) ? body.deadline : plan.deadline,
    body.icon ?? plan.icon,
    planPeriod(body.period, plan.period),
    ['active', 'done', 'archived'].includes(body.status) ? body.status : plan.status,
    plan.id,
  );
  return planPayload(user.id);
});

featureRouter.delete('/api/plans/:id', ({ user, params }) => {
  const plan = get('SELECT * FROM plans WHERE id = ? AND user_id = ?', Number(params.id), user.id);
  if (!plan) throw notFound('Không tìm thấy nhiệm vụ này');
  run('DELETE FROM plans WHERE id = ?', plan.id);
  return planPayload(user.id);
});

// ----------------------------------------------------------------- expenses
export const EXPENSE_RANGES = { today: 'Hôm nay', week: 'Tuần này', month: 'Tháng này' };

/**
 * Turns `?range=today|week|month` (or an explicit `?month=YYYY-MM`) into a pair
 * of day keys. Ranges cover the whole period, not just up to today, so an entry
 * back-dated or post-dated inside the period still shows up.
 */
export function resolveRange({ range, month } = {}) {
  const today = dayKey();

  if (month) {
    if (!MONTH_RE.test(month)) throw bad('Tháng phải có dạng YYYY-MM');
    const anchor = `${month}-01`;
    return { range: 'month', from: anchor, to: endOfMonth(anchor), month };
  }

  switch (range) {
    case 'today': return { range: 'today', from: today, to: today, month: monthKey() };
    case 'week': return { range: 'week', from: startOfWeek(today), to: endOfWeek(today), month: monthKey() };
    case 'month':
    case undefined:
    case null:
    case '': return { range: 'month', from: startOfMonth(today), to: endOfMonth(today), month: monthKey() };
    default: throw bad(`Khoảng thời gian không hợp lệ. Chọn: ${Object.keys(EXPENSE_RANGES).join(', ')}`);
  }
}

/**
 * Bản gửi ra client: giấu đường dẫn tệp thật, chỉ đưa link đọc qua route có kiểm
 * chủ sở hữu. Client không cần biết ảnh nằm ở đâu trên đĩa.
 */
const publicExpense = (expense) => {
  if (!expense) return expense;
  const { receipt_path: path, ...rest } = expense;
  return { ...rest, receipt_url: path ? `/api/expenses/${expense.id}/receipt` : null };
};

export function expensePayload(userId, spec = resolveRange()) {
  const { from, to } = spec;

  const list = all(
    `SELECT e.*, c.code AS category_code, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
       FROM expenses e LEFT JOIN categories c ON c.id = e.category_id
      WHERE e.user_id = ? AND e.spent_on BETWEEN ? AND ?
      ORDER BY e.spent_on DESC, e.id DESC`,
    userId, from, to,
  );

  const byCategory = all(
    `SELECT c.id, c.code, c.name, c.icon, c.color, c.group_code, c.group_label,
            SUM(e.amount) AS total, COUNT(*) AS count
       FROM expenses e JOIN categories c ON c.id = e.category_id
      WHERE e.user_id = ? AND e.spent_on BETWEEN ? AND ?
      GROUP BY c.id
      ORDER BY total DESC`,
    userId, from, to,
  );

  const total = list.reduce((sum, e) => sum + e.amount, 0);
  const todayTotal = list.filter((e) => e.spent_on === dayKey()).reduce((sum, e) => sum + e.amount, 0);

  // Phần ngân sách lấy thẳng từ chính hàm dựng màn Lập ngân sách, không tự tính
  // lại: hai màn hình mà tính riêng thì sớm muộn cũng lệch nhau một con số, rồi
  // người dùng không biết tin màn nào. Và luôn theo **cả tháng**, kể cả khi đang
  // xem tab Hôm nay — "còn tiêu được bao nhiêu" là câu hỏi của cả tháng.

  return {
    ...spec,
    label: EXPENSE_RANGES[spec.range],
    ranges: EXPENSE_RANGES,
    expenses: list.map(publicExpense),
    byCategory: byCategory.map((c) => ({ ...c, percent: total ? Math.round((c.total / total) * 100) : 0 })),
    categories: categories(),
    totals: { total, today: todayTotal, count: list.length },
    monthBudget: budgetSummary(userId, spec.month),
  };
}

featureRouter.get('/api/expenses', ({ user, url }) => {
  materializeDueRecurring(user.id);
  const spec = resolveRange({ range: url.searchParams.get('range'), month: url.searchParams.get('month') });
  return expensePayload(user.id, spec);
});

// Thu nhập tháng do người dùng tự gõ tay — xem chú thích ở bảng monthly_income
// trong db.js. Chỉ dùng để tính %, không bắt buộc phải có.
featureRouter.get('/api/expenses/income', ({ user, url }) => {
  const month = url.searchParams.get('month') || monthKey();
  if (!MONTH_RE.test(month)) throw bad('Tháng phải có dạng YYYY-MM');
  const row = get('SELECT amount FROM monthly_income WHERE user_id = ? AND month = ?', user.id, month);
  return { month, amount: row?.amount ?? 0 };
});

featureRouter.put('/api/expenses/income', ({ user, body }) => {
  const month = String(body.month || monthKey());
  if (!MONTH_RE.test(month)) throw bad('Tháng phải có dạng YYYY-MM');
  const amount = Math.max(0, Math.round(Number(body.amount) || 0));
  run(
    `INSERT INTO monthly_income (user_id, month, amount, updated_at) VALUES (?,?,?,?)
     ON CONFLICT(user_id, month) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at`,
    user.id, month, amount, nowIso(),
  );
  return { month, amount };
});

// --------------------------------------------------------------- income
// Sổ thu nhập thật (khác con số thu nhập tháng gõ tay ở trên) — mỗi lần nhận
// tiền ghi một dòng, phân theo 4 loại cố định.
const INCOME_CATEGORIES = {
  regular: { label: 'TN thường xuyên', icon: 'briefcase-01' },
  irregular: { label: 'TN không thường xuyên', icon: 'exchange-01' },
  gift: { label: 'Quà, thưởng', icon: 'gift' },
  other: { label: 'Khác', icon: 'package' },
};

const publicIncome = (entry) => (entry ? { ...entry, category_label: INCOME_CATEGORIES[entry.category]?.label, category_icon: INCOME_CATEGORIES[entry.category]?.icon } : entry);

featureRouter.get('/api/income', ({ user, url }) => {
  materializeDueIncomeRecurring(user.id);
  const spec = resolveRange({ range: url.searchParams.get('range'), month: url.searchParams.get('month') });
  const list = all(
    'SELECT * FROM income_entries WHERE user_id = ? AND received_on BETWEEN ? AND ? ORDER BY received_on DESC, id DESC',
    user.id, spec.from, spec.to,
  );
  return {
    ...spec,
    entries: list.map(publicIncome),
    categories: INCOME_CATEGORIES,
    totals: { total: list.reduce((sum, e) => sum + e.amount, 0), count: list.length },
  };
});

featureRouter.post('/api/income', ({ user, body }) => {
  const amount = positiveAmount(body.amount, 'Số tiền thu nhập');
  const category = INCOME_CATEGORIES[body.category] ? body.category : null;
  if (!category) throw bad('Chọn một loại thu nhập');
  const receivedOn = body.receivedOn && DAY_RE.test(body.receivedOn) ? body.receivedOn : dayKey();
  const note = body.note ? String(body.note).slice(0, 200) : null;

  const info = run(
    'INSERT INTO income_entries (user_id, amount, category, note, received_on, created_at) VALUES (?,?,?,?,?,?)',
    user.id, amount, category, note, receivedOn, nowIso(),
  );
  const id = Number(info.lastInsertRowid);

  // "Lặp lại hàng tháng": khoản vừa ghi coi như đã là bản của tháng này, mẫu
  // chỉ cần tự vá từ THÁNG SAU trở đi (xem materializeDueIncomeRecurring).
  if (body.recurring) {
    const template = createIncomeRecurringTemplate(user.id, { amount, category, note, receivedOn });
    run('UPDATE income_entries SET recurring_id = ? WHERE id = ?', template.id, id);
  }

  return { entry: publicIncome(get('SELECT * FROM income_entries WHERE id = ?', id)) };
});

featureRouter.delete('/api/income/:id', ({ user, params }) => {
  const entry = get('SELECT * FROM income_entries WHERE id = ? AND user_id = ?', Number(params.id), user.id);
  if (!entry) throw notFound('Không tìm thấy khoản thu nhập này');
  run('DELETE FROM income_entries WHERE id = ?', entry.id);
  return { ok: true };
});

/**
 * Shared by the manual form and by Ekko bot's quick-log flow.
 *
 * Ảnh hoá đơn (nếu có) được ghi **sau** khi có id khoản chi, vì tên tệp mang id đó
 * — có vậy nhìn thư mục là biết ảnh thuộc khoản nào.
 */
export async function createExpense(userId, body, source = 'manual', lang = 'vi') {
  const amount = positiveAmount(body.amount);
  const category = resolveCategory(body);
  const spentOn = body.spentOn && DAY_RE.test(body.spentOn) ? body.spentOn : dayKey();
  const note = body.note ? String(body.note).slice(0, 200) : null;

  const info = run(
    'INSERT INTO expenses (user_id, amount, category_id, note, spent_on, source, created_at) VALUES (?,?,?,?,?,?,?)',
    userId, amount, category?.id ?? null, note, spentOn, source, nowIso(),
  );
  const rewards = useFeature(userId, 'expenses');
  const id = Number(info.lastInsertRowid);

  const receiptPath = await saveReceipt(userId, id, body.receipt);
  if (receiptPath) run('UPDATE expenses SET receipt_path = ? WHERE id = ?', receiptPath, id);

  // "Lặp lại hàng tháng": khoản vừa ghi coi như đã là bản của tháng này, mẫu
  // chỉ cần tự vá từ THÁNG SAU trở đi (xem `materializeDueRecurring`).
  if (body.recurring) {
    const template = createRecurringTemplate(userId, { amount, categoryId: category?.id ?? null, note, spentOn });
    run('UPDATE expenses SET recurring_id = ? WHERE id = ?', template.id, id);
  }

  const expense = get('SELECT * FROM expenses WHERE id = ?', id);
  return {
    expense: publicExpense(expense),
    category,
    rewards,
    // Khoản chi vẫn được lưu; cảnh báo là lời nhắc, không phải chặn.
    alerts: expenseAlerts(userId, expense, category, lang),
  };
}

/**
 * Đọc ảnh hoá đơn: trả về số tiền và nhóm chi tiêu đoán được, **không ghi gì vào
 * sổ**. Người dùng vẫn là người bấm lưu — máy đọc sai một con số mà tự ghi luôn
 * thì còn tệ hơn bắt gõ tay.
 */
featureRouter.post('/api/expenses/scan', async ({ user, body }) => {
  const key = keyState();
  if (key === 'missing') {
    throw new HttpError(503, 'Chưa bật tính năng đọc hoá đơn tự động. Bạn nhập tay giúp nhé.');
  }
  if (key === 'invalid') {
    // Câu này để quản trị viên đọc ra ngay, không phải người học đoán mò.
    throw new HttpError(503, 'Khoá API trong app/.env chưa hợp lệ — có vẻ vẫn là chỗ điền mẫu. Bạn nhập tay giúp nhé.');
  }
  checkReceipt(body.receipt);
  if (!takeAiCall(user.id, 'receipt')) {
    throw new HttpError(429, 'Hôm nay bạn đã dùng hết lượt AI. Bạn nhập tay khoản chi này giúp nhé.');
  }

  const list = categories();
  const read = await readReceipt(body.receipt, list.map((c) => ({ code: c.code, name: c.name })))
    .catch((err) => { throw bad(err.message); });

  const category = list.find((c) => c.code === read.categoryCode) || null;
  return { ...read, categoryId: category?.id ?? null, categoryName: category?.name ?? null };
});

featureRouter.post('/api/expenses', async ({ user, body, req }) => {
  const created = await createExpense(user.id, body, 'manual', langOf(req));
  return { ...created, ...expensePayload(user.id, resolveRange({ month: created.expense.spent_on.slice(0, 7) })) };
});

/**
 * The bottom quick-entry bar. Same Vietnamese parser Ekko bot uses, so the same
 * sentence works in both places.
 *
 * Whatever is typed here is also written into the Ekko bot chat log: the member
 * typed a sentence and got an answer, which is a conversation whichever box it
 * happened in. Keeping one timeline means "what did I log yesterday" has a single
 * place to look. The rows carry source `quick` so the "Bạn của Ekko bot" badge
 * still counts real conversations only.
 *
 * The expense's own source stays `manual`: the member typed it themselves,
 * parsing is only an input method.
 */
/**
 * Đọc thử một câu ghi chép mà CHƯA lưu: số tiền, ghi chú, nhóm chi đoán được.
 * Màn "Nói để ghi" (Simple mode) dùng để người dùng xem lại và xác nhận trước
 * khi lưu — nhận giọng nói có thể nghe nhầm, nên không ghi thẳng.
 */
featureRouter.post('/api/expenses/parse', async ({ user, body }) => {
  const raw = String(body.text || '').trim();
  if (!raw) throw bad('Bạn chưa nhập gì');
  if (raw.length > 200) throw bad('Nội dung quá dài');
  // Có khoá API thì AI đọc câu (services/expenseReader.js), không thì bộ đọc viết sẵn.
  const { items, source } = await readExpenses(raw, { userId: user.id });
  if (!items.length) {
    throw bad('Chưa thấy số tiền trong câu này. Thử kiểu "cà phê 35k" hoặc "ăn trưa 60 nghìn".');
  }
  const [first] = items;
  return { amount: first.amount, note: first.note, category: first.category, spentOn: first.spentOn, items, source };
});

featureRouter.post('/api/expenses/quick', async ({ user, body, req }) => {
  const lang = langOf(req);
  const raw = String(body.text || '').trim();
  if (!raw) throw bad('Bạn chưa nhập gì');
  if (raw.length > 200) throw bad('Nội dung quá dài');

  // Một câu có thể có nhiều khoản ("phở 45k, cà phê 25k"): ghi từng khoản.
  // "Nói để ghi" gửi kèm các khoản người dùng đã xem lại: dùng đúng các khoản đó.
  const reviewed = reviewedItems(body.items);
  const { items, source } = reviewed.length ? { items: reviewed, source: 'reviewed' } : await readExpenses(raw, { userId: user.id });
  if (!items.length) {
    throw bad('Chưa thấy số tiền trong câu này. Thử kiểu "cà phê 35k" hoặc "ăn trưa 60 nghìn".');
  }

  const created = [];
  for (const item of items) {
    created.push({
      item,
      result: await createExpense(user.id, {
        amount: item.amount,
        categoryId: item.category?.id,
        note: item.note,
        spentOn: item.spentOn,
      }, 'manual', lang),
    });
  }

  appendMessages(user.id, [
    { role: 'user', text: raw },
    // rewards: null — thanh ghi nhanh đã hiện phần thưởng ngay lúc ghi rồi.
    ...created.map(({ item, result }) => {
      const reply = expenseLoggedReply({ amount: item.amount, category: item.category, note: item.note }, lang);
      return {
        role: 'bot',
        text: reply.text + alertLine(result.alerts, lang),
        // `logged` và `alerts` là dữ liệu thô: mở lại sổ ở ngôn ngữ khác thì câu
        // này được dựng lại, không phải đọc bản đã viết bằng tiếng cũ.
        meta: {
          kind: reply.kind,
          action: reply.action,
          suggestions: reply.suggestions,
          rewards: null,
          logged: reply.logged,
          alerts: result.alerts,
        },
      };
    }),
  ], 'quick');

  // Huy hiệu "Ghi nhanh như gió" đếm cả sổ hội thoại vừa ghi ở trên: xét lại
  // sau khi ghi sổ, không thì huy hiệu chậm một lượt.
  const lateBadges = evaluateBadges(user.id);
  const first = created[0].result;
  return {
    ...first,
    // Phần thưởng của mọi khoản (khoản thứ 2 có thể mở một huy hiệu).
    rewards: mergeRewards([...created.map(({ result }) => result.rewards), lateBadges.length ? { badges: lateBadges } : null]),
    category: created[0].item.category,
    // Mọi khoản vừa ghi (câu có nhiều khoản), và AI có tham gia đọc câu không.
    expenses: created.map(({ result }) => result.expense),
    total: created.reduce((sum, { item }) => sum + item.amount, 0),
    alerts: created.flatMap(({ result }) => result.alerts || []),
    source,
    ...expensePayload(user.id, resolveRange({ month: first.expense.spent_on.slice(0, 7) })),
  };
});

/**
 * Ảnh hoá đơn. Kiểm chủ sở hữu trước khi đọc tệp — ảnh nằm ngoài `public/` chính
 * là để bắt buộc đi qua chỗ này.
 */
featureRouter.get('/api/expenses/:id/receipt', ({ user, params, res }) => {
  const expense = get('SELECT * FROM expenses WHERE id = ? AND user_id = ?', Number(params.id), user.id);
  if (!expense?.receipt_path) throw notFound('Khoản chi này không có ảnh hoá đơn');

  const file = receiptFile(expense.receipt_path);
  if (!file) throw notFound('Không tìm thấy ảnh hoá đơn');

  const data = readFileSync(file.full);
  res.writeHead(200, {
    'content-type': file.type,
    'content-length': data.length,
    // Ảnh riêng của từng người: không cho proxy hay CDN nào giữ lại.
    'cache-control': 'private, max-age=300',
  });
  res.end(data);
  return undefined;
});

featureRouter.patch('/api/expenses/:id', ({ user, params, body }) => {
  const expense = get('SELECT * FROM expenses WHERE id = ? AND user_id = ?', Number(params.id), user.id);
  if (!expense) throw notFound('Không tìm thấy khoản chi này');

  const amount = body.amount !== undefined ? positiveAmount(body.amount) : expense.amount;
  const category = body.categoryId !== undefined || body.categoryCode !== undefined ? resolveCategory(body) : null;
  const categoryId = category ? category.id : expense.category_id;
  const spentOn = body.spentOn && DAY_RE.test(body.spentOn) ? body.spentOn : expense.spent_on;
  const note = body.note !== undefined ? (body.note ? String(body.note).slice(0, 200) : null) : expense.note;

  run(
    'UPDATE expenses SET amount = ?, category_id = ?, note = ?, spent_on = ? WHERE id = ?',
    amount, categoryId, note, spentOn, expense.id,
  );
  return expensePayload(user.id, resolveRange({ month: spentOn.slice(0, 7) }));
});

featureRouter.delete('/api/expenses/:id', ({ user, params }) => {
  const expense = get('SELECT * FROM expenses WHERE id = ? AND user_id = ?', Number(params.id), user.id);
  if (!expense) throw notFound('Không tìm thấy khoản chi này');
  removeReceipt(expense.receipt_path);
  run('DELETE FROM expenses WHERE id = ?', expense.id);
  return expensePayload(user.id, resolveRange({ month: expense.spent_on.slice(0, 7) }));
});

// ----------------------------------------------------------------- savings
featureRouter.get('/api/savings', ({ user }) => savingsPayload(user.id));

featureRouter.post('/api/savings', ({ user, body }) => {
  createManualSource(user.id, body);
  const rewards = useFeature(user.id, 'savings');
  return { ...savingsPayload(user.id), rewards };
});

featureRouter.patch('/api/savings/:id', ({ user, params, body }) => {
  updateSavingsSource(user.id, params.id, body);
  return savingsPayload(user.id);
});

featureRouter.delete('/api/savings/:id', ({ user, params }) => {
  deleteSavingsSource(user.id, params.id);
  return savingsPayload(user.id);
});

// "Tiết kiệm cùng Ekko": chọn kỳ hạn trước, chỉ đối tác có báo giá cho đúng
// kỳ hạn đó mới hiện ra (xem `savingsChannels`).
featureRouter.get('/api/savings/channels', ({ url }) => {
  const term = Number(url.searchParams.get('term')) || savingsTerms()[0] || 6;
  return { term, terms: savingsTerms(), channels: savingsChannels(term) };
});

featureRouter.post('/api/savings/deposit', ({ user, body }) => {
  createEkkoDeposit(user.id, body);
  const rewards = useFeature(user.id, 'savings');
  return { ...savingsPayload(user.id), rewards };
});

featureRouter.get('/api/savings/recap', ({ user }) => savingsRecap(user.id));

featureRouter.post('/api/savings/recap/dismiss', ({ user, body }) => {
  const recap = savingsRecap(user.id);
  if (recap.month !== body.month) throw bad('Tháng không khớp với banner hiện tại');
  if (body.add && recap.hasData && !recap.dismissed) createRecapSource(user.id, recap.month, recap.remaining);
  dismissSavingsRecap(user.id, recap.month);
  return savingsPayload(user.id);
});

// Widget thị trường ở màn Tiết kiệm — giá vàng (API ngoài thật, cache 5 phút)
// và lãi suất ngân hàng (dữ liệu tham khảo trong bank_interest_rates).
featureRouter.get('/api/market/gold', () => goldPrices());
featureRouter.get('/api/market/bank-rates', () => bankInterestRates());
