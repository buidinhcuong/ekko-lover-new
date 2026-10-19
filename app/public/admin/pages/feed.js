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
  const go = (d) => ctx.navigate(`/feed?days=${d}${meta.ekko && employer ? `&employer=${encodeURIComponent(employer)}` : ''}`);
  const reload = () => go(days);

  // --- trả lời (một tin hoặc cả nhóm) --------------------------------------------
  const openReply = (postIds, title) => {
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
          await ctx.api.post('/api/admin/feed/reply', { postIds, text: text.get() });
          ctx.notify('Đã gửi trả lời', 'success');
          reload();
        } catch (err) { ctx.notify(err.message, 'error'); return false; }
        return true;
      },
    });
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
  const stats = el('div.stat-grid', {}, [
    stat('Góp ý', String(t.posts), t.belowThreshold ? `${t.belowThreshold} góp ý thuộc nhóm dưới ${report.minGroup} người (không hiện từ khoá / nhóm)` : null),
    stat('Người góp ý', String(t.people)),
    stat('Đã phản hồi', pct(t.replied)),
    stat('Cảm xúc chung', mood(t.sentiment), `điểm ${t.sentiment.toLocaleString('vi-VN')} (−1 đến 1)`),
  ]);

  // --- đám mây từ khoá: chữ to theo số NGƯỜI nhắc ---------------------------------
  const cloud = el('div.panel', {}, [
    el('div.panel__head', {}, [el('h2', {}, 'Từ khoá được nhắc nhiều'), el('span.cellmeta', {}, 'chữ càng to = càng nhiều người nhắc')]),
    report.keywords.length
      ? el('div.wordcloud', {}, report.keywords.map((k) => el('span.wordcloud__word', {
        style: { fontSize: `${Math.round(14 + k.weight * 30)}px`, opacity: String(0.55 + k.weight * 0.45) },
        title: `${k.text}: ${k.people} người, ${k.posts} góp ý${k.trend === null ? '' : ` · ${k.trend >= 0 ? '+' : ''}${k.trend}% so với kỳ trước`}`,
      }, k.text)))
      : el('p.hint', {}, `Chưa có từ khoá nào được từ ${report.minGroup} người trở lên cùng nhắc (ngưỡng ẩn danh).`),
  ]);

  // --- nhóm vấn đề cần giải quyết -------------------------------------------------
  const issues = el('div.panel', {}, [
    el('div.panel__head', {}, [el('h2', {}, 'Vấn đề cần giải quyết'), el('span.cellmeta', {}, `nhóm có từ ${report.minGroup} người · xếp theo mức ưu tiên`)]),
    report.issues.length
      ? el('div.issuelist', {}, report.issues.map((i) => el('div.issue', {}, [
        el('div.issue__head', {}, [
          badge(...PRIORITY[i.priority]),
          el('strong', {}, i.title),
        ]),
        el('div.cellmeta', {}, `${topicLabel[i.topic] || i.topic}${i.keyword ? ` · "${i.keyword}"` : ''} · ${i.people} người · ${i.posts} góp ý · ${mood(i.sentiment)} · đã trả lời ${i.replied}/${i.posts}`),
        i.quotes.length ? el('ul.issue__quotes', {}, i.quotes.map((x) => el('li', {}, x))) : null,
        el('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } }, [
          el('button.ekko-btn.ekko-btn--primary.ekko-btn--sm', { type: 'button', onclick: () => openReply(i.postIds, `Trả lời nhóm: ${i.title}`) }, `Trả lời cả nhóm (${i.posts})`),
        ]),
      ])))
      : el('p.hint', {}, `Chưa có nhóm vấn đề nào đủ ${report.minGroup} người.`),
  ]);

  const bars = (rows) => {
    if (!rows.length) return el('p.hint', {}, 'Chưa có dữ liệu.');
    const max = Math.max(1, ...rows.map((r) => r.posts));
    return el('div.bars', {}, rows.map((r) => el('div.barrow.barrow--wide', {}, [
      el('span', {}, r.label),
      el('span.barrow__track', {}, [el('span.barrow__fill', { style: { width: `${Math.round((r.posts / max) * 100)}%`, display: 'block' } })]),
      el('span.barrow__value', {}, [`${r.posts}`, el('span.cellmeta', { style: { display: 'inline', marginLeft: '4px' } }, `· ${r.people} người`)]),
    ])));
  };
  const breakdown = el('div.split', { style: { marginTop: '16px' } }, [
    el('div.panel', {}, [el('div.panel__head', {}, [el('h2', {}, 'Theo chủ đề')]), bars(report.byTopic)]),
    el('div.panel', {}, [el('div.panel__head', {}, [el('h2', {}, 'Theo loại')]), bars(report.byType)]),
  ]);

  // --- danh sách góp ý ------------------------------------------------------------
  const statusFilter = el('select', {}, [el('option', { value: '' }, 'Mọi trạng thái'), ...meta.statuses.map((s) => el('option', { value: s.code }, s.label))]);
  const topicFilter = el('select', {}, [el('option', { value: '' }, 'Mọi chủ đề'), ...meta.topics.map((s) => el('option', { value: s.code }, s.label))]);
  const listHost = el('div');
  const drawList = () => {
    const rows = posts.filter((p) => (!statusFilter.value || p.status === statusFilter.value) && (!topicFilter.value || p.topic === topicFilter.value));
    listHost.replaceChildren(table(
      [{ label: 'Ngày' }, { label: 'Góp ý' }, { label: 'Người gửi' }, { label: 'Trạng thái' }, { label: '' }],
      rows,
      (p) => el('tr', {}, [
        el('td', {}, [formatDay(p.createdAt.slice(0, 10)), meta.ekko && p.company ? el('span.cellmeta', {}, p.company) : null]),
        el('td', { style: { maxWidth: '520px' } }, [
          el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' } }, [
            badge(typeLabel[p.type] || p.type, p.type === 'complaint' ? 'warning' : p.type === 'praise' ? 'success' : 'neutral'),
            badge(topicLabel[p.topic] || p.topic, 'brand'),
            p.urgency === 'urgent' || p.urgency === 'high' ? badge(PRIORITY[p.urgency][0], PRIORITY[p.urgency][1]) : null,
            p.sensitive ? badge('Nhạy cảm', 'error') : null,
          ]),
          el('div', { style: { whiteSpace: 'pre-wrap' } }, p.text),
          ...p.replies.map((r) => el('div.feedreply-admin', {}, [el('b', {}, r.by === 'hr' ? 'Doanh nghiệp: ' : 'Ekko: '), r.text, el('span.cellmeta', { style: { display: 'inline', marginLeft: '6px' } }, formatDay(r.createdAt.slice(0, 10)))])),
        ]),
        el('td', {}, p.author ? [el('strong', {}, p.author.name), el('span.cellmeta', {}, p.author.email || '')] : el('span.cellmeta', {}, 'Ẩn danh')),
        el('td', {}, el('select', {
          onchange: async (e) => {
            try { await ctx.api.patch(`/api/admin/feed/posts/${p.id}`, { status: e.target.value }); ctx.notify('Đã đổi trạng thái', 'success'); } catch (err) { ctx.notify(err.message, 'error'); }
          },
        }, meta.statuses.map((s) => el('option', { value: s.code, selected: s.code === p.status }, s.label)))),
        el('td', {}, el('button.ekko-btn.ekko-btn--secondary.ekko-btn--sm', { type: 'button', onclick: () => openReply([p.id], 'Trả lời góp ý') }, 'Trả lời')),
      ]),
    ));
  };
  statusFilter.addEventListener('change', drawList);
  topicFilter.addEventListener('change', drawList);
  drawList();
  const list = el('div.panel', { style: { marginTop: '16px' } }, [
    el('div.panel__head', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [el('h2', { style: { flex: '1' } }, `Các góp ý (${posts.length})`), statusFilter, topicFilter]),
    el('p.hint', { style: { margin: '0 0 12px' } }, 'Nội dung đã được che số điện thoại, CCCD, số tài khoản và tên người được nhắc tới. Tên người gửi chỉ hiện khi họ tự chọn ghi tên.'),
    listHost,
  ]);

  return el('div', {}, [
    head, stats,
    el('div.split', {}, [cloud, issues]),
    breakdown, list,
    meta.ekko ? await managePanel(ctx, employer) : null,
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
