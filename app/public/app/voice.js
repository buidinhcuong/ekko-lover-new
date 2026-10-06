/**
 * "Nói để ghi" — ghi một khoản chi bằng giọng nói (concept Simple mode).
 *
 * Ba bước, mỗi bước một việc, chữ to:
 *   1. Nghe   — bấm micro rồi nói tự nhiên: "cà phê ba mươi lăm nghìn".
 *   2. Xem lại — Ekko đọc ra khoản chi, số tiền và nhóm chi; nhận giọng nói có
 *                thể nghe nhầm nên KHÔNG lưu thẳng, người dùng bấm "Lưu" mới ghi.
 *   3. Lưu    — đi qua đúng đường của thanh ghi nhanh (`/api/expenses/quick`),
 *                nên XP, chuỗi ngày và cảnh báo chi tiêu y như ghi bằng tay.
 *
 * Nhận giọng nói dùng Web Speech API có sẵn trong trình duyệt (không gửi âm
 * thanh lên server của Ekko). Máy hoặc webview không hỗ trợ, hay người dùng từ
 * chối quyền micro, thì chuyển sang ô gõ chữ to — vẫn đọc được số kiểu "ba mươi
 * lăm nghìn" vì server tự đổi số đọc bằng chữ ra chữ số.
 */
import { api, ApiError, el, mount, toast, vnd, dataIcon } from '/shared/client.js';
import { celebrateRewards, closeSheet, sheet } from './ui.js';
import { getLang, t } from './i18n.js';

// TẠM: icon micro nét 1.5 theo kiểu Vuesax (cùng họ với tabbar). Thay bằng icon
// của "[Ekko UI] - Design System" khi lấy được từ Figma.
const MIC = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
  + '<path d="M12 15.5c2.21 0 4-1.79 4-4V6c0-2.21-1.79-4-4-4S8 3.79 8 6v5.5c0 2.21 1.79 4 4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
  + '<path d="M4.35 9.65v1.7C4.35 15.57 7.78 19 12 19s7.65-3.43 7.65-7.65v-1.7M12 19v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export const micIcon = (size = 32) => el('span.micicon', { html: MIC.replace(/width="32" height="32"/, `width="${size}" height="${size}"`) });

const Recognition = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;
export const voiceSupported = () => Boolean(Recognition());

/**
 * Mở luồng "Nói để ghi".
 * @param {object} ctx      ngữ cảnh app (refreshWorld…)
 * @param {object} [opts]
 * @param {() => any} [opts.onSaved] gọi sau khi lưu xong (vẽ lại màn đang đứng)
 * @param {boolean} [opts.typing]    mở thẳng ô gõ chữ thay vì micro
 */
export function openVoiceNote(ctx, { onSaved, typing = false } = {}) {
  const body = el('div.voicenote');
  let recognition = null;
  let closed = false;

  sheet({
    title: t('Ghi chép chi tiêu'),
    body: [body],
    onClose: () => { closed = true; recognition?.abort?.(); },
  });

  const stopListening = () => { try { recognition?.stop(); } catch { /* đã dừng */ } };

  // --- bước 1: nghe --------------------------------------------------------
  function listen() {
    const SR = Recognition();
    if (!SR) { typeIt(t('Máy này chưa nghe được giọng nói. Bạn gõ giúp nhé.')); return; }

    const live = el('p.voicenote__live', {}, t('Hãy nói khoản chi của bạn…'));
    const mic = el('button.voicenote__mic.is-listening', {
      type: 'button', 'aria-label': t('Dừng nghe'), onclick: stopListening,
    }, [micIcon(40)]);
    mount(body, [
      mic,
      el('p.voicenote__status', { role: 'status' }, t('Đang nghe…')),
      live,
      el('p.voicenote__hint', {}, t('Ví dụ: “Cà phê ba mươi lăm nghìn”')),
      el('div.voicenote__actions', {}, [
        el('button.btn.btn--block', { type: 'button', onclick: stopListening }, t('Nói xong')),
        el('button.voicenote__link', { type: 'button', onclick: () => { recognition?.abort?.(); typeIt(); } }, t('Gõ chữ thay vì nói')),
      ]),
    ]);

    let finalText = '';
    let heard = '';
    let failure = null;
    recognition = new SR();
    recognition.lang = getLang() === 'en' ? 'en-US' : 'vi-VN';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += piece;
        else interim += piece;
      }
      heard = (finalText + interim).trim();
      if (heard) live.textContent = heard;
    };
    recognition.onerror = (event) => { failure = event.error; };
    recognition.onend = () => {
      recognition = null;
      if (closed) return;
      const text = (finalText || heard).trim();
      if (text) { review(text); return; }
      if (failure === 'not-allowed' || failure === 'service-not-allowed') {
        typeIt(t('Ekko chưa được dùng micro. Hãy cho phép micro trong cài đặt, hoặc gõ chữ ở đây.'));
      } else if (failure && failure !== 'no-speech' && failure !== 'aborted') {
        typeIt(t('Chưa nghe được, bạn gõ giúp nhé.'));
      } else {
        retry(t('Ekko chưa nghe thấy gì.'));
      }
    };
    try {
      recognition.start();
    } catch {
      typeIt(t('Máy này chưa nghe được giọng nói. Bạn gõ giúp nhé.'));
    }
  }

  /** Không nghe thấy gì: hỏi lại, một nút to "Nói lại". */
  function retry(message) {
    mount(body, [
      el('button.voicenote__mic', { type: 'button', 'aria-label': t('Nói lại'), onclick: listen }, [micIcon(40)]),
      el('p.voicenote__status', { role: 'status' }, message),
      el('div.voicenote__actions', {}, [
        el('button.btn.btn--block', { type: 'button', onclick: listen }, t('Nói lại')),
        el('button.voicenote__link', { type: 'button', onclick: () => typeIt() }, t('Gõ chữ thay vì nói')),
      ]),
    ]);
  }

  // --- gõ chữ (khi không nói được) -----------------------------------------
  function typeIt(message = '', value = '') {
    const input = el('input.voicenote__input', {
      type: 'text', value, enterkeyhint: 'done', autocomplete: 'off',
      placeholder: t('VD: cà phê 35 nghìn'), 'aria-label': t('Khoản chi và số tiền'),
    });
    const go = () => { const text = input.value.trim(); if (text) review(text); else input.focus(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); go(); } });
    mount(body, [
      message ? el('p.voicenote__status', { role: 'status' }, message) : null,
      el('label.voicenote__label', {}, [t('Bạn đã chi gì, bao nhiêu tiền?'), input]),
      el('div.voicenote__actions', {}, [
        el('button.btn.btn--block', { type: 'button', onclick: go }, t('Tiếp tục')),
        voiceSupported() ? el('button.voicenote__link', { type: 'button', onclick: listen }, t('Nói thay vì gõ')) : null,
      ]),
    ]);
    input.focus({ preventScroll: true });
  }

  // --- bước 2: xem lại -----------------------------------------------------
  async function review(text) {
    mount(body, [el('p.voicenote__status', { role: 'status' }, t('Đang đọc khoản chi…'))]);
    let parsed;
    try {
      parsed = await api.post('/api/expenses/parse', { text });
    } catch (err) {
      if (closed) return;
      const reason = err instanceof ApiError ? err.message : t('Kiểm tra kết nối rồi thử lại nhé.');
      mount(body, [
        el('p.voicenote__heard', {}, [el('span', {}, t('Ekko nghe được')), el('strong', {}, `“${text}”`)]),
        el('p.voicenote__status', { role: 'alert' }, reason),
        el('div.voicenote__actions', {}, [
          voiceSupported() ? el('button.btn.btn--block', { type: 'button', onclick: listen }, t('Nói lại')) : null,
          el(voiceSupported() ? 'button.btn.btn--ghost.btn--block' : 'button.btn.btn--block', { type: 'button', onclick: () => typeIt('', text) }, t('Sửa bằng cách gõ')),
        ]),
      ]);
      return;
    }
    if (closed) return;

    const save = el('button.btn.btn--block', { type: 'button', onclick: () => commit(text, save, parsed.items) }, t('Lưu khoản chi'));
    mount(body, [
      el('p.voicenote__heard', {}, [el('span', {}, t('Ekko nghe được')), el('strong', {}, `“${text}”`)]),
      el('div.voicenote__card', {}, [
        el('div.voicenote__row', {}, [el('span', {}, t('Khoản chi')), el('strong', {}, parsed.note || t('Khoản chi'))]),
        el('div.voicenote__row', {}, [el('span', {}, t('Số tiền')), el('strong.voicenote__amount', {}, vnd(parsed.amount))]),
        el('div.voicenote__row', {}, [
          el('span', {}, t('Nhóm')),
          el('strong.voicenote__cat', {}, [
            parsed.category ? dataIcon(parsed.category.icon, 'package', 24) : null,
            parsed.category?.name || t('Khác'),
          ]),
        ]),
        // Câu có nhiều khoản: liệt kê các khoản còn lại để người dùng thấy đủ trước khi lưu.
        ...(parsed.items || []).slice(1).map((item) => el('div.voicenote__row', {}, [
          el('span', {}, item.note || t('Khoản chi')),
          el('strong', {}, `${vnd(item.amount)} · ${item.category?.name || t('Khác')}`),
        ])),
      ]),
      el('div.voicenote__actions', {}, [
        save,
        voiceSupported()
          ? el('button.btn.btn--ghost.btn--block', { type: 'button', onclick: listen }, t('Nói lại'))
          : el('button.btn.btn--ghost.btn--block', { type: 'button', onclick: () => typeIt('', text) }, t('Sửa lại')),
      ]),
    ]);
    save.focus({ preventScroll: true });
  }

  // --- bước 3: lưu ---------------------------------------------------------
  // `items`: các khoản vừa xem lại — gửi kèm để server lưu đúng chúng, không đọc câu lần nữa.
  async function commit(text, button, items) {
    button.disabled = true;
    let result;
    try {
      result = await api.post('/api/expenses/quick', { text, items });
    } catch (err) {
      button.disabled = false;
      toast({ title: t('Chưa lưu được'), body: err instanceof ApiError ? err.message : t('Kiểm tra kết nối rồi thử lại nhé.') }, 'error');
      return;
    }
    closeSheet();
    const { expense, category, alerts } = result;
    if (alerts?.length) toast({ title: alerts[0].title, body: alerts[0].text }, 'warning');
    else if (result.expenses?.length > 1) toast({ title: t('Đã ghi {n} khoản · {amount}', { n: result.expenses.length, amount: vnd(result.total) }) }, 'success');
    else toast({ title: t('Đã ghi {amount}', { amount: vnd(expense.amount) }), body: category?.name || t('Khác') }, 'success');
    await ctx.refreshWorld();
    await celebrateRewards(result.rewards, { title: t('Đã ghi vào sổ') });
    await onSaved?.(result);
  }

  if (typing || !voiceSupported()) typeIt(typing ? '' : t('Máy này chưa nghe được giọng nói. Bạn gõ giúp nhé.'));
  else listen();
}
