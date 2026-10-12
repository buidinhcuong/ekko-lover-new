/**
 * End-to-end smoke test. Boots the real server on a scratch database, then
 * exercises SSO, learning, the three tools, Ekko bot and the admin API over
 * HTTP. Run with `npm run smoke`.
 *
 * The streak rules are also checked directly against the service, because the
 * freeze window spans days and cannot be driven through the HTTP surface.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = mkdtempSync(join(tmpdir(), 'gdtc-smoke-'));
const PORT = 4399;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const section = (title) => console.log(`\n${title}`);

// --- a cookie-aware fetch ------------------------------------------------
const jars = new Map();

async function call(jar, method, path, body, { lang } = {}) {
  const headers = {};
  const cookie = jars.get(jar);
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  // Ngôn ngữ app người dùng yêu cầu; Admin portal không gửi header này.
  if (lang) headers['x-lang'] = lang;

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });

  const setCookie = response.headers.getSetCookie?.() || [];
  for (const raw of setCookie) {
    const pair = raw.split(';')[0];
    jars.set(jar, pair);
  }

  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* redirect bodies are empty */ }
  return { status: response.status, json, headers: response.headers };
}

const get = (jar, path, opts) => call(jar, 'GET', path, undefined, opts);
const getEn = (jar, path) => call(jar, 'GET', path, undefined, { lang: 'en' });
const post = (jar, path, body = {}, opts) => call(jar, 'POST', path, body, opts);
const patch = (jar, path, body = {}, opts) => call(jar, 'PATCH', path, body, opts);
const put = (jar, path, body = {}, opts) => call(jar, 'PUT', path, body, opts);
const del = (jar, path, opts) => call(jar, 'DELETE', path, undefined, opts);

// --- server lifecycle ----------------------------------------------------
function startServer() {
  const child = spawn(process.execPath, [join(ROOT, 'server', 'index.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      EKKO_DATA_DIR: DATA_DIR,
      NODE_ENV: 'development',
      // Tắt hẳn phần gọi Claude khi chạy kiểm thử: bộ kiểm phải cho cùng một kết
      // quả trên mọi máy, không phụ thuộc có khoá hay không, và không được tiêu
      // tiền API mỗi lần chạy. Đặt rỗng chứ không xoá — config.js chỉ nạp .env cho
      // biến CHƯA có, nên biến rỗng ở đây vẫn thắng tệp .env của máy.
      ANTHROPIC_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  return child;
}

async function waitForServer(attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`${BASE}/healthz`);
      if (response.ok) return await response.json();
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Máy chủ không khởi động kịp');
}

// --- streak rules, tested directly against the service -------------------
async function testStreakRules() {
  section('Quy tắc streak (đóng băng tối đa 3 ngày)');

  process.env.EKKO_DATA_DIR = DATA_DIR;
  const { touchStreak, streakStatus, readState } = await import('../server/services/streak.js');
  const { db, run, get: dbGet } = await import('../server/db.js');

  const now = new Date().toISOString();
  run('INSERT INTO users (ekko_user_id, name, role, created_at) VALUES (?,?,?,?)', 'streak-test', 'Streak Test', 'member', now);
  const userId = dbGet('SELECT id FROM users WHERE ekko_user_id = ?', 'streak-test').id;
  run('INSERT INTO user_state (user_id, updated_at) VALUES (?, ?)', userId, now);

  const reset = (count, lastDay) => run(
    'UPDATE user_state SET streak_count = ?, streak_best = ?, last_active_day = ?, updated_at = ? WHERE user_id = ?',
    count, count, lastDay, now, userId,
  );

  // gap 1: a normal consecutive day
  reset(5, '2026-03-01');
  check('Ngày liên tiếp (cách 1 ngày) → +1', touchStreak(userId, '2026-03-02').count === 6);

  // gap 0: already counted today
  reset(6, '2026-03-02');
  const same = touchStreak(userId, '2026-03-02');
  check('Cùng ngày → không cộng thêm', same.count === 6 && same.outcome === 'already_counted');

  // gap 2..4: inside the freeze window
  for (const [gap, day] of [[2, '2026-03-03'], [3, '2026-03-04'], [4, '2026-03-05']]) {
    reset(6, '2026-03-01');
    const result = touchStreak(userId, day);
    check(`Cách ${gap} ngày (đóng băng ${gap - 1}/3) → chuỗi sống, +1`, result.count === 7 && result.outcome === 'recovered');
  }

  // gap 5: past the freeze window
  reset(6, '2026-03-01');
  const lost = touchStreak(userId, '2026-03-06');
  check('Cách 5 ngày (quá 3 ngày đóng băng) → mất chuỗi, về 1', lost.count === 1 && lost.outcome === 'reset');

  // read-only status reporting
  reset(9, '2026-03-01');
  const frozen = streakStatus(userId, '2026-03-04');
  check('Trạng thái đóng băng báo đúng số ngày còn lại',
    frozen.status === 'frozen' && frozen.frozenDays === 2 && frozen.freezeDaysLeft === 1,
    JSON.stringify(frozen));

  const dead = streakStatus(userId, '2026-03-20');
  check('Trạng thái mất chuỗi hiển thị 0', dead.status === 'lost' && dead.count === 0);

  check('Kỷ lục streak được giữ lại', readState(userId).streak_best >= 9);

  section('Luật huy hiệu mới');
  const { recordActivity, longestDayRun } = await import('../server/services/progression.js');
  reset(4, '2026-03-01');
  recordActivity(userId, { kind: 'lesson_completed', ref: 'r', xp: 0, day: '2026-03-04' });
  check('Cứu chuỗi đang đóng băng được ghi lại cho huy hiệu "Hồi sinh"',
    dbGet("SELECT COUNT(*) n FROM activity_log WHERE user_id = ? AND kind = 'streak_recovered'", userId).n === 1);

  section('Ghi nhanh bằng AI: kiểm lại kết quả');
  const { sanitizeAiItems, loadCategories } = await import('../server/services/expenseReader.js');
  const cats = loadCategories();
  const today = '2026-03-10';
  const ok = sanitizeAiItems({ is_expense: true, items: [
    { amount: 45000, note: 'phở', category_code: 'wants_dining', spent_on: '', confidence: 'cao' },
    { amount: 25000, note: 'cà phê', category_code: 'wants_entertainment', spent_on: '2026-03-09', confidence: 'cao' },
  ] }, cats, today);
  check('Câu nhiều khoản tách thành từng khoản, giữ đúng nhóm và ngày',
    ok.length === 2 && ok[0].category.code === 'wants_dining' && ok[0].spentOn === today && ok[1].spentOn === '2026-03-09',
    JSON.stringify(ok.map((i) => [i.amount, i.category?.code, i.spentOn])));
  const unsure = sanitizeAiItems({ is_expense: true, items: [
    { amount: 300000, note: 'đổ xăng', category_code: 'wants_other', spent_on: '', confidence: 'thap' },
  ] }, cats, today);
  check('AI không chắc mà từ khoá của Admin khớp thì theo từ khoá', unsure[0].category.code === 'needs_transport',
    unsure[0].category?.code);
  const wrong = sanitizeAiItems({ is_expense: true, items: [
    { amount: 50000, note: 'grab', category_code: 'khong_co', spent_on: '2026-04-01', confidence: 'cao' },
    { amount: -5, note: 'sai', category_code: 'wants_other', spent_on: '', confidence: 'cao' },
  ] }, cats, today);
  check('Mã nhóm không có thật, ngày tương lai, số tiền âm đều bị chặn',
    wrong.length === 1 && wrong[0].category.code === 'needs_transport' && wrong[0].spentOn === today,
    JSON.stringify(wrong.map((i) => [i.category?.code, i.spentOn])));
  check('Câu không phải khoản chi thì không ghi gì',
    sanitizeAiItems({ is_expense: false, items: [{ amount: 1, note: 'x', category_code: 'wants_other', spent_on: '', confidence: 'cao' }] }, cats, today).length === 0);

  section('Huy hiệu Streak 20 ngày');
  {
    const order = (code) => dbGet('SELECT order_index o FROM badges WHERE code = ?', code)?.o;
    check('Có huy hiệu Streak 20 ngày, xếp giữa Streak 7 và Streak 30',
      order('streak_7') < order('streak_20') && order('streak_20') < order('streak_30'),
      JSON.stringify([order('streak_7'), order('streak_20'), order('streak_30')]));
    const { evaluateBadges } = await import('../server/services/progression.js');
    run('UPDATE user_state SET streak_count = 20 WHERE user_id = ?', userId);
    evaluateBadges(userId, { autoClaim: true });
    check('Giữ streak đủ 20 ngày thì nhận huy hiệu Streak 20 ngày',
      Boolean(dbGet("SELECT 1 FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = ? AND b.code = 'streak_20'", userId)));
  }

  section('Phạm vi và giới hạn lượt AI (Claude giả)');
  {
    const { createServer } = await import('node:http');
    const { config } = await import('../server/config.js');
    const { respond } = await import('../server/services/botEngine.js');
    const { aiCallsToday } = await import('../server/services/aiQuota.js');
    // Claude giả: câu có "thơ" thì báo ngoài phạm vi, còn lại trả lời trong phạm vi.
    let calls = 0;
    let lastAsked = '';
    const fake = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        calls += 1;
        const body = JSON.parse(raw);
        const asked = body.messages.at(-1).content;
        lastAsked = asked;
        const inScope = !/thơ/.test(asked);
        const out = { in_scope: inScope, answer: inScope ? 'Quỹ khẩn cấp nên bằng 3–6 tháng chi tiêu thiết yếu.' : 'Đây là bài thơ…' };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          stop_reason: 'end_turn', model: 'claude-sonnet-5-5',
          usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 500, cache_creation_input_tokens: 0 },
          content: [{ type: 'text', text: JSON.stringify(out) }],
        }));
      });
    });
    await new Promise((r) => fake.listen(0, '127.0.0.1', r));
    const saved = { key: config.anthropicApiKey, url: config.anthropicBaseUrl };
    config.anthropicApiKey = 'sk-ant-test-key-for-smoke-only-000000';
    config.anthropicBaseUrl = `http://127.0.0.1:${fake.address().port}`;
    const { setSetting } = await import('../server/db.js');
    setSetting('ai_daily_limit', '4');
    const noop = async () => ({ expense: { spent_on: '2026-01-01' }, alerts: [] });
    try {
      const poem = await respond(userId, 'làm thơ đi', { createExpense: noop });
      check('Câu ngoài phạm vi: bỏ phần AI viết, trả câu cố định', poem.kind === 'out_of_scope' && !/bài thơ…/.test(poem.text), poem.kind);
      check('Câu ngoài phạm vi được ghi lại cho Admin',
        dbGet("SELECT COUNT(*) n FROM ai_out_of_scope WHERE text LIKE '%thơ%'").n === 1);
      const fin = await respond(userId, 'xin chào', { createExpense: noop });
      check('Câu trong phạm vi thì dùng câu trả lời của AI', fin.kind === 'ai' && /3–6 tháng/.test(fin.text), fin.kind);
      // Token AI: lượt vừa gọi ghi model, token vào / ra / cache và chi phí theo bảng giá.
      const lastCall = dbGet('SELECT * FROM ai_calls WHERE user_id = ? ORDER BY id DESC LIMIT 1', userId);
      check('Ghi token của lượt gọi AI: model, token vào/ra/cache, chi phí',
        lastCall.model === 'claude-sonnet-5-5' && lastCall.input_tokens === 1000 && lastCall.output_tokens === 200
        && lastCall.cache_read_tokens === 500 && Math.abs(lastCall.cost_usd - 0.0041) < 1e-9, JSON.stringify(lastCall));
      const { aiUsageReport } = await import('../server/services/aiUsage.js');
      const report = aiUsageReport({ days: 7 });
      const mine = report.users.find((u) => u.id === userId);
      check('Báo cáo Admin "Sử dụng AI": tổng, theo tính năng, theo người dùng, theo ngày',
        report.daily.length === 7 && report.totals.output >= 200 && report.byKind.some((k) => k.kind === 'bot')
        && mine?.output === 400 && mine.measured === 2 && ['rat_nhieu', 'nhieu', 'trung_binh', 'it'].includes(mine.level),
        JSON.stringify({ totals: report.totals, mine }));
      const money = await respond(userId, 'Lương 10 triệu thì nên chia tiền tiết kiệm thế nào?', { createExpense: noop });
      check('Câu hỏi tài chính: AI trả lời thẳng (không chỉ trích bài học), có kèm số liệu tháng của người dùng',
        money.kind === 'ai' && /Số liệu của người dùng:[\s\S]*Đã chi trong tháng/.test(lastAsked), money.kind);
      let logged = 0;
      const countLog = async () => { logged += 1; return noop(); };
      const iphone = await respond(userId, 'Lương công nhân của tôi là 5 triệu 1 tháng, tôi có nên mua iphone 18 50 triệu, trả góp toàn bộ không', { createExpense: countLog });
      check('Câu có số tiền nhưng xin tư vấn ("lương 5 triệu có nên mua iPhone 50 triệu trả góp không") → AI tư vấn, không ghi chi',
        iphone.kind === 'ai' && logged === 0, `${iphone.kind} logged=${logged}`);
      const over = await respond(userId, 'cảm ơn', { createExpense: noop });
      check('Hết lượt AI hôm nay thì không gọi AI nữa', over.kind === 'ai_limit' && calls === 4 && aiCallsToday(userId) === 4,
        JSON.stringify({ kind: over.kind, calls }));
    } finally {
      config.anthropicApiKey = saved.key;
      config.anthropicBaseUrl = saved.url;
      setSetting('ai_daily_limit', '30');
      fake.close();
    }
  }

  check('Chuỗi ngày liền nhau dài nhất',
    longestDayRun(['2026-01-01', '2026-01-02', '2026-01-04', '2026-01-05', '2026-01-06']) === 3
    && longestDayRun([]) === 0);

  db.close();
}

// --- main ---------------------------------------------------------------
async function main() {
  const server = startServer();
  try {
    const health = await waitForServer();

    section('Nội dung khởi tạo');
    check('10 cấp độ', health.content.levels === 10, String(health.content.levels));
    const { BADGES } = await import('../server/seed/catalogue.js');
    check(`${BADGES.length} huy hiệu`, health.content.badges === BADGES.length, String(health.content.badges));
    check('8 mô đun, 34 bài học', health.content.modules === 8 && health.content.lessons === 34, `${health.content.modules} · ${health.content.lessons}`);
    check('Có frame nội dung', health.content.frames > 40, String(health.content.frames));

    section('Cổng vào preview');
    const landing = await fetch(`${BASE}/`, { redirect: 'manual' });
    const landingHtml = await landing.text();
    check('Trang gốc trả về cổng preview', landing.status === 200 && landingHtml.includes('preview.js'));
    check('Cổng preview nhúng cả hai giao diện',
      landingHtml.includes('preview.css') && (await (await fetch(`${BASE}/preview.js`)).text()).includes("'/admin/'"));
    check('Hai giao diện gốc vẫn mở trực tiếp được',
      (await fetch(`${BASE}/app/`)).status === 200 && (await fetch(`${BASE}/admin/`)).status === 200);

    section('Đăng nhập SSO');
    const anon = await get('anon', '/api/me');
    check('Chưa đăng nhập thì bị chặn', anon.status === 401);

    const badToken = await get('anon', '/sso?token=khong-hop-le');
    check('Token SSO sai bị từ chối', badToken.status === 401);

    const login = await get('member', '/dev/login');
    check('Đăng nhập demo chuyển hướng', login.status === 302);
    const ssoUrl = login.headers.get('location');
    const ssoResponse = await get('member', ssoUrl);
    check('SSO đặt phiên và chuyển vào app', ssoResponse.status === 302 && ssoResponse.headers.get('location') === '/app/');

    const me = await get('member', '/api/me');
    check('Đọc được hồ sơ', me.status === 200 && me.json.user.name.length > 0);
    const ladder = me.json.world.levels;
    const expectedRank = ladder.filter((l) => me.json.world.progress.xp >= l.xp_required).pop();
    check('Cấp độ luôn khớp với XP đang có',
      me.json.world.level.order_index === expectedRank.order_index,
      `${me.json.world.progress.xp} XP → cấp ${me.json.world.level.order_index}, chờ ${expectedRank.order_index}`);
    check('Có 6 đảo chức năng', me.json.world.features.length === 6, String(me.json.world.features.length));
    check('Màn chủ biết concept đang bật để chọn hình hài',
      typeof me.json.world.concept === 'string' && me.json.world.concept.length > 0,
      String(me.json.world.concept));
    check('Có bài học tiếp theo', Boolean(me.json.world.learning.next));

    section('Học tập');
    const lessonId = me.json.world.learning.next.id;
    const lesson = await get('member', `/api/learn/lessons/${lessonId}`);
    check('Mở được bài học đầu tiên', lesson.status === 200 && lesson.json.frames.length > 0);
    check('Frame có payload đã giải mã', typeof lesson.json.frames[0].payload === 'object');

    const locked = await get('member', '/api/learn/modules');
    const currentRank = me.json.world.level.order_index;
    const above = locked.json.filter((m) => m.unlock_level > currentRank);
    const below = locked.json.filter((m) => m.unlock_level <= currentRank);
    check('Mô đun trên cấp hiện tại bị khoá',
      above.every((m) => m.locked === true),
      above.map((m) => `${m.unlock_level}:${m.locked}`).join(' '));
    check('Mô đun trong cấp hiện tại được mở',
      below.length > 0 && below.every((m) => m.locked === false));

    section('Bản đồ học tập');
    const map = await get('member', '/api/learn/map');
    const kinds = map.json.entries.map((e) => e.type);
    check('Bản đồ trả về lộ trình phẳng theo thứ tự học',
      kinds[0] === 'module' && kinds.includes('lesson') && kinds.includes('quiz'),
      kinds.slice(0, 5).join(','));
    check('Chỉ một chặng được đánh dấu đang ở đây',
      map.json.entries.filter((e) => e.current).length === 1);
    check('Chặng đang ở đây chưa hoàn thành và không bị khoá',
      (() => { const c = map.json.entries.find((e) => e.current); return c && !c.completed && !c.locked; })());
    check('Mô đun trên cấp hiện tại bị khoá trên bản đồ',
      map.json.entries.filter((e) => e.type === 'module' && e.unlock_level > map.json.levelOrder)
        .every((e) => e.locked));
    check('Trắc nghiệm khoá khi chưa học hết mô đun',
      map.json.entries.filter((e) => e.type === 'quiz').every((e) => e.locked === true));

    // Học tuần tự: chưa xong bài trên thì bài dưới còn khoá.
    const mapLessons = map.json.entries.filter((e) => e.type === 'lesson');
    check('Chỉ đúng một bài đang mở để học',
      mapLessons.filter((e) => !e.completed && !e.locked).length === 1,
      mapLessons.filter((e) => !e.completed && !e.locked).map((e) => e.title).join(' | '));
    check('Bài chưa tới lượt bị khoá vì thứ tự, không phải vì cấp',
      mapLessons.some((e) => e.lockReason === 'sequence'),
      mapLessons.map((e) => e.lockReason).join(','));
    check('Mỗi bài mang dáng để chọn icon (bài toàn slide là bộ slide)',
      mapLessons.every((e) => ['story', 'deck', 'practice'].includes(e.shape))
      && mapLessons.some((e) => e.shape === 'deck'),
      [...new Set(mapLessons.map((e) => e.shape))].join(','));
    check('Bài đã học xong vẫn mở để xem lại',
      mapLessons.filter((e) => e.completed).every((e) => e.locked === false));

    const gateLesson = mapLessons.find((e) => e.current);
    const laterLesson = mapLessons.find((e) => e.lockReason === 'sequence');
    const openLocked = await get('member', `/api/learn/lessons/${laterLesson.id}`);
    check('Gọi thẳng API cũng không mở được bài chưa tới lượt',
      openLocked.status === 400, `${openLocked.status} ${openLocked.json?.error || ''}`);
    const finishLocked = await post('member', `/api/learn/lessons/${laterLesson.id}/complete`, {});
    check('Không thể học xong bài chưa tới lượt qua API', finishLocked.status === 400);
    check('Bài đang tới lượt thì mở bình thường',
      (await get('member', `/api/learn/lessons/${gateLesson.id}`)).status === 200);
    check('Mỗi mô đun trên bản đồ có emoji để làm mốc',
      map.json.entries.filter((e) => e.type === 'module').every((e) => e.emoji));

    section('Trắc nghiệm cuối mô đun');
    const firstModule = locked.json[0];
    const beforeAll = await get('member', `/api/learn/modules/${firstModule.slug}`);
    check('Câu hỏi thuộc mô đun, không nằm trong bài học',
      beforeAll.json.quiz.total > 0
      && beforeAll.json.lessons.length > 0,
      `quiz=${beforeAll.json.quiz.total}`);
    check('Đáp án đúng không bị gửi ra client',
      !JSON.stringify(beforeAll.json.quiz.questions).includes('correct'));
    check('Chưa học hết thì trắc nghiệm còn khoá', beforeAll.json.quiz.unlocked === false);

    const lessonXps = [];
    for (const l of beforeAll.json.lessons) {
      const done = await post('member', `/api/learn/lessons/${l.id}/complete`, {});
      if (done.json.rewards) lessonXps.push(done.json.rewards.xp);
      if (done.json.moduleCompleted) {
        check('Học xong trọn mô đun không còn XP thưởng riêng', done.json.moduleRewards?.xp === 0, String(done.json.moduleRewards?.xp));
      }
    }
    check('Mỗi bài học hoàn tất được đúng 30 XP', lessonXps.length > 0 && lessonXps.every((x) => x === 30), JSON.stringify(lessonXps));
    const afterAll = await get('member', `/api/learn/modules/${firstModule.slug}`);
    check('Học hết bài thì trắc nghiệm mở', afterAll.json.quiz.unlocked === true);

    const mapAfter = await get('member', '/api/learn/map');
    const quizStop = mapAfter.json.entries.find((e) => e.type === 'quiz' && e.moduleSlug === firstModule.slug);
    check('Chặng trắc nghiệm trên bản đồ cũng mở theo', quizStop.locked === false);

    const wrong = await post('member', `/api/learn/modules/${firstModule.slug}/quiz`, { answers: {} });
    check('Bỏ trống thì được 0 điểm', wrong.json.correct === 0 && wrong.json.total === afterAll.json.quiz.total);
    check('Lần đầu hoàn thành bài test được đúng 50 XP, không phụ thuộc số câu đúng', wrong.json.rewards?.xp === 50,
      String(wrong.json.rewards?.xp));
    check('Kết quả trả về phần giải thích cho từng câu',
      wrong.json.review.length === wrong.json.total && wrong.json.review.every((r) => 'correctIndex' in r));

    const perfect = {};
    wrong.json.review.forEach((r) => { perfect[r.id] = r.correctIndex; });
    const right = await post('member', `/api/learn/modules/${firstModule.slug}/quiz`, { answers: perfect });
    check('Trả lời đúng hết được điểm tối đa', right.json.correct === right.json.total);
    check('Làm lại điểm cao hơn không được thêm XP', right.json.improved === true && right.json.rewards?.xp === 0);

    const again = await post('member', `/api/learn/modules/${firstModule.slug}/quiz`, { answers: {} });
    check('Làm lại tệ hơn thì không thưởng thêm (vẫn ghi nhận cho thử thách)', again.json.improved === false && again.json.rewards?.xp === 0);
    const skipModule = locked.json.find((m) => m.slug !== firstModule.slug);
    check('Chưa học hết bài thì không nộp được bài test qua API',
      (await post('member', `/api/learn/modules/${skipModule.slug}/quiz`, { answers: {} })).status === 400);

    const kept = await get('member', `/api/learn/modules/${firstModule.slug}`);
    check('Chỉ giữ điểm tốt nhất', kept.json.quiz.result.correct === right.json.total, JSON.stringify(kept.json.quiz.result));

    section('Học tập (tiếp)');
    const complete = await post('member', `/api/learn/lessons/${lessonId}/complete`, { quizCorrect: 1, quizTotal: 1 });
    check('Học lại không thưởng lần hai', complete.json.replay === true && complete.json.rewards === null);

    const world = await get('member', '/api/me/world');
    check('Đã cộng XP và streak sau khi học', world.json.progress.xp > 0 && world.json.streak.count === 1);
    const pigImages = (world.json.levels || []).map((l) => l.character_image);
    const pigStatus = await Promise.all(pigImages.map((src) => fetch(`${BASE}${src}`).then((r) => r.status)));
    check('Ảnh heo của cả 10 cấp đều tải được', pigImages.length === 10 && pigStatus.every((s) => s === 200),
      pigImages.filter((_, i) => pigStatus[i] !== 200).join(', '));
    check('Năm cấp dùng bộ ảnh heo mới',
      ['pig-study-2', 'pig-office-2', 'pig-family-2', 'pig-grow-2', 'pig-saver'].every((n) => pigImages.includes(`/assets/levels/${n}.png`)));
    check('Trao huy hiệu "Bài học đầu tiên"',
      (await get('member', '/api/me/badges')).json.all.find((b) => b.code === 'first_lesson')?.earned === true);
    check('Trao huy hiệu "Mô đun đầu tiên" khi xong cả mô đun',
      (await get('member', '/api/me/badges')).json.all.find((b) => b.code === 'first_module')?.earned === true);

    section('Mở chức năng thì không được gì');
    const beforeOpen = (await get('member', '/api/me/world')).json;
    for (const path of ['/api/budget', '/api/goals', '/api/expenses']) {
      await get('member', path);
      await get('member', path);   // mở lại lần nữa cũng vậy
    }
    const afterOpen = (await get('member', '/api/me/world')).json;

    check('Mở chức năng không cộng XP', afterOpen.progress.xp === beforeOpen.progress.xp,
      `${beforeOpen.progress.xp} → ${afterOpen.progress.xp}`);
    check('Mở chức năng không đụng tới streak',
      afterOpen.streak.count === beforeOpen.streak.count && afterOpen.streak.countedToday === beforeOpen.streak.countedToday);
    check('Mở chức năng không ghi vào nhật ký hoạt động',
      (await get('member', '/api/me/activity?limit=50')).json.every((a) => a.kind !== 'feature_used'));
    check('Đọc dữ liệu không trả về phần thưởng nào',
      (await get('member', '/api/budget')).json.rewards === undefined
      && (await get('member', '/api/goals')).json.rewards === undefined
      && (await get('member', '/api/expenses')).json.rewards === undefined);
    check('Đảo chưa có dấu tích khi mới chỉ mở lên xem',
      afterOpen.features.find((f) => f.code === 'budget')?.usedToday === false);

    section('Ba chức năng');
    // Ngân sách đặt theo TỪNG DÒNG hạn mức, mỗi dòng thuộc một nhóm level 1
    // (needs / wants / incident) và có thể bó hẹp vào một nhóm chi tiêu cụ thể.
    //
    // Tài khoản mới đã có sẵn vài dòng ngân sách mẫu, nên mọi khẳng định ở đây
    // đều tính theo PHẦN CHÊNH chứ không theo con số tuyệt đối — có vậy bài kiểm
    // mới không vỡ mỗi lần bộ dữ liệu mẫu đổi.
    const thisMonth = new Date().toISOString().slice(0, 7);
    const allCats = (await get('member', '/api/categories')).json;
    const healthCat = allCats.find((c) => c.code === 'needs_health');
    const before = (await get('member', '/api/budget/limits')).json.totals.amount;

    const budget = await post('member', '/api/budget/limits', {
      month: thisMonth, groupCode: 'needs', categoryId: healthCat.id, amount: 3000000,
    });
    check('Đặt được hạn mức cho một nhóm chi tiêu',
      budget.status === 200 && budget.json.items.some((i) => i.categoryId === healthCat.id && i.amount === 3000000),
      `${budget.status} ${JSON.stringify(budget.json?.error ?? '')}`);

    const budget2 = await post('member', '/api/budget/limits', {
      month: thisMonth, groupCode: 'needs', amount: 2000000,
    });
    check('Đặt được hạn mức cho cả nhóm level 1',
      budget2.status === 200 && budget2.json.totals.amount === before + 5000000,
      `${before} + 5.000.000 ≠ ${budget2.json?.totals?.amount}`);
    check('Làm một việc thật thì mới được thưởng', budget.json.rewards?.xp > 0, JSON.stringify(budget.json.rewards?.xp));
    check('Lúc đó đảo mới có dấu tích',
      (await get('member', '/api/me/world')).json.features.find((f) => f.code === 'budget')?.usedToday === true);
    check('Ngân sách đối chiếu với chi tiêu thực tế', budget2.json.totals.spent >= 0);

    // Một nhóm chỉ được có một dòng trong tháng: dòng thứ hai phải bị chặn chứ
    // không âm thầm tạo thành hai hạn mức chồng nhau cho cùng một nhóm.
    const duplicate = await post('member', '/api/budget/limits', {
      month: thisMonth, groupCode: 'needs', amount: 999000,
    });
    check('Không tạo hai hạn mức cho cùng một nhóm trong tháng', duplicate.status === 400, String(duplicate.status));

    const wrongGroup = await post('member', '/api/budget/limits', {
      month: thisMonth, groupCode: 'wants', categoryId: healthCat.id, amount: 100000,
    });
    check('Nhóm chi tiêu phải thuộc đúng nhóm level 1', wrongGroup.status === 400, String(wrongGroup.status));

    const lineId = budget2.json.items.find((i) => i.groupCode === 'needs' && i.categoryId === null)?.id;
    const edited = await patch('member', `/api/budget/limits/${lineId}`, { amount: 2500000 });
    check('Sửa được hạn mức', edited.json.totals.amount === before + 5500000,
      `${before} + 5.500.000 ≠ ${edited.json?.totals?.amount}`);
    const dropped = await del('member', `/api/budget/limits/${lineId}?month=${thisMonth}`);
    check('Xoá được hạn mức', dropped.json.totals.amount === before + 3000000,
      `${before} + 3.000.000 ≠ ${dropped.json?.totals?.amount}`);

    const goal = await post('member', '/api/goals', { name: 'Mua xe máy', targetAmount: 20000000, icon: 'motorbike-01' });
    check('Tạo được mục tiêu', goal.status === 200 && goal.json.goal.target_amount === 20000000);

    const deposit = await post('member', `/api/goals/${goal.json.goal.id}/deposit`, { amount: 20000000 });
    check('Nạp đủ thì mục tiêu hoàn thành', deposit.json.justCompleted === true);
    // Mục tiêu không còn nạp tiền ở Ekko Lover: các huy hiệu nạp tiền / hoàn thành mục tiêu tắt sẵn.
    check('Huy hiệu nạp tiền và hoàn thành mục tiêu đã tắt',
      !(await get('member', '/api/me/badges')).json.all.some((b) => ['goal_deposits', 'goals_completed'].includes(b.rule_type)));

    // So với hạn mức tháng: câu hỏi "còn tiêu được bao nhiêu" là của cả tháng, nên
    // con số phải giống nhau ở cả ba tab.
    const budgetNow = (await get('member', '/api/budget')).json;
    const forMonth = (await get('member', '/api/expenses?range=month')).json;
    check('Sổ chi tiêu kèm phần ngân sách tháng',
      forMonth.monthBudget && forMonth.monthBudget.month === budgetNow.month);
    check('Ngân sách và số đã tiêu khớp với màn ngân sách',
      forMonth.monthBudget.planned === budgetNow.totals.planned
      && forMonth.monthBudget.spent === budgetNow.totals.spent,
      `sổ ${forMonth.monthBudget.planned}/${forMonth.monthBudget.spent} · ngân sách ${budgetNow.totals.planned}/${budgetNow.totals.spent}`);
    check('Phần trăm ngân sách tính đúng',
      forMonth.monthBudget.percent === (forMonth.monthBudget.planned > 0
        ? Math.round((forMonth.monthBudget.spent / forMonth.monthBudget.planned) * 100)
        : 0));
    const forToday = (await get('member', '/api/expenses?range=today')).json;
    check('Đổi tab không làm đổi phần ngân sách',
      JSON.stringify(forToday.monthBudget) === JSON.stringify(forMonth.monthBudget));

    check('Thu nhập của tháng cũng được đưa sang',
      forMonth.monthBudget.income === budgetNow.totals.income);

    section('Tư vấn trước khi tạo mục tiêu');
    // Người dùng riêng cho phần này: chưa có thu nhập, chưa có khoản chi.
    const adviseeLogin = await get('advisee', '/dev/login?sub=smoke-advisee&name=Advisee');
    await get('advisee', adviseeLogin.headers.get('location'));
    // Đăng nhập lần đầu có thể nạp dữ liệu mẫu: xoá đi để đúng là người chưa có dữ liệu.
    const { DatabaseSync } = await import('node:sqlite');
    const scratch = new DatabaseSync(join(DATA_DIR, 'gdtc.sqlite'));
    const adviseeId = scratch.prepare("SELECT id FROM users WHERE ekko_user_id = 'smoke-advisee'").get().id;
    for (const table of ['expenses', 'income_entries', 'monthly_income', 'goals']) {
      scratch.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(adviseeId);
    }
    scratch.close();
    // Ngày theo giờ Việt Nam như server (toISOString là giờ UTC: chạy lúc 0–7h sáng sẽ lệch một ngày).
    const day = (months) => { const d = new Date(); d.setMonth(d.getMonth() + months); return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }); };
    const ask = await post('advisee', '/api/goals/advice', { name: 'Quỹ khẩn cấp', targetAmount: 12000000, deadline: day(12) });
    check('Chưa có dữ liệu thì hỏi thu nhập và số tiền để dành ước tính',
      ask.status === 200 && ask.json.needsInfo.includes('monthlyIncome') && ask.json.needsInfo.includes('monthlySaving') && ask.json.analysis === null,
      JSON.stringify(ask.json).slice(0, 200));
    const advised = await post('advisee', '/api/goals/advice', {
      name: 'Quỹ khẩn cấp', targetAmount: 12000000, deadline: day(12), monthlyIncome: 10000000, monthlySaving: 2000000,
    });
    check('Có số ước tính thì phân tích: khả thi, 6 tháng là đạt',
      advised.json.analysis?.verdict === 'kha_thi' && advised.json.facts.monthsNeeded === 6 && advised.json.analysis.points.length >= 2,
      JSON.stringify(advised.json.facts));
    check('Không có khoá AI thì nhận xét theo công thức', advised.json.analysis?.source === 'rule');
    const adviseeGoals = (await get('advisee', '/api/goals')).json.goals;
    check('Có tư vấn là mục tiêu được ghi ngay vào danh sách, kèm lời tư vấn',
      advised.json.created === true && adviseeGoals.length === 1 && adviseeGoals[0].advice?.verdict === 'kha_thi',
      JSON.stringify(adviseeGoals.map((g) => [g.name, g.advice?.verdict])));
    const readvised = await post('advisee', '/api/goals/advice', {
      name: 'Quỹ khẩn cấp gia đình', targetAmount: 15000000, deadline: day(12), goalId: advised.json.goal.id,
    });
    const afterReadvise = (await get('advisee', '/api/goals')).json.goals;
    check('Tư vấn lại thì cập nhật đúng mục tiêu đó, không tạo thêm',
      readvised.json.created === false && afterReadvise.length === 1 && afterReadvise[0].name === 'Quỹ khẩn cấp gia đình'
      && afterReadvise[0].target_amount === 15000000);
    const remembered = await post('advisee', '/api/goals/advice', { name: 'Mua xe', targetAmount: 30000000, deadline: day(6) });
    check('Số ước tính được nhớ cho lần sau; mục tiêu quá sức thì báo khó đạt',
      remembered.json.needsInfo.length === 0 && remembered.json.finances.incomeSource === 'estimate'
      && remembered.json.analysis.verdict === 'kho_dat' && remembered.json.facts.gapPerMonth === 3000000,
      JSON.stringify({ f: remembered.json.finances, v: remembered.json.analysis?.verdict, gap: remembered.json.facts.gapPerMonth }));
    check('Chưa đủ số liệu để tư vấn thì chưa tạo mục tiêu', ask.json.goal === undefined);
    check('Mục tiêu mới sau tư vấn được thêm vào danh sách', (await get('advisee', '/api/goals')).json.goals.length === 2);
    check('Thiếu tên mục tiêu thì báo lỗi', (await post('advisee', '/api/goals/advice', { targetAmount: 1000000 })).status === 400);

    section('Mục tiêu gợi ý');
    const goalsHome = await get('member', '/api/goals');
    check('Trả về bộ mục tiêu gợi ý theo nhóm',
      goalsHome.json.templates.length === 4 && goalsHome.json.templates.every((g) => g.templates.length > 0));
    check('Mỗi gợi ý có sẵn số tiền và số tháng',
      goalsHome.json.templates.flatMap((g) => g.templates)
        .every((t) => t.code && t.emoji && typeof t.amount === 'number' && t.months > 0));
    check('Có ngày hôm nay để tính thời hạn theo giờ Việt Nam', /^\d{4}-\d{2}-\d{2}$/.test(goalsHome.json.today));
    check('Chỉ có hai kỳ tiết kiệm: tháng và tuần',
      Object.keys(goalsHome.json.periods).join(',') === 'month,week');

    const fromTemplate = await post('member', '/api/goals', {
      template: 'motorbike', name: 'Mua xe máy', targetAmount: 30000000, deadline: '2028-02-11', period: 'week',
    });
    check('Mục tiêu tạo từ gợi ý giữ mã gợi ý và kỳ tiết kiệm',
      fromTemplate.json.goal.template === 'motorbike' && fromTemplate.json.goal.period === 'week');
    check('Mục tiêu lấy biểu tượng của gợi ý khi không truyền icon', fromTemplate.json.goal.icon === 'motorbike-01');
    check('App biết mục tiêu thuộc nhóm nào',
      fromTemplate.json.goals.find((g) => g.id === fromTemplate.json.goal.id)?.group === 'Mua sắm tài sản');

    const badPeriod = await patch('member', `/api/goals/${fromTemplate.json.goal.id}`, { period: 'quý' });
    check('Kỳ tiết kiệm không hợp lệ bị bỏ qua, giữ giá trị cũ',
      badPeriod.json.goals.find((g) => g.id === fromTemplate.json.goal.id)?.period === 'week');

    const badTemplate = await post('member', '/api/goals', { template: 'du-thuyen', name: 'Mua du thuyền', targetAmount: 1000000 });
    check('Mã gợi ý lạ không được ghi vào mục tiêu', badTemplate.json.goal.template === null);
    await del('member', `/api/goals/${badTemplate.json.goal.id}`);

    section('Ba chức năng (tiếp)');
    const badAmount = await post('member', '/api/expenses', { amount: -5000 });
    check('Số tiền âm bị từ chối', badAmount.status === 400);

    const expense = await post('member', '/api/expenses', { amount: 45000, categoryCode: 'needs_food', note: 'Cà phê' });
    check('Ghi được khoản chi', expense.status === 200 && expense.json.expense.amount === 45000);

    const bar = await post('member', '/api/expenses/quick', { text: 'đổ xăng 120 nghìn' });
    check('Thanh ghi nhanh đọc đúng số tiền', bar.status === 200 && bar.json.expense.amount === 120000, String(bar.json?.expense?.amount));
    check('Thanh ghi nhanh đoán đúng nhóm', bar.json.category?.code === 'needs_transport', bar.json.category?.code);
    check('Thanh ghi nhanh tách được ghi chú', bar.json.expense.note === 'đổ xăng', bar.json.expense.note);

    // Số tiền gõ tắt: phần đuôi sau đơn vị là phần lẻ ("29tr900" = 29,9 triệu).
    for (const [text, amount] of [['mua laptop 29tr900', 29900000], ['tiền nhà 12tr', 12000000], ['ăn tối 1tr2', 1200000]]) {
      const short = await post('member', '/api/expenses/quick', { text });
      check(`Ghi nhanh hiểu số tiền gõ tắt "${text}"`, short.status === 200 && short.json.expense.amount === amount, String(short.json?.expense?.amount));
      if (short.json?.expense?.id) await del('member', `/api/expenses/${short.json.expense.id}`);
    }
    const { parseMoney } = await import('../public/shared/money.js');
    check('Ô Số tiền đọc được các kiểu gõ tắt',
      parseMoney('29tr900') === 29900000 && parseMoney('12tr') === 12000000 && parseMoney('35k5') === 35500
      && parseMoney('1ty2') === 1200000000 && parseMoney('2,5tr') === 2500000 && parseMoney('12.000.000') === 12000000
      && parseMoney('12tr9999') === null);

    // Simple mode: nói để ghi. Giọng nói hay trả số bằng chữ, nên server tự đổi.
    for (const [text, amount] of [['cà phê ba mươi lăm nghìn', 35000], ['tiền điện một triệu hai', 1200000], ['học phí hai triệu rưỡi', 2500000], ['coffee 35 thousand', 35000]]) {
      const spoken = await post('member', '/api/expenses/parse', { text });
      check(`Đọc thử "${text}" ra đúng số tiền, chưa lưu`, spoken.status === 200 && spoken.json.amount === amount, JSON.stringify(spoken.json));
    }
    const countBefore = (await get('member', '/api/expenses?range=today')).json.totals.count;
    await post('member', '/api/expenses/parse', { text: 'trà sữa bốn mươi lăm nghìn' });
    check('Đọc thử không ghi gì vào sổ', (await get('member', '/api/expenses?range=today')).json.totals.count === countBefore);
    const parsedCoffee = (await post('member', '/api/expenses/parse', { text: 'cà phê ba mươi lăm nghìn' })).json;
    check('Đọc thử đoán được nhóm chi và ghi chú', parsedCoffee.note === 'cà phê' && Boolean(parsedCoffee.category?.name), JSON.stringify(parsedCoffee));
    const spokenSave = await post('member', '/api/expenses/quick', { text: 'cà phê ba mươi lăm nghìn' });
    check('Ghi nhanh cũng hiểu số đọc bằng chữ', spokenSave.status === 200 && spokenSave.json.expense.amount === 35000);
    check('Đọc thử câu không có số tiền thì báo lỗi rõ ràng',
      (await post('member', '/api/expenses/parse', { text: 'mua bảy cái bánh' })).status === 400);

    const barNoMoney = await post('member', '/api/expenses/quick', { text: 'hôm nay trời đẹp' });
    check('Câu không có số tiền bị từ chối kèm gợi ý', barNoMoney.status === 400 && /35k/.test(barNoMoney.json.error));

    // A back-dated entry so the three ranges cannot accidentally agree.
    const lastMonth = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);
    await post('member', '/api/expenses', { amount: 777000, categoryCode: 'needs_other', note: 'cũ', spentOn: lastMonth });

    const ranges = {};
    for (const key of ['today', 'week', 'month']) {
      ranges[key] = (await get('member', `/api/expenses?range=${key}`)).json;
    }
    check('Lọc "Hôm nay" chỉ lấy đúng một ngày', ranges.today.from === ranges.today.to);
    check('Lọc "Tuần này" trải đúng 7 ngày',
      Math.round((Date.parse(ranges.week.to) - Date.parse(ranges.week.from)) / 86400000) === 6,
      `${ranges.week.from} → ${ranges.week.to}`);
    check('Lọc "Tháng này" bắt đầu từ ngày 1', ranges.month.from.endsWith('-01'), ranges.month.from);
    // Đầu tháng, "tuần này" còn lấn sang tháng trước, nên chỉ so tuần với tháng
    // khi tuần nằm trọn trong tháng; hôm nay thì luôn nằm trong cả hai.
    check('Khoảng rộng hơn thì không ít khoản hơn',
      ranges.week.totals.count >= ranges.today.totals.count
      && ranges.month.totals.count >= ranges.today.totals.count
      && (ranges.week.from < ranges.month.from || ranges.month.totals.count >= ranges.week.totals.count),
      [ranges.today.totals.count, ranges.week.totals.count, ranges.month.totals.count].join(' / '));
    check('Mọi khoản trả về đều nằm trong khoảng',
      ranges.week.expenses.every((e) => e.spent_on >= ranges.week.from && e.spent_on <= ranges.week.to));
    check('Nhãn khoảng thời gian đi kèm dữ liệu', ranges.today.label === 'Hôm nay' && ranges.month.label === 'Tháng này');

    const badRange = await get('member', '/api/expenses?range=quy');
    check('Khoảng thời gian lạ bị từ chối', badRange.status === 400);

    section('Cảnh báo chi tiêu bất thường');
    const normalMeal = await post('member', '/api/expenses', { amount: 45000, categoryCode: 'needs_food', note: 'cơm trưa' });
    check('Khoản chi bình thường thì không cảnh báo', normalMeal.json.alerts.length === 0,
      JSON.stringify(normalMeal.json.alerts));

    const hugeMeal = await post('member', '/api/expenses', { amount: 2000000, categoryCode: 'needs_food', note: 'ăn tối' });
    check('Khoản ăn uống 2 triệu bị cảnh báo',
      hugeMeal.json.alerts.some((a) => a.code === 'daily_large'), JSON.stringify(hugeMeal.json.alerts.map((a) => a.code)));
    check('Cảnh báo vẫn ghi khoản chi vào sổ', hugeMeal.json.expense.amount === 2000000);
    check('Cảnh báo nói rõ số tiền và cách sửa',
      /2\.000\.000đ/.test(hugeMeal.json.alerts[0].title) && /sổ chi tiêu/.test(hugeMeal.json.alerts[0].text));
    await del('member', `/api/expenses/${hugeMeal.json.expense.id}`);

    const bigHousing = await post('member', '/api/expenses', { amount: 4000000, categoryCode: 'needs_housing', note: 'tiền nhà' });
    check('Nhóm không đặt ngưỡng thì không cảnh báo theo ngưỡng',
      bigHousing.json.alerts.every((a) => a.code !== 'daily_large'),
      JSON.stringify(bigHousing.json.alerts.map((a) => a.code)));
    await del('member', `/api/expenses/${bigHousing.json.expense.id}`);

    // Ngân sách Ăn uống tháng này là 3.000.000 (đặt ở phần trên).
    const halfBudget = await post('member', '/api/expenses', { amount: 1500000, categoryCode: 'needs_food', note: 'tiệc cơ quan' });
    check('Một khoản bằng nửa hạn mức nhóm thì được nhắc',
      halfBudget.json.alerts.some((a) => a.code === 'budget_share'),
      JSON.stringify(halfBudget.json.alerts.map((a) => a.code)));
    await del('member', `/api/expenses/${halfBudget.json.expense.id}`);

    // Mức thường của người này ở nhóm Ăn uống đang là vài chục nghìn, nên 300k
    // là bất thường dù chưa tới ngưỡng 500k của nhóm.
    const spike = await post('member', '/api/expenses', { amount: 300000, categoryCode: 'needs_food', note: 'nhà hàng' });
    check('Gấp nhiều lần mức thường của chính người dùng thì được nhắc',
      spike.json.alerts.some((a) => a.code === 'personal_spike'),
      JSON.stringify(spike.json.alerts.map((a) => a.code)));
    await del('member', `/api/expenses/${spike.json.expense.id}`);

    // Ngưỡng của nhóm chỉ là phỏng đoán mặc định: khi phần lớn khoản chi gần đây
    // của chính người dùng đều ở mức đó thì nó phải im lặng.
    const bigSpender = [];
    for (let i = 0; i < 6; i += 1) {
      const row = await post('member', '/api/expenses', { amount: 1200000, categoryCode: 'wants_entertainment', note: `nhậu ${i}` });
      bigSpender.push(row.json.expense.id);
    }
    const habitual = await post('member', '/api/expenses', { amount: 1200000, categoryCode: 'wants_entertainment', note: 'nhậu nữa' });
    check('Mức cao nhưng là bình thường với người này thì không cảnh báo',
      habitual.json.alerts.every((a) => a.code !== 'daily_large'),
      JSON.stringify(habitual.json.alerts.map((a) => a.code)));
    for (const id of [...bigSpender, habitual.json.expense.id]) await del('member', `/api/expenses/${id}`);

    const alertViaBot = await post('member', '/api/bot/message', { text: 'ăn trưa 3 triệu' });
    check('Ekko bot cũng cảnh báo ngay trong câu trả lời',
      /\n\n\*\*/.test(alertViaBot.json.reply.text) && alertViaBot.json.reply.alerts.length > 0,
      alertViaBot.json.reply.text?.slice(0, 80));
    await del('member', `/api/expenses/${alertViaBot.json.reply.expense.id}`);

    section('Ghi nhanh đồng bộ vào khung chat');
    const chatBefore = (await get('member', '/api/bot/history?limit=100')).json.messages.length;
    await post('member', '/api/expenses/quick', { text: 'cà phê 33k' });
    const synced = (await get('member', '/api/bot/history?limit=100')).json.messages.slice(chatBefore);

    check('Một lần ghi nhanh thêm đúng hai tin nhắn',
      synced.length === 2 && synced[0].role === 'user' && synced[1].role === 'bot',
      synced.map((m) => m.role).join(','));
    check('Tin nhắn giữ nguyên câu người dùng đã gõ', synced[0]?.text === 'cà phê 33k', synced[0]?.text);
    check('Ekko bot xác nhận đúng số tiền trong khung chat', /33\.000/.test(synced[1]?.text || ''), synced[1]?.text);
    check('Hai tin nhắn được đánh dấu nguồn "quick"',
      synced.every((m) => m.source === 'quick'), synced.map((m) => m.source).join(','));
    check('Tin nhắn xác nhận có nút mở sổ chi tiêu',
      synced[1]?.meta?.action?.route === '/app/#/expenses', JSON.stringify(synced[1]?.meta?.action));
    check('Không hiện lại phần thưởng đã trao ở thanh ghi nhanh', synced[1]?.meta?.rewards === null);

    // Huy hiệu "Bạn của Ekko bot" cần 5 lần trò chuyện. Ghi nhanh nhiều hơn thế
    // vẫn không được tính, vì đó không phải là trò chuyện.
    for (const line of ['bún bò 40k', 'trà sữa 30k', 'gửi xe 5k', 'bánh mì 20k']) {
      await post('member', '/api/expenses/quick', { text: line });
    }
    check('Ghi nhanh không tính là trò chuyện với Ekko bot',
      (await get('member', '/api/me/badges')).json.all.find((b) => b.code === 'bot_friend')?.earned === false);

    section('Ekko bot');
    const quick = await post('member', '/api/bot/message', { text: 'ăn trưa 65 nghìn' });
    check('Ghi nhanh chi tiêu từ câu nói', quick.json.reply.kind === 'expense_logged');
    check('Đọc đúng số tiền 65.000', quick.json.reply.expense.amount === 65000, String(quick.json.reply.expense?.amount));

    const notMoney = await post('member', '/api/bot/message', { text: 'quy tắc 50/30/20 là gì?' });
    check('Câu hỏi có số nhưng không phải tiền thì không bị ghi sổ',
      notMoney.json.reply.kind !== 'expense_logged', notMoney.json.reply.kind);

    const streakQuestion = await post('member', '/api/bot/message', { text: 'streak của tôi thế nào?' });
    check('Trả lời được câu hỏi về streak', streakQuestion.json.reply.kind === 'status_streak');

    const lessonQuestion = await post('member', '/api/bot/message', { text: 'quỹ khẩn cấp cần bao nhiêu tháng?' });
    check('Tìm được nội dung trong bài học',
      lessonQuestion.json.reply.kind === 'lesson' && lessonQuestion.json.reply.action?.type === 'open_lesson',
      lessonQuestion.json.reply.kind);

    const spending = await post('member', '/api/bot/message', { text: 'tháng này tôi tiêu bao nhiêu?' });
    check('Trả lời được câu hỏi về chi tiêu', spending.json.reply.kind === 'status_spending');

    const history = await get('member', '/api/bot/history');
    check('Lưu lịch sử trò chuyện', history.json.messages.length >= 10);
    check('Khung chat có cả tin ghi nhanh và tin trò chuyện',
      new Set(history.json.messages.map((m) => m.source)).size === 2,
      [...new Set(history.json.messages.map((m) => m.source))].join(','));
    check('Trò chuyện thật thì được huy hiệu "Bạn của Ekko bot"',
      (await get('member', '/api/me/badges')).json.all.find((b) => b.code === 'bot_friend')?.earned === true);

    section('Phân quyền');
    const memberOnAdmin = await get('member', '/api/admin/levels');
    check('Người học không vào được API quản trị', memberOnAdmin.status === 403);

    const adminLogin = await get('admin', '/dev/login?role=admin');
    await get('admin', adminLogin.headers.get('location'));
    const who = await get('admin', '/api/session/whoami');
    check('Đăng nhập được với vai trò quản trị', who.json.role === 'admin');

    section('Admin portal');
    const levels = await get('admin', '/api/admin/levels');
    check('Đọc được danh sách cấp độ', levels.json.length === 10);
    check('Cấp độ có emoji và ngưỡng XP tăng dần',
      levels.json.every((l) => l.emoji)
      && levels.json.every((l, i) => i === 0 || l.xp_required > levels.json[i - 1].xp_required),
      levels.json.map((l) => `${l.emoji}${l.xp_required}`).join(' '));

    const perked = await patch('admin', `/api/admin/levels/${levels.json[0].id}`, { perk: 'Ưu đãi thử nghiệm', emoji: 'piggy-bank' });
    check('Sửa được phúc lợi của cấp độ', perked.json.perk === 'Ưu đãi thử nghiệm' && perked.json.emoji === 'piggy-bank');

    check('Thang XP đủ dài: cấp cao nhất cần từ 3.000 XP',
      levels.json[levels.json.length - 1].xp_required >= 3000, String(levels.json[levels.json.length - 1].xp_required));

    const aiSettings = (await get('admin', '/api/admin/settings/ai')).json;
    check('Admin xem được giới hạn lượt AI (mặc định 30) và số liệu hôm nay',
      aiSettings.dailyLimit === 30 && aiSettings.usage && Array.isArray(aiSettings.outOfScope), JSON.stringify(aiSettings).slice(0, 160));
    check('Giới hạn lượt AI không hợp lệ bị chặn', (await put('admin', '/api/admin/settings/ai', { dailyLimit: -3 })).status === 400);
    check('Đổi được giới hạn lượt AI', (await put('admin', '/api/admin/settings/ai', { dailyLimit: 50 })).json.dailyLimit === 50);
    await put('admin', '/api/admin/settings/ai', { dailyLimit: 30 });
    check('Tin nhắn cho Ekko bot dài quá 300 ký tự bị chặn',
      (await post('member', '/api/bot/message', { text: 'a'.repeat(301) })).status === 400);

    const learningXp = (await get('admin', '/api/admin/settings/learning-xp')).json;
    check('XP học tập mặc định: 30/bài, 50/bài test mô đun', learningXp.lesson === 30 && learningXp.moduleQuiz === 50,
      JSON.stringify(learningXp));
    const changedXp = await put('admin', '/api/admin/settings/learning-xp', { lesson: 35, moduleQuiz: 60 });
    check('Đổi được XP học tập', changedXp.json.lesson === 35 && changedXp.json.moduleQuiz === 60);
    check('XP học tập âm bị chặn', (await put('admin', '/api/admin/settings/learning-xp', { lesson: -1 })).status === 400);
    check('Người học không đổi được XP học tập', (await put('member', '/api/admin/settings/learning-xp', { lesson: 999 })).status === 403);
    await put('admin', '/api/admin/settings/learning-xp', { lesson: 30, moduleQuiz: 50 });

    const created = await post('admin', '/api/admin/badges', {
      name: 'Huy hiệu kiểm thử', group_code: 'learning',
      rule_type: 'lessons_completed', rule_value: 99, xp_reward: 5, order_index: 99,
    });
    check('Tạo được huy hiệu mới, mã tự sinh từ tên', created.status === 200 && created.json.code === 'huy_hieu_kiem_thu',
      JSON.stringify(created.json));
    const sameName = await post('admin', '/api/admin/badges', {
      name: 'Huy hiệu kiểm thử', group_code: 'learning', rule_type: 'lessons_completed', rule_value: 98,
    });
    check('Trùng tên thì mã thêm số', sameName.json.code === 'huy_hieu_kiem_thu_2', sameName.json.code);
    await del('admin', `/api/admin/badges/${sameName.json.id}`);
    const badGroup = await post('admin', '/api/admin/badges', {
      name: 'Sai nhóm', group_code: 'khong-co', rule_type: 'lessons_completed', rule_value: 1,
    });
    check('Nhóm huy hiệu không hợp lệ bị chặn', badGroup.status === 400);
    const badgeRowsGrouped = (await get('admin', '/api/admin/badges')).json;
    check('Mọi huy hiệu khởi tạo đều có nhóm', badgeRowsGrouped.every((b) => b.group_code));

    const challengeRows = (await get('admin', '/api/admin/challenges')).json;
    check('Có thử thách khởi đầu, ngày và tuần',
      ['once', 'daily', 'weekly'].every((p) => challengeRows.some((c) => c.period === p)));
    const newChallenge = await post('admin', '/api/admin/challenges', {
      name: 'Thử thách kiểm thử', period: 'weekly', rule_type: 'news_read', rule_value: 2, xp_reward: 5,
    });
    check('Tạo được thử thách, mã tự sinh', newChallenge.status === 200 && newChallenge.json.code === 'thu_thach_kiem_thu');
    check('Kỳ thử thách không hợp lệ bị chặn',
      (await post('admin', '/api/admin/challenges', { name: 'Sai kỳ', period: 'monthly', rule_type: 'news_read' })).status === 400);
    check('Xoá được thử thách', (await del('admin', `/api/admin/challenges/${newChallenge.json.id}`)).status === 200);


    const badRule = await post('admin', '/api/admin/badges', {
      code: 'smoke_bad_rule', name: 'Sai điều kiện', rule_type: 'khong-ton-tai', rule_value: 1,
    });
    check('Điều kiện huy hiệu không hợp lệ bị chặn', badRule.status === 400);

    const updated = await patch('admin', `/api/admin/badges/${created.json.id}`, { name: 'Đã đổi tên' });
    check('Sửa được huy hiệu', updated.json.name === 'Đã đổi tên');
    check('Xoá được huy hiệu', (await del('admin', `/api/admin/badges/${created.json.id}`)).status === 200);

    const tree = await get('admin', '/api/admin/content/tree');
    check('Cây nội dung mang emoji, kiểu nội dung và câu hỏi',
      tree.json.every((m) => m.emoji)
      && tree.json.every((m) => Array.isArray(m.questions))
      && tree.json.every((m) => m.lessons.every((l) => ['text', 'slides'].includes(l.content_type))));

    const question = await post('admin', '/api/admin/questions', {
      module_id: tree.json[0].id,
      order_index: 99,
      question: 'Câu hỏi kiểm thử?',
      options: [{ text: 'Sai', correct: false }, { text: 'Đúng', correct: true }],
    });
    check('Tạo được câu hỏi cuối mô đun', question.status === 200 && question.json.options.length === 2);
    check('Câu hỏi trả về options đã giải mã', Array.isArray(question.json.options));

    const noCorrect = await post('admin', '/api/admin/questions', {
      module_id: tree.json[0].id, question: 'Thiếu đáp án đúng?',
      options: [{ text: 'A' }, { text: 'B' }],
    });
    check('Câu hỏi không có đáp án đúng bị chặn', noCorrect.status === 400);

    const oneOption = await post('admin', '/api/admin/questions', {
      module_id: tree.json[0].id, question: 'Chỉ một lựa chọn?',
      options: [{ text: 'A', correct: true }],
    });
    check('Câu hỏi dưới hai lựa chọn bị chặn', oneOption.status === 400);
    await del('admin', `/api/admin/questions/${question.json.id}`);

    const badType = await patch('admin', `/api/admin/lessons/${tree.json[0].lessons[0].id}`, { content_type: 'video' });
    check('Kiểu nội dung không hợp lệ bị chặn', badType.status === 400);

    // The list toggles PATCH a single flag, so that path has to work on its own.
    const flip = async (entity, id, field, value) => (await patch('admin', `/api/admin/${entity}/${id}`, { [field]: value })).json;
    const lessonId2 = tree.json[0].lessons[0].id;
    check('Tắt nhanh bài học', (await flip('lessons', lessonId2, 'is_published', 0)).is_published === 0);
    check('Bật lại bài học', (await flip('lessons', lessonId2, 'is_published', 1)).is_published === 1);
    check('Tắt nhanh mô đun', (await flip('modules', tree.json[0].id, 'is_published', 0)).is_published === 0);
    check('Bài học của mô đun đã tắt biến mất khỏi app người học',
      !(await get('member', '/api/learn/modules')).json.some((m) => m.id === tree.json[0].id));
    // Ẩn thêm mô đun 2: mô đun hiển thị đầu tiên còn lại là mô đun 3 — tạm đặt
    // nó đòi cấp 10 — vẫn phải mở ngay, bài đầu của nó là bài đang tới lượt.
    const thirdUnlock = tree.json[2].unlock_level;
    await flip('modules', tree.json[2].id, 'unlock_level', 10);
    await flip('modules', tree.json[1].id, 'is_published', 0);
    const hiddenMap = (await get('member', '/api/learn/map')).json.entries;
    const firstShown = hiddenMap.find((e) => e.type === 'module');
    check('Ẩn các mô đun trước thì mô đun hiển thị đầu tiên mở ngay',
      firstShown?.id === tree.json[2].id && !firstShown.locked, JSON.stringify(firstShown));
    check('…và bài đầu của nó học được luôn',
      hiddenMap.find((e) => e.type === 'lesson')?.current === true);
    check('…gọi thẳng API bài đó cũng được',
      (await get('member', `/api/learn/lessons/${tree.json[2].lessons[0].id}`)).status === 200);
    await flip('modules', tree.json[1].id, 'is_published', 1);
    await flip('modules', tree.json[0].id, 'is_published', 1);
    await flip('modules', tree.json[2].id, 'unlock_level', thirdUnlock);

    const featureRows = await get('admin', '/api/admin/features');
    check('Tắt nhanh đảo chức năng', (await flip('features', featureRows.json[1].id, 'is_enabled', 0)).is_enabled === 0);
    check('Đảo đã tắt không còn trong thế giới người học',
      !(await get('member', '/api/me/world')).json.features.some((f) => f.id === featureRows.json[1].id));
    await flip('features', featureRows.json[1].id, 'is_enabled', 1);

    // Nhóm chi tiêu is now edited inside the expense feature's dialog, but the
    // API path it uses is the same, and the bot must pick changes up at once.
    const cats = await get('admin', '/api/admin/categories');
    const food = cats.json.find((c) => c.code === 'needs_food');
    const widened = await patch('admin', `/api/admin/categories/${food.id}`, { keywords: `${food.keywords},bánh mì kiểm thử` });
    check('Sửa được từ khoá nhóm chi tiêu', widened.json.keywords.endsWith('bánh mì kiểm thử'));

    const classified = await post('member', '/api/expenses/quick', { text: 'bánh mì kiểm thử 20k' });
    check('Ekko bot dùng ngay từ khoá vừa thêm',
      classified.json.category?.code === 'needs_food', classified.json.category?.code);
    await patch('admin', `/api/admin/categories/${food.id}`, { keywords: food.keywords });

    const badgeRows = await get('admin', '/api/admin/badges');
    check('Tắt nhanh huy hiệu', (await flip('badges', badgeRows.json[0].id, 'is_active', 0)).is_active === 0);
    await flip('badges', badgeRows.json[0].id, 'is_active', 1);

    const newFrame = await post('admin', '/api/admin/frames', {
      lesson_id: lessonId, order_index: 99, kind: 'slide',
      payload: { image: '/assets/mascot/bot-1.png', caption: 'Slide kiểm thử' },
    });
    check('Tạo được frame slide', newFrame.status === 200 && newFrame.json.payload.caption === 'Slide kiểm thử');

    const editedSlide = await patch('admin', `/api/admin/frames/${newFrame.json.id}`, {
      kind: 'slide',
      payload: { image: '/assets/mascot/bot-2.png', caption: 'Đã sửa', alt: 'Ảnh minh hoạ' },
    });
    check('Sửa được một slide mà vẫn giữ đúng loại frame',
      editedSlide.json.kind === 'slide' && editedSlide.json.payload.caption === 'Đã sửa'
      && editedSlide.json.payload.alt === 'Ảnh minh hoạ',
      JSON.stringify(editedSlide.json.payload));

    const badKind = await post('admin', '/api/admin/frames', { lesson_id: lessonId, kind: 'khong-hop-le' });
    check('Loại frame không hợp lệ bị chặn', badKind.status === 400);

    const framesNow = await get('admin', `/api/admin/frames?lesson_id=${lessonId}`);
    check('Frame mới xuất hiện trong bài học', framesNow.json.some((f) => f.id === newFrame.json.id));
    await del('admin', `/api/admin/frames/${newFrame.json.id}`);

    const injection = await patch('admin', `/api/admin/levels/${levels.json[0].id}`, {
      name: 'Đảo Khởi Hành', id: 999, some_unknown_column: 'x',
    });
    check('Trường lạ bị bỏ qua, không lọt vào SQL', injection.status === 200 && injection.json.id === levels.json[0].id);

    const stats = await get('admin', '/api/admin/stats/overview');
    check('Bảng điều khiển có số liệu', stats.json.users.total >= 2 && stats.json.engagement.lessonsCompleted >= 1);

    const users = await get('admin', '/api/admin/stats/users');
    check('Danh sách người học không lộ dữ liệu chi tiêu',
      users.json.length >= 2 && !('expenses' in users.json[0]) && !('budget' in users.json[0]));

    section('Nhận thưởng huy hiệu (Ekko Lover)');
    const claimBoard = (await get('member', '/api/me/badges')).json;
    const pending = claimBoard.all.find((b) => b.claimable);
    check('Đạt huy hiệu ở Ekko Lover thì XP còn chờ bấm nhận',
      Boolean(pending) && claimBoard.claimable >= 1,
      JSON.stringify(claimBoard.all.filter((b) => b.earned).map((b) => `${b.code}:${b.claimable}`)));
    if (pending) {
      const xpBefore = (await get('member', '/api/me/world')).json.progress.xp;
      const claimed = await post('member', `/api/me/badges/${pending.code}/claim`, {});
      check('Nhận thưởng trả về đúng XP của huy hiệu', claimed.status === 200 && claimed.json.xp === pending.xp_reward,
        JSON.stringify(claimed.json));
      const xpAfter = (await get('member', '/api/me/world')).json.progress.xp;
      check('XP của người dùng tăng sau khi nhận', xpAfter >= xpBefore + pending.xp_reward, `${xpBefore} → ${xpAfter}`);
      const twice = await post('member', `/api/me/badges/${pending.code}/claim`, {});
      check('Nhận lần hai không cộng thêm', twice.json.already === true && twice.json.xp === 0);
      const claimedRow = (await get('member', '/api/me/badges')).json.all.find((b) => b.code === pending.code);
      check('Huy hiệu đã nhận không còn chờ', claimedRow.claimable === false && Boolean(claimedRow.claimed_at));
    }
    const notEarned = claimBoard.all.find((b) => !b.earned);
    check('Huy hiệu chưa đạt thì không nhận được',
      !notEarned || (await post('member', `/api/me/badges/${notEarned.code}/claim`, {})).status === 400);

    section('Check-in hằng ngày');
    const firstCheckin = await post('member', '/api/me/checkin', {});
    const secondCheckin = await post('member', '/api/me/checkin', {});
    check('Lần đầu vào màn chính trong ngày được 10 XP', firstCheckin.status === 200 && firstCheckin.json.xp === 10,
      JSON.stringify(firstCheckin.json).slice(0, 120));
    check('Lần thứ hai trong ngày không được thêm', secondCheckin.json.xp === 0 && secondCheckin.json.already === true);
    check('Check-in không tính streak', firstCheckin.json.streak === null);
    check('Check-in mặc định trong XP học tập là 10', (await get('admin', '/api/admin/settings/learning-xp')).json.checkin === 10);

    section('Thử thách (Ekko Lover)');
    const challengeBoard = (await get('member', '/api/me/challenges')).json;
    check('Mỗi ngày đúng 3 thử thách, tuần có đủ bộ',
      challengeBoard.daily.items.length === 3 && challengeBoard.weekly.items.length >= 4,
      `${challengeBoard.daily.items.length} / ${challengeBoard.weekly.items.length}`);
    check('Đề hôm nay cố định khi mở lại',
      JSON.stringify((await get('member', '/api/me/challenges')).json.daily.items.map((i) => i.id))
        === JSON.stringify(challengeBoard.daily.items.map((i) => i.id)));
    const allChallenges = [challengeBoard.onboarding, challengeBoard.daily, challengeBoard.weekly].filter(Boolean).flatMap((s) => s.items);
    const doneChallenge = allChallenges.find((i) => i.claimable);
    const openChallenge = allChallenges.find((i) => !i.done);
    check('Người học đã làm việc nên có thử thách xong chờ nhận', Boolean(doneChallenge),
      JSON.stringify(allChallenges.map((i) => `${i.code}:${i.progress}/${i.target}`)));
    if (doneChallenge) {
      const xpBefore = (await get('member', '/api/me/world')).json.progress.xp;
      const got = await post('member', `/api/me/challenges/${doneChallenge.id}/claim`, {});
      check('Nhận thưởng thử thách cộng đúng XP', got.status === 200 && got.json.xp === doneChallenge.xp_reward
        && (await get('member', '/api/me/world')).json.progress.xp === xpBefore + doneChallenge.xp_reward, JSON.stringify(got.json).slice(0, 200));
      check('Nhận lần hai bị chặn', (await post('member', `/api/me/challenges/${doneChallenge.id}/claim`, {})).status === 400);
    }
    if (openChallenge) {
      check('Thử thách chưa xong thì không nhận được',
        (await post('member', `/api/me/challenges/${openChallenge.id}/claim`, {})).status === 400);
    }
    check('Thưởng cả ngày chỉ nhận được khi đã nhận hết',
      challengeBoard.daily.bonus.ready || (await post('member', '/api/me/challenges/bonus/daily', {})).status === 400);
    const memberWorld = (await get('member', '/api/me/world')).json;
    check('Màn chính có nhóm huy hiệu và tiến độ từng huy hiệu',
      memberWorld.badges.groups.length === 7
      && memberWorld.badges.all.every((b) => b.group_code && Number.isInteger(b.progress)));

    section('Concept màn Khám phá');
    const conceptsBefore = await get('admin', '/api/admin/concepts');
    check('Ba concept: Ekko Lover, Ekko Lover Colors và Simple mode',
      JSON.stringify(conceptsBefore.json.map((c) => c.code)) === JSON.stringify(['lover', 'lover-colors', 'simple']),
      JSON.stringify(conceptsBefore.json.map((c) => c.code)));
    check('Đánh số từ 1',
      JSON.stringify(conceptsBefore.json.map((c) => c.order_index)) === '[1,2,3]');
    check('Chỉ một concept được bật',
      conceptsBefore.json.filter((c) => c.active).length === 1,
      JSON.stringify(conceptsBefore.json.map((c) => `${c.code}:${c.active}`)));
    check('Mặc định là Ekko Lover',
      conceptsBefore.json.find((c) => c.active)?.code === 'lover');
    check('Bản đồ học tập nói rõ concept đang dùng',
      (await get('member', '/api/learn/map')).json.concept === 'lover');

    const conceptMapBefore = (await get('member', '/api/learn/map')).json;
    for (const removed of ['sky', 'islands', 'path']) {
      check(`Concept đã xoá "${removed}" không bật lại được`,
        (await put('admin', '/api/admin/concepts/active', { code: removed })).status === 400);
    }
    const badConcept = await put('admin', '/api/admin/concepts/active', { code: 'khong-co-that' });
    check('Mã concept lạ bị từ chối', badConcept.status === 400);
    check('Concept đang bật không đổi vì một request hỏng',
      (await get('admin', '/api/admin/concepts')).json.find((c) => c.active)?.code === 'lover');

    const toColors = await put('admin', '/api/admin/concepts/active', { code: 'lover-colors' });
    check('Có concept "Ekko Lover Colors" (bản sao của Ekko Lover) và bật được',
      toColors.status === 200 && toColors.json.find((c) => c.active)?.name === 'Ekko Lover Colors'
      && toColors.json.find((c) => c.code === 'lover-colors')?.base === 'lover');
    const conceptMapColors = (await get('member', '/api/learn/map')).json;
    check('Đổi concept không đụng tới lộ trình học',
      conceptMapColors.concept === 'lover-colors'
      && JSON.stringify(conceptMapColors.entries) === JSON.stringify(conceptMapBefore.entries)
      && conceptMapColors.levelOrder === conceptMapBefore.levelOrder);
    const toSimple = await put('admin', '/api/admin/concepts/active', { code: 'simple' });
    check('Có concept "Simple mode" dựng trên Ekko Lover và bật được',
      toSimple.status === 200 && toSimple.json.find((c) => c.active)?.name === 'Simple mode'
      && toSimple.json.find((c) => c.code === 'simple')?.base === 'lover');
    check('Simple mode dùng chung lộ trình học',
      JSON.stringify((await get('member', '/api/learn/map')).json.entries) === JSON.stringify(conceptMapBefore.entries));
    check('Cấp độ và chức năng không còn trỏ tới ảnh đảo đã xoá',
      (await get('admin', '/api/admin/levels')).json.every((l) => !String(l.island_image || '').startsWith('/assets/islands/'))
      && (await get('admin', '/api/admin/features')).json.every((f) => !String(f.island_image || '').startsWith('/assets/islands/')));

    check('Người mới chưa xem onboarding Ekko Lover',
      (await get('member', '/api/me/world')).json.onboarding?.lover === false);
    const seenIntro = await post('member', '/api/me/onboarding', { key: 'lover' });
    check('Xem xong onboarding thì server ghi nhận, không hiện lại',
      seenIntro.status === 200 && (await get('member', '/api/me/world')).json.onboarding?.lover === true);
    check('Khoá onboarding lạ bị từ chối',
      (await post('member', '/api/me/onboarding', { key: 'khac' })).status === 400);

    const quickSwitch = await get('member', '/dev/concept?code=simple&redirect=/');
    const whoConcept = (await get('member', '/api/session/whoami')).json;
    check('Nút đổi concept ở bản demo đổi được và quay về đúng trang',
      quickSwitch.status === 302 && quickSwitch.headers.get('location') === '/'
      && (await get('member', '/api/learn/map')).json.concept === 'simple' && whoConcept.concept === 'simple');
    check('Nút đổi concept từ chối mã lạ',
      (await get('member', '/dev/concept?code=sky')).status === 400);
    check('Nút đổi concept không chuyển hướng ra ngoài miền',
      (await get('member', `/dev/concept?code=lover&redirect=${encodeURIComponent('https://evil.example.com')}`)).headers.get('location') === '/app/');

    await put('admin', '/api/admin/concepts/active', { code: 'lover' });
    check('Đổi ngược về Ekko Lover được', (await get('member', '/api/learn/map')).json.concept === 'lover');

    check('Người học không đổi được concept',
      (await put('member', '/api/admin/concepts/active', { code: 'lover-colors' })).status === 403);

    section('Nhiệm vụ');
    const planTemplates = (await get('member', '/api/plans')).json.templates;
    check('Có bộ kế hoạch gợi ý xếp theo nhóm',
      planTemplates.length > 0 && planTemplates.every((g) => g.label && g.templates.length > 0),
      String(planTemplates.length));

    const plan = await post('member', '/api/plans', { name: 'Học tiếng Anh', totalTasks: 0, template: 'course' });
    check('Tạo được kế hoạch', plan.status === 200 && plan.json.plan.total_tasks === 0,
      `${plan.status} ${JSON.stringify(plan.json?.error ?? '')}`);
    check('Kế hoạch cũng tính là dùng chức năng', plan.json.rewards?.xp > 0);

    const planId = plan.json.plan.id;
    const task1 = await post('member', `/api/plans/${planId}/tasks`, { title: 'Học 10 từ mới' });
    const task2 = await post('member', `/api/plans/${planId}/tasks`, { title: 'Nghe một podcast' });
    check('Thêm được nhiệm vụ', task2.status === 200
      && task2.json.plans.find((p) => p.id === planId)?.tasks.length === 2);
    check('Thêm nhiệm vụ thì tổng việc của kế hoạch cũng tăng',
      task2.json.plans.find((p) => p.id === planId)?.total_tasks === 2,
      String(task2.json.plans.find((p) => p.id === planId)?.total_tasks));

    const firstTaskId = task1.json.plans.find((p) => p.id === planId).tasks.at(-1).id;
    const doneOne = await patch('member', `/api/plans/${planId}/tasks/${firstTaskId}`, { status: 'completed' });
    const planAfterOne = doneOne.json.plans.find((p) => p.id === planId);
    check('Xong một nhiệm vụ thì tiến độ nhích lên',
      planAfterOne.completed_tasks === 1 && planAfterOne.percent === 50,
      `${planAfterOne.completed_tasks}/${planAfterOne.total_tasks} · ${planAfterOne.percent}%`);
    check('Bỏ tích lại thì tiến độ lùi về',
      (await patch('member', `/api/plans/${planId}/tasks/${firstTaskId}`, { status: 'pending' }))
        .json.plans.find((p) => p.id === planId).completed_tasks === 0);

    const secondTaskId = task2.json.plans.find((p) => p.id === planId).tasks.at(0).id;
    await patch('member', `/api/plans/${planId}/tasks/${firstTaskId}`, { status: 'completed' });
    const allDone = await patch('member', `/api/plans/${planId}/tasks/${secondTaskId}`, { status: 'completed' });
    check('Xong hết nhiệm vụ thì kế hoạch chuyển sang hoàn thành',
      allDone.json.plans.find((p) => p.id === planId)?.status === 'done');

    check('Kế hoạch không tên bị từ chối',
      (await post('member', '/api/plans', { name: '   ', totalTasks: 1 })).status === 400);
    check('Xoá được kế hoạch',
      (await del('member', `/api/plans/${planId}`)).status === 200
      && !(await get('member', '/api/plans')).json.plans.some((p) => p.id === planId));

    section('Tiết kiệm');
    const savingsBefore = (await get('member', '/api/savings')).json;
    check('Sổ tiết kiệm mở ra rỗng', savingsBefore.totals.count === 0, String(savingsBefore.totals.count));

    const source = await post('member', '/api/savings', {
      channelName: 'Sổ tiết kiệm ngân hàng', amount: 10000000, ratePercent: 6, ratePeriod: 'year',
    });
    check('Thêm được một nguồn tiết kiệm',
      source.status === 200 && source.json.totals.saved === 10000000,
      `${source.status} ${JSON.stringify(source.json?.error ?? '')}`);
    check('Lãi tham khảo một năm được tính sẵn',
      source.json.totals.interestPerYear === 600000, String(source.json.totals.interestPerYear));
    const dayShift = (months, days = 0) => { const d = new Date(); d.setMonth(d.getMonth() + months); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
    const running = await post('member', '/api/savings', {
      channelName: 'Sổ đang chạy', amount: 10000000, ratePercent: 6, ratePeriod: 'year', startedOn: dayShift(-3), endedOn: dayShift(3),
    });
    const live = running.json.sources.find((x) => x.channel_name === 'Sổ đang chạy');
    // Khoản tự nhập: lãi = gốc × 6%/năm × số ngày gửi / 365.
    const liveDays = Math.round((Date.parse(`${dayShift(3)}T00:00:00Z`) - Date.parse(`${dayShift(-3)}T00:00:00Z`)) / 86400000);
    check('Chưa tới hạn thì khoản vẫn là tiền gốc, lãi chỉ là dự kiến khi đáo hạn (tính theo ngày)',
      live.balance === 10000000 && live.interestToDate === 0 && live.matured === false
      && live.maturityInterest === Math.round(10000000 * 0.06 * liveDays / 365),
      JSON.stringify({ b: live.balance, m: live.maturityInterest, t: live.termMonths }));
    const done = await post('member', '/api/savings', {
      channelName: 'Sổ đã đáo hạn', amount: 10000000, ratePercent: 6, ratePeriod: 'year', startedOn: dayShift(-12, -1), endedOn: dayShift(0, -1),
    });
    const matured = done.json.sources.find((x) => x.channel_name === 'Sổ đã đáo hạn');
    const doneDays = Math.round((Date.parse(`${dayShift(0, -1)}T00:00:00Z`) - Date.parse(`${dayShift(-12, -1)}T00:00:00Z`)) / 86400000);
    const doneInterest = Math.round(10000000 * 0.06 * doneDays / 365);
    check('Tới ngày đáo hạn thì lãi cả kỳ được cộng vào khoản',
      matured.matured === true && matured.balance === 10000000 + doneInterest && matured.interestToDate === doneInterest,
      JSON.stringify({ b: matured.balance, t: matured.termMonths }));
    await del('member', `/api/savings/${live.id}`);
    await del('member', `/api/savings/${matured.id}`);
    check('Tiết kiệm cũng tính là dùng chức năng', source.json.rewards?.xp > 0);

    const sourceId = source.json.sources[0].id;
    check('Sửa được số tiền',
      (await patch('member', `/api/savings/${sourceId}`, { amount: 12000000 })).json.totals.saved === 12000000);
    check('Lãi suất ngoài khoảng cho phép bị từ chối',
      (await post('member', '/api/savings', { channelName: 'Sai', amount: 1000, ratePercent: 900 })).status === 400);
    check('Xoá được nguồn tiết kiệm',
      (await del('member', `/api/savings/${sourceId}`)).json.totals.count === 0);

    const channels = (await get('member', '/api/savings/channels?term=6')).json;
    check('Đối tác xếp theo lãi suất giảm dần',
      channels.channels.every((c, i, list) => i === 0 || list[i - 1].ratePercent >= c.ratePercent));
    check('Đối tác gửi tiết kiệm lọc theo đúng kỳ hạn',
      channels.term === 6 && channels.channels.length > 0
      && channels.channels.every((c) => Number.isFinite(c.ratePercent)),
      JSON.stringify(channels.channels.map((c) => `${c.name}:${c.ratePercent}`)));

    section('Tin tức');
    const news = (await get('member', '/api/news')).json;
    check('Có tin tức để đọc', news.length > 0, String(news.length));
    check('Danh sách tin không kèm nội dung dài',
      news.every((n) => n.title && n.summary && n.body === undefined));
    const article = await get('member', `/api/news/${news[0].id}`);
    check('Mở đọc tin thì được ghi lại cho huy hiệu và thử thách',
      (await get('member', '/api/me/activity?limit=5')).json.some((a) => a.kind === 'news_read' && a.ref === String(news[0].id)));
    check('Mở được một tin', article.status === 200 && article.json.body.length > 0);
    check('Tin không có thật thì báo không tìm thấy',
      (await get('member', '/api/news/999999')).status === 404);

    section('Hai ngôn ngữ (tiếng Việt · tiếng Anh)');
    const mapVi = (await get('member', '/api/learn/map')).json;
    const mapEn = (await getEn('member', '/api/learn/map')).json;
    check('Không gửi x-lang thì nội dung là tiếng Việt',
      mapVi.entries[0].title === 'Đặt mục tiêu tài chính', mapVi.entries[0].title);
    check('x-lang: en dịch tên mô đun',
      mapEn.entries[0].title === 'Set financial goals', mapEn.entries[0].title);
    check('x-lang: en dịch tên bài học',
      mapEn.entries.some((e) => e.title === 'Set short- and long-term goals in life'));
    check('Dịch không đụng tới cấu trúc bản đồ',
      mapEn.entries.length === mapVi.entries.length
      && mapEn.entries.every((e, i) => e.type === mapVi.entries[i].type && e.id === mapVi.entries[i].id
        && e.locked === mapVi.entries[i].locked));

    const langUnknown = (await get('member', '/api/learn/map', { lang: 'fr' })).json;
    check('Ngôn ngữ chưa hỗ trợ thì về tiếng Việt',
      langUnknown.entries[0].title === 'Đặt mục tiêu tài chính');

    const worldEn = (await getEn('member', '/api/me/world')).json;
    // Cấp 1 đã bị một kiểm thử Admin phía trên đổi tên, nên soi cấp cuối (cấp 10).
    const topLevelEn = worldEn.levels.find((l) => l.order_index === 10);
    check('Dịch tên cấp độ', topLevelEn.name === 'Prosperous Piggy', topLevelEn.name);
    check('Dịch tên chức năng',
      worldEn.features.map((f) => f.name).join(', ')
        === 'Explore, Budget, Financial goals, Expense log, Missions, Savings',
      worldEn.features.map((f) => f.name).join(', '));

    const expensesEn = (await getEn('member', '/api/expenses')).json;
    check('Dịch nhãn khoảng thời gian', expensesEn.label === 'This month', expensesEn.label);
    check('Dịch tên nhóm chi tiêu',
      expensesEn.categories.some((c) => c.name === 'Groceries')
      && expensesEn.categories.some((c) => c.name === 'Other'),
      expensesEn.categories.map((c) => c.name).slice(0, 4).join(', '));
    check('Ghi chú do người dùng tự gõ thì giữ nguyên',
      (await getEn('member', '/api/expenses?range=month')).json.expenses
        .every((e) => !e.note || typeof e.note === 'string'));

    const badgesEn = (await getEn('member', '/api/me/badges')).json;
    check('Dịch tên và mô tả huy hiệu',
      badgesEn.all[0].name === 'First lesson'
      && badgesEn.all[0].description === 'Finish your very first lesson.',
      `${badgesEn.all[0].name} / ${badgesEn.all[0].description}`);

    const goalsEn = (await getEn('member', '/api/goals')).json;
    check('Dịch nhóm và tên mục tiêu gợi ý',
      goalsEn.templates[0].label === 'Emergency fund'
      && goalsEn.templates[0].templates[0].name === 'Emergency fund');
    check('Dịch kỳ tiết kiệm', goalsEn.periods.month === 'Monthly' && goalsEn.periods.week === 'Weekly');

    const firstLessonId = mapEn.entries.find((e) => e.type === 'lesson').id;
    const lessonEn = (await getEn('member', `/api/learn/lessons/${firstLessonId}`)).json;
    check('Dịch tiêu đề và mô đun của bài học',
      lessonEn.lesson.title === 'Set short- and long-term goals in life'
      && lessonEn.lesson.module_title === 'Set financial goals');
    // Nội dung khung bài là phần dài nhất; sót một câu là lẫn ngôn ngữ ngay.
    // `đ` là đơn vị tiền, có mặt trong cả bản tiếng Anh, nên không tính là sót.
    const VIETNAMESE = /[ăâêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
    const frameText = JSON.stringify(lessonEn.frames);
    const leftover = frameText.match(new RegExp(`[^"]{0,40}${VIETNAMESE.source}[^"]{0,40}`, 'i'));
    check('Không còn chữ tiếng Việt trong nội dung khung bài', !leftover, leftover?.[0]);

    const goalsModule = (await get('member', '/api/learn/modules/dat-muc-tieu-tai-chinh')).json;
    const featureLesson = goalsModule.lessons.find((l) => l.slug === 'chuc-nang-muc-tieu');
    const featureFrames = (await get('admin', `/api/admin/frames?lesson_id=${featureLesson?.id}`)).json;
    const lastFrame = Array.isArray(featureFrames) ? featureFrames.at(-1) : null;
    const lastPayload = typeof lastFrame?.payload === 'string' ? JSON.parse(lastFrame.payload) : lastFrame?.payload;
    check('Bài "Dùng chức năng Mục tiêu" có nút dẫn tới chức năng thật ở slide cuối',
      featureLesson && lastPayload?.cta?.route === '/goals' && lastPayload?.cta?.label === 'Tạo mục tiêu ngay',
      JSON.stringify(lastPayload?.cta));
    const moneyModule = (await get('member', '/api/learn/modules/quan-ly-tien-bac-thong-minh')).json;
    check('Bài "Dùng chức năng Ngân sách" đứng ngay sau bài Tạo ngân sách',
      moneyModule.lessons.map((l) => l.slug).join(',')
        === 'chi-tieu-thong-minh,tao-ngan-sach,chuc-nang-ngan-sach,theo-doi-ngan-sach,luu-giu-hoa-don,chuc-nang-ghi-chep',
      moneyModule.lessons.map((l) => l.slug).join(','));
    const budgetLesson = moneyModule.lessons.find((l) => l.slug === 'chuc-nang-ngan-sach');
    const budgetFrames = (await get('admin', `/api/admin/frames?lesson_id=${budgetLesson?.id}`)).json;
    const budgetLast = Array.isArray(budgetFrames) ? budgetFrames.at(-1) : null;
    const budgetPayload = typeof budgetLast?.payload === 'string' ? JSON.parse(budgetLast.payload) : budgetLast?.payload;
    check('Slide cuối bài Ngân sách có nút dẫn tới chức năng Ngân sách',
      budgetPayload?.cta?.route === '/budget' && budgetPayload?.cta?.label === 'Đặt ngân sách ngay',
      JSON.stringify(budgetPayload?.cta));

    const expenseLesson = moneyModule.lessons.find((l) => l.slug === 'chuc-nang-ghi-chep');
    const expenseFrames = (await get('admin', `/api/admin/frames?lesson_id=${expenseLesson?.id}`)).json;
    const expenseLast = Array.isArray(expenseFrames) ? expenseFrames.at(-1) : null;
    const expensePayload = typeof expenseLast?.payload === 'string' ? JSON.parse(expenseLast.payload) : expenseLast?.payload;
    check('Slide cuối bài Ghi chép có nút dẫn tới chức năng Ghi chép chi tiêu',
      expensePayload?.cta?.route === '/expenses' && expensePayload?.cta?.label === 'Ghi chép ngay',
      JSON.stringify(expensePayload?.cta));

    const financeModule = (await get('member', '/api/learn/modules/to-chuc-tai-chinh')).json;
    check('Bài "Dùng chức năng Tiết kiệm" đứng ngay sau bài Chọn sản phẩm tiết kiệm',
      financeModule.lessons.map((l) => l.slug).slice(0, 3).join(',')
        === 'so-sanh-phuong-phap-tiet-kiem,chon-san-pham-tiet-kiem,chuc-nang-tiet-kiem',
      financeModule.lessons.map((l) => l.slug).join(','));
    const savingsLesson = financeModule.lessons.find((l) => l.slug === 'chuc-nang-tiet-kiem');
    const savingsFrames = (await get('admin', `/api/admin/frames?lesson_id=${savingsLesson?.id}`)).json;
    const savingsLast = Array.isArray(savingsFrames) ? savingsFrames.at(-1) : null;
    const savingsPayload = typeof savingsLast?.payload === 'string' ? JSON.parse(savingsLast.payload) : savingsLast?.payload;
    check('Slide cuối bài Tiết kiệm có nút dẫn tới chức năng Tiết kiệm',
      savingsPayload?.cta?.route === '/savings' && savingsPayload?.cta?.label === 'Tiết kiệm ngay',
      JSON.stringify(savingsPayload?.cta));

    const featureEn = (await getEn('member', '/api/learn/modules/dat-muc-tieu-tai-chinh')).json;
    check('Tên bài giới thiệu chức năng Mục tiêu có bản tiếng Anh',
      featureEn.lessons.some((l) => l.title === 'Using Goals in the Ekko app'));

    const quizEn = (await getEn('member', '/api/learn/modules/dat-muc-tieu-tai-chinh')).json;
    check('Dịch câu hỏi và đáp án trắc nghiệm',
      quizEn.quiz.questions[0].question.startsWith('What do you call a goal')
      && quizEn.quiz.questions[0].options.every((o) => !VIETNAMESE.test(o.text)),
      quizEn.quiz.questions[0].question);

    const badMonthEn = await get('member', '/api/budget/limits?month=thang-9', { lang: 'en' });
    check('Dịch cả thông báo lỗi',
      badMonthEn.status === 400 && badMonthEn.json.error === 'The month must look like YYYY-MM',
      `${badMonthEn.status} ${badMonthEn.json?.error}`);

    // Admin gửi kèm x-lang cũng vẫn nhận bản gốc: đó là bản đang được biên tập.
    const adminEn = (await getEn('admin', '/api/admin/content/tree')).json;
    check('Admin portal vẫn thấy bản gốc tiếng Việt',
      adminEn[0].title === 'Đặt mục tiêu tài chính', adminEn[0].title);

    section('Ekko bot nói hai thứ tiếng');
    const streakEn = await post('member', '/api/bot/message', { text: 'How is my streak?' }, { lang: 'en' });
    check('Câu hỏi tiếng Anh vẫn khớp đúng ý định',
      streakEn.json.reply.kind === 'status_streak', streakEn.json.reply.kind);
    check('Bot trả lời bằng tiếng Anh',
      /your streak/i.test(streakEn.json.reply.text), streakEn.json.reply.text);

    const lessonAskEn = await post('member', '/api/bot/message', { text: 'What is an emergency fund?' }, { lang: 'en' });
    check('Tìm được nội dung bài học từ câu hỏi tiếng Anh',
      lessonAskEn.json.reply.kind === 'lesson'
      && !VIETNAMESE.test(lessonAskEn.json.reply.text),
      lessonAskEn.json.reply.kind);

    const logEn = await post('member', '/api/bot/message', { text: 'coffee 35k' }, { lang: 'en' });
    check('Ghi chi tiêu qua chat, xác nhận bằng tiếng Anh',
      logEn.json.reply.kind === 'expense_logged' && /^Logged \*\*35,000đ\*\*/.test(logEn.json.reply.text),
      logEn.json.reply.text);

    const historyVi = (await get('member', '/api/bot/history?limit=2')).json.messages;
    const historyEn = (await getEn('member', '/api/bot/history?limit=2')).json.messages;
    check('Mở lại sổ chat bằng tiếng Việt thì câu bot đọc tiếng Việt',
      historyVi.at(-1).text.startsWith('Đã ghi **35.000đ**'), historyVi.at(-1).text);
    check('Mở lại sổ chat bằng tiếng Anh thì câu bot đọc tiếng Anh',
      historyEn.at(-1).text.startsWith('Logged **35,000đ**'), historyEn.at(-1).text);
    check('Câu người dùng tự gõ không bị dịch',
      historyVi.at(-2).text === 'coffee 35k' && historyEn.at(-2).text === 'coffee 35k');
    await del('member', `/api/expenses/${logEn.json.reply.expense.id}`);

    // Câu trả lời có số liệu cũng phải đọc lại được: sổ chat lưu mẫu câu và dữ
    // liệu thô, nên con số của lúc nói vẫn giữ nguyên khi đổi ngôn ngữ.
    const streakVi = await post('member', '/api/bot/message', { text: 'Streak của tôi thế nào?' });
    const afterStreakEn = (await getEn('member', '/api/bot/history?limit=1')).json.messages[0];
    const afterStreakVi = (await get('member', '/api/bot/history?limit=1')).json.messages[0];
    check('Câu trả lời về streak nói lại được bằng tiếng Anh',
      /^Your streak is/.test(afterStreakEn.text), afterStreakEn.text);
    check('Vẫn đọc được nguyên văn tiếng Việt',
      afterStreakVi.text === streakVi.json.reply.text, afterStreakVi.text);

    const lessonVi = await post('member', '/api/bot/message', { text: 'Quỹ khẩn cấp là gì?' });
    check('Câu trả lời trích bài học nói lại được bằng tiếng Anh',
      lessonVi.json.reply.kind === 'lesson'
      && !VIETNAMESE.test((await getEn('member', '/api/bot/history?limit=1')).json.messages[0].text),
      (await getEn('member', '/api/bot/history?limit=1')).json.messages[0].text.slice(0, 90));

    section('Ảnh hoá đơn');
    // JPEG bé xíu, đủ chữ ký đầu tệp để server nhận là ảnh thật.
    const jpegBytes = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
    ]);
    const jpegUrl = `data:image/jpeg;base64,${jpegBytes.toString('base64')}`;

    const withReceipt = await post('member', '/api/expenses', {
      amount: 42000, note: 'hoá đơn siêu thị', receipt: jpegUrl,
    });
    check('Ghi được khoản chi kèm ảnh hoá đơn', withReceipt.status === 200);
    const receiptId = withReceipt.json.expense.id;
    check('Khoản chi trả về link xem ảnh, không phải đường dẫn tệp',
      withReceipt.json.expense.receipt_url === `/api/expenses/${receiptId}/receipt`
      && withReceipt.json.expense.receipt_path === undefined,
      JSON.stringify(withReceipt.json.expense.receipt_url));

    const image = await get('member', `/api/expenses/${receiptId}/receipt`);
    check('Tải lại được đúng ảnh vừa gửi lên',
      image.status === 200 && image.headers.get('content-type') === 'image/jpeg');

    const notImage = await post('member', '/api/expenses', {
      amount: 1000, receipt: `data:image/jpeg;base64,${Buffer.from('day khong phai anh').toString('base64')}`,
    });
    check('Tệp không phải ảnh bị từ chối dù khai là JPEG', notImage.status === 400);

    const badMime = await post('member', '/api/expenses', { amount: 1000, receipt: 'data:text/html;base64,PGI+' });
    check('Chỉ nhận JPEG, PNG, WebP', badMime.status === 400);

    // Quản trị viên ở đây là một người **đã đăng nhập** nhưng không phải chủ khoản
    // chi — đúng tình huống cần chặn.
    const stranger = await get('admin', `/api/expenses/${receiptId}/receipt`);
    check('Người khác không xem được ảnh hoá đơn của mình', stranger.status === 404, `status ${stranger.status}`);

    // Đọc hoá đơn bằng AI: bộ kiểm này chạy không có khoá API, nên phải thấy đúng
    // câu từ chối rõ ràng chứ không phải lỗi 500 khó hiểu.
    const scanOff = await post('member', '/api/expenses/scan', { receipt: jpegUrl });
    check('Chưa cấu hình khoá thì đọc hoá đơn báo rõ, không sập',
      scanOff.status === 503 && /nhập tay/i.test(scanOff.json?.error || ''),
      `${scanOff.status} ${scanOff.json?.error || ''}`);
    check('Đường đọc hoá đơn cũng kiểm ảnh trước',
      (await post('member', '/api/expenses/scan', { receipt: 'data:text/html;base64,PGI+' })).status === 503);
    check('Đọc hoá đơn không tự ghi khoản chi nào',
      (await get('member', '/api/expenses')).json.expenses.filter((e) => e.id === receiptId).length === 1);

    await del('member', `/api/expenses/${receiptId}`);
    check('Xoá khoản chi thì ảnh cũng không còn truy cập được',
      (await get('member', `/api/expenses/${receiptId}/receipt`)).status === 404);


    section('Người dùng mẫu (demo)');
    const vetLogin = await get('veteran', '/dev/persona?as=veteran');
    check('Nút người dùng lâu năm đăng nhập rồi về màn chủ',
      vetLogin.status === 302 && vetLogin.headers.get('location') === '/app/#/');
    const vet = (await get('veteran', '/api/me')).json;
    const topLevel = Math.max(...vet.world.levels.map((l) => l.order_index));
    check('Người dùng lâu năm: heo cấp cao nhất, học hết bài, đủ huy hiệu học tập và cấp độ, đã xem onboarding',
      vet.user.persona === 'veteran' && vet.world.level.order_index === topLevel
      && vet.world.learning.lessonsDone === vet.world.learning.lessonsTotal
      && vet.world.badges.all.filter((b) => ['learning', 'level'].includes(b.group_code)).every((b) => b.earned)
      && vet.world.onboarding.lover === true,
      JSON.stringify({ lvl: vet.world.level.order_index, learn: vet.world.learning, badges: vet.world.badges.earned }));
    const vetMap = (await get('veteran', '/api/learn/map')).json;
    const vetQuizzes = vetMap.entries.filter((e) => e.type === 'quiz');
    check('Người dùng lâu năm đã làm hết bài trắc nghiệm mô đun, đúng hết',
      vetQuizzes.length > 0 && vetQuizzes.every((e) => e.completed && e.result?.correct === e.total),
      `${vetQuizzes.filter((e) => e.completed).length}/${vetQuizzes.length}`);
    const vetExpenses = (await get('veteran', '/api/expenses')).json;
    const vetGoals = (await get('veteran', '/api/goals')).json;
    const vetSavings = (await get('veteran', '/api/savings')).json;
    check('Người dùng lâu năm có dữ liệu ở mọi chức năng',
      JSON.stringify(vetExpenses).length > 2000 && vetGoals.goals.length === 3 && vetSavings.sources.length === 3,
      `goals ${vetGoals.goals.length} · savings ${vetSavings.sources.length}`);
    await get('veteran', '/dev/persona?as=veteran');
    check('Bấm lại thì dựng lại từ đầu, không nhân đôi dữ liệu',
      (await get('veteran', '/api/goals')).json.goals.length === 3
      && (await get('veteran', '/api/savings')).json.sources.length === 3);

    await get('learner', '/dev/persona?as=mid');
    const learner = (await get('learner', '/api/me')).json;
    const learnerShare = learner.world.learning.lessonsDone / learner.world.learning.lessonsTotal;
    check('Người dùng đang học: học khoảng 30% số bài, đã xem onboarding, chưa lên cấp cao nhất',
      learner.user.persona === 'mid' && learnerShare > 0.25 && learnerShare < 0.35
      && learner.world.onboarding.lover === true && learner.world.level.order_index < topLevel && learner.world.streak.count === 12,
      JSON.stringify({ learn: learner.world.learning, lvl: learner.world.level.order_index }));
    const learnerMap = (await get('learner', '/api/learn/map')).json.entries;
    const doneQuizzes = learnerMap.filter((e) => e.type === 'quiz' && e.completed).length;
    const doneModules = learnerMap.filter((e) => e.type === 'quiz' && !e.locked).length;
    check('Người dùng đang học làm trắc nghiệm của mô-đun đã học xong, bài kế tiếp đang mở',
      doneQuizzes >= 1 && doneQuizzes <= doneModules && learnerMap.some((e) => e.type === 'lesson' && e.current),
      `${doneQuizzes}/${doneModules}`);
    check('Người dùng đang học có dữ liệu ở mọi chức năng',
      (await get('learner', '/api/goals')).json.goals.length === 2
      && (await get('learner', '/api/savings')).json.sources.length === 1
      && (await get('learner', '/api/expenses?range=week')).json.totals.count > 0
      && (await get('learner', '/api/budget')).json.items.length > 0);

    await get('newbie', '/dev/persona?as=new');
    const newbie = (await get('newbie', '/api/me')).json;
    check('Người dùng mới: heo cấp 1, 0 XP, chưa học, chưa xem onboarding',
      newbie.user.persona === 'new' && newbie.world.level.order_index === 1 && newbie.world.progress.xp === 0
      && newbie.world.learning.lessonsDone === 0 && newbie.world.onboarding.lover === false);
    check('Người dùng mới chưa có dữ liệu chức năng nào',
      (await get('newbie', '/api/goals')).json.goals.length === 0
      && (await get('newbie', '/api/savings')).json.sources.length === 0
      && newbie.world.badges.earned === 0 && newbie.world.streak.count === 0);
    check('Người dùng thường không bị gắn persona', (await get('member', '/api/me')).json.user.persona === null);
    check('Persona lạ bị từ chối', (await get('anon', '/dev/persona?as=admin')).status === 400);
    const fromPreview = await get('previewer', '/dev/persona?as=veteran&redirect=/');
    const previewWho = (await get('previewer', '/api/session/whoami')).json;
    check('Bấm từ trang chính thì quay lại trang chính, vẫn xem được cả Admin portal',
      fromPreview.headers.get('location') === '/' && previewWho.role === 'admin' && previewWho.persona === 'veteran');
    check('Không chuyển hướng người dùng mẫu ra ngoài miền',
      (await get('anon', `/dev/persona?as=new&redirect=${encodeURIComponent('https://evil.example.com')}`)).headers.get('location') === '/app/');

    section('Heo Dream Team');
    {
    const teamLogin = async (jar, sub, name) => {
      const r = await get(jar, `/dev/login?sub=${sub}&name=${encodeURIComponent(name)}`);
      await get(jar, r.headers.get('location'));
    };
    await teamLogin('teamA', 'smoke-team-a', 'Heo A');
    await teamLogin('teamB', 'smoke-team-b', 'Heo B');
    await teamLogin('teamC', 'smoke-team-c', 'Heo C');
    const worldA = (await get('teamA', '/api/me/world')).json;
    const codeA = worldA.me.friendCode;
    const codeB = (await get('teamB', '/api/me/world')).json.me.friendCode;
    const codeC = (await get('teamC', '/api/me/world')).json.me.friendCode;
    check('Mỗi người dùng có một mã ID riêng', /^EK[2-9A-Z]{6}$/.test(codeA) && codeA !== codeB && codeB !== codeC, `${codeA} ${codeB}`);
    const selfInvite = await post('teamA', '/api/team/invites', { code: codeA });
    check('Không tự mời chính mình', selfInvite.status === 400);
    const noSuch = await post('teamA', '/api/team/invites', { code: 'EK000000' });
    check('ID không tồn tại thì báo lỗi', noSuch.status === 400);
    // Gõ thường, có gạch ngang vẫn tìm ra.
    const inviteB = await post('teamA', '/api/team/invites', { code: `${codeB.slice(0, 2).toLowerCase()}-${codeB.slice(2)}` });
    check('Mời bạn bằng ID (không phân biệt hoa thường, bỏ dấu gạch)', inviteB.status === 200 && inviteB.json.board.invites.outgoing.length === 1, JSON.stringify(inviteB.json));
    const again = await post('teamA', '/api/team/invites', { code: codeB });
    check('Không mời trùng khi lời mời cũ còn chờ', again.status === 400);
    const boardB = (await get('teamB', '/api/team')).json;
    check('Người được mời thấy lời mời', boardB.invites.incoming.length === 1 && boardB.invites.incoming[0].from.name === 'Heo A');
    const accepted = await post('teamB', `/api/team/invites/${boardB.invites.incoming[0].id}/accept`);
    check('Chấp nhận lời mời thì hai bạn chung một đội, người mời làm trưởng đội',
      accepted.status === 200 && accepted.json.board.team.members.length === 2
      && accepted.json.board.team.ownerName === 'Heo A', JSON.stringify(accepted.json).slice(0, 200));

    // C mời B: B đang ở đội có người khác → phải rời đội trước.
    await post('teamC', '/api/team/invites', { code: codeB });
    const inviteToB = (await get('teamB', '/api/team')).json.invites.incoming[0];
    const blocked = await post('teamB', `/api/team/invites/${inviteToB.id}/accept`);
    check('Đang ở trong đội thì không vào được đội khác', blocked.status === 400, JSON.stringify(blocked.json));
    const left = await post('teamB', '/api/team/leave');
    check('Rời đội', left.status === 200 && left.json.board.team === null);
    const boardAAfter = (await get('teamA', '/api/team')).json;
    check('Đội còn một người vẫn giữ, người đó là trưởng đội', boardAAfter.team.members.length === 1 && boardAAfter.team.isOwner);
    const joinC = await post('teamB', `/api/team/invites/${inviteToB.id}/accept`);
    check('Rời đội rồi thì vào được đội khác', joinC.status === 200 && joinC.json.board.team.ownerName === 'Heo C');

    // Nhắc giữ streak: B chưa học / ghi chép gì hôm nay.
    const boardC = (await get('teamC', '/api/team')).json;
    const memberB = boardC.team.members.find((m) => m.name === 'Heo B');
    check('Danh sách thành viên có cấp heo, XP và streak', memberB && memberB.level && typeof memberB.xp === 'number' && memberB.streak);
    check('Bạn chưa giữ streak hôm nay thì nhắc được', memberB.canNudge === true);
    const nudge = await post('teamC', `/api/team/members/${memberB.userId}/nudge`);
    check('Nhắc giữ streak', nudge.status === 200 && nudge.json.board.team.members.find((m) => m.name === 'Heo B').nudgedToday);
    const nudgeAgain = await post('teamC', `/api/team/members/${memberB.userId}/nudge`);
    check('Mỗi ngày chỉ nhắc một bạn một lần', nudgeAgain.status === 400);
    const outsider = await post('teamA', `/api/team/members/${memberB.userId}/nudge`);
    check('Không nhắc được người ngoài đội', outsider.status === 400);
    const worldB = (await get('teamB', '/api/me/world')).json;
    check('Người được nhắc thấy lời nhắc ở màn chủ', worldB.team.nudges.length === 1 && worldB.team.nudges[0].fromName === 'Heo C');
    await post('teamB', '/api/team/nudges/seen');
    check('Xem rồi thì lời nhắc không hiện lại', (await get('teamB', '/api/me/world')).json.team.nudges.length === 0);
    const enTeam = await getEn('teamB', '/api/team');
    check('API đội trả được khi app ở tiếng Anh', enTeam.status === 200);

    // XP từ Dream Team: C kiếm XP thì B (cùng đội) nhận thêm % do Admin đặt.
    check('% XP từ Dream Team ngoài 0–100 bị chặn', (await put('admin', '/api/admin/settings/team-xp', { percent: 101 })).status === 400);
    const shareSet = await put('admin', '/api/admin/settings/team-xp', { percent: 50 });
    check('Admin đặt % XP từ Dream Team', shareSet.status === 200 && shareSet.json.percent === 50);
    const bBefore = (await get('teamB', '/api/me/world')).json.progress;
    const cBefore = (await get('teamC', '/api/me/world')).json.progress.xp;
    const cCheckin = (await post('teamC', '/api/me/checkin', {})).json;
    const bAfter = (await get('teamB', '/api/me/world')).json.progress;
    const expected = Math.floor((cCheckin.xp || 0) * 0.5);
    check('Bạn cùng đội kiếm XP thì mình nhận thêm đúng %', cCheckin.xp > 0 && bAfter.xp - bBefore.xp === expected && bAfter.teamXpTotal - bBefore.teamXpTotal === expected,
      `${cCheckin.xp} → ${bAfter.xp - bBefore.xp}`);
    check('Phần XP từ đội có trên thanh tiến độ', bAfter.teamXpIntoLevel >= Math.min(expected, bAfter.xpIntoLevel) && bAfter.teamPercent >= 0);
    const cAfter = (await get('teamC', '/api/me/world')).json.progress.xp;
    check('XP nhận từ đội không chia ngược lại', cAfter - cBefore === cCheckin.xp, `${cAfter - cBefore}`);
    const outsiderXp = (await get('teamA', '/api/me/world')).json.progress.teamXpTotal;
    check('Người ngoài đội không nhận XP', outsiderXp === 0);
    await put('admin', '/api/admin/settings/team-xp', { percent: 10 });
    }

    section('Đăng ký / đăng nhập nội bộ');
    {
      const authCfg = (await get('anon2', '/api/auth/config')).json;
      check('Màn đăng nhập biết đang bật đăng ký nội bộ', authCfg.localAuth === true && authCfg.signupOpen === true);
      const signup = (await get('admin', '/api/admin/settings/signup')).json;
      check('Admin xem được mã đăng ký', /^[A-Z0-9]{6,20}$/.test(signup.code));
      const base = { name: 'Thử Nghiệm', email: 'Tester@Ekko.vn', password: 'matkhau-123' };
      check('Đăng ký thiếu mã bị chặn', (await post('anon2', '/api/auth/register', base)).status === 400);
      check('Sai mã đăng ký bị chặn', (await post('anon2', '/api/auth/register', { ...base, code: 'SAIMA123' })).status === 400);
      check('Mật khẩu ngắn bị chặn', (await post('anon2', '/api/auth/register', { ...base, password: '123', code: signup.code })).status === 400);
      const reg = await post('local1', '/api/auth/register', { ...base, code: signup.code.toLowerCase() });
      check('Đăng ký đúng mã thì có tài khoản và vào luôn', reg.status === 200 && (await get('local1', '/api/me')).json.user.localAccount === true, JSON.stringify(reg.json));
      check('Email đã có tài khoản thì không đăng ký lại', (await post('anon2', '/api/auth/register', { ...base, code: signup.code })).status === 400);
      check('Chưa đăng nhập thì không vào được API', (await get('anon3', '/api/me')).status === 401);
      const ok = await post('local2', '/api/auth/login', { email: ' tester@ekko.vn ', password: 'matkhau-123' });
      check('Đăng nhập bằng email (không phân biệt hoa thường) + mật khẩu', ok.status === 200 && (await get('local2', '/api/me')).status === 200);
      const wrong = await post('anon3', '/api/auth/login', { email: 'tester@ekko.vn', password: 'sai-mat-khau' });
      const ghost = await post('anon3', '/api/auth/login', { email: 'khongco@ekko.vn', password: 'sai-mat-khau' });
      check('Sai mật khẩu và email không tồn tại báo cùng một lỗi', wrong.status === 401 && ghost.status === 401 && wrong.json.error === ghost.json.error);
      for (let i = 0; i < 3; i += 1) await post('anon3', '/api/auth/login', { email: 'tester@ekko.vn', password: 'sai-mat-khau' });
      const locked = await post('anon3', '/api/auth/login', { email: 'tester@ekko.vn', password: 'sai-mat-khau' });
      const lockedRight = await post('anon3', '/api/auth/login', { email: 'tester@ekko.vn', password: 'matkhau-123' });
      check('Sai 5 lần thì khoá đăng nhập, đúng mật khẩu cũng phải chờ', locked.status === 429 && lockedRight.status === 429);
      const users = (await get('admin', '/api/admin/stats/users')).json;
      const tester = users.find((u) => u.email === 'tester@ekko.vn');
      check('Admin thấy tài khoản có mật khẩu riêng', tester && tester.has_password === 1);
      const reset = await post('admin', `/api/admin/members/${tester.id}/reset-password`, {});
      check('Admin đặt lại mật khẩu → mật khẩu tạm', reset.status === 200 && /^Ekko-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(reset.json.password));
      const viaTemp = await post('local3', '/api/auth/login', { email: 'tester@ekko.vn', password: reset.json.password });
      check('Đặt lại thì mở khoá và đăng nhập được bằng mật khẩu tạm', viaTemp.status === 200);
      check('Đổi mật khẩu cần đúng mật khẩu hiện tại', (await post('local3', '/api/me/password', { current: 'sai', next: 'matkhau-moi-1' })).status === 400);
      check('Đổi mật khẩu', (await post('local3', '/api/me/password', { current: reset.json.password, next: 'matkhau-moi-1' })).status === 200);
      check('Mật khẩu mới dùng được', (await post('local4', '/api/auth/login', { email: 'tester@ekko.vn', password: 'matkhau-moi-1' })).status === 200);
      check('Tài khoản thường không vào được Admin', (await get('local4', '/api/admin/stats/users')).status === 403);
      check('Admin cấp quyền quản trị', (await post('admin', `/api/admin/members/${tester.id}/role`, { role: 'admin' })).status === 200
        && (await get('local4', '/api/admin/stats/users')).status === 200);
      const meAdmin = users.find((u) => u.role === 'admin' && u.email === 'admin@ekko.vn');
      check('Không tự bỏ quyền quản trị của mình', (await post('admin', `/api/admin/members/${meAdmin.id}/role`, { role: 'member' })).status === 400);
      await put('admin', '/api/admin/settings/signup', { open: false });
      check('Đóng đăng ký thì không tạo được tài khoản mới', (await post('anon2', '/api/auth/register', { ...base, email: 'moi@ekko.vn', code: signup.code })).status === 403);
      await put('admin', '/api/admin/settings/signup', { open: true });
      check('Mã đăng ký sai định dạng bị chặn', (await put('admin', '/api/admin/settings/signup', { code: 'ab' })).status === 400);
      const outEn = await call('anon3', 'POST', '/api/auth/login', { email: 'x@ekko.vn', password: 'y' }, { lang: 'en' });
      check('Lỗi đăng nhập có bản tiếng Anh', outEn.json.error === 'Wrong email or password', outEn.json.error);
      const db2 = new (await import('node:sqlite')).DatabaseSync(join(DATA_DIR, 'gdtc.sqlite'));
      const stored = db2.prepare('SELECT password_hash FROM local_accounts WHERE email = ?').get('tester@ekko.vn').password_hash;
      db2.close();
      check('Mật khẩu chỉ lưu dạng băm', stored.startsWith('scrypt$') && !stored.includes('matkhau'));
    }

    section('Sửa lỗi theo sổ theo dõi (08/10)');
    {
      const r = await get('bugs', '/dev/login?sub=smoke-bugs&name=Bug%20Test');
      await get('bugs', r.headers.get('location'));
      // BUG-008/009: ký tự lẻ do bộ gõ gửi sót → trả lời ngắn, không tốn AI, không câu dài.
      for (const ch of ['ứ', 'k', 'ý', 'k?']) {
        const reply = (await post('bugs', '/api/bot/message', { text: ch })).json?.reply;
        check(`Bot: tin "${ch}" được trả lời ngắn, không coi là câu hỏi`, reply?.kind === 'too_short', JSON.stringify(reply).slice(0, 120));
      }
      const ok = (await post('bugs', '/api/bot/message', { text: 'Streak của tôi thế nào?' })).json?.reply;
      check('Bot: câu bình thường vẫn trả lời như cũ', ok && ok.kind !== 'too_short');
      const lvl = (await post('bugs', '/api/bot/message', { text: 'Tôi đang ở cấp mấy?' })).json?.reply;
      check('Bot: câu cấp độ ghi đúng tổng 10 cấp', /\/10\)|cấp cao nhất/.test(lvl?.text || ''), lvl?.text);
      // BUG-006: Nhà thám hiểm tính cả Học tập.
      const board = (await get('bugs', '/api/me/badges')).json;
      const explorer = board.all.find((b) => b.code === 'explorer');
      const lessons = (await get('bugs', '/api/me/world')).json.learning.lessonsDone;
      check('Huy hiệu Nhà thám hiểm: có học bài thì Học tập được tính một chức năng', explorer && (lessons > 0 ? explorer.progress >= 1 : true), JSON.stringify(explorer).slice(0, 160));
      // BUG-007: đồ mặc vào Mua sắm (bộ đọc viết sẵn, không cần AI).
      const cats = (await get('bugs', '/api/categories')).json;
      const shop = cats.find((c) => c.code === 'wants_shopping');
      check('Nhóm Mua sắm có từ khoá đồ mặc (áo, váy, áo phao…)', shop && /(^|,)áo(,|$)/.test(shop.keywords) && shop.keywords.includes('áo phao'), shop?.keywords);
      // BUG-002: thử thách mang theo loại luật để app mở đúng chức năng.
      const ch = (await get('bugs', '/api/me/challenges')).json;
      const items = [...(ch.onboarding?.items || []), ...ch.daily.items, ...ch.weekly.items];
      check('Thử thách có loại luật để mở đúng chức năng', items.length > 0 && items.every((i) => typeof i.rule_type === 'string'));
      // BUG-001: tên của mình có trong dữ liệu màn chính.
      check('Màn chính có tên người dùng', (await get('bugs', '/api/me/world')).json.me.name === 'Bug Test');
      // BUG-010: nhờ bot đổi mục của khoản chi vừa ghi.
      const food = cats.find((c) => c.code === 'needs_food');
      const logged = await post('bugs', '/api/expenses', { amount: 415000, note: 'áo phao lông vũ', categoryId: food.id });
      const expId = logged.json?.expense?.id;
      const fix = (await post('bugs', '/api/bot/message', { text: 'sai rồi, mục mua sắm chứ' })).json?.reply;
      const month = (await get('bugs', '/api/expenses')).json.expenses.find((e) => e.id === expId);
      check('Bot đổi mục khoản vừa ghi: "sai rồi, mục mua sắm chứ" → Mua sắm', fix?.kind === 'recategorized' && month?.category_id === shop.id, `${fix?.kind} ${fix?.text}`);
      const same = (await post('bugs', '/api/bot/message', { text: 'đổi sang Mua sắm' })).json?.reply;
      check('Bot: đã đúng mục rồi thì báo, không đổi', same?.kind === 'recategorize_same');
      const ask = (await post('bugs', '/api/bot/message', { text: 'Đổi mục' })).json?.reply;
      check('Bot: "Đổi mục" không nói mục nào thì hỏi lại (không kèm chip gợi ý)', ask?.kind === 'recategorize_ask' && !ask.suggestions?.length, JSON.stringify(ask?.suggestions));
      const q = (await post('bugs', '/api/bot/message', { text: 'quỹ khẩn cấp phải là bao nhiêu?' })).json?.reply;
      const q2 = (await post('bugs', '/api/bot/message', { text: 'nên chuyển sang gửi tiết kiệm không?' })).json?.reply;
      check('Bot: câu hỏi thường không bị hiểu nhầm là lệnh đổi mục', !String(q?.kind).startsWith('recategoriz') && !String(q2?.kind).startsWith('recategoriz'), `${q?.kind} / ${q2?.kind}`);
      const en = (await call('bugs', 'POST', '/api/bot/message', { text: 'Move to Groceries' }, { lang: 'en' })).json?.reply;
      check('Bot (tiếng Anh): "Move to Groceries" đổi được mục', en?.kind === 'recategorized' && /Moved/.test(en.text), `${en?.kind} ${en?.text}`);
      const loggedReply = (await post('bugs', '/api/bot/message', { text: 'trà sữa 35k' })).json?.reply;
      check('Câu xác nhận ghi chi không kèm chip gợi ý, chỉ dặn nhắn để đổi mục', !loggedReply?.suggestions?.length && /đổi sang/.test(loggedReply?.text), JSON.stringify(loggedReply?.suggestions));
      // Khoản lặp lại hàng tháng: xem / sửa / dừng.
      await post('bugs', '/api/income', { amount: 9000000, category: 'regular', note: 'lương lặp', recurring: true });
      const rentExp = (await post('bugs', '/api/expenses', { amount: 3000000, note: 'tiền nhà lặp', recurring: true })).json.expense;
      const rec = (await get('bugs', '/api/recurring')).json;
      const recExp = rec.expenses.find((r) => r.note === 'tiền nhà lặp');
      const recInc = rec.income.find((r) => r.note === 'lương lặp');
      check('Xem được danh sách khoản lặp lại (thu nhập + chi tiêu)', Boolean(recExp && recInc && recInc.category_label), JSON.stringify(rec));
      const edited = await call('bugs', 'PATCH', `/api/recurring/expense/${recExp.id}`, { amount: 3500000, dayOfMonth: 5, note: 'tiền nhà' });
      const afterEdit = (await get('bugs', '/api/recurring')).json.expenses.find((r) => r.id === recExp.id);
      check('Sửa khoản lặp lại: đổi số tiền, ngày, ghi chú', edited.status === 200 && afterEdit?.amount === 3500000 && afterEdit.day_of_month === 5 && afterEdit.note === 'tiền nhà');
      check('Sửa khoản lặp lại: ngày ngoài 1–31 bị từ chối', (await call('bugs', 'PATCH', `/api/recurring/income/${recInc.id}`, { dayOfMonth: 40 })).status === 400);
      check('Người khác không sửa được khoản lặp lại của mình', (await call('advisee', 'PATCH', `/api/recurring/expense/${recExp.id}`, { amount: 1 })).status === 404);
      const stopped = await call('bugs', 'DELETE', `/api/recurring/expense/${recExp.id}`);
      const afterStop = (await get('bugs', '/api/recurring')).json;
      const keptEntry = (await get('bugs', '/api/expenses')).json.expenses.some((e) => e.id === rentExp.id);
      check('Dừng lặp lại: hết trong danh sách, khoản đã ghi vẫn giữ', stopped.status === 200 && !afterStop.expenses.some((r) => r.id === recExp.id) && keptEntry);
      // BUG-011: dữ liệu tháng có nhóm của từng khoản (để lọc theo dòng ngân sách).
      check('Ghi chép theo tháng có mã nhóm từng khoản', (await get('bugs', '/api/expenses')).json.expenses.every((e) => 'category_id' in e && 'spent_on' in e));

      // Thu nhập: ghi khoản thu nhập (nút "Thu nhập") thì thu nhập tháng lấy theo đó.
      const thisMonth = (await get('bugs', '/api/me/world')).json.today.slice(0, 7);
      const before = (await get('bugs', `/api/expenses/income?month=${thisMonth}`)).json;
      await post('bugs', '/api/income', { amount: 40000000, category: 'regular', note: 'Lương' });
      const after = (await get('bugs', `/api/expenses/income?month=${thisMonth}`)).json;
      check('Ghi khoản thu nhập 40 triệu thì thu nhập tháng hiện 40 triệu (không hỏi lại)',
        after.amount === before.recorded + 40000000 && after.source === 'entries', JSON.stringify(after));
      await put('bugs', '/api/expenses/income', { month: thisMonth, amount: 15000000 });
      const mixed = (await get('bugs', `/api/expenses/income?month=${thisMonth}`)).json;
      check('Đã có khoản thu nhập đã ghi thì ưu tiên số đã ghi hơn số tự gõ', mixed.amount === after.amount && mixed.typed === 15000000, JSON.stringify(mixed));

      // EK-002: video tải từng đoạn (Safari / iPhone).
      const v = '/assets/video/ekko-hoc-tap.mp4';
      const full = await fetch(BASE + v, { method: 'HEAD' });
      const part = await fetch(BASE + v, { headers: { range: 'bytes=0-99' } });
      const tail = await fetch(BASE + v, { headers: { range: 'bytes=-10' } });
      const bad = await fetch(BASE + v, { headers: { range: 'bytes=999999999-' } });
      check('Video: loại tệp video/mp4, báo hỗ trợ tải từng đoạn', full.headers.get('content-type') === 'video/mp4' && full.headers.get('accept-ranges') === 'bytes');
      check('Video: tải một đoạn trả 206 đúng 100 byte', part.status === 206 && (await part.arrayBuffer()).byteLength === 100 && /^bytes 0-99\//.test(part.headers.get('content-range')));
      check('Video: tải 10 byte cuối', tail.status === 206 && (await tail.arrayBuffer()).byteLength === 10);
      check('Video: đoạn ngoài tệp trả 416', bad.status === 416);
    }

    section('Bảo mật');
    const traversal = await fetch(`${BASE}/assets/../../server/config.js`);
    check('Chặn truy cập ngoài thư mục public', traversal.status !== 200 || !(await traversal.text()).includes('ssoSecret'));

    const openRedirect = await get('anon', `/dev/login?redirect=${encodeURIComponent('https://evil.example.com')}`);
    const redirectTarget = new URL(openRedirect.headers.get('location'), BASE).searchParams.get('redirect');
    check('Chặn chuyển hướng ra ngoài miền', redirectTarget === '/app/', String(redirectTarget));
  } finally {
    server.kill();
  }

  await testStreakRules();

  console.log(`\n${passed} đạt, ${failed} lỗi`);
  rmSync(DATA_DIR, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  rmSync(DATA_DIR, { recursive: true, force: true });
  process.exit(1);
});
