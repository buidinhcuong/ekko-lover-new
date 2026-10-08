/**
 * Ekko bot chat sheet.
 *
 * The bot answers questions about the programme, the lessons and the member's
 * own numbers, and logs an expense straight from a message like "cà phê 35k".
 *
 * Cũng ghi được bằng ảnh hoá đơn: chụp mới hoặc chọn ảnh trong máy ngay ở thanh
 * nhập. Bot đọc (AI của máy chủ, không được thì đọc trên máy), nói lại số tiền +
 * nhóm đoán được, rồi chờ người dùng bấm "Ghi khoản này" hoặc "Sửa trước khi
 * ghi" — không tự ghi khi người dùng chưa xác nhận.
 */
import { api, el, formatDay, guard, mount, renderText, toast, uiIcon, vnd } from '/shared/client.js';
import { celebrateRewards, closeSheet, sheet, isImeEnter, trackComposition } from './ui.js';
import { t } from './i18n.js';
import { readReceipt, shrinkImage } from './receiptLocal.js';
import { dateFromReceipt, openAdd, pickReceiptCategory } from './views/expenses.js';

export async function openBot(ctx) {
  const chat = el('div.chat');
  const input = el('input.input', {
    placeholder: t('Hỏi mình, hoặc ghi "cà phê 35k"'),
    'aria-label': t('Tin nhắn'),
    maxlength: '300',   // khớp giới hạn ở routes/bot.js
  });
  const ime = trackComposition(input);
  const sendButton = el('button.btn', { style: { width: '52px', padding: '0' }, 'aria-label': t('Gửi') }, '↑');

  const scroller = el('div.sheet__body', { style: { flex: '1' } }, [chat]);
  const toBottom = () => { scroller.scrollTop = scroller.scrollHeight; };

  /**
   * `source === 'quick'` là câu gõ ở thanh ghi nhanh dưới đáy màn hình, không
   * phải gõ trong khung này. Có nhãn để người dùng hiểu vì sao tin nhắn đó ở đây.
   */
  function push(role, text, meta, source = 'chat') {
    const node = el(`div.msg.msg--${role}`, { html: renderText(text) });
    if (source === 'quick' && role === 'user') {
      node.classList.add('msg--quick');
      node.append(el('span.msg__tag', {}, [uiIcon('flash', 16), ` ${t('ghi nhanh')}`]));
    }
    chat.append(node);

    if (meta?.action) chat.append(actionButton(meta.action, ctx));
    if (meta?.suggestions?.length) chat.append(suggestionRow(meta.suggestions, send));

    toBottom();
    return node;
  }

  async function send(text) {
    // Bấm Gửi khi bộ gõ còn đang soạn chữ: đợi chữ chốt xong rồi mới đọc ô.
    if (text === undefined) await ime.afterComposition();
    const message = String(text ?? input.value).trim();
    if (!message) return;

    input.value = '';
    push('user', message);

    const typing = el('div.msg.msg--bot', {}, [el('span.typing', {}, [el('i'), el('i'), el('i')])]);
    chat.append(typing);
    toBottom();

    const result = await guard(() => api.post('/api/bot/message', { text: message }), t('Ekko bot chưa trả lời được'));
    typing.remove();
    if (!result) return;

    push('bot', result.reply.text, result.reply.meta);

    // Logging an expense through chat still earns the daily reward.
    if (result.reply.rewards) {
      await ctx.refreshWorld();
      await celebrateRewards(result.reply.rewards, { title: t('Đã ghi vào sổ') });
    }
  }

  // --- ghi bằng ảnh hoá đơn ------------------------------------------------
  // Hai ô file riêng: chỉ ô có `capture` mới mở thẳng máy ảnh trên điện thoại,
  // ô không có `capture` mới cho vào thư viện ảnh.
  const camInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const galleryInput = el('input', { type: 'file', accept: 'image/*', hidden: true });
  // Một nút "+" cạnh nút gửi; bấm vào mở menu nhỏ ngay phía trên với hai lựa
  // chọn. Menu đóng khi chọn xong, bấm ra ngoài hoặc bấm Esc.
  const attachMenu = el('div.chat__attachmenu', { role: 'menu', hidden: true });
  const attachButton = el('button.chat__attach', {
    type: 'button', 'aria-label': t('Thêm ảnh hoá đơn'), 'aria-haspopup': 'menu', 'aria-expanded': 'false',
  }, uiIcon('add-01', 24));
  const setMenu = (open) => {
    attachMenu.hidden = !open;
    attachButton.setAttribute('aria-expanded', String(open));
  };
  const menuItem = (icon, label, input) => el('button.chat__attachitem', {
    type: 'button', role: 'menuitem',
    onclick: () => { setMenu(false); input.click(); },
  }, [uiIcon(icon, 20), label]);
  mount(attachMenu,
    menuItem('camera-01', t('Chụp ảnh'), camInput),
    menuItem('image-01', t('Tải ảnh lên'), galleryInput));
  attachButton.addEventListener('click', (event) => { event.stopPropagation(); setMenu(attachMenu.hidden); });
  const closeMenu = (event) => {
    if (attachMenu.hidden) return;
    if (event.type === 'keydown' ? event.key === 'Escape' : !attachMenu.contains(event.target)) setMenu(false);
  };
  document.addEventListener('pointerdown', closeMenu, true);
  document.addEventListener('keydown', closeMenu);
  // Sheet đóng thì gỡ luôn listener, khỏi tích lại mỗi lần mở bot.
  const stopListening = new MutationObserver(() => {
    if (attachButton.isConnected) return;
    document.removeEventListener('pointerdown', closeMenu, true);
    document.removeEventListener('keydown', closeMenu);
    stopListening.disconnect();
  });
  let categories = null;

  async function sendReceipt(file) {
    let dataUrl;
    try {
      dataUrl = await shrinkImage(file, 1280, 0.72, { unreadable: t('Không đọc được tệp ảnh'), notImage: t('Tệp này không phải ảnh') });
    } catch (err) {
      toast(err.message, 'error');
      return;
    }
    chat.append(el('div.msg.msg--user.msg--image', {}, [el('img', { src: dataUrl, alt: t('Ảnh hoá đơn') })]));
    const typing = el('div.msg.msg--bot', {}, [el('span.typing', {}, [el('i'), el('i'), el('i')])]);
    chat.append(typing);
    toBottom();

    categories ||= await guard(() => api.get('/api/categories'), t('Không tải được nhóm chi tiêu')) || [];
    const { read, text } = await readReceipt(dataUrl);
    typing.remove();

    if (!read?.amount) {
      push('bot', t('Mình chưa đọc được số tiền trên hoá đơn này. Bạn nhắn giúp mình kiểu **"ăn trưa 60k"** nhé, hoặc thử chụp lại rõ hơn.'));
      return;
    }
    const category = pickReceiptCategory(read, text, categories);
    const { date } = dateFromReceipt(read, ctx.world.today);
    const lines = [
      t('Mình đọc được hoá đơn **{amount}**', { amount: vnd(read.amount) }),
      category ? t('Nhóm: **{name}**', { name: category.name }) : null,
      read.note ? t('Ghi chú: {note}', { note: read.note }) : null,
      t('Ngày: {day}', { day: formatDay(date) }),
    ].filter(Boolean);
    const reply = push('bot', `${lines.join('\n')}\n\n${read.confidence === 'cao' ? t('Ghi luôn nhé?') : t('Mình chưa chắc lắm, bạn xem lại giúp rồi hãy ghi.')}`);

    const actions = el('div.chat__receiptactions', {}, [
      el('button.btn.btn--sm', {
        type: 'button',
        onclick: async () => {
          actions.remove();
          const result = await guard(() => api.post('/api/expenses', {
            amount: read.amount, categoryId: category?.id, note: read.note || category?.name || null, spentOn: date, receipt: dataUrl,
          }), t('Không ghi được khoản chi'));
          if (!result) { reply.after(actions); return; }
          push('bot', t('Đã ghi **{amount}** vào nhóm **{name}**, kèm ảnh hoá đơn.', { amount: vnd(read.amount), name: category?.name || t('Khác') }));
          if (result.alerts?.length) push('bot', `**${result.alerts[0].title}** ${result.alerts[0].text}`);
          await ctx.refreshWorld();
          await celebrateRewards(result.rewards, { title: t('Đã ghi vào sổ') });
        },
      }, t('Ghi khoản này')),
      el('button.btn.btn--sm.btn--ghost', {
        type: 'button',
        onclick: () => {
          closeSheet();
          openAdd(ctx, categories, () => ctx.navigate('/expenses'), { receipt: dataUrl, read, text });
        },
      }, t('Sửa trước khi ghi')),
    ]);
    reply.after(actions);
    toBottom();
  }
  for (const input of [camInput, galleryInput]) {
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = '';   // chọn lại đúng tệp đó vẫn chạy
      if (file) sendReceipt(file);
    });
  }

  sendButton.addEventListener('click', () => send());
  input.addEventListener('keydown', (event) => {
    // Enter của bộ gõ tiếng Việt là để chốt chữ đang gõ, không phải gửi — trước
    // đây gửi luôn nên ký tự còn sót ('ứ', 'k'…) thành một tin riêng (BUG-008).
    if (event.key !== 'Enter' || isImeEnter(event)) return;
    event.preventDefault();
    send();
  });

  const panel = sheet({
    title: t('Ekko bot'),
    body: [],
  });

  // Replace the default body with a scroll area plus a fixed composer.
  const head = panel.querySelector('.sheet__head');
  head.prepend(el('img', { src: '/assets/mascot/ekko-bot.png', alt: '', width: 32, height: 32 }));
  panel.style.height = '82%';   // của màn hình điện thoại, không phải của viewport
  mount(panel, head, scroller, el('div.chat__composer', {}, [
    input,
    el('div.chat__attachwrap', {}, [attachButton, attachMenu]),
    sendButton, camInput, galleryInput,
  ]));
  stopListening.observe(document.body, { childList: true, subtree: true });

  const history = await guard(() => api.get('/api/bot/history?limit=30'), t('Không tải được lịch sử trò chuyện'));

  if (!history?.messages?.length) {
    push('bot', t('Chào bạn, mình là **Ekko bot**. Mình giải thích các bài học, cho bạn biết streak và chi tiêu của mình, và ghi chi tiêu giúp bạn chỉ bằng một câu nhắn.'));
  } else {
    for (const message of history.messages) {
      push(message.role, message.text, message.meta, message.source);
    }
  }

  toBottom();
  input.focus({ preventScroll: true });
}

function actionButton(action, ctx) {
  const run = () => {
    closeSheet();
    if (action.type === 'navigate') ctx.navigate(action.route.replace('/app/#', ''));
    else if (action.type === 'open_lesson') ctx.openLesson(action.lessonId);
  };
  return el('button.btn.btn--sm.btn--ghost', { style: { alignSelf: 'flex-start' }, onclick: run }, action.label);
}

// Bot không gợi ý câu hỏi nữa — chỉ còn nút hành động "Đổi mục" / "Đổi sang X"
// (lọc cả tin nhắn cũ trong lịch sử, vốn còn lưu chip câu hỏi).
const isActionChip = (text) => /^(Đổi mục|Đổi sang |Change category|Move to )/.test(text);

function suggestionRow(suggestions, send) {
  const actions = suggestions.filter(isActionChip);
  if (!actions.length) return '';
  return el('div.chips', { style: { marginTop: '4px' } },
    actions.slice(0, 3).map((text) => el('button.chip', { onclick: () => send(text) }, text)));
}
