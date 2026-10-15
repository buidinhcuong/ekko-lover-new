/**
 * Sử dụng AI: token và chi phí Claude theo người dùng, tính năng, ngày
 * (services/aiUsage.js). Chỉ số đếm — không có nội dung người dùng hỏi.
 * Kỳ xem (7 / 30 / 90 ngày) nằm trên hash: #/ai-usage?days=30.
 */
import { el, formatDay } from '/shared/client.js';
import { badge, barChart, companyPicker, hashParams, table } from '../ui.js';

const KIND_LABEL = { bot: 'Ekko bot', quick: 'Ghi nhanh', receipt: 'Đọc hoá đơn', advice: 'Tư vấn mục tiêu' };
const LEVEL = {
  rat_nhieu: ['Rất nhiều', 'error'],
  nhieu: ['Nhiều', 'warning'],
  trung_binh: ['Trung bình', 'neutral'],
  it: ['Ít', 'success'],
};
const PERIODS = [7, 30, 90];

const int = (n) => Math.round(n || 0).toLocaleString('vi-VN');
const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr` : n >= 1e3 ? `${(n / 1e3).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} k` : int(n));
const usd = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: n > 0 && n < 0.01 ? 4 : 2, maximumFractionDigits: n > 0 && n < 0.01 ? 4 : 2 })}`;
const vnd = (n, rate) => `≈ ${Math.round((n || 0) * rate).toLocaleString('vi-VN')}đ`;
const pct = (x) => `${(x * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;

const stat = (label, value, hint) => el('div.stat', {}, [
  el('div.stat__label', {}, label),
  el('div.stat__value', {}, value),
  hint ? el('div.stat__hint', {}, hint) : null,
]);

export default async function aiUsage(ctx) {
  const params = hashParams();
  const days = Number(params.get('days')) || 30;
  const employer = params.get('employer') || '';
  const withCompany = (d) => `/ai-usage?days=${d}${employer ? `&employer=${encodeURIComponent(employer)}` : ''}`;
  const [r, picker] = await Promise.all([
    ctx.api.get(`/api/admin/ai-usage?days=${days}${employer ? `&employer=${encodeURIComponent(employer)}` : ''}`),
    companyPicker(ctx, '/ai-usage'),
  ]);
  const rate = r.usdVnd;
  const t = r.totals;
  const unmeasured = t.calls - t.measured;

  const periodChips = el('div', { style: { display: 'flex', gap: '6px' } }, PERIODS.map((d) => el(
    `button.ekko-btn.ekko-btn--sm.${d === r.days ? 'ekko-btn--primary' : 'ekko-btn--secondary'}`,
    { type: 'button', onclick: () => ctx.navigate(withCompany(d)) },
    `${d} ngày`,
  )));

  // --- chi phí theo ngày ---------------------------------------------------
  const maxDay = Math.max(...r.daily.map((d) => d.cost), 0);
  const labelEvery = r.days > 31 ? 7 : r.days > 14 ? 3 : 1;
  const peakDay = r.daily.reduce((a, b) => (b.cost > a.cost ? b : a), r.daily[0]);
  const chart = barChart(r.daily.map((d) => ({
    label: d.day.slice(8),
    value: d.cost,
    detail: `${formatDay(d.day)}: ${usd(d.cost)} · ${d.calls} lượt · ${d.users} người`,
  })), { format: usd, height: 220, labelEvery });
  if (r.days > 31) chart.classList.add('barchart--dense');
  const dailyPanel = el('div.panel', {}, [
    el('div.panel__head', {}, [el('h2', {}, 'Chi phí AI theo ngày')]),
    maxDay > 0
      ? el('div', {}, [
        el('div.chartsum', {}, [
          el('div', {}, [el('small', {}, 'Hôm nay'), el('b', {}, usd(r.daily.at(-1).cost))]),
          el('div', {}, [el('small', {}, 'Trung bình / ngày'), el('b', {}, usd(t.cost / r.days))]),
          el('div', {}, [el('small', {}, 'Cao nhất'), el('b', {}, `${usd(peakDay.cost)} · ${formatDay(peakDay.day)}`)]),
        ]),
        chart,
      ])
      : el('p.hint', {}, 'Chưa có lượt gọi AI nào được đo token trong kỳ này.'),
  ]);

  // --- theo tính năng ------------------------------------------------------
  const maxKind = Math.max(...r.byKind.map((k) => k.cost), 0) || 1;
  const kindPanel = el('div.panel', {}, [
    el('div.panel__head', {}, [el('h2', {}, 'Theo tính năng')]),
    r.byKind.length
      ? el('div.bars', {}, r.byKind.map((k) => el('div.barrow', {}, [
        el('span', {}, [KIND_LABEL[k.kind] || k.kind, el('span.cellmeta', {}, `${int(k.calls)} lượt · ${compact(k.input + k.output + k.cacheRead + k.cacheWrite)} token`)]),
        el('span.barrow__track', {}, [el('span.barrow__fill', { style: { width: `${Math.round((k.cost / maxKind) * 100)}%`, display: 'block' } })]),
        el('span.barrow__value', {}, usd(k.cost)),
      ])))
      : el('p.hint', {}, 'Chưa có lượt gọi nào.'),
    r.byModel.length ? el('p.hint', { style: { marginTop: '12px' } }, `Model: ${r.byModel.map((m) => `${m.model} (${int(m.calls)} lượt${m.priceKnown ? '' : ', giá ước tính'})`).join(' · ')}`) : null,
  ]);

  // --- từng người dùng -----------------------------------------------------
  const search = el('input', { type: 'search', placeholder: 'Tìm theo tên, email hoặc công ty' });
  const levelFilter = el('select', {}, [
    el('option', { value: '' }, 'Mọi mức dùng'),
    ...Object.entries(LEVEL).map(([code, [label]]) => el('option', { value: code }, label)),
  ]);
  // Mặc định 10 người tốn nhất; chọn thêm 100 / 200.
  const pageSize = el('select', {}, [10, 100, 200].map((n) => el('option', { value: String(n) }, `Hiện ${n} người`)));
  const shownNote = el('p.hint', { style: { margin: '8px 0 0' } });
  const listHost = el('div');
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const rows = r.users.filter((u) => (!levelFilter.value || u.level === levelFilter.value)
      && (!q || [u.name, u.email, u.employer].filter(Boolean).some((v) => v.toLowerCase().includes(q))));
    const shown = rows.slice(0, Number(pageSize.value));
    shownNote.textContent = rows.length > shown.length
      ? `Đang hiện ${shown.length} / ${rows.length} người — chọn "Hiện ${pageSize.value === '10' ? 100 : 200} người" để xem thêm.`
      : rows.length ? `Đang hiện cả ${rows.length} người.` : '';
    listHost.replaceChildren(rows.length ? table(
      [{ label: 'Người dùng' }, { label: 'Mức dùng' }, { label: 'Lượt', align: 'right' }, { label: 'Token vào', align: 'right' }, { label: 'Token ra', align: 'right' }, { label: 'TB / lượt', align: 'right' }, { label: 'Chi phí', align: 'right' }, { label: 'Tính năng' }, { label: 'Chạm giới hạn', align: 'right' }],
      shown,
      (u) => el('tr', {}, [
        el('td', {}, [el('strong', {}, u.name), el('span.cellmeta', {}, [u.email, u.employer].filter(Boolean).join(' · ') || '—')]),
        el('td', {}, badge(...LEVEL[u.level])),
        el('td.num', {}, [int(u.calls), el('span.cellmeta', {}, `${u.activeDays} ngày`)]),
        el('td.num', {}, [compact(u.input + u.cacheRead + u.cacheWrite), u.cacheRead ? el('span.cellmeta', {}, `cache ${compact(u.cacheRead)}`) : null]),
        el('td.num', {}, compact(u.output)),
        el('td.num', {}, compact(u.avgTokens)),
        el('td.num', {}, [el('strong', {}, usd(u.cost)), el('span.cellmeta', {}, `${pct(u.share)} tổng · ${vnd(u.cost, rate)}`)]),
        el('td', {}, el('span.cellmeta', { style: { display: 'block' } }, u.byKind.map((k) => `${KIND_LABEL[k.kind] || k.kind} ${k.calls}`).join(' · '))),
        el('td.num', {}, u.limitDays ? `${u.limitDays} ngày` : '—'),
      ]),
    ) : el('p.hint', {}, 'Không có người dùng nào khớp.'));
  };
  search.addEventListener('input', draw);
  levelFilter.addEventListener('change', draw);
  pageSize.addEventListener('change', draw);
  draw();

  // --- tỷ giá ----------------------------------------------------------------
  const rateInput = el('input', { type: 'number', min: '1000', max: '100000', step: '100', value: String(rate), style: { width: '120px' } });
  const saveRate = async () => {
    try {
      await ctx.api.put('/api/admin/settings/usd-vnd', { rate: Number(rateInput.value) });
      ctx.notify('Đã lưu tỷ giá', 'success');
      ctx.navigate(withCompany(r.days));
    } catch (err) { ctx.notify(err.message, 'error'); }
  };

  const th = r.thresholds;
  return el('div', {}, [
    el('div.page-head', {}, [
      el('div', { style: { flex: '1' } }, [
        el('h1', {}, 'Sử dụng AI'),
        el('p', {}, `Token và chi phí Claude của từng người dùng, ${formatDay(r.from)} – ${formatDay(r.to)}. Chỉ số đếm, không lưu nội dung người dùng hỏi.`),
      ]),
      el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, [picker, periodChips]),
    ]),

    el('div.stat-grid', {}, [
      stat('Chi phí AI', usd(t.cost), `${vnd(t.cost, rate)} · tỷ giá ${int(rate)}`),
      stat('Lượt gọi AI', int(t.calls), unmeasured > 0 ? `${int(unmeasured)} lượt chưa có số token (lỗi, hoặc trước khi bật đo)` : `${int(t.users)} người dùng`),
      stat('Token', compact(t.tokens), `vào ${compact(t.input + t.cacheRead + t.cacheWrite)} · ra ${compact(t.output)}`),
      stat('Trung bình mỗi người', usd(t.users ? t.cost / t.users : 0), `${t.users ? int(t.calls / t.users) : 0} lượt / người`),
    ]),

    el('div.split', {}, [dailyPanel, kindPanel]),

    el('div.panel', { style: { marginTop: '16px' } }, [
      el('div.panel__head', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, [
        el('h2', { style: { flex: '1' } }, `Theo người dùng (${r.users.length})`),
        levelFilter, pageSize, search,
      ]),
      el('p.hint', { style: { margin: '0 0 12px' } }, [
        'Mức dùng so với những người cùng dùng AI trong kỳ, theo chi phí: ',
        el('b', {}, 'Rất nhiều'), ` ≥ 3 lần trung vị (${usd(th.median)})`, r.users.length >= 10 ? ` hoặc 10% cao nhất (≥ ${usd(th.p90)})` : '', ' · ',
        el('b', {}, 'Nhiều'), ` ≥ ${usd(th.p75)} · `,
        el('b', {}, 'Ít'), ` ≤ ${usd(th.p25)}. `,
        r.limit ? `"Chạm giới hạn" = số ngày dùng hết ${r.limit} lượt/ngày.` : 'Hiện không giới hạn lượt/ngày.',
      ]),
      listHost,
      shownNote,
    ]),

    el('div.panel', { style: { marginTop: '16px' } }, [
      el('div.panel__head', {}, [el('h2', {}, 'Cách tính chi phí')]),
      el('p.hint', { style: { margin: '0 0 12px' } }, 'Theo bảng giá công khai của Anthropic cho model thực chạy (vd Claude Sonnet 5.5: $2 / 1 triệu token vào, $10 / 1 triệu token ra, $0,20 / 1 triệu token đọc từ cache). Đây là ước tính để so sánh — số tiền thật xem ở hoá đơn trên console Anthropic.'),
      el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
        el('span', {}, 'Tỷ giá USD → VND'), rateInput,
        el('button.ekko-btn.ekko-btn--secondary.ekko-btn--sm', { type: 'button', onclick: saveRate }, 'Lưu tỷ giá'),
      ]),
    ]),
  ]);
}
