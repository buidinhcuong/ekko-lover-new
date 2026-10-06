/**
 * Learning content and progress: modules -> lessons -> frames.
 */
import { all, get, run, tx } from '../db.js';
import { bad, notFound, Router } from '../lib/http.js';
import { dayKey, nowIso } from '../lib/time.js';
import { learningXp, levelForXp, recordActivity } from '../services/progression.js';
import { activeConcept } from '../services/concepts.js';
import { readState } from '../services/streak.js';
import { firstVisibleModuleId, moduleOverview, nextLesson, withEffectiveUnlock } from '../services/world.js';

export const learnRouter = new Router();

const currentLevelOrder = (userId) => {
  const level = levelForXp(readState(userId).xp);
  return level ? level.order_index : 1;
};

/**
 * Dáng của một bài học, suy từ các loại khung nó có: có khung tương tác thì đó là
 * bài bắt tay làm, có slide thì là bài lật thẻ, còn lại là bài kể chuyện. Client
 * dùng cái này để chọn icon nói **bài học là gì**, thay vì vẽ dấu tích hay ổ khoá.
 */
const lessonShape = (kinds) => (kinds.includes('interactive')
  ? 'practice'
  : kinds.includes('slide') ? 'deck' : 'story');

/**
 * Học tuần tự: chỉ bài chưa xong **đầu tiên** mới mở, bài đã xong thì xem lại
 * thoải mái. Chặn ngay ở đây chứ không chỉ ẩn nút trên bản đồ — nút bấm là gợi ý,
 * còn luật thì phải nằm ở server, không thì gọi thẳng API là qua mặt được.
 */
function requireInOrder(userId, lessonId) {
  const done = get(
    "SELECT 1 ok FROM lesson_progress WHERE user_id = ? AND lesson_id = ? AND status = 'completed'",
    userId, lessonId,
  );
  if (done) return;

  const gate = nextLesson(userId, currentLevelOrder(userId));
  if (gate?.id === lessonId) return;
  throw bad('Học xong bài phía trên đã, rồi bài này mới mở.');
}

learnRouter.get('/api/learn/modules', ({ user }) => {
  const levelOrder = currentLevelOrder(user.id);
  return moduleOverview(user.id).map((m) => ({
    ...m,
    locked: m.unlock_level > levelOrder,
    percent: m.lesson_count ? Math.round((m.completed_count / m.lesson_count) * 100) : 0,
  }));
});

/**
 * Bản đồ học tập: một danh sách phẳng theo đúng thứ tự học, từ dưới lên trên.
 *
 * Mỗi phần tử là một chặng trên đường đi: mốc mô đun (chỉ để trang trí), một bài
 * học, hoặc bài trắc nghiệm cuối mô đun. Client chỉ việc vẽ, không phải tự suy ra
 * cái gì mở cái gì khoá.
 */
learnRouter.get('/api/learn/map', ({ user }) => {
  const levelOrder = currentLevelOrder(user.id);
  const entries = [];
  // Cửa duy nhất đang mở: bài chưa xong đầu tiên theo đúng thứ tự học. Chưa học
  // xong bài trên thì bài dưới còn khoá.
  const gateId = nextLesson(user.id, levelOrder)?.id ?? null;
  // Bài học gồm những loại khung nào — client lấy đó chọn icon cho chặng. Gom một
  // lần cho cả bản đồ, không hỏi lại theo từng bài.
  const shapes = new Map(all(
    `SELECT l.id, GROUP_CONCAT(DISTINCT f.kind) kinds
       FROM lessons l LEFT JOIN frames f ON f.lesson_id = l.id
      WHERE l.is_published = 1
      GROUP BY l.id`,
  ).map((r) => [r.id, lessonShape(r.kinds || '')]));

  const firstId = firstVisibleModuleId();
  for (const row of all('SELECT * FROM modules WHERE is_published = 1 ORDER BY order_index')) {
    const module = withEffectiveUnlock(row, firstId);
    const moduleLocked = module.unlock_level > levelOrder;

    const lessons = all(
      `SELECT l.id, l.order_index, l.title, l.est_minutes, p.status
         FROM lessons l
         LEFT JOIN lesson_progress p ON p.lesson_id = l.id AND p.user_id = ?
        WHERE l.module_id = ? AND l.is_published = 1
        ORDER BY l.order_index`,
      user.id, module.id,
    );

    entries.push({
      type: 'module',
      id: module.id,
      slug: module.slug,
      order_index: module.order_index,
      title: module.title,
      summary: module.summary,
      emoji: module.emoji,
      cover_image: module.cover_image,
      locked: moduleLocked,
      unlock_level: module.unlock_level,
    });

    for (const lesson of lessons) {
      const completed = lesson.status === 'completed';
      // Chú heo đứng ở đúng cái cửa đang mở.
      const current = !completed && !moduleLocked && lesson.id === gateId;
      const locked = moduleLocked || (!completed && !current);

      entries.push({
        type: 'lesson',
        id: lesson.id,
        moduleId: module.id,
        title: lesson.title,
        est_minutes: lesson.est_minutes,
        xp_reward: learningXp().lesson,
        completed,
        // 'practice' | 'deck' | 'story' — dáng của bài, để chọn icon cho đúng.
        shape: shapes.get(lesson.id) || 'story',
        locked,
        // Khoá vì chưa tới cấp, hay vì còn bài phía trên chưa học xong — hai lý do
        // này cần hai câu nhắc khác nhau ở phía app.
        lockReason: !locked ? null : moduleLocked ? 'level' : 'sequence',
        current,
      });
    }

    const questions = get('SELECT COUNT(*) n FROM module_questions WHERE module_id = ?', module.id).n;
    if (!questions) continue;

    const done = lessons.length > 0 && lessons.every((l) => l.status === 'completed');
    const result = get('SELECT * FROM module_quiz_results WHERE user_id = ? AND module_id = ?', user.id, module.id);

    entries.push({
      type: 'quiz',
      moduleId: module.id,
      moduleSlug: module.slug,
      moduleOrder: module.order_index,
      total: questions,
      locked: moduleLocked || !done,
      completed: Boolean(result?.completed_at),
      result: result ? { correct: result.correct, total: result.total } : null,
    });
  }

  return { entries, levelOrder, concept: activeConcept() };
});

learnRouter.get('/api/learn/modules/:slug', ({ user, params }) => {
  const module = withEffectiveUnlock(get('SELECT * FROM modules WHERE slug = ? AND is_published = 1', params.slug));
  if (!module) throw notFound('Không tìm thấy mô đun này');

  const lessons = all(
    `SELECT l.*, p.status, p.frame_index, p.completed_at
       FROM lessons l
       LEFT JOIN lesson_progress p ON p.lesson_id = l.id AND p.user_id = ?
      WHERE l.module_id = ? AND l.is_published = 1
      ORDER BY l.order_index`,
    user.id, module.id,
  ).map((l) => ({ ...l, completed: l.status === 'completed' }));

  const completedCount = lessons.filter((l) => l.completed).length;
  const questions = all(
    'SELECT id, order_index, question, options FROM module_questions WHERE module_id = ? ORDER BY order_index',
    module.id,
  ).map((q) => ({
    id: q.id,
    order_index: q.order_index,
    question: q.question,
    // Never ship `correct` to the client: it would be visible in the network tab.
    options: JSON.parse(q.options || '[]').map((o) => ({ text: o.text })),
  }));

  const result = get('SELECT * FROM module_quiz_results WHERE user_id = ? AND module_id = ?', user.id, module.id);

  return {
    ...module,
    locked: module.unlock_level > currentLevelOrder(user.id),
    lessons,
    completedCount,
    quiz: {
      questions,
      total: questions.length,
      // The test opens once every lesson in the module is done.
      unlocked: questions.length > 0 && lessons.length > 0 && completedCount === lessons.length,
      result: result ?? null,
    },
  };
});

/**
 * Grades the end-of-module test. Answers are checked server-side against the
 * stored options, and the reward scales with the score. Retakes are allowed but
 * only ever raise the recorded best.
 */
learnRouter.post('/api/learn/modules/:slug/quiz', ({ user, params, body }) => {
  const module = get('SELECT * FROM modules WHERE slug = ? AND is_published = 1', params.slug);
  if (!module) throw notFound('Không tìm thấy mô đun này');

  const questions = all(
    'SELECT id, options FROM module_questions WHERE module_id = ? ORDER BY order_index',
    module.id,
  );
  if (!questions.length) throw bad('Mô đun này chưa có câu hỏi');
  // Bài test chỉ mở khi đã học hết bài của mô đun (như màn hình hiển thị) — nếu
  // không, gọi thẳng API là ăn ngay 50 XP mỗi mô đun mà không học gì.
  const remainingLessons = get(
    `SELECT COUNT(*) n FROM lessons l
       LEFT JOIN lesson_progress p ON p.lesson_id = l.id AND p.user_id = ? AND p.status = 'completed'
      WHERE l.module_id = ? AND l.is_published = 1 AND p.lesson_id IS NULL`,
    user.id, module.id,
  ).n;
  if (remainingLessons > 0) throw bad('Học hết bài trong mô đun này để mở phần trắc nghiệm.');

  const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
  let correct = 0;
  const review = questions.map((q) => {
    const options = JSON.parse(q.options || '[]');
    const correctIndex = options.findIndex((o) => o.correct);
    const picked = Number(answers[q.id]);
    const ok = Number.isInteger(picked) && picked === correctIndex;
    if (ok) correct += 1;
    return { id: q.id, correct: ok, correctIndex, explain: options[correctIndex]?.explain ?? null };
  });

  const previous = get('SELECT * FROM module_quiz_results WHERE user_id = ? AND module_id = ?', user.id, module.id);
  const improved = !previous || correct > previous.correct;

  run(
    `INSERT INTO module_quiz_results (user_id, module_id, correct, total, attempts, completed_at)
     VALUES (?,?,?,?,1,?)
     ON CONFLICT(user_id, module_id) DO UPDATE
       SET correct = MAX(module_quiz_results.correct, excluded.correct),
           total = excluded.total,
           attempts = module_quiz_results.attempts + 1,
           completed_at = COALESCE(module_quiz_results.completed_at, excluded.completed_at)`,
    user.id, module.id, correct, questions.length, nowIso(),
  );

  // Lần đầu hoàn thành bài test của mô đun được thưởng một mức XP chung (Admin
  // đặt ở trang Chức năng), không phụ thuộc số câu đúng. Làm lại không được thêm
  // XP; lần làm lại có điểm cao hơn vẫn ghi lại (0 XP) để xét huy hiệu "đúng hết".
  const firstTime = !previous;
  // Mọi lần nộp đều được ghi (lần làm lại 0 XP), để thử thách "Làm 1 bài trắc
  // nghiệm" làm được cả khi người dùng đã đạt điểm tối đa từ trước.
  const rewards = recordActivity(user.id, {
    kind: 'module_quiz',
    ref: String(module.id),
    xp: firstTime ? learningXp().moduleQuiz : 0,
    meta: { title: module.title, correct, total: questions.length },
    countsForStreak: false,
  });

  return { correct, total: questions.length, review, rewards, improved };
});

learnRouter.get('/api/learn/lessons/:id', ({ user, params }) => {
  const lesson = get(
    `SELECT l.*, m.title AS module_title, m.slug AS module_slug, m.unlock_level, m.id AS module_id
       FROM lessons l JOIN modules m ON m.id = l.module_id
      WHERE l.id = ? AND l.is_published = 1`,
    Number(params.id),
  );
  if (!lesson) throw notFound('Không tìm thấy bài học này');
  if (lesson.module_id !== firstVisibleModuleId() && lesson.unlock_level > currentLevelOrder(user.id)) {
    throw bad('Bài học này chưa mở khoá ở cấp độ hiện tại của bạn.');
  }
  requireInOrder(user.id, lesson.id);

  const frames = all('SELECT id, order_index, kind, payload FROM frames WHERE lesson_id = ? ORDER BY order_index', lesson.id)
    .map((f) => ({ id: f.id, order_index: f.order_index, kind: f.kind, payload: JSON.parse(f.payload || '{}') }));

  let progress = get('SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = ?', user.id, lesson.id);
  if (!progress) {
    run(
      'INSERT INTO lesson_progress (user_id, lesson_id, status, frame_index, started_at) VALUES (?,?,?,?,?)',
      user.id, lesson.id, 'in_progress', 0, nowIso(),
    );
    progress = get('SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = ?', user.id, lesson.id);
  }

  const siblings = all('SELECT id, title, order_index FROM lessons WHERE module_id = ? AND is_published = 1 ORDER BY order_index', lesson.module_id);
  const idx = siblings.findIndex((s) => s.id === lesson.id);

  return {
    lesson,
    frames,
    progress,
    // XP người học nhận khi học xong bài này lần đầu (0 nếu đã học xong trước đó).
    xp: progress.status === 'completed' ? 0 : learningXp().lesson,
    nextInModule: idx >= 0 ? siblings[idx + 1] ?? null : null,
  };
});

learnRouter.post('/api/learn/lessons/:id/progress', ({ user, params, body }) => {
  const lessonId = Number(params.id);
  const frameIndex = Number(body.frameIndex);
  if (!Number.isInteger(frameIndex) || frameIndex < 0) throw bad('frameIndex không hợp lệ');

  run(
    `INSERT INTO lesson_progress (user_id, lesson_id, status, frame_index, started_at)
     VALUES (?,?,'in_progress',?,?)
     ON CONFLICT(user_id, lesson_id) DO UPDATE
       SET frame_index = MAX(lesson_progress.frame_index, excluded.frame_index)`,
    user.id, lessonId, frameIndex, nowIso(),
  );
  return { ok: true };
});

/**
 * Completing a lesson is the main reward moment: XP, a streak day, and
 * a module bonus when it was the last lesson of the module.
 */
learnRouter.post('/api/learn/lessons/:id/complete', ({ user, params, body }) => {
  const lesson = get(
    `SELECT l.*, m.id AS module_id, m.title AS module_title
       FROM lessons l JOIN modules m ON m.id = l.module_id
      WHERE l.id = ? AND l.is_published = 1`,
    Number(params.id),
  );
  if (!lesson) throw notFound('Không tìm thấy bài học này');
  requireInOrder(user.id, lesson.id);

  const existing = get('SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = ?', user.id, lesson.id);
  const alreadyCompleted = existing?.status === 'completed';

  const quizTotal = Number(body.quizTotal) || 0;
  const quizCorrect = Math.min(Number(body.quizCorrect) || 0, quizTotal);
  const day = dayKey();

  return tx(() => {
    run(
      `INSERT INTO lesson_progress (user_id, lesson_id, status, frame_index, quiz_correct, quiz_total, started_at, completed_at)
       VALUES (?,?,'completed',?,?,?,?,?)
       ON CONFLICT(user_id, lesson_id) DO UPDATE
         SET status = 'completed',
             quiz_correct = MAX(lesson_progress.quiz_correct, excluded.quiz_correct),
             quiz_total   = MAX(lesson_progress.quiz_total, excluded.quiz_total),
             completed_at = COALESCE(lesson_progress.completed_at, excluded.completed_at)`,
      user.id, lesson.id, 999, quizCorrect, quizTotal, existing?.started_at ?? nowIso(), nowIso(),
    );

    // Replays are welcome but do not pay out twice.
    if (alreadyCompleted) {
      return { replay: true, rewards: null, moduleCompleted: false };
    }

    const rewards = recordActivity(user.id, {
      kind: 'lesson_completed',
      ref: String(lesson.id),
      xp: learningXp().lesson,
      meta: { title: lesson.title, quizCorrect, quizTotal },
      day,
    });

    const remaining = get(
      `SELECT COUNT(*) n
         FROM lessons l
         LEFT JOIN lesson_progress p ON p.lesson_id = l.id AND p.user_id = ? AND p.status = 'completed'
        WHERE l.module_id = ? AND l.is_published = 1 AND p.lesson_id IS NULL`,
      user.id, lesson.module_id,
    ).n;

    let moduleRewards = null;
    if (remaining === 0) {
      const alreadyLogged = get(
        'SELECT 1 ok FROM activity_log WHERE user_id = ? AND kind = ? AND ref = ?',
        user.id, 'module_completed', String(lesson.module_id),
      );
      if (!alreadyLogged) {
        moduleRewards = recordActivity(user.id, {
          kind: 'module_completed',
          ref: String(lesson.module_id),
          // Học xong trọn mô đun không còn XP riêng; vẫn ghi lại cho nhật ký,
          // màn ăn mừng và huy hiệu mô đun.
          xp: 0,
          meta: { title: lesson.module_title },
          countsForStreak: false,
          day,
        });
      }
    }

    return {
      replay: false,
      rewards,
      moduleCompleted: Boolean(moduleRewards),
      moduleRewards,
      moduleTitle: lesson.module_title,
      next: nextLesson(user.id, currentLevelOrder(user.id)),
    };
  });
});
