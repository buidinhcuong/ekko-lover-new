/**
 * EkkoFeed — báo cáo góp ý của người lao động (server/services/ekkoFeed.js).
 *
 * Quản trị Ekko: mọi công ty (ô chọn công ty), hàng chờ kiểm duyệt, tài khoản HR
 * doanh nghiệp, ngưỡng ẩn danh. HR doanh nghiệp: chỉ công ty mình (server khoá
 * cứng), không thấy phần quản lý.
 *
 * Kỳ xem và công ty nằm trên hash: #/feed?days=30&employer=…
 */
import { el, formatDay } from '/shared/client.js';
import { moodFace } from '/shared/moods.js';
import { downloadDemoAccess } from '../demoAccessPage.js';
import { badge, companyPicker, confirmAction, hashParams, modal, table, textAreaField, textField, selectField } from '../ui.js';

const PRIORITY = { urgent: ['Khẩn', 'error'], high: ['Cao', 'warning'], medium: ['Trung bình', 'brand'], low: ['Thấp', 'neutral'] };
const PERIODS = [7, 30, 90];

const pct = (x) => `${Math.round((x || 0) * 100)}%`;
const mood = (s) => (s <= -0.5 ? 'Rất tiêu cực' : s < -0.15 ? 'Tiêu cực' : s <= 0.15 ? 'Trung lập' : s < 0.5 ? 'Tích cực' : 'Rất tích cực');
// Cảm xúc người gửi tự chọn (Vui · Bình thường · Buồn · Phẫn nộ).
const MOOD_LABEL = { happy: 'Vui', neutral: 'Bình thường', sad: 'Buồn', angry: 'Phẫn nộ' };
const moodTag = (code) => (MOOD_LABEL[code] ? el('span.moodtag', { title: `Người gửi chọn: ${MOOD_LABEL[code]}` }, moodFace(code, 16)) : null);
const moodChip = (moods = []) => {
  const total = moods.reduce((n, m) => n + m.posts, 0);
  return el('span.feedchip.feedchip--moods', { title: 'Cảm xúc người gửi tự chọn (bài không chọn không tính)' }, [
    el('small', {}, 'Cảm xúc người gửi'),
    total
      ? el('b.moodcounts', {}, moods.filter((m) => m.posts).map((m) => el('span', { title: `${m.label}: ${m.posts}` }, [moodFace(m.code, 18), String(m.posts)])))
      : el('b', {}, '—'),
  ]);
};
const stat = (label, value, hint) => el('div.stat', {}, [
  el('div.stat__label', {}, label), el('div.stat__value', {}, value), hint ? el('div.stat__hint', {}, hint) : null,
]);

export default async function feedPage(ctx) {
  const params = hashParams();
  const days = Number(params.get('days')) || 30;
  const employer = params.get('employer') || '';
  // Ba tab con: Báo cáo chung · Phản hồi · Chia sẻ (giữ trên hash: #/feed?tab=reply|share).
  const tab = ['reply', 'share'].includes(params.get('tab')) ? params.get('tab') : 'report';
  const meta = await ctx.api.get('/api/admin/feed/meta');
  const q = (extra = '') => `days=${days}${meta.ekko && employer ? `&employer=${encodeURIComponent(employer)}` : ''}${extra}`;
  const [report, posts, { assignees }, picker] = await Promise.all([
    ctx.api.get(`/api/admin/feed/report?${q()}`),
    ctx.api.get(`/api/admin/feed/posts?${q()}`),
    ctx.api.get('/api/admin/feed/assignees').catch(() => ({ assignees: [] })),
    meta.ekko ? companyPicker(ctx, '/feed') : Promise.resolve(null),
  ]);
  const topicLabel = Object.fromEntries(meta.topics.map((x) => [x.code, x.label]));
  const typeLabel = Object.fromEntries(meta.types.map((x) => [x.code, x.label]));
  const statusLabel = Object.fromEntries(meta.statuses.map((x) => [x.code, x.label]));
  const go = (d, toTab = tab) => ctx.navigate(`/feed?days=${d}${meta.ekko && employer ? `&employer=${encodeURIComponent(employer)}` : ''}${toTab === 'report' ? '' : `&tab=${toTab}`}`);
  const reload = () => go(days);

  // --- trả lời (một tin hoặc cả nhóm) --------------------------------------------
  const openReply = (postIds, title, issueKey = null, after = reload) => {
    const text = textAreaField({ label: 'Nội dung trả lời', rows: 6, placeholder: 'VD: Cảm ơn anh chị đã phản ánh. Từ tuần sau nhà ăn ca đêm tăng thêm 40 suất…' });
    modal({
      title,
      width: 640,
      saveLabel: postIds.length > 1 ? `Gửi tới ${postIds.length} người` : 'Gửi trả lời',
      rows: [[text], [el('p.hint', { style: { margin: 0 } }, postIds.length > 1
        ? 'Mỗi người nhận riêng trong mục "Góp ý của tôi" của họ — không ai thấy người khác. Góp ý chuyển sang "Đã phản hồi".'
        : 'Người gửi nhận trong mục "Góp ý của tôi". Tin ẩn danh thì bạn vẫn không biết là ai.')]],
      onSave: async () => {
        try {
          await ctx.api.post('/api/admin/feed/reply', { postIds, text: text.get(), issueKey });
          ctx.notify('Đã gửi trả lời', 'success');
          after();
        } catch (err) { ctx.notify(err.message, 'error'); return false; }
        return true;
      },
    });
  };

  // --- trả lời riêng từng người: mỗi góp ý một ô trả lời, gửi ngay -------------------
  const replyItem = (p, issueKey = null) => {
    const replies = el('div', {}, p.replies.map((r) => el('div.feedreply-admin', {}, [el('b', {}, r.by === 'hr' ? 'Doanh nghiệp: ' : 'Ekko: '), r.text])));
    const box = el('textarea', { rows: 2, placeholder: 'Trả lời riêng người này…' });
    const send = el('button.ekko-btn.ekko-btn--secondary.ekko-btn--sm', {
      type: 'button',
      onclick: async () => {
        const text = box.value.trim();
        if (text.length < 2) { ctx.notify('Bạn chưa nhập nội dung trả lời', 'error'); return; }
        send.disabled = true;
        try {
          await ctx.api.post('/api/admin/feed/reply', { postIds: [p.id], text, issueKey });
          replies.append(el('div.feedreply-admin', {}, [el('b', {}, meta.ekko ? 'Ekko: ' : 'Doanh nghiệp: '), text]));
          box.value = '';
          ctx.notify('Đã gửi trả lời riêng', 'success');
        } catch (err) { ctx.notify(err.message, 'error'); }
        send.disabled = false;
      },
    }, 'Gửi riêng');
    box.addEventListener('focus', () => { if (p.unread) markSeen([`post:${p.id}`]); });
    return el(`div.replyitem${p.unread ? '.is-unread' : ''}`, { dataset: { seenKey: `post:${p.id}` } }, [
      el('div.cellmeta', {}, [p.unread ? el('span.unreaddot', { title: 'Chưa đọc' }) : null, moodTag(p.mood), `${formatDay(p.createdAt.slice(0, 10))} · ${p.author ? p.author.name : 'Ẩn danh'} · ${statusLabel[p.status] || p.status}${meta.ekko && p.company ? ` · ${p.company}` : ''}`]),
      el('div.replyitem__text', {}, p.text),
      replies,
      el('div.replyitem__form', {}, [box, send]),
    ]);
  };
  /** Danh sách góp ý, mỗi cái một ô trả lời riêng (thay vì một câu cho cả nhóm). */
  const openIndividual = (title, list, issueKey = null) => modal({
    title,
    width: 760,
    saveLabel: 'Xong',
    rows: [
      [el('p.hint', { style: { margin: 0 } }, 'Mỗi người nhận câu trả lời riêng của mình trong "Góp ý của tôi". Tin ẩn danh thì bạn vẫn không biết là ai.')],
      [el('div.replylist', {}, list.map((p) => replyItem(p, issueKey)))],
    ],
    onSave: () => { reload(); return true; },
  });
  const openIndividualIssue = async (key, title) => {
    try {
      const d = await ctx.api.get(`/api/admin/feed/issue?key=${encodeURIComponent(key)}`);
      openIndividual(`Trả lời từng người: ${title}`, d.posts, key);
    } catch (err) { ctx.notify(err.message, 'error'); }
  };

  const head = el('div.page-head', {}, [
    el('div', { style: { flex: '1' } }, [
      el('h1', {}, meta.ekko ? 'EkkoFeed' : `EkkoFeed · ${meta.employerName || 'Công ty của bạn'}`),
      el('p', {}, `Góp ý, phàn nàn, yêu cầu của người lao động gửi tới doanh nghiệp, ${formatDay(report.from)} – ${formatDay(report.to)}. Tin ẩn danh không bao giờ hiện danh tính người gửi.`),
    ]),
    el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, [
      picker,
      el('div', { style: { display: 'flex', gap: '6px' } }, PERIODS.map((d) => el(
        `button.ekko-btn.ekko-btn--sm.${d === report.days ? 'ekko-btn--primary' : 'ekko-btn--secondary'}`,
        { type: 'button', onclick: () => go(d) }, `${d} ngày`,
      ))),
    ]),
  ]);

  const t = report.totals;
  const S = report.sections;
  const stats = el('div.stat-grid', {}, [
    stat('Tổng số bài', String(t.posts), `${t.people} người gửi`),
    stat('Góp ý / Cần giải quyết', String(S.issue.totals.posts), `${S.issue.totals.people} người · đã phản hồi ${pct(S.issue.totals.replied)}`),
    stat('Chia sẻ', String(S.share.totals.posts), `${S.share.totals.people} người`),
    stat('Cảm xúc chung', mood(t.sentiment), `điểm ${t.sentiment.toLocaleString('vi-VN')} (−1 đến 1)`),
  ]);

  // --- đám mây từ khoá: chữ to theo số NGƯỜI nhắc ---------------------------------
  const cloudPanel = (keywords, tone = '') => el('div.panel', {}, [
    el('div.panel__head', {}, [el('h2', {}, 'Từ khoá được nhắc nhiều'), el('span.cellmeta', {}, 'chữ càng to = càng nhiều người nhắc')]),
    keywords.length
      ? el(`div.wordcloud${tone}`, {}, keywords.map((k) => el('span.wordcloud__word', {
        style: { fontSize: `${Math.round(14 + k.weight * 30)}px`, opacity: String(0.55 + k.weight * 0.45) },
        title: `${k.text}: ${k.people} người, ${k.posts} bài${k.trend === null ? '' : ` · ${k.trend >= 0 ? '+' : ''}${k.trend}% so với kỳ trước`}`,
      }, k.text)))
      : el('p.hint', {}, `Chưa có từ khoá nào được từ ${report.minGroup} người trở lên cùng nhắc (ngưỡng ẩn danh).`),
  ]);
  const topicRows = (rows) => {
    if (!rows.length) return el('p.hint', { style: { margin: 0 } }, 'Chưa có dữ liệu.');
    const max = Math.max(1, ...rows.map((r) => r.posts));
    return el('div.topicrows', {}, rows.map((r) => el('div.topicrow', { title: `${r.label}: ${r.posts} bài · ${r.people} người` }, [
      el('span.topicrow__name', {}, r.label),
      el('span.topicrow__track', {}, [el('span', { style: { width: `${Math.round((r.posts / max) * 100)}%` } })]),
      el('span.topicrow__n', {}, String(r.posts)),
    ])));
  };

  // --- nhóm vấn đề cần giải quyết (+ quản lý từng vấn đề) --------------------------
  const ISSUE_TONE = { open: 'warning', in_progress: 'brand', resolved: 'success', dismissed: 'neutral' };
  const issueLabel = Object.fromEntries(meta.issueStatuses.map((x) => [x.code, x.label]));
  const todayKey = report.to;
  const issueFilters = [
    ['active', 'Cần xử lý', (i) => i.status === 'open' || i.status === 'in_progress'],
    ['resolved', 'Đã giải quyết', (i) => i.status === 'resolved' || i.status === 'dismissed'],
    ['all', 'Tất cả', () => true],
  ];
  let issueFilter = 'active';
  // Góp ý "Cần giải quyết" không thuộc nhóm vấn đề nào (dưới ngưỡng người) — để HR không bỏ sót.
  const inIssues = new Set(report.issues.flatMap((i) => i.postIds));
  const loose = posts.filter((p) => p.type === 'issue' && !inIssues.has(p.id));
  const postById = new Map(posts.map((p) => [p.id, p]));
  // Gộp các góp ý viết y hệt nhau (bỏ dấu câu, hoa thường) để thẻ không lặp lại.
  const uniqueTexts = (list) => {
    const m = new Map();
    for (const p of list) {
      const k = p.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      if (m.has(k)) m.get(k).same += 1; else m.set(k, { p, same: 1 });
    }
    return [...m.values()];
  };

  /** Đánh dấu đã đọc (chấm xanh như email chưa đọc). Không chặn giao diện nếu lỗi. */
  const markSeen = (keys) => {
    // Mở một vấn đề = đã đọc cả các góp ý trong đó.
    const list = [...new Set(keys.filter(Boolean).flatMap((k) => [k, ...(report.issues.find((x) => x.key === k)?.postIds || []).map((id) => `post:${id}`)]))];
    if (!list.length) return;
    ctx.api.post('/api/admin/feed/seen', { keys: list }).catch(() => {});
    for (const k of list) {
      if (k.startsWith('post:')) { const p = postById.get(Number(k.slice(5))); if (p) p.unread = false; } else {
        const it = report.issues.find((x) => x.key === k);
        if (it) { it.unread = false; it.postIds.forEach((id) => { const p = postById.get(id); if (p) p.unread = false; }); }
      }
    }
    document.querySelectorAll(list.map((k) => `[data-seen-key="${CSS.escape(k)}"]`).join(',')).forEach((n) => n.classList.remove('is-unread'));
  };

  /** Ô "Phụ trách" dạng dropdown: HR của công ty (+ quản trị Ekko), hoặc tự nhập tên. */
  const assigneesFor = (key) => {
    const company = String(key).split('|')[0];
    return assignees.filter((a) => a.role === 'ekko' || a.employerKey === company);
  };
  const ownerPicker = (i, { onPick = null } = {}) => {
    const people = assigneesFor(i.key);
    const known = people.some((a) => a.name === i.owner);
    const OTHER = '__other__';
    const box = el('div.ownerpick');
    const save = async (value) => {
      if (onPick) { onPick(value); i.owner = value || null; draw(); return; }
      try {
        await ctx.api.patch('/api/admin/feed/issue', { key: i.key, owner: value || '' });
        i.owner = value || null;
        ctx.notify(value ? `Đã giao cho ${value}` : 'Đã bỏ người phụ trách', 'success');
      } catch (err) { ctx.notify(err.message, 'error'); }
      draw();
    };
    const typeOwn = () => {
      const input = el('input.input.ownerpick__input', { type: 'text', maxlength: '80', value: known ? '' : (i.owner || ''), placeholder: 'Tên người phụ trách' });
      const done = () => save(input.value.trim());
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); if (e.key === 'Escape') draw(); });
      box.replaceChildren(input, el('button.ekko-btn.ekko-btn--primary.ekko-btn--sm', { type: 'button', onclick: done }, 'Giao'));
      input.focus();
    };
    function draw() {
      const select = el(`select.input.ownerpick__select${i.owner ? '' : '.is-empty'}`, {
        'aria-label': 'Người phụ trách',
        onchange: (e) => (e.target.value === OTHER ? typeOwn() : save(e.target.value)),
      }, [
        el('option', { value: '', selected: !i.owner }, 'Chưa giao'),
        ...(i.owner && !known ? [el('option', { value: i.owner, selected: true }, i.owner)] : []),
        ...people.map((a) => el('option', { value: a.name, selected: a.name === i.owner }, `${a.name}${a.role === 'ekko' ? ' (Ekko)' : ''}`)),
        el('option', { value: OTHER }, 'Người khác… (nhập tên)'),
      ]);
      box.replaceChildren(el('span.ownerpick__avatar', { 'aria-hidden': 'true' }, i.owner ? i.owner.trim().split(/\s+/).at(-1).slice(0, 1).toUpperCase() : '?'), select);
    }
    draw();
    return box;
  };

  const issueHost = el('div.issuelist');
  const filterRow = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' } });
  const drawIssues = () => {
    filterRow.replaceChildren(...issueFilters.map(([code, label, fn]) => el(
      `button.ekko-btn.ekko-btn--sm.${code === issueFilter ? 'ekko-btn--primary' : 'ekko-btn--secondary'}`,
      { type: 'button', onclick: () => { issueFilter = code; drawIssues(); } },
      `${label} (${report.issues.filter(fn).length})`,
    )));
    const fn = issueFilters.find(([code]) => code === issueFilter)[2];
    const rows = report.issues.filter(fn);
    issueHost.replaceChildren(...(rows.length ? rows.map((i) => {
      const overdue = i.dueOn && i.dueOn < todayKey && (i.status === 'open' || i.status === 'in_progress');
      // Nội dung góp ý thật (đã che thông tin cá nhân): 3 bài mới nhất, xem hết trong "Quản lý".
      const items = i.postIds.map((id) => postById.get(id)).filter(Boolean);
      const card = el(`div.issue${i.unread ? '.is-unread' : ''}`, { dataset: { seenKey: i.key } }, [
        el('div.issue__main', {}, [
          el('div.issue__head', {}, [
            i.unread ? el('span.unreaddot', { title: 'Chưa đọc', 'aria-label': 'Chưa đọc' }) : null,
            badge(issueLabel[i.status] || i.status, ISSUE_TONE[i.status]),
            badge(...PRIORITY[i.priority]),
            el('strong', {}, i.title),
          ]),
          el('div.cellmeta', {}, `${meta.ekko && i.company ? `${i.company} · ` : ''}${topicLabel[i.topic] || i.topic}${i.keyword ? ` · "${i.keyword}"` : ''} · ${i.people} người · ${i.posts} góp ý · ${mood(i.sentiment)} · đã trả lời ${i.replied}/${i.posts}`),
          (i.dueOn || i.newSinceResolved) ? el('div.issue__mgmt', {}, [
            i.dueOn ? el(`span${overdue ? '.is-overdue' : ''}`, {}, `Hạn: ${formatDay(i.dueOn)}${overdue ? ' (quá hạn)' : ''}`) : null,
            i.newSinceResolved ? el('span.is-overdue', {}, `${i.newSinceResolved} góp ý mới sau khi giải quyết`) : null,
          ]) : null,
          items.length ? el('div.issue__texts', {}, [
            ...uniqueTexts(items).slice(0, 3).map(({ p, same }) => el(`figure.issuequote${p.unread && !i.unread ? '.is-unread' : ''}`, {}, [
              el('blockquote', {}, `“${p.text}”`),
              el('figcaption', {}, [moodTag(p.mood), same > 1
                ? `${same} người viết giống nhau · mới nhất ${formatDay(p.createdAt.slice(0, 10))}`
                : `${p.author ? p.author.name : 'Ẩn danh'} · ${formatDay(p.createdAt.slice(0, 10))}${p.replies.length ? ' · đã trả lời' : ''}`]),
            ])),
            uniqueTexts(items).length > 3 ? el('button.linkbtn', { type: 'button', onclick: () => openIssue(i.key) }, `+ ${uniqueTexts(items).length - 3} nội dung khác — xem tất cả ${items.length} góp ý`) : null,
          ]) : (i.quotes.length ? el('ul.issue__quotes', {}, i.quotes.map((x) => el('li', {}, x))) : null),
          el('div', { style: { display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' } }, [
            el('button.ekko-btn.ekko-btn--primary.ekko-btn--sm', { type: 'button', onclick: () => openIssue(i.key) }, 'Quản lý'),
            el('button.ekko-btn.ekko-btn--secondary.ekko-btn--sm', { type: 'button', onclick: () => { markSeen([i.key]); openReply(i.postIds, `Trả lời nhóm: ${i.title}`, i.key); } }, `Trả lời cả nhóm (${i.posts})`),
            el('button.ekko-btn.ekko-btn--secondary.ekko-btn--sm', { type: 'button', onclick: () => { markSeen([i.key]); openIndividualIssue(i.key, i.title); } }, 'Trả lời từng người'),
          ]),
        ]),
        el('div.issue__side', {}, [
          el('small', {}, 'Phụ trách'),
          ownerPicker(i),
        ]),
      ]);
      return card;
    }) : [el('p.hint', {}, report.issues.length ? 'Không có vấn đề nào ở mục này.' : `Chưa có nhóm vấn đề nào đủ ${report.minGroup} người.`)]));
  };

  /** Màn quản lý một vấn đề: trạng thái, phụ trách, hạn, ghi chú nội bộ, các góp ý, lịch sử. */
  const openIssue = async (key) => {
    markSeen([key]);
    let d;
    try { d = await ctx.api.get(`/api/admin/feed/issue?key=${encodeURIComponent(key)}`); } catch (err) { ctx.notify(err.message, 'error'); return; }
    const title = textField({ label: 'Tiêu đề vấn đề', value: d.title });
    const status = selectField({ label: 'Trạng thái', value: d.status, options: meta.issueStatuses.map((x) => [x.code, x.label]),
      hint: 'Đang xử lý → người gửi thấy "Đang xử lý". Đã giải quyết → góp ý của họ chuyển "Đã đóng".' });
    // Cùng dropdown như trên thẻ vấn đề; chỉ lưu khi bấm "Lưu thay đổi".
    const ownerState = { key: d.key, owner: d.owner || null };
    const owner = {
      node: el('label.ekko-field', {}, [el('span.ekko-field__label', {}, 'Người phụ trách'), ownerPicker(ownerState, { onPick: (v) => { ownerState.owner = v || null; } })]),
      get: () => ownerState.owner || '',
    };
    const due = textField({ label: 'Hạn xử lý', type: 'date', value: d.dueOn || '' });
    const note = textAreaField({ label: 'Ghi chú nội bộ (người lao động không thấy)', value: d.note || '', rows: 3, placeholder: 'VD: Đã báo bếp, chờ duyệt thêm 40 suất…' });
    // Mỗi góp ý có ô "Trả lời riêng"; nút "Trả lời cả nhóm" ở trên gửi một câu cho tất cả.
    const postsNode = el('div.issue__posts', {}, d.posts.map((p) => replyItem(p, d.key)));
    const eventsNode = d.events.length
      ? el('ul.issue__events', {}, d.events.map((e) => el('li', {}, [
        el('span.cellmeta', { style: { display: 'inline' } }, `${formatDay(e.created_at.slice(0, 10))} ${e.created_at.slice(11, 16)} · ${e.name || '—'} · `),
        e.action === 'status' ? `Trạng thái → ${e.detail}` : e.action === 'note' ? 'Sửa ghi chú nội bộ' : e.detail,
      ])))
      : el('p.hint', { style: { margin: 0 } }, 'Chưa có thao tác nào.');
    modal({
      title: 'Quản lý vấn đề',
      width: 860,
      saveLabel: 'Lưu thay đổi',
      rows: [
        [el('div.cellmeta', {}, `${d.company || ''} · ${topicLabel[d.topic] || d.topic}${d.keyword ? ` · "${d.keyword}"` : ''} · ${d.people} người · ${d.posts.length} góp ý`)],
        [title], [status, owner, due], [note],
        [el('div', {}, [
          el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0 8px' } }, [
            el('strong', { style: { flex: '1' } }, `Các góp ý trong vấn đề (${d.posts.length})`),
            el('button.ekko-btn.ekko-btn--secondary.ekko-btn--sm', {
              type: 'button',
              onclick: () => openReply(d.posts.map((p) => p.id), `Trả lời nhóm: ${d.title}`, d.key, () => { reload(); }),
            }, 'Trả lời cả nhóm'),
          ]),
          postsNode,
        ])],
        [el('div', {}, [el('strong', { style: { display: 'block', margin: '4px 0 8px' } }, 'Lịch sử thao tác'), eventsNode])],
      ],
      onSave: async () => {
        try {
          await ctx.api.patch('/api/admin/feed/issue', {
            key: d.key, title: title.get(), status: status.get(), owner: owner.get(), dueOn: due.get() || null, note: note.get(),
          });
          ctx.notify('Đã lưu vấn đề', 'success');
          reload();
        } catch (err) { ctx.notify(err.message, 'error'); return false; }
        return true;
      },
    });
  };

  drawIssues();
  const issues = el('div.panel', {}, [
    el('div.panel__head', {}, [el('h2', {}, 'Vấn đề cần giải quyết'), el('span.cellmeta', {}, `nhóm có từ ${report.minGroup} người · xếp theo trạng thái, mức ưu tiên`)]),
    filterRow,
    issueHost,
  ]);

  // --- Chia sẻ: chỉ để đọc (không cần phản hồi), gom theo chủ đề ---------------------
  const shares = posts.filter((p) => p.type === 'share');
  // --- Chia sẻ: gom nhóm thông minh (chủ đề + từ khoá chính), không cần phản hồi ----
  const moodOf = (x) => (x > 0.15 ? 'pos' : x < -0.15 ? 'neg' : 'neu');
  const MOOD = { pos: 'Tích cực', neu: 'Trung lập', neg: 'Băn khoăn' };
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const shareClusters = (() => {
    const map = new Map();
    for (const p of shares) {
      const key = `${p.topic}|${(p.keywords[0] || '').toLowerCase()}`;
      if (!map.has(key)) map.set(key, { key, topic: p.topic, keywords: new Set(), list: [], summaries: new Map() });
      const c = map.get(key);
      c.list.push(p);
      p.keywords.forEach((k) => c.keywords.add(k));
      if (p.summary) c.summaries.set(p.summary, (c.summaries.get(p.summary) || 0) + 1);
    }
    return [...map.values()].map((c) => {
      const mood = { pos: 0, neu: 0, neg: 0 };
      c.list.forEach((p) => { mood[moodOf(p.sentiment)] += 1; });
      const recent = c.list.filter((p) => p.createdAt.slice(0, 10) >= weekAgo).length;
      const title = [...c.summaries.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || c.list[0].text;
      // Trích tiêu biểu: câu tích cực nhất + câu mới nhất (khác nhau).
      const byMood = [...c.list].sort((a, b) => b.sentiment - a.sentiment);
      const quotes = [...new Set([byMood[0], c.list[0], byMood[byMood.length - 1]])].slice(0, 2);
      const avg = c.list.reduce((n, p) => n + p.sentiment, 0) / c.list.length;
      return { ...c, keywords: [...c.keywords], mood, recent, title, quotes, avg };
    }).sort((a, b) => b.list.length - a.list.length || b.recent - a.recent);
  })();
  const sharePos = shares.filter((p) => moodOf(p.sentiment) === 'pos').length;
  const shareNeg = shares.filter((p) => moodOf(p.sentiment) === 'neg');
  const rising = [...shareClusters].filter((c) => c.recent >= 2).sort((a, b) => b.recent / b.list.length - a.recent / a.list.length)[0];

  const moodBar = (m, total) => el('span.moodbar', { title: `${m.pos} tích cực · ${m.neu} trung lập · ${m.neg} băn khoăn` },
    ['pos', 'neu', 'neg'].filter((k) => m[k]).map((k) => el(`i.is-${k}`, { style: { flexGrow: String(m[k]) } })));
  const quoteCard = (p) => el(`figure.sharequote.is-${moodOf(p.sentiment)}`, {}, [
    el('blockquote', {}, `“${p.text}”`),
    el('figcaption', {}, [moodTag(p.mood), `${p.author ? p.author.name : 'Ẩn danh'} · ${formatDay(p.createdAt.slice(0, 10))}`]),
  ]);
  const insightCard = (label, value, hint, tone = '') => el(`div.shareinsight${tone}`, {}, [
    el('small', {}, label), el('b', {}, value), hint ? el('span', {}, hint) : null,
  ]);
  const shareInsights = () => el('div.shareinsights', {}, [
    insightCard('Tinh thần chung', shares.length ? `${Math.round((sharePos / shares.length) * 100)}% tích cực` : '—', `${shares.length} chia sẻ từ ${S.share.totals.people} người`, '.is-pos'),
    insightCard('Được nhắc nhiều nhất', shareClusters[0] ? shareClusters[0].title : '—', shareClusters[0] ? `${shareClusters[0].list.length} người · ${topicLabel[shareClusters[0].topic] || ''}` : ''),
    insightCard('Mới nổi 7 ngày qua', rising ? rising.title : '—', rising ? `${rising.recent} chia sẻ mới trong tuần` : 'chưa có nhóm nào tăng rõ'),
    insightCard('Tâm tư cần để ý', String(shareNeg.length), shareNeg.length ? 'chia sẻ mang cảm xúc buồn / băn khoăn — không cần trả lời, nhưng nên nắm' : 'không có chia sẻ buồn nào', shareNeg.length ? '.is-neg' : ''),
  ]);

  // Báo cáo chung: bản tóm gọn, xem chi tiết ở tab Chia sẻ.
  const shareRead = el('div.panel', {}, [
    el('div.panel__head', {}, [el('h2', {}, 'Nhóm chia sẻ nổi bật'), el('button.linkbtn', { type: 'button', onclick: () => go(days, 'share') }, 'Xem tất cả ở tab Chia sẻ →')]),
    shareClusters.length
      ? el('div.toplist', {}, shareClusters.slice(0, 6).map((c) => el('button.toprow.toprow--share', { type: 'button', onclick: () => go(days, 'share') }, [
        badge(topicLabel[c.topic] || c.topic, 'success'),
        el('span.toprow__title', {}, c.title),
        el('span.cellmeta', { style: { display: 'inline' } }, `${c.list.length} người`),
        moodBar(c.mood),
      ])))
      : el('p.hint', {}, 'Chưa có chia sẻ nào trong kỳ.'),
  ]);

  // Tab Chia sẻ: điểm nhấn + lọc (tìm, cảm xúc, chủ đề) + 2 cách xem (theo nhóm / dòng thời gian).
  const shareTab = () => {
    const state = { q: '', mood: 'all', topic: '', view: 'group' };
    const host = el('div');
    const match = (p) => (state.mood === 'all' || moodOf(p.sentiment) === state.mood)
      && (!state.topic || p.topic === state.topic)
      && (!state.q || `${p.text} ${p.keywords.join(' ')}`.toLowerCase().includes(state.q));
    const seg = (key, items) => el('div.segment', {}, items.map(([code, label]) => el('button.segment__btn', {
      type: 'button', 'aria-pressed': String(state[key] === code), onclick: () => { state[key] = code; draw(); },
    }, label)));
    const search = el('input.input.sharesearch', { type: 'search', placeholder: 'Tìm trong chia sẻ… (VD: tổ trưởng, nhà ăn)', oninput: (e) => { state.q = e.target.value.trim().toLowerCase(); draw(); } });
    const topicSel = el('select.input.sharetopic', { onchange: (e) => { state.topic = e.target.value; draw(); } }, [
      el('option', { value: '' }, 'Mọi chủ đề'),
      ...[...new Set(shares.map((p) => p.topic))].map((code) => el('option', { value: code }, topicLabel[code] || code)),
    ]);
    const controls = el('div.sharecontrols');
    const body = el('div');

    const groupView = () => {
      const clusters = shareClusters.map((c) => ({ ...c, shown: c.list.filter(match) })).filter((c) => c.shown.length);
      if (!clusters.length) return el('p.hint', {}, 'Không có chia sẻ nào khớp bộ lọc.');
      const big = clusters.filter((c) => c.list.length >= 2);
      const small = clusters.filter((c) => c.list.length < 2);
      const card = (c) => {
        const quotes = c.quotes.filter((p) => c.shown.includes(p));
        const rest = c.shown.filter((p) => !quotes.includes(p));
        const more = el('div.sharecluster__more', { hidden: true }, rest.map(quoteCard));
        const toggle = rest.length ? el('button.linkbtn', {
          type: 'button',
          onclick: (e) => { more.hidden = !more.hidden; e.target.textContent = more.hidden ? `Xem thêm ${rest.length} chia sẻ` : 'Thu gọn'; },
        }, `Xem thêm ${rest.length} chia sẻ`) : null;
        return el(`article.sharecluster.is-${moodOf(c.avg)}`, {}, [
          el('header.sharecluster__head', {}, [
            el('div', {}, [
              el('div.sharecluster__tags', {}, [
                badge(topicLabel[c.topic] || c.topic, 'success'),
                c.recent ? el('span.sharenew', {}, `${c.recent} mới tuần này`) : null,
              ]),
              el('h3', {}, c.title),
            ]),
            el('div.sharecluster__count', {}, [el('b', {}, String(c.list.length)), el('small', {}, 'người')]),
          ]),
          el('div.sharecluster__mood', {}, [moodBar(c.mood), el('small.cellmeta', { style: { display: 'inline' } }, ['pos', 'neu', 'neg'].filter((k) => c.mood[k]).map((k) => `${c.mood[k]} ${MOOD[k].toLowerCase()}`).join(' · '))]),
          c.keywords.length ? el('div.sharecluster__kw', {}, c.keywords.slice(0, 5).map((k) => el('span', {}, `#${k}`))) : null,
          el('div.sharecluster__quotes', {}, (quotes.length ? quotes : c.shown.slice(0, 2)).map(quoteCard)),
          more, toggle,
        ]);
      };
      return el('div', {}, [
        big.length ? el('div.sharegrid', {}, big.map(card)) : null,
        small.length ? el('div.panel', { style: { marginTop: '16px' } }, [
          el('div.panel__head', {}, [el('h2', {}, `Chia sẻ riêng lẻ (${small.length})`), el('span.cellmeta', {}, 'chưa trùng ý với ai — vẫn đáng đọc')]),
          el('div.sharewall', {}, small.flatMap((c) => c.shown).map(quoteCard)),
        ]) : null,
      ]);
    };

    const timelineView = () => {
      const list = shares.filter(match);
      if (!list.length) return el('p.hint', {}, 'Không có chia sẻ nào khớp bộ lọc.');
      const weekOf = (d) => {
        const ageDays = Math.floor((Date.now() - new Date(`${d}T00:00:00`).getTime()) / 86400000);
        return ageDays < 7 ? 'Tuần này' : ageDays < 14 ? 'Tuần trước' : ageDays < 30 ? `${Math.floor(ageDays / 7)} tuần trước` : 'Cũ hơn';
      };
      const weeks = new Map();
      list.forEach((p) => { const w = weekOf(p.createdAt.slice(0, 10)); if (!weeks.has(w)) weeks.set(w, []); weeks.get(w).push(p); });
      return el('div.sharetimeline', {}, [...weeks.entries()].map(([w, items]) => {
        const m = { pos: 0, neu: 0, neg: 0 };
        items.forEach((p) => { m[moodOf(p.sentiment)] += 1; });
        return el('section.shareweek', {}, [
          el('div.shareweek__head', {}, [el('h3', {}, w), el('small.cellmeta', { style: { display: 'inline' } }, `${items.length} chia sẻ`), moodBar(m)]),
          el('div.sharewall', {}, items.map((p) => el('div', {}, [badge(topicLabel[p.topic] || p.topic, 'neutral'), quoteCard(p)]))),
        ]);
      }));
    };

    function draw() {
      const n = shares.filter(match).length;
      controls.replaceChildren(
        search, topicSel,
        seg('mood', [['all', 'Tất cả'], ['pos', 'Tích cực'], ['neu', 'Trung lập'], ['neg', 'Băn khoăn']]),
        el('span.sharecontrols__spacer'),
        el('small.cellmeta', { style: { display: 'inline' } }, `${n}/${shares.length} chia sẻ`),
        seg('view', [['group', 'Theo nhóm'], ['time', 'Dòng thời gian']]),
      );
      body.replaceChildren(state.view === 'group' ? groupView() : timelineView());
    }
    draw();
    mountShare(host, [
      shareInsights(),
      el('p.hint', { style: { margin: '4px 0 12px' } }, 'Chia sẻ là cảm nhận, lời khen, câu chuyện — không cần phản hồi. Chia sẻ có cùng chủ đề và ý chính được gom thành nhóm.'),
      controls, body,
    ]);
    return host;
  };
  const mountShare = (host, kids) => host.replaceChildren(...kids.filter(Boolean));

  /** Một phần báo cáo (Góp ý hoặc Chia sẻ) — cùng cấu trúc: số liệu, từ khoá, theo chủ đề. */
  const sectionBlock = ({ code, title, hint, sec, right, chips }) => el('section.feedsection', { dataset: { type: code } }, [
    el('div.feedsection__head', {}, [
      el('h2', {}, title),
      el('span.cellmeta', {}, hint),
    ]),
    el('div.feedsection__chips', {}, [
      ...chips.map(([label, value]) => el('span.feedchip', {}, [el('small', {}, label), el('b', {}, value)])),
      moodChip(sec.moods),
    ]),
    el('div.split', {}, [cloudPanel(sec.keywords, code === 'share' ? '.wordcloud--share' : ''), right]),
    el('div.panel', { style: { marginTop: '16px' } }, [el('div.panel__head', {}, [el('h2', {}, 'Theo chủ đề')]), topicRows(sec.byTopic)]),
  ]);
  const trendTxt = (now, before) => (before ? `${now >= before ? '+' : ''}${Math.round(((now - before) / before) * 100)}% so với kỳ trước` : '');

  // --- Góp ý lẻ: Cần giải quyết nhưng chưa đủ người để thành nhóm — liệt kê thẳng ----
  const loosePanel = el('div.panel', { style: { marginTop: '16px' } }, [
    el('div.panel__head', {}, [
      el('h2', {}, `Góp ý lẻ chưa đủ nhóm (${loose.length})`),
      el('span.cellmeta', {}, `Góp ý / Cần giải quyết chưa có đủ ${report.minGroup} người cùng nêu — trả lời từng người`),
    ]),
    loose.length ? el('div.replylist', {}, loose.map((p) => el('div', {}, [
      el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' } }, [
        badge(topicLabel[p.topic] || p.topic, 'brand'),
        p.urgency === 'urgent' || p.urgency === 'high' ? badge(PRIORITY[p.urgency][0], PRIORITY[p.urgency][1]) : null,
        p.sensitive ? badge('Nhạy cảm', 'error') : null,
      ]),
      replyItem(p),
    ]))) : el('p.hint', {}, 'Không có góp ý lẻ nào trong kỳ.'),
  ]);

  // --- Báo cáo chung: tóm tắt các vấn đề nổi bật, bấm để sang tab Phản hồi -----------
  const topIssues = el('div.panel', {}, [
    el('div.panel__head', {}, [el('h2', {}, 'Vấn đề nổi bật'), el('span.cellmeta', {}, 'bấm để xử lý ở tab Phản hồi')]),
    report.issues.length
      ? el('div.toplist', {}, report.issues.slice(0, 8).map((i) => el('button.toprow', {
        type: 'button',
        onclick: () => { try { sessionStorage.setItem('ekkofeed.openIssue', i.key); } catch { /* chặn bộ nhớ: chỉ chuyển tab */ } go(days, 'reply'); },
      }, [
        badge(issueLabel[i.status] || i.status, ISSUE_TONE[i.status]),
        el('span.toprow__title', {}, i.title),
        el('span.cellmeta', { style: { display: 'inline' } }, `${i.people} người`),
        badge(...PRIORITY[i.priority]),
      ])))
      : el('p.hint', {}, `Chưa có nhóm vấn đề nào đủ ${report.minGroup} người.`),
    loose.length ? el('p.hint', { style: { margin: '10px 0 0' } }, `+ ${loose.length} góp ý lẻ chưa đủ nhóm — xem ở tab Phản hồi.`) : null,
  ]);

  const tabs = el('div.subtabs', { role: 'tablist' }, [
    ['report', 'Báo cáo chung'],
    ['reply', `Phản hồi${report.issues.filter((i) => i.status === 'open').length + loose.filter((p) => !p.replies.length).length ? ` (${report.issues.filter((i) => i.status === 'open').length + loose.filter((p) => !p.replies.length).length} cần xử lý)` : ''}`],
    ['share', `Chia sẻ (${shares.length})`],
  ].map(([code, label]) => el('button.subtab', {
    type: 'button', role: 'tab', 'aria-selected': String(code === tab), onclick: () => go(days, code),
  }, label)));

  // Từ "Vấn đề nổi bật" bấm sang: mở luôn màn quản lý của vấn đề đó.
  let pending = null;
  try {
    pending = tab === 'reply' ? sessionStorage.getItem('ekkofeed.openIssue') : null;
    if (pending) sessionStorage.removeItem('ekkofeed.openIssue');
  } catch { /* trình duyệt chặn bộ nhớ: bỏ qua */ }
  if (pending) setTimeout(() => openIssue(pending), 50);

  return el('div', {}, [
    head, tabs,
    ...(tab === 'report'
      ? [
        stats,
        sectionBlock({
          code: 'issue', title: 'Góp ý / Cần giải quyết', hint: 'điều chưa ổn, đề xuất, việc mong công ty giải quyết', sec: S.issue, right: topIssues,
          chips: [
            ['Bài', String(S.issue.totals.posts)], ['Người', String(S.issue.totals.people)],
            ['Đã phản hồi', pct(S.issue.totals.replied)], ['Cảm xúc', mood(S.issue.totals.sentiment)],
            ['Xu hướng', trendTxt(S.issue.totals.posts, S.issue.totals.prevPosts) || '—'],
          ],
        }),
        sectionBlock({
          code: 'share', title: 'Chia sẻ', hint: 'cảm nhận, lời khen, câu chuyện của người lao động', sec: S.share, right: shareRead,
          chips: [
            ['Bài', String(S.share.totals.posts)], ['Người', String(S.share.totals.people)],
            ['Cảm xúc', mood(S.share.totals.sentiment)],
            ['Xu hướng', trendTxt(S.share.totals.posts, S.share.totals.prevPosts) || '—'],
          ],
        }),
        meta.ekko ? await managePanel(ctx, employer) : null,
      ]
      : tab === 'share' ? [shareTab()] : [issues, loosePanel]),
  ]);
}

/** Quản trị Ekko: tài khoản HR doanh nghiệp + ngưỡng ẩn danh. */
async function managePanel(ctx, employer) {
  const [accounts, companies, settings, kits] = await Promise.all([
    ctx.api.get('/api/admin/feed/hr-accounts'),
    ctx.api.get('/api/admin/stats/companies'),
    ctx.api.get(`/api/admin/feed/settings${employer ? `?employer=${encodeURIComponent(employer)}` : ''}`),
    ctx.api.get('/api/admin/feed/demo-kits'),
  ]);
  const realCompanies = companies.filter((c) => c.value !== '__none__');

  const add = () => {
    const email = textField({ label: 'Email HR', type: 'email', placeholder: 'hr@congty.vn' });
    const name = textField({ label: 'Họ tên', placeholder: 'Nguyễn Thị HR' });
    const company = selectField({ label: 'Công ty', value: employer || realCompanies[0]?.value, options: realCompanies.map((c) => [c.value, `${c.name}${c.code ? ` (mã ${c.code})` : ''}`]) });
    modal({
      title: 'Thêm tài khoản HR doanh nghiệp',
      width: 560,
      saveLabel: 'Tạo tài khoản',
      rows: [[email], [name], [company], [el('p.hint', { style: { margin: 0 } }, 'HR đăng nhập Admin portal bằng email + mật khẩu tạm, chỉ thấy EkkoFeed của công ty này. Email đã có tài khoản thì chỉ gắn quyền.')]],
      onSave: async () => {
        try {
          const r = await ctx.api.post('/api/admin/feed/hr-accounts', { email: email.get(), name: name.get(), employer: company.get() });
          if (r.password) {
            await confirmAction(`Tài khoản HR của ${r.company}: ${r.email} — mật khẩu tạm: ${r.password}. Gửi cho HR và nhắc đổi mật khẩu. Mật khẩu này chỉ hiện một lần.`, { title: 'Mật khẩu tạm', confirmLabel: 'Đã chép' });
          } else ctx.notify(`Đã gắn quyền HR ${r.company} cho ${r.email}`, 'success');
          ctx.navigate(location.hash.slice(1));
        } catch (err) { ctx.notify(err.message, 'error'); return false; }
        return true;
      },
    });
  };
  const revoke = async (a) => {
    if (!await confirmAction(`Thu hồi quyền HR của ${a.email} (${a.employer_name})?`, { title: 'Thu hồi quyền HR', confirmLabel: 'Thu hồi' })) return;
    try { await ctx.api.delete(`/api/admin/feed/hr-accounts/${a.id}`); ctx.notify('Đã thu hồi', 'success'); ctx.navigate(location.hash.slice(1)); } catch (err) { ctx.notify(err.message, 'error'); }
  };

  // --- bộ tài khoản demo cho khách hàng -------------------------------------------
  const showKit = (r) => {
    const origin = location.origin;
    const line = (label, email, password) => el('div.demokit__acc', {}, [
      el('strong', {}, label), el('code', {}, email), el('code', {}, password),
    ]);
    modal({
      title: `Bộ demo: ${r.company}`,
      width: 640,
      saveLabel: 'Tải trang truy cập (HTML)',
      rows: [
        [el('p.hint', { style: { margin: 0 } }, 'Mật khẩu chỉ hiện một lần. Tải trang truy cập để gửi khách: có đường dẫn + mã QR mở app trên điện thoại, đường dẫn Admin HR, tài khoản và gợi ý các luồng nên thử.')],
        [el('div.demokit', {}, [
          line('App người lao động', r.worker.email, r.worker.password),
          el('span.cellmeta', {}, `${origin}/app/?demo=1`),
          line('Admin HR', r.hr.email, r.hr.password),
          el('span.cellmeta', {}, `${origin}/admin/`),
        ])],
      ],
      onSave: () => { downloadDemoAccess({ origin, ...r }); return false; },
    });
  };
  const makeKit = (preset = '') => {
    const company = textField({ label: 'Tên công ty demo', value: preset, placeholder: 'VD: Demo – Công ty May Hưng Thịnh' });
    modal({
      title: preset ? 'Tạo lại bộ demo' : 'Tạo bộ demo cho khách hàng',
      width: 560,
      saveLabel: preset ? 'Đổi mật khẩu & nạp lại dữ liệu mẫu' : 'Tạo bộ demo',
      rows: [[company], [el('p.hint', { style: { margin: 0 } }, preset
        ? 'Mật khẩu cũ hết hiệu lực; dữ liệu mẫu được nạp lại (góp ý khách tự gửi vẫn giữ).'
        : 'Tạo một công ty mẫu + tài khoản người lao động (app điện thoại) + tài khoản HR (Admin), kèm ~50 góp ý / chia sẻ mẫu. Người dùng mẫu được tính vào số liệu chung — xoá bộ demo khi khách dùng xong.')]],
      onSave: async () => {
        try {
          const r = await ctx.api.post('/api/admin/feed/demo-kits', { company: company.get() });
          setTimeout(() => showKit(r), 50);
        } catch (err) { ctx.notify(err.message, 'error'); return false; }
        return true;
      },
    });
  };
  const dropKit = async (k) => {
    if (!await confirmAction(`Xoá bộ demo "${k.company}"? Tài khoản người lao động, HR và toàn bộ dữ liệu mẫu của công ty này bị xoá.`, { title: 'Xoá bộ demo', confirmLabel: 'Xoá' })) return;
    try { await ctx.api.delete(`/api/admin/feed/demo-kits/${encodeURIComponent(k.slug)}`); ctx.notify('Đã xoá bộ demo', 'success'); ctx.navigate(location.hash.slice(1)); } catch (err) { ctx.notify(err.message, 'error'); }
  };

  const minGroup = el('input', { type: 'number', min: '1', max: '50', value: String(settings.minGroup), style: { width: '80px' } });
  const saveMin = async () => {
    try {
      await ctx.api.put('/api/admin/feed/settings', { employer: employer && employer !== '__none__' ? employer : null, minGroup: Number(minGroup.value) });
      ctx.notify('Đã lưu ngưỡng ẩn danh', 'success');
      ctx.navigate(location.hash.slice(1));
    } catch (err) { ctx.notify(err.message, 'error'); }
  };

  return el('div.panel', { style: { marginTop: '16px' } }, [
    el('div.panel__head', {}, [el('h2', {}, 'Quản lý (chỉ quản trị Ekko)')]),
    el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' } }, [
      el('span', {}, employer && employer !== '__none__' ? 'Ngưỡng ẩn danh của công ty đang chọn' : 'Ngưỡng ẩn danh mặc định (mọi công ty)'), minGroup, el('span', {}, 'người'),
      el('button.ekko-btn.ekko-btn--secondary.ekko-btn--sm', { type: 'button', onclick: saveMin }, 'Lưu'),
      el('span.hint', {}, 'Từ khoá / nhóm vấn đề chỉ hiện cho doanh nghiệp khi có từ ngần này người.'),
    ]),
    el('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '8px' } }, [
      el('h3', { style: { margin: 0, flex: '1' } }, `Tài khoản HR doanh nghiệp (${accounts.length})`),
      el('button.ekko-btn.ekko-btn--primary.ekko-btn--sm', { type: 'button', onclick: add }, 'Thêm tài khoản HR'),
    ]),
    table(
      [{ label: 'HR' }, { label: 'Công ty' }, { label: 'Tạo lúc' }, { label: 'Dùng gần nhất' }, { label: '' }],
      accounts,
      (a) => el('tr', {}, [
        el('td', {}, [el('strong', {}, a.name), el('span.cellmeta', {}, a.email)]),
        el('td', {}, a.employer_name),
        el('td', {}, formatDay(a.created_at.slice(0, 10))),
        el('td', {}, a.last_used ? formatDay(a.last_used.slice(0, 10)) : 'Chưa'),
        el('td', {}, el('button.ekko-btn.ekko-btn--secondary.ekko-btn--sm', { type: 'button', onclick: () => revoke(a) }, 'Thu hồi')),
      ]),
    ),
    el('div', { style: { display: 'flex', alignItems: 'center', margin: '20px 0 8px' } }, [
      el('div', { style: { flex: '1' } }, [
        el('h3', { style: { margin: 0 } }, `Bộ demo cho khách hàng (${kits.length})`),
        el('span.hint', {}, 'Một nút: công ty mẫu + tài khoản app người lao động + tài khoản Admin HR + dữ liệu mẫu, kèm trang truy cập HTML để gửi khách.'),
      ]),
      el('button.ekko-btn.ekko-btn--primary.ekko-btn--sm', { type: 'button', onclick: () => makeKit() }, 'Tạo bộ demo'),
    ]),
    kits.length ? table(
      [{ label: 'Công ty demo' }, { label: 'Tài khoản' }, { label: 'Cập nhật' }, { label: 'Dùng gần nhất' }, { label: '' }],
      kits,
      (k) => el('tr', {}, [
        el('td', {}, el('strong', {}, k.company)),
        el('td', {}, [el('span.cellmeta', {}, k.worker_email || '—'), el('span.cellmeta', {}, k.hr_email || '—')]),
        el('td', {}, formatDay(k.updated_at.slice(0, 10))),
        el('td', {}, k.last_seen ? formatDay(k.last_seen.slice(0, 10)) : 'Chưa dùng'),
        el('td', {}, el('div', { style: { display: 'flex', gap: '6px' } }, [
          el('button.ekko-btn.ekko-btn--secondary.ekko-btn--sm', { type: 'button', onclick: () => makeKit(k.company) }, 'Tạo lại'),
          el('button.ekko-btn.ekko-btn--secondary.ekko-btn--sm', { type: 'button', onclick: () => dropKit(k) }, 'Xoá'),
        ])),
      ]),
    ) : null,
  ]);
}
