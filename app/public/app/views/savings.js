/**
 * Tiết kiệm.
 *
 * Một màn duy nhất (không có tab): các nguồn tiết kiệm người dùng đang theo
 * dõi (tự thêm tay hoặc gửi qua Ekko), cộng nút "+ Thêm nguồn tiết kiệm" cho
 * nguồn tự do (số tiền, kênh, lãi suất %/tháng hoặc %/năm).
 *
 * "Gửi tiết kiệm cùng Ekko" (mô phỏng luồng gửi tiết kiệm online: chọn kỳ
 * hạn, chọn đối tác theo lãi suất, xem lãi dự kiến, "Tiếp tục" tạo một nguồn
 * tiết kiệm mới, không có dòng tiền thật nào bị trừ) không phải một tab hay
 * một màn riêng — nó là MỘT banner ở cuối màn, có mascot Ekko bot, mở sheet
 * khi bấm vào. "Tính thử tiền lãi" lại là một dòng gợi ý bên trong sheet đó.
 */
import { api, dataIcon, el, formatDay, guard, mount, singleFlight, spriteIcon, toast, uiIcon, vnd, vndShort } from '/shared/client.js';
import { celebrateRewards, closeSheet, confirmSheet, moneyInput, readMoney, sheet, swipeRow } from '../ui.js';
import { getLang, t } from '../i18n.js';

const annualRate = (ratePercent, ratePeriod) => (ratePeriod === 'month' ? ratePercent * 12 : ratePercent);
const projectedInterest = (amount, ratePercent, ratePeriod, termMonths = 12) => Math.round(
  amount * (annualRate(ratePercent, ratePeriod) / 100) * (termMonths / 12),
);

/** Cộng tháng trên chuỗi YYYY-MM-DD, giữ nguyên ngày (kẹp lại nếu tháng đích ngắn hơn). */
function addMonths(day, months) {
  const [y, m, d] = day.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/** Nguồn "recap" lưu tháng thô (YYYY-MM) ở `note` — format lại theo ngôn ngữ đang chọn. */
const monthLabel = (month) => {
  const [y, m] = month.split('-');
  if (getLang() === 'en') {
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(Number(y), Number(m) - 1, 1)));
  }
  return `Tháng ${Number(m)}/${y}`;
};

const SOURCE_ICON = { manual: 'money-bag-02', ekko: 'bank', recap: 'piggy-bank' };

/** Logo đối tác là ảnh thật (đường dẫn); chưa có ảnh thì dùng icon ngân hàng. */
const channelLogo = (logo) => (logo && logo.startsWith('/')
  ? el('img', { src: logo, alt: '' })
  : dataIcon(logo, 'bank', 24));

export default async function savingsView(ctx) {
  const board = el('div.skyboard');
  const [data0, gold, bankRates] = await Promise.all([
    api.get('/api/savings'),
    api.get('/api/market/gold'),
    api.get('/api/market/bank-rates'),
  ]);
  let data = data0;

  const reload = async () => { data = await api.get('/api/savings'); };
  const render = () => mount(board, ...body());

  function body() {
    const { sources, totals } = data;

    // Banner mascot dẫn sang "Gửi tiết kiệm cùng Ekko" — luôn hiện ở CUỐI
    // màn dù đã có nguồn hay chưa, vì đây là lối vào chính của tính năng.
    const ekkoCta = el('button.savingscta', { onclick: openDepositSheet }, [
      el('img.savingscta__mascot', { src: '/assets/mascot/ekko-bot.png', alt: '' }),
      el('div.savingscta__text', {}, [
        el('div.savingscta__title', {}, t('Gửi tiết kiệm cùng Ekko')),
        el('div.savingscta__sub', {}, t('Chọn kỳ hạn, xem lãi dự kiến ngay')),
      ]),
      el('span.savingscta__arrow', {}, [spriteIcon('chevron-right-01-stroke', 20)]),
    ]);

    if (!sources.length) {
      return [
        el('div.empty', {}, [
          el('img', { src: '/assets/lessons/muc-tieu-tiet-kiem.svg', alt: '' }),
          el('h3', {}, t('Chưa có nguồn tiết kiệm nào')),
          el('p.muted', {}, t('Thêm nguồn tiết kiệm bạn đang có, hoặc gửi tiết kiệm cùng Ekko để bắt đầu theo dõi lãi dự kiến.')),
          el('button.btn', { style: { marginTop: '16px' }, onclick: openAddManual }, t('+ Thêm nguồn tiết kiệm')),
        ]),
        ekkoCta,
        marketWidget(),
      ];
    }

    return [
      // Con số ấn tượng nằm NGOÀI khung thẻ, căn giữa màn hình — đây là điểm
      // nhìn đầu tiên của màn, nên nổi bật hẳn bằng gradient thương hiệu thay
      // vì chìm vào hàng "stat-row" nhỏ như các chi tiết khác bên dưới.
      el('div.savingshero', {}, [
        // Tổng hiện có đã gồm lãi cộng hằng tháng (server: balance).
        el('div.savingshero__amount', {}, vnd(totals.balance ?? totals.saved)),
        el('div.savingshero__label', {}, t('tổng đang tiết kiệm')),
        ctx.world.concept === 'lover' && totals.pendingInterest > 0
          ? el('div.savingshero__label', {}, t('Lãi dự kiến khi đáo hạn: +{amount}', { amount: vnd(totals.pendingInterest) }))
          : null,
      ]),
      ...sources.map((source) => sourceCard(source)),
      ctx.world.concept === 'lover' ? el('p.skynote.savinghint', {}, t('Vuốt một khoản sang trái để sửa hoặc xoá.')) : null,
      el('div.savingsactions', { style: { marginTop: 'var(--spacing-12)' } }, [
        el('button.btn.btn--ghost.savingsactions__btn.savingsactions__btn--add', { onclick: () => openManualForm(null, 'in') }, t('+ Thêm nguồn tiết kiệm')),
        el('button.btn.btn--ghost.savingsactions__btn.savingsactions__btn--withdraw', { onclick: () => openManualForm(null, 'out') }, t('− Rút tiết kiệm / Vay')),
      ]),
      ekkoCta,
      marketWidget(),
    ];
  }

  // ----------------------------------------------------------- thị trường
  /**
   * Giá vàng (API ngoài thật, server cache 5 phút) + lãi suất tiết kiệm tham
   * khảo của ngân hàng thật, đặt ngay dưới banner "Gửi tiết kiệm cùng Ekko".
   * Dữ liệu lấy MỘT LẦN lúc mở màn (không refetch mỗi lần render() nội bộ do
   * CRUD nguồn tiết kiệm — giá vàng/lãi suất không đổi trong một phiên xem).
   */
  function marketWidget() {
    const goldCard = el('div.card', { style: { marginTop: 'var(--spacing-16)' } }, [
      el('div.card__head', {}, [
        el('h3', {}, t('Giá vàng hôm nay')),
        gold.asOf ? el('small.muted', {}, gold.asOf) : null,
      ]),
      gold.ok && gold.items.length
        ? el('div', {}, gold.items.map((item) => goldRow(item)))
        : el('p.muted', {}, gold.error || t('Không tải được giá vàng lúc này')),
    ]);

    const groups = [
      { label: t('Ngân hàng nhà nước'), rows: bankRates.state || [] },
      { label: t('Ngân hàng cổ phần'), rows: bankRates.jointStock || [] },
    ].filter((g) => g.rows.length);
    const maxRate = Math.max(1, ...groups.flatMap((g) => g.rows.map((b) => Number(b.rates['12']) || 0)));

    const ratesCard = groups.length ? el('div.card', { style: { marginTop: 'var(--spacing-12)' } }, [
      el('div.card__head', {}, [el('h3', {}, t('Lãi suất tiết kiệm 12 tháng'))]),
      ...groups.map((g, gi) => el('div', { style: { marginTop: gi === 0 ? '0' : 'var(--spacing-16)' } }, [
        el('div.marketrates__grouplabel', {}, g.label),
        ...[...g.rows]
          .sort((a, b) => (Number(b.rates['12']) || 0) - (Number(a.rates['12']) || 0))
          .map((bank, i) => bankRateRow(bank, maxRate, i === 0)),
      ])),
      el('p.muted', { style: { fontSize: 'var(--font-size-text-xs)', marginTop: 'var(--spacing-10)' } },
        t('Số liệu tham khảo, ngân hàng có thể điều chỉnh theo từng thời điểm.')),
    ]) : null;

    return el('div', {}, [goldCard, ratesCard]);
  }

  function goldRow(item) {
    const isVnd = item.currency === 'VND';
    const fmt = (n) => (isVnd ? vndShort(n) : `$${n.toLocaleString('en-US', { maximumFractionDigits: 1 })}`);
    const change = item.changeBuy;
    const tone = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
    const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '—';

    return el('div.goldrow', {}, [
      el('div.goldrow__name', {}, item.name),
      el('div.goldrow__prices', {}, [
        el('div.goldrow__price', {}, [el('small', {}, t('Mua')), el('b', {}, fmt(item.buy))]),
        item.sell > 0 ? el('div.goldrow__price', {}, [el('small', {}, t('Bán')), el('b', {}, fmt(item.sell))]) : null,
      ]),
      el(`span.goldrow__change.goldrow__change--${tone}`, {}, `${arrow} ${fmt(Math.abs(change))}`),
    ]);
  }

  function bankRateRow(bank, maxRate, isTop) {
    const rate = Number(bank.rates['12']) || 0;
    return el('div.bankrate', {}, [
      el('span.bankrate__logo', {}, [channelLogo(bank.logo)]),
      el('div.bankrate__main', {}, [
        el('div.bankrate__name', {}, bank.name),
        el('div.bar', {}, [el('div.bar__fill', { style: { width: `${Math.round((rate / maxRate) * 100)}%` } })]),
      ]),
      el('span.bankrate__value.withicon', {}, [isTop ? uiIcon('award-01', 16) : null, `${rate}%`]),
    ]);
  }

  function sourceCard(source) {
    const isOut = source.direction === 'out';
    const sub = source.source === 'ekko'
      ? t('{rate}%/năm · kỳ hạn {term} tháng', { rate: source.rate_percent, term: source.term_months })
      : source.source === 'recap'
        ? t('Tiền còn lại {month}', { month: source.note ? monthLabel(source.note) : t('tháng trước') })
        : source.rate_percent > 0
          ? t('{rate}% {period}', { rate: source.rate_percent, period: source.rate_period === 'month' ? t('/tháng') : t('/năm') })
          : t('Không có lãi suất');

    const remove = async () => {
      const ok = await confirmSheet({
        title: t('Xoá nguồn tiết kiệm'),
        message: t('Xoá "{name}"?', { name: source.channel_name }),
      });
      if (!ok) return;
      if (!await guard(() => api.delete(`/api/savings/${source.id}`), t('Không xoá được'))) return;
      toast(t('Đã xoá'));
      await reload();
      render();
    };

    // Ekko Lover: số dư, dòng gốc + lãi khi đáo hạn; vuốt sang trái để Sửa / Xoá
    // (mọi loại khoản, cùng kiểu vuốt với Ghi chép chi tiêu).
    if (ctx.world.concept === 'lover') {
      const sign = isOut ? '-' : '';
      const body = el('div.savingcard__body', {}, [
        el('div.row', {}, [
          el('span.row__icon', {}, uiIcon(isOut ? 'money-send-01' : (SOURCE_ICON[source.source] || 'money-bag-02'), 20)),
          el('div.row__main', {}, [
            el('div.row__title', {}, source.channel_name),
            el('div.row__sub', {}, sub),
          ]),
          el('span.row__value', { style: isOut ? { color: 'var(--text-error)' } : {} }, `${sign}${vnd(source.balance)}`),
        ]),
        // Lãi trả khi đáo hạn: trước hạn chỉ là lãi dự kiến, tới hạn mới cộng vào khoản.
        source.maturityInterest ? el('div.savingcard__line', {}, [
          el('span', {}, t('Gốc {amount}', { amount: vnd(source.amount) })),
          el('b', { style: { color: isOut ? 'var(--text-error)' : 'var(--text-success)' } }, source.matured
            ? (isOut
              ? t('Lãi phải trả {amount}', { amount: vnd(source.maturityInterest) })
              : t('Đã đáo hạn · lãi +{amount}', { amount: vnd(source.maturityInterest) }))
            : t('Lãi khi đáo hạn {sign}{amount}', { sign: isOut ? '-' : '+', amount: vnd(source.maturityInterest) })),
        ]) : null,
        source.maturityInterest && !source.matured ? el('div.savingcard__next', {}, t('Đáo hạn ngày {day} · rút trước hạn thì không có lãi kỳ hạn', {
          day: formatDay(source.maturityOn),
        })) : null,
        !source.maturityInterest && source.rate_percent > 0 ? el('div.savingcard__next', {}, t('Chưa có ngày kết thúc · lãi tham khảo 12 tháng: +{amount}', {
          amount: vnd(source.interestPerYear),
        })) : null,
      ]);
      return el('div.card.savingcard', {}, [swipeRow(body, [
        { label: t('Sửa'), tone: 'edit', onclick: () => openEditManual(source) },
        { label: t('Xoá'), tone: 'danger', onclick: remove },
      ])]);
    }

    const content = el('div.row', {}, [
      el('span.row__icon', {}, uiIcon(isOut ? 'money-send-01' : (SOURCE_ICON[source.source] || 'money-bag-02'), 20)),
      el('div.row__main', {}, [
        el('div.row__title', {}, source.channel_name),
        el('div.row__sub', {}, sub),
        source.interestToDate > 0
          ? el('div.row__sub', { style: { color: isOut ? 'var(--text-error)' : 'var(--text-success)' } }, isOut
            ? t('Lãi phải trả: -{amount} ({n} tháng)', { amount: vnd(source.interestToDate), n: source.monthsElapsed })
            : t('Lãi tích luỹ: +{amount} ({n} tháng)', { amount: vnd(source.interestToDate), n: source.monthsElapsed }))
          : null,
      ]),
      el('span.row__value', { style: isOut ? { color: 'var(--text-error)' } : {} }, isOut ? `-${vnd(source.amount)}` : vnd(source.amount)),
    ]);

    if (source.source !== 'manual') return el('div.card', {}, [content]);

    // `.card` mất hết padding của mình (0) để nhường chỗ cho cử chỉ vuốt của
    // swipeRow chiếm trọn bề ngang thẻ; bù lại padding ngay trên `.row` bên
    // trong, nếu không icon/chữ sẽ dính sát viền thẻ.
    content.style.padding = 'var(--spacing-14) var(--spacing-16)';
    return el('div.card', { style: { padding: '0', overflow: 'hidden' } }, [swipeRow(content, [
      { label: t('Sửa'), tone: 'edit', onclick: () => openEditManual(source) },
      {
        label: t('Xoá'),
        tone: 'danger',
        onclick: async () => {
          const ok = await confirmSheet({
            title: t('Xoá nguồn tiết kiệm'),
            message: t('Xoá "{name}"?', { name: source.channel_name }),
          });
          if (!ok) return;
          if (!await guard(() => api.delete(`/api/savings/${source.id}`), t('Không xoá được'))) return;
          toast(t('Đã xoá'));
          await reload();
          render();
        },
      },
    ])]);
  }

  function openAddManual() { openManualForm(null, 'in'); }
  function openEditManual(source) { openManualForm(source); }

  // `direction` chỉ có ý nghĩa khi TẠO MỚI ('in': + Thêm nguồn tiết kiệm,
  // 'out': − Rút tiết kiệm/Vay); khi sửa, giữ nguyên direction đã lưu của
  // chính nguồn đó — không có cách đổi chiều một khoản đã tạo qua form này.
  function openManualForm(source, forcedDirection) {
    const editing = Boolean(source);
    const isOut = editing ? source.direction === 'out' : forcedDirection === 'out';
    const channelInput = el('input.input', {
      value: source?.channel_name || '',
      placeholder: isOut ? t('VD: Vay mua xe') : t('VD: Sổ tiết kiệm Vietcombank'),
      maxlength: '80',
    });
    const amountInput = moneyInput(source?.amount || 0, t('VD: 20.000.000'));
    const rateInput = el('input.input', { type: 'number', step: '0.1', min: '0', max: '100', value: source?.rate_percent ?? '' });

    let ratePeriod = source?.rate_period || 'year';
    const periodPick = el('div.periodpick', {}, [
      el('button', { type: 'button', 'aria-pressed': String(ratePeriod === 'month') }, t('%/tháng')),
      el('button', { type: 'button', 'aria-pressed': String(ratePeriod === 'year') }, t('%/năm')),
    ]);
    [...periodPick.children].forEach((btn, i) => {
      btn.onclick = () => {
        ratePeriod = i === 0 ? 'month' : 'year';
        [...periodPick.children].forEach((c, j) => c.setAttribute('aria-pressed', String(j === i)));
      };
    });

    // Ngày bắt đầu quyết định lãi TÍCH LUỸ tính đến hôm nay (server tính lại
    // ở `sourcePayload`). Ngày kết thúc chỉ là GỢI Ý +12 tháng — đổi ngày bắt
    // đầu thì gợi ý lại theo, nhưng thôi gợi ý ngay khi người dùng đã tự sửa
    // ngày kết thúc, để không đè mất lựa chọn họ vừa chỉnh.
    const startedInput = el('input.input', { type: 'date', value: source?.started_on || ctx.world.today });
    const endedInput = el('input.input', { type: 'date', value: source?.ended_on || addMonths(startedInput.value, 12) });
    let endedTouched = editing && Boolean(source?.ended_on);
    startedInput.addEventListener('change', () => {
      if (!endedTouched && startedInput.value) endedInput.value = addMonths(startedInput.value, 12);
    });
    endedInput.addEventListener('change', () => { endedTouched = true; });

    // Lãi suất là một MỤC TUỲ CHỌN: tiền để dành không sinh lãi (ống heo, quỹ
    // tiêu vặt...) thì không có kỳ hạn, nên cũng không có ngày bắt đầu/kết
    // thúc — ba thứ này đi cùng nhau, tắt lãi suất là ẩn/xoá luôn cả hai ngày.
    let hasRate = editing ? (source.rate_percent > 0 || Boolean(source.started_on) || Boolean(source.ended_on)) : true;
    const rateSection = el('div', {}, [
      el('div.field', {}, [
        el('span', {}, t('Lãi suất')),
        el('div', { style: { display: 'flex', gap: '8px' } }, [
          el('div.input', { style: { flex: '1' } }, [rateInput]),
          periodPick,
        ]),
      ]),
      el('div.formrow', { style: { display: 'flex', gap: '8px' } }, [
        el('label.field', { style: { flex: '1' } }, [el('span', {}, t('Ngày bắt đầu')), startedInput]),
        el('label.field', { style: { flex: '1' } }, [el('span', {}, t('Ngày kết thúc')), endedInput]),
      ]),
    ]);
    rateSection.style.display = hasRate ? '' : 'none';

    const rateCheck = el('input', {
      type: 'checkbox', checked: hasRate,
      onchange: (e) => { hasRate = e.target.checked; rateSection.style.display = hasRate ? '' : 'none'; },
    });

    const save = singleFlight(async () => {
      const body2 = {
        channelName: channelInput.value.trim(),
        amount: readMoney(amountInput),
        ratePercent: hasRate ? (Number(rateInput.value) || 0) : 0,
        ratePeriod: hasRate ? ratePeriod : 'year',
        startedOn: hasRate ? (startedInput.value || null) : null,
        endedOn: hasRate ? (endedInput.value || null) : null,
        direction: isOut ? 'out' : 'in',
      };
      if (!body2.channelName) return toast(isOut ? t('Hãy đặt tên khoản rút/vay') : t('Hãy đặt tên kênh tiết kiệm'), 'error');
      if (!body2.amount) return toast(t('Nhập số tiền lớn hơn 0'), 'error');
      if (body2.endedOn && body2.startedOn && body2.endedOn < body2.startedOn) return toast(t('Ngày kết thúc phải sau ngày bắt đầu'), 'error');

      const result = editing
        ? await guard(() => api.patch(`/api/savings/${source.id}`, body2), t('Không lưu được'))
        : await guard(() => api.post('/api/savings', body2), t('Không thêm được'));
      if (!result) return;

      closeSheet();
      toast(editing ? t('Đã lưu thay đổi') : (isOut ? t('Đã ghi nhận khoản rút/vay') : t('Đã thêm nguồn tiết kiệm')), 'success');
      // Rút tiền/vay nợ không phải một thành tích để ăn mừng confetti — chỉ
      // nguồn tiết kiệm MỚI (chiều 'in') mới đáng được celebrate.
      if (!editing && !isOut) await celebrateRewards(result.rewards, { title: t('Nguồn tiết kiệm đã được thêm') });
      await ctx.refreshWorld();
      await reload();
      render();
    });

    sheet({
      title: editing
        ? (isOut ? t('Sửa khoản rút/vay') : t('Sửa nguồn tiết kiệm'))
        : (isOut ? t('Rút tiết kiệm / Vay') : t('Thêm nguồn tiết kiệm')),
      body: [
        el('label.field', {}, [el('span', {}, isOut ? t('Khoản rút/vay') : t('Kênh tiết kiệm')), channelInput]),
        el('label.field', {}, [el('span', {}, t('Số tiền')), amountInput]),
        el('label.field', { style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' } }, [
          rateCheck,
          // `.field > span` toàn cục có display:block + margin-bottom (làm
          // nhãn phía trên input xuống dòng) — đè lại vì đây là nhãn ĐỨNG
          // CẠNH checkbox trên cùng một hàng, không phải nhãn phía trên input.
          el('span', { style: { display: 'inline', margin: '0' } }, t('Khoản này có lãi suất')),
        ]),
        rateSection,
        el('button.btn.btn--block', { onclick: save }, editing ? t('Lưu thay đổi') : (isOut ? t('Rút') : t('Thêm'))),
      ],
    });
  }

  // --------------------------------------------------- gửi tiết kiệm cùng Ekko
  /**
   * Sheet mở từ banner mascot ở cuối màn — không phải một tab hay màn riêng.
   * Chọn kỳ hạn + đối tác, xem lãi dự kiến, "Tiếp tục" tạo một nguồn mới.
   */
  function openDepositSheet() {
    let term = null;
    let channels = [];
    let selected = null;
    let amount = 0;

    const amountInput = moneyInput(0, t('Nhập số tiền'));
    const termPick = el('div.periodpick.periodpick--scroll');
    const channelGrid = el('div.savingschannel__row');
    const calcBody = el('div.ekkocalc__body');

    const refreshCalc = () => {
      if (!amount || !selected) {
        mount(calcBody, [el('p.ekkocalc__hint', {}, t('Nhập số tiền và chọn một đối tác để Ekko tính lãi dự kiến.'))]);
        return;
      }
      const interest = projectedInterest(amount, selected.ratePercent, 'year', term);
      mount(calcBody, [
        el('p.ekkocalc__line', {}, [`${t('Lãi khi đáo hạn')} `, el('b', {}, vnd(interest))]),
        el('p.ekkocalc__sub', {}, t('{name} · {rate}%/năm · kỳ hạn {term} tháng', { name: selected.name, rate: selected.ratePercent, term })),
      ]);
    };

    const renderChannels = () => {
      mount(channelGrid, channels.map((c) => el('button.savingschannel', {
        type: 'button',
        'aria-pressed': String(selected?.id === c.id),
        onclick: () => { selected = c; renderChannels(); refreshCalc(); },
      }, [
        el('span.savingschannel__logo', {}, [channelLogo(c.logo)]),
        el('span', {}, [
          el('span.savingschannel__rate', {}, `${c.ratePercent}%`),
          el('span.savingschannel__name', {}, c.name),
        ]),
      ])));
    };

    const loadTerm = async (nextTerm) => {
      const payload = await api.get(`/api/savings/channels?term=${nextTerm}`);
      term = payload.term;
      channels = payload.channels;
      selected = channels[0] || null;

      mount(termPick, payload.terms.map((m) => el('button', {
        type: 'button',
        'aria-pressed': String(m === term),
        onclick: () => loadTerm(m),
      }, t('{n} tháng', { n: m }))));
      renderChannels();
      refreshCalc();
    };

    amountInput.addEventListener('input', () => { amount = readMoney(amountInput); refreshCalc(); });

    let agreed = true;
    const submit = singleFlight(async () => {
      amount = readMoney(amountInput);
      if (!amount) return toast(t('Nhập số tiền gửi tiết kiệm'), 'error');
      if (!selected) return toast(t('Chọn một đối tác tiết kiệm'), 'error');
      if (!agreed) return toast(t('Cần đồng ý điều khoản dịch vụ'), 'error');

      const result = await guard(
        () => api.post('/api/savings/deposit', { channelId: selected.id, termMonths: term, amount }),
        t('Không gửi được'),
      );
      if (!result) return;

      closeSheet();
      toast(t('Đã thêm vào Quỹ tiết kiệm Ekko'), 'success');
      await celebrateRewards(result.rewards, { title: t('Đã gửi tiết kiệm') });
      await ctx.refreshWorld();
      await reload();
      render();
    });

    sheet({
      title: t('Gửi tiết kiệm cùng Ekko'),
      body: [
        el('label.field', {}, [el('span', {}, t('Số tiền gửi tiết kiệm')), amountInput]),
        el('p.ekkocalc__hint', { style: { marginTop: '-4px' } }, t('Lãi khi đáo hạn tính ngay bên dưới khi bạn nhập số tiền.')),
        el('div.card', { style: { marginTop: '12px' } }, [
          el('div.card__head', {}, [el('h3', {}, t('Gói tiết kiệm'))]),
          el('p.muted', { style: { fontSize: 'var(--font-size-text-sm)', marginBottom: '10px' } }, t('Chọn kỳ hạn gửi và đối tác')),
          termPick,
          el('div', { style: { marginTop: '12px' } }, [channelGrid]),
        ]),
        el('div.ekkocalc', { style: { marginTop: '12px' } }, [
          el('div.ekkocalc__head', {}, [spriteIcon('star-stroke', 20), el('span', {}, t('Ekko tính giúp bạn'))]),
          calcBody,
        ]),
        el('label.field', { style: { marginTop: '12px', display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: '8px' } }, [
          el('input', {
            type: 'checkbox', checked: true,
            onchange: (e) => { agreed = e.target.checked; },
            style: { marginTop: '3px' },
          }),
          el('span', { style: { fontSize: 'var(--font-size-text-sm)' } }, t('Tôi đồng ý với điều khoản, điều kiện sử dụng dịch vụ Tiết kiệm cùng Ekko.')),
        ]),
        el('button.btn.btn--block', { onclick: submit }, t('Tiếp tục')),
        // Gợi ý nhẹ cuối sheet cho ai còn đang cân nhắc chọn đối tác — không
        // phải một sheet/màn riêng, chỉ mở thêm MỘT sheet nữa đè lên.
        el('button.loverhome__link', {
          style: { display: 'block', width: '100%', textAlign: 'center', marginTop: '4px' },
          onclick: openCalculatorSheet,
        }, [uiIcon('bulb', 16), ` ${t('Chưa chắc chọn đối tác nào? Tính thử và so sánh lãi suất')} →`]),
      ],
    });

    loadTerm(6);
  }

  // ------------------------------------------------------------ tính thử lãi
  /** Sheet tham khảo, mở từ dòng gợi ý trong sheet gửi tiết kiệm — không tạo gì cả. */
  function openCalculatorSheet() {
    let term = null;
    let amount = 50_000_000;

    const amountInput = moneyInput(amount, t('Nhập số tiền bạn muốn gửi'));
    const termPick = el('div.periodpick.periodpick--scroll');
    // `.row + .row` tự vẽ vạch ngăn giữa các dòng (xem style.css), không cần
    // tự tay thêm border-top cho từng dòng ở đây.
    const rows = el('div');

    const renderRows = (channels) => {
      mount(rows, channels.map((c) => el('div.row', {}, [
        el('span.row__icon', {}, [channelLogo(c.logo)]),
        el('div.row__main', {}, [
          el('div.row__title', {}, c.name),
          el('div.row__sub', {}, `${c.ratePercent}%/năm`),
        ]),
        el('span.row__value', { style: { color: 'var(--text-success)' } }, `+${vnd(projectedInterest(amount, c.ratePercent, 'year', term))}`),
      ])));
    };

    const loadTerm = async (nextTerm) => {
      const payload = await api.get(`/api/savings/channels?term=${nextTerm}`);
      term = payload.term;
      mount(termPick, payload.terms.map((m) => el('button', {
        type: 'button',
        'aria-pressed': String(m === term),
        onclick: () => loadTerm(m),
      }, t('{n} tháng', { n: m }))));
      renderRows(payload.channels);
    };

    amountInput.addEventListener('input', () => { amount = readMoney(amountInput); loadTerm(term); });

    sheet({
      title: t('Tính thử tiền lãi'),
      body: [
        el('label.field', {}, [el('span', {}, t('Nhập số tiền bạn muốn gửi')), amountInput]),
        el('div.field', { style: { marginBottom: '12px' } }, [el('span', {}, t('Chọn kỳ hạn')), termPick]),
        el('p.muted', { style: { fontSize: 'var(--font-size-text-sm)', marginBottom: '4px' } }, t('Lãi suất các đối tác (%/năm)')),
        rows,
      ],
    });

    loadTerm(6);
  }

  render();
  return el('div.screen__body.screen__body--sky', {}, [board]);
}
