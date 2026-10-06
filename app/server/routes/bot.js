import { all, run } from '../db.js';
import { bad, Router } from '../lib/http.js';
import { botCapabilities, replaySay, respond } from '../services/botEngine.js';
import { appendMessages, renderExpenseLogged } from '../services/botLog.js';
import { alertLine } from '../services/spendingAlerts.js';
import { evaluateBadges } from '../services/progression.js';
import { createExpense } from './features.js';
import { langOf } from '../i18n/index.js';

export const botRouter = new Router();

botRouter.get('/api/bot/history', ({ user, url, req }) => {
  const lang = langOf(req);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 40));
  const rows = all(
    'SELECT id, role, text, meta, source, created_at FROM bot_messages WHERE user_id = ? ORDER BY id DESC LIMIT ?',
    user.id, limit,
  ).reverse();

  return {
    messages: rows.map((row) => {
      const meta = row.meta ? JSON.parse(row.meta) : null;
      return { ...row, text: replay(row.text, meta, lang), meta: replayMeta(meta, lang) };
    }),
    capabilities: botCapabilities,
  };
});

/**
 * Câu bot đã nói, đọc lại ở ngôn ngữ đang chọn.
 *
 * Chỉ dựng lại được những câu do máy sinh ra và có kèm dữ liệu thô (`logged`,
 * `alerts`). Câu trả lời tự do của phần AI thì giữ nguyên như lúc nói — dịch lại
 * một câu đã nói bằng cách đoán thì tệ hơn là để đúng nguyên văn. Câu người dùng
 * tự gõ cũng không bao giờ bị đổi.
 */
function replay(text, meta, lang) {
  if (meta?.logged) return renderExpenseLogged(meta.logged, lang) + alertLine(meta.alerts, lang);
  return replaySay(meta?.say, lang) ?? text;
}

/** Nhãn nút cũng phải theo ngôn ngữ: nó là một câu do máy sinh, như phần chữ. */
function replayMeta(meta, lang) {
  const label = replaySay(meta?.action?.labelSay, lang);
  return label ? { ...meta, action: { ...meta.action, label } } : meta;
}

botRouter.post('/api/bot/message', async ({ user, body, req }) => {
  const text = String(body.text || '').trim();
  if (!text) throw bad('Bạn chưa nhập nội dung');
  // Câu hỏi dài không cần cho tài chính cá nhân, lại là cách hay dùng để nhồi
  // yêu cầu ngoài phạm vi vào bot — giữ ngắn.
  if (text.length > 300) throw bad('Tin nhắn quá dài, bạn hỏi ngắn hơn nhé (tối đa 300 ký tự)');

  appendMessages(user.id, [{ role: 'user', text }], 'chat');

  // Bot trả lời bằng ngôn ngữ app đang hiển thị.
  const reply = await respond(user.id, text, { createExpense, lang: langOf(req) });

  const meta = {
    kind: reply.kind,
    action: reply.action ?? null,
    suggestions: reply.suggestions ?? null,
    rewards: reply.rewards ?? null,
    logged: reply.logged ?? null,
    alerts: reply.alerts ?? null,
    say: reply.say ?? null,
  };
  appendMessages(user.id, [{ role: 'bot', text: reply.text, meta }], 'chat');

  // "Bạn của Ekko bot" and friends are counted on message volume.
  const badges = evaluateBadges(user.id);

  return { reply: { ...reply, meta }, badges };
});

botRouter.delete('/api/bot/history', ({ user }) => {
  run('DELETE FROM bot_messages WHERE user_id = ?', user.id);
  return { ok: true };
});
