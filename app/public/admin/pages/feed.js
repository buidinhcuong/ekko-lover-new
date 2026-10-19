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
import { badge, companyPicker, confirmAction, hashParams, modal, table, textAreaField, textField, selectField } from '../ui.js';

const PRIORITY = { urgent: ['Khẩn', 'error'], high: ['Cao', 'warning'], medium: ['Trung bình', 'brand'], low: ['Thấp', 'neutral'] };
const PERIODS = [7, 30, 90];

const pct = (x) => `${Math.round((x || 0) * 100)}%`;
const mood = (s) => (s <= -0.5 ? 'Rất tiêu cực' : s < -0.15 ? 'Tiêu cực' : s <= 0.15 ? 'Trung lập' : s < 0.5 ? 'Tích cực' : 'Rất tích cực');
const stat = (label, value, hint) => el('div.stat', {}, [
  el('div.stat__label', {}, label), el('div.stat__value', {}, value), hint ? el('div.stat__hint', {}, hint) : null,
]);

export default async function feedPage(ctx) {
  const params = hashParams();
  const days = Number(params.get('days')) || 30;
  const employer = params.get('employer') || '';
  // Hai tab con: Báo cáo chung · Phản hồi (giữ trên hash: #/feed?tab=reply).
  const tab = params.get('tab') === 'reply' ? 'reply' : 'report';
  const meta = await ctx.api.get('/api/admin/feed/meta');
  const q = (extra = '') => `days=${days}${meta.ekko && employer ? `&employer=${encodeURIComponent(employer)}` : ''}${extra}`;
  const [report, posts, picker] = await Promise.all([
    ctx.api.get(`/api/admin/feed/report?${q()}`),
    ctx.api.get(`/api/admin/feed/posts?${q()}`),
    meta.ekko ? companyPicker(ctx, '/feed') : Promise.resolve(null),
  ]);
  const topicLabel = Object.fromEntries(meta.topics.map((x) => [x.code, x.label]));
  const typeLabel = Object.fromEntries(meta.types.map((x) => [x.code, x.label]));
  const statusLabel = Object.fromEntries(meta.statuses.map((x) => [x.code, x.label]));
  const go = (d, toTab = tab) => ctx.navigate(`/feed?days=${d}${meta.ekko && employer ? `&employer=${encodeURIComponent(employer)}` : ''}${toTab === 'reply' ? '&tab=reply' : ''}`);
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
    return el('div.replyitem', {}, [
      el('div.cellmeta', {}, `${formatDay(p.createdAt.slice(0, 10))} · ${p.author ? p.author.name : 'Ẩn danh'} · ${statusLabel[p.status] || p.status}${meta.ekko && p.company ? ` · ${p.company}` : ''}`),
      el('div', { style: { whiteSpace: 'pre-wrap' } }, p.text),
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
      return el('div.issue', {}, [
        el('div.issue__head', {}, [
          badge(issueLabel[i.status] || i.status, ISSUE_TONE[i.status]),
          badge(...PRIORITY[i.priority]),
          el('strong', {}, i.title),
        ]),
        el('div.cellmeta', {}, `${meta.ekko && i.company ? `${i.company} · ` : ''}${topicLabel[i.topic] || i.topic}${i.keyword ? ` · "${i.keyword}"` : ''} · ${i.people} người · ${i.posts} góp ý · ${mood(i.sentiment)} · đã trả lời ${i.replied}/${i.posts}`),
        el('div.issue__mgmt', {}, [
          el('span', {}, `Phụ trách: ${i.owner || 'chưa giao'}`),
          i.dueOn ? el(`span${overdue ? '.is-overdue' : ''}`, {}, `Hạn: ${formatDay(i.dueOn)}${overdue ? ' (quá hạn)' : ''}`) : null,
          i.newSinceResolved ? el('span.is-overdue', {}, `${i.newSinceResolved} góp ý mới sau khi giải quyết`) : null,
        ]),
        i.quotes.length ? el('ul.issue__quotes', {}, i.quotes.map((x) => el('li', {}, x))) : null,
        el('div', { style: { display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' } }, [
          el('button.ekko-btn.ekko-btn--primary.ekko-btn--sm', { type: 'button', onclick: () => openIssue(i.key) }, 'Quản lý'),
          el('button.ekko-btn.ekko-btn--secondary.ekko-btn--sm', { type: 'button', onclick: () => openReply(i.postIds, `Trả lời nhóm: ${i.title}`, i.key) }, `Trả lời cả nhóm (${i.posts})`),
          el('button.ekko-btn.ekko-btn--secondary.ekko-btn--sm', { type: 'button', onclick: () => openIndividualIssue(i.key, i.title) }, 'Trả lời từng người'),
        ]),
      ]);
    }) : [el('p.hint', {}, report.issues.length ? 'Không có vấn đề nào ở mục này.' : `Chưa có nhóm vấn đề nào đủ ${report.minGroup} người.`)]));
  };

  /** Màn quản lý một vấn đề: trạng thái, phụ trách, hạn, ghi chú nội bộ, các góp ý, lịch sử. */
  const openIssue = async (key) => {
    let d;
    try { d = await ctx.api.get(`/api/admin/feed/issue?key=${encodeURIComponent(key)}`); } catch (err) { ctx.notify(err.message, 'error'); return; }
    const title = textField({ label: 'Tiêu đề vấn đề', value: d.title });
    const status = selectField({ label: 'Trạng thái', value: d.status, options: meta.issueStatuses.map((x) => [x.code, x.label]),
      hint: 'Đang xử lý → người gửi thấy "Đang xử lý". Đã giải quyết → góp ý của họ chuyển "Đã đóng".' });
    const owner = textField({ label: 'Người phụ trách', value: d.owner || '', placeholder: 'VD: Chị Hà — Phòng Nhân sự' });
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
  const shareGroups = meta.topics
    .map((tp) => ({ ...tp, list: shares.filter((p) => p.topic === tp.code) }))
    .filter((g) => g.list.length)
    .sort((a, b) => b.list.length - a.list.length);
  const shareRead = el('div.panel', {}, [
    el('div.panel__head', {}, [el('h2', {}, 'Các chia sẻ theo chủ đề'), el('span.cellmeta', {}, 'chỉ để đọc — Chia sẻ không cần phản hồi')]),
    shareGroups.length
      ? el('div.sharegroups', {}, shareGroups.map((g, idx) => el('details.sharegroup', idx === 0 ? { open: true } : {}, [
        el('summary', {}, [el('strong', {}, g.label), el('span.cellmeta', { style: { display: 'inline', marginLeft: '8px' } }, `${g.list.length} chia sẻ`)]),
        el('ul.sharelist', {}, g.list.map((p) => el('li', {}, [
          el('span', {}, p.text),
          el('span.cellmeta', { style: { display: 'inline', marginLeft: '6px' } }, `${formatDay(p.createdAt.slice(0, 10))}${p.author ? ` · ${p.author.name}` : ''}`),
        ]))),
      ])))
      : el('p.hint', {}, 'Chưa có chia sẻ nào trong kỳ.'),
  ]);

  /** Một phần báo cáo (Góp ý hoặc Chia sẻ) — cùng cấu trúc: số liệu, từ khoá, theo chủ đề. */
  const sectionBlock = ({ code, title, hint, sec, right, chips }) => el('section.feedsection', { dataset: { type: code } }, [
    el('div.feedsection__head', {}, [
      el('h2', {}, title),
      el('span.cellmeta', {}, hint),
    ]),
    el('div.feedsection__chips', {}, chips.map(([label, value]) => el('span.feedchip', {}, [el('small', {}, label), el('b', {}, value)]))),
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
      : [issues, loosePanel]),
  ]);
}

/** Quản trị Ekko: tài khoản HR doanh nghiệp + ngưỡng ẩn danh. */
async function managePanel(ctx, employer) {
  const [accounts, companies, settings] = await Promise.all([
    ctx.api.get('/api/admin/feed/hr-accounts'),
    ctx.api.get('/api/admin/stats/companies'),
    ctx.api.get(`/api/admin/feed/settings${employer ? `?employer=${encodeURIComponent(employer)}` : ''}`),
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
  ]);
}
