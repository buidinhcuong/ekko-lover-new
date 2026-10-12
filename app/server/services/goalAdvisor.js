/**
 * Tư vấn trước khi tạo một mục tiêu tài chính: mục tiêu này có khả thi không,
 * và bao lâu thì đạt.
 *
 * Các con số (cần để dành bao nhiêu mỗi tháng, người dùng để dành được bao
 * nhiêu, mấy tháng thì đạt) luôn tính ở đây, bằng công thức. AI chỉ viết lời
 * nhận xét dựa trên đúng các con số đó — không tự tính lại — để lời khuyên
 * không bao giờ lệch với số app đang hiện. Chưa có khoá API, hoặc gọi AI lỗi,
 * thì trả lời nhận xét viết theo công thức (`source: 'rule'`), màn hình vẫn đủ.
 *
 * Số thu nhập / tiết kiệm lấy theo thứ tự: người dùng vừa nhập → dữ liệu ghi
 * chép thật (thu nhập, chi tiêu 3 tháng gần nhất) → số ước tính đã nhập lần
 * trước (`user_state.est_monthly_*`). Thiếu thì trả `needsInfo` để app hỏi thêm.
 *
 * Gọi API theo cùng khung với receiptAI.js (HTTP trực tiếp, không SDK — dự án
 * không có dependency nào).
 */
import { config } from '../config.js';
import { get, run } from '../db.js';
import { addDays, dayKey, nowIso } from '../lib/time.js';
import { keyState } from './receiptAI.js';
import { takeAiCall } from './aiQuota.js';
import { recordAiUsage } from './aiUsage.js';

const endpoint = () => `${config.anthropicBaseUrl}/v1/messages`;
const TIMEOUT_MS = 30_000;
/** Một đoạn nhận xét ngắn dựa trên số đã tính sẵn: không cần nghĩ sâu. */
const EFFORT = 'low';

const VERDICTS = ['kha_thi', 'can_co_gang', 'kho_dat'];
/** Trên mốc này (50 năm) thì không tính ngày dự kiến đạt. */
const MAX_MONTHS = 600;

// --- số liệu của người dùng ---------------------------------------------

/**
 * Trung bình mỗi tháng của một tổng trong cửa sổ 90 ngày. Chia theo số NGÀY có
 * dữ liệu (từ khoản đầu tiên trong cửa sổ tới hôm nay) / 30, không chia theo số
 * tháng lịch — cửa sổ 90 ngày thường chạm 4 tháng lịch, chia 4 là hụt ~25%.
 */
function monthlyAverage(sql, userId, since, today) {
  const row = get(sql, userId, since);
  if (!row || !row.first) return null;
  const from = row.first > since ? row.first : since;
  const days = Math.max(1, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1);
  return Math.round(row.total / Math.max(1, days / 30));
}

/** Thu nhập, chi tiêu, khả năng để dành mỗi tháng theo dữ liệu thật (null nếu chưa đủ). */
function recordedFinances(userId, today = dayKey()) {
  const since = addDays(today, -90);
  let income = monthlyAverage(
    `SELECT COALESCE(SUM(amount), 0) total, MIN(received_on) first
       FROM income_entries WHERE user_id = ? AND received_on >= ?`,
    userId, since, today,
  );
  if (!income) {
    income = get('SELECT amount FROM monthly_income WHERE user_id = ? AND amount > 0 ORDER BY month DESC LIMIT 1', userId)?.amount ?? null;
  }
  // Ít hơn 5 khoản chi trong 3 tháng thì chưa đủ để coi là "chi tiêu hằng tháng".
  const expenseCount = get('SELECT COUNT(*) n FROM expenses WHERE user_id = ? AND spent_on >= ?', userId, since).n;
  const expenses = expenseCount >= 5
    ? monthlyAverage(
      `SELECT COALESCE(SUM(amount), 0) total, MIN(spent_on) first
         FROM expenses WHERE user_id = ? AND spent_on >= ?`,
      userId, since, today,
    )
    : null;
  const savings = get(
    `SELECT COALESCE(SUM(CASE WHEN direction = 'out' THEN -amount ELSE amount END), 0) n
       FROM savings_sources WHERE user_id = ?`,
    userId,
  ).n;
  return { income, expenses, saving: income && expenses ? income - expenses : null, savings };
}

/** Chốt số dùng để phân tích, kèm nguồn của từng số (input | data | estimate). */
export function resolveFinances(userId, { monthlyIncome, monthlySaving } = {}) {
  const recorded = recordedFinances(userId);
  const state = get('SELECT est_monthly_income, est_monthly_saving FROM user_state WHERE user_id = ?', userId) || {};
  const pick = (input, data, estimate) => {
    if (Number.isFinite(input) && input >= 0) return { value: input, source: 'input' };
    if (data !== null && data !== undefined) return { value: data, source: 'data' };
    if (estimate !== null && estimate !== undefined) return { value: estimate, source: 'estimate' };
    return { value: null, source: null };
  };
  const income = pick(monthlyIncome, recorded.income, state.est_monthly_income);
  const saving = pick(monthlySaving, recorded.saving, state.est_monthly_saving);
  return {
    income: income.value,
    incomeSource: income.source,
    saving: saving.value,
    savingSource: saving.source,
    expenses: recorded.expenses,
    savings: recorded.savings,
  };
}

/** Lưu số ước tính người dùng vừa nhập, để lần sau khỏi hỏi lại. */
export function rememberEstimates(userId, { monthlyIncome, monthlySaving }) {
  if (Number.isFinite(monthlyIncome) && monthlyIncome >= 0) {
    run('UPDATE user_state SET est_monthly_income = ?, updated_at = ? WHERE user_id = ?', monthlyIncome, nowIso(), userId);
  }
  if (Number.isFinite(monthlySaving) && monthlySaving >= 0) {
    run('UPDATE user_state SET est_monthly_saving = ?, updated_at = ? WHERE user_id = ?', monthlySaving, nowIso(), userId);
  }
}

// --- các con số của mục tiêu --------------------------------------------

function monthsBetween(from, to) {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
}

function addMonthsKey(key, months) {
  const [y, m, d] = key.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/**
 * Số gốc cho cả nhận xét theo công thức lẫn nhận xét của AI.
 * `verdict`: kha_thi (để dành đủ mức cần) · can_co_gang (đạt 70–99% mức cần) · kho_dat.
 */
export function goalFacts({ targetAmount, deadline, income, saving, today = dayKey() }) {
  const expired = Boolean(deadline && deadline < today);
  const months = deadline && !expired ? Math.max(1, monthsBetween(today, deadline)) : null;
  const requiredPerMonth = months ? Math.ceil(targetAmount / months) : null;
  // Quá 50 năm thì coi như không đạt được (số tiết kiệm gõ nhầm kiểu "10" thay
  // vì 10.000.000 cũng không làm phép cộng ngày vượt khỏi phạm vi của Date).
  const rawMonths = saving > 0 ? Math.ceil(targetAmount / saving) : null;
  const monthsNeeded = rawMonths && rawMonths <= MAX_MONTHS ? rawMonths : null;
  const reachDate = monthsNeeded ? addMonthsKey(today, monthsNeeded) : null;
  let verdict = 'kho_dat';
  if (monthsNeeded) {
    if (!requiredPerMonth) verdict = 'kha_thi';
    else if (saving >= requiredPerMonth) verdict = 'kha_thi';
    else if (saving >= requiredPerMonth * 0.7) verdict = 'can_co_gang';
  }
  return {
    today,
    targetAmount,
    deadline,
    expired,
    months,
    requiredPerMonth,
    income,
    saving,
    savingShareOfIncome: income > 0 && saving !== null ? Math.round((saving / income) * 100) : null,
    requiredShareOfIncome: income > 0 && requiredPerMonth ? Math.round((requiredPerMonth / income) * 100) : null,
    monthsNeeded,
    reachDate,
    gapPerMonth: requiredPerMonth && saving !== null ? Math.max(0, requiredPerMonth - saving) : null,
    verdict,
  };
}

// --- nhận xét theo công thức --------------------------------------------

const vnd = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')}đ`;
const dayVi = (key) => (key ? key.split('-').reverse().join('/') : '');

function ruleAnalysis(goal, f) {
  if (f.expired) {
    return {
      verdict: 'kho_dat',
      headline: 'Thời hạn bạn chọn đã qua.',
      points: [f.monthsNeeded
        ? `Với mức để dành ${vnd(f.saving)}/tháng, bạn đạt mục tiêu vào khoảng ${dayVi(f.reachDate)}.`
        : 'Hãy chọn một thời hạn trong tương lai.'],
      tip: 'Đặt lại thời hạn rồi bấm Tư vấn lần nữa nhé.',
    };
  }
  if (!(f.saving > 0) || !f.monthsNeeded) {
    return {
      verdict: 'kho_dat',
      headline: f.saving > 0
        ? 'Với mức để dành hiện tại, mục tiêu này cần hơn 50 năm mới đạt.'
        : 'Hiện bạn chưa có khoản dư để tiết kiệm cho mục tiêu này.',
      points: [
        f.requiredPerMonth ? `Để kịp hạn, cần để dành ${vnd(f.requiredPerMonth)} mỗi tháng trong ${f.months} tháng.` : null,
        'Thử cắt bớt một nhóm chi tiêu không thiết yếu để có khoản dư hằng tháng.',
      ].filter(Boolean),
      tip: 'Bắt đầu từ một khoản nhỏ, ví dụ 5% thu nhập mỗi tháng.',
    };
  }
  const points = [];
  if (f.requiredPerMonth) points.push(`Cần để dành ${vnd(f.requiredPerMonth)} mỗi tháng trong ${f.months} tháng để kịp hạn ${dayVi(f.deadline)}.`);
  points.push(`Bạn để dành được khoảng ${vnd(f.saving)}/tháng${f.savingShareOfIncome !== null ? ` (${f.savingShareOfIncome}% thu nhập)` : ''}.`);
  points.push(`Với mức này, bạn đạt ${vnd(goal.targetAmount)} sau khoảng ${f.monthsNeeded} tháng (${dayVi(f.reachDate)}).`);

  if (f.verdict === 'kha_thi') {
    return { verdict: 'kha_thi', headline: 'Mục tiêu này khả thi với mức tiết kiệm hiện tại.', points, tip: 'Để riêng khoản tiết kiệm ngay sau ngày nhận lương để giữ nhịp.' };
  }
  return {
    verdict: f.verdict,
    headline: f.verdict === 'can_co_gang' ? 'Mục tiêu hơi căng, cần cố gắng thêm một chút.' : 'Khó đạt mục tiêu đúng hạn với mức tiết kiệm hiện tại.',
    points,
    tip: `Tăng tiết kiệm thêm ${vnd(f.gapPerMonth)}/tháng, hoặc dời hạn tới ${dayVi(f.reachDate)}.`,
  };
}

// --- nhận xét của AI ------------------------------------------------------

const SYSTEM = [
  'Bạn là trợ lý tài chính của app Ekko, tư vấn cho người lao động Việt Nam trước khi họ đặt một mục tiêu tiết kiệm.',
  'Bạn nhận một mục tiêu và các con số ĐÃ TÍNH SẴN. Hãy dùng đúng các con số đó, không tự tính lại, không bịa thêm số liệu.',
  'Viết tiếng Việt, giọng thân mật, ngắn gọn, dễ quét mắt.',
  'headline: một câu kết luận mục tiêu có khả thi không.',
  'points: 2 đến 4 ý, mỗi ý một câu ngắn (dưới 25 từ): cần để dành bao nhiêu mỗi tháng và trong bao lâu, mức đó so với khả năng để dành và thu nhập, bao lâu thì đạt.',
  'tip: một gợi ý cụ thể, làm được ngay (dời hạn, giảm số tiền, tăng tiết kiệm, cắt một nhóm chi đang cao).',
  'verdict: giữ đúng giá trị verdict đã cho, trừ khi số liệu cho thấy rõ là sai.',
].join(' ');

const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: VERDICTS },
    headline: { type: 'string' },
    points: { type: 'array', items: { type: 'string' } },
    tip: { type: 'string' },
  },
  required: ['verdict', 'headline', 'points', 'tip'],
  additionalProperties: false,
};

function aiContext(goal, f, finances) {
  const line = (label, value) => (value === null || value === undefined ? null : `- ${label}: ${value}`);
  return [
    `Mục tiêu: "${goal.name}", số tiền ${vnd(goal.targetAmount)}${goal.deadline ? `, hạn ${dayVi(goal.deadline)}` : ', chưa đặt hạn'}. Hôm nay: ${dayVi(f.today)}.`,
    'Con số đã tính sẵn:',
    line('Số tháng tới hạn', f.months),
    line('Cần để dành mỗi tháng để kịp hạn', f.requiredPerMonth !== null ? vnd(f.requiredPerMonth) : null),
    line('Thu nhập ước tính mỗi tháng', finances.income !== null ? `${vnd(finances.income)} (${finances.incomeSource === 'data' ? 'theo dữ liệu ghi chép' : 'người dùng ước tính'})` : null),
    line('Chi tiêu trung bình mỗi tháng', finances.expenses !== null ? vnd(finances.expenses) : null),
    line('Có thể để dành mỗi tháng', finances.saving !== null ? `${vnd(finances.saving)} (${finances.savingSource === 'data' ? 'thu nhập trừ chi tiêu' : 'người dùng ước tính'})` : null),
    line('Tỉ lệ để dành so với thu nhập', f.savingShareOfIncome !== null ? `${f.savingShareOfIncome}%` : null),
    line('Mức cần để dành so với thu nhập', f.requiredShareOfIncome !== null ? `${f.requiredShareOfIncome}%` : null),
    line('Với mức để dành hiện tại, số tháng để đạt', f.monthsNeeded),
    line('Ngày dự kiến đạt', f.reachDate ? dayVi(f.reachDate) : null),
    line('Còn thiếu mỗi tháng so với mức cần', f.gapPerMonth ? vnd(f.gapPerMonth) : null),
    line('Tổng tiền đang gửi tiết kiệm', finances.savings ? vnd(finances.savings) : null),
    f.expired ? '- Lưu ý: thời hạn đã qua.' : null,
    `- verdict: ${f.verdict}`,
  ].filter(Boolean).join('\n');
}

async function aiAnalysis(goal, f, finances, callId) {
  if (keyState() !== 'ok') return null;
  const body = {
    model: config.anthropicModel,
    max_tokens: 2048,
    output_config: { effort: EFFORT, format: { type: 'json_schema', schema: SCHEMA } },
    // Bị từ chối vì lý do an toàn thì máy chủ tự chạy lại trên model dự phòng.
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{ role: 'user', content: aiContext(goal, f, finances) }],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(endpoint(), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.error('[goalAdvisor]', response.status, (await response.text().catch(() => '')).slice(0, 300));
      return null;
    }
    const payload = await response.json();
    recordAiUsage(callId, payload);
    if (payload.stop_reason === 'refusal' || payload.stop_reason === 'max_tokens') return null;
    const text = (payload.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const out = JSON.parse(text);
    if (!VERDICTS.includes(out.verdict) || !out.headline || !Array.isArray(out.points)) return null;
    return {
      verdict: out.verdict,
      headline: String(out.headline).slice(0, 200),
      points: out.points.map((p) => String(p).slice(0, 200)).filter(Boolean).slice(0, 4),
      tip: String(out.tip || '').slice(0, 200),
    };
  } catch (err) {
    console.error('[goalAdvisor] gọi thất bại:', err.name, err.cause?.code || '', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// --- điểm vào -----------------------------------------------------------

/**
 * @param {number} userId
 * @param {{ name: string, targetAmount: number, deadline: string|null, monthlyIncome?: number, monthlySaving?: number }} input
 */
export async function adviseGoal(userId, input) {
  const goal = { name: input.name, targetAmount: input.targetAmount, deadline: input.deadline || null };
  rememberEstimates(userId, input);
  const finances = resolveFinances(userId, input);

  const needsInfo = [];
  if (finances.income === null) needsInfo.push('monthlyIncome');
  if (finances.saving === null) needsInfo.push('monthlySaving');

  const plan = goalFacts({ targetAmount: goal.targetAmount, deadline: goal.deadline, income: finances.income, saving: finances.saving });
  if (needsInfo.length) return { draft: goal, finances, needsInfo, facts: plan, analysis: null };

  // Hết lượt AI hôm nay thì nhận xét theo công thức.
  const callId = keyState() === 'ok' ? takeAiCall(userId, 'advice') : false;
  const ai = callId ? await aiAnalysis(goal, plan, finances, callId) : null;
  const analysis = ai ? { ...ai, source: 'ai' } : { ...ruleAnalysis(goal, plan), source: 'rule' };
  return { draft: goal, finances, needsInfo, facts: plan, analysis };
}
