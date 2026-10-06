/**
 * Trắc nghiệm cuối mô đun.
 *
 * Answers are graded on the server, so the correct option is never sent to the
 * client before submission. One question per screen, same shape as the lesson
 * player so it feels like part of the same flow.
 */
import { api, el, guard, mount, spriteIcon, uiIcon } from '/shared/client.js';
import { celebrate, celebrateRewards, closeSheet, getOverlayRoot, lockScroll, unlockScroll } from '../ui.js';
import { t } from '../i18n.js';

export async function openModuleQuiz(module, ctx) {
  const questions = module.quiz?.questions ?? [];
  if (!questions.length) return;

  closeSheet();

  const answers = {};   // question id -> chosen option index
  let index = 0;

  const segments = el('div.player__bar');
  const stage = el('div.player__stage');
  const foot = el('div.player__foot');

  const player = el('div.player', { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('Trắc nghiệm cuối mô đun') }, [
    segments,
    el('div.player__head', {}, [
      el('button.iconbtn', { onclick: close, 'aria-label': t('Đóng') }, uiIcon('cancel-01', 20)),
      el('strong', {}, t('Trắc nghiệm · {title}', { title: module.title })),
    ]),
    stage,
    foot,
  ]);

  function close() {
    player.remove();
    unlockScroll();
  }

  function renderSegments() {
    mount(segments, questions.map((_, i) => el(
      `div.player__seg${i < index ? '.player__seg--done' : i === index ? '.player__seg--current' : ''}`,
      {}, [el('i')],
    )));
  }

  function render() {
    const question = questions[index];
    const isLast = index === questions.length - 1;
    const chosen = answers[question.id];

    const next = el('button.btn.btn--block', {
      disabled: chosen === undefined,
      onclick: () => (isLast ? submit() : goTo(index + 1)),
    }, isLast ? t('Xem kết quả') : t('Câu tiếp theo'));

    const options = question.options.map((option, i) => el('button.quiz-option', {
      dataset: chosen === i ? { state: 'picked' } : {},
      onclick: () => {
        answers[question.id] = i;
        render();
      },
    }, [
      el('i', {}, String.fromCharCode(65 + i)),
      el('span', {}, option.text),
    ]));

    mount(stage, el('div.frame', {}, [
      el('p.frame__caption', {}, t('Câu {i} / {n}', { i: index + 1, n: questions.length })),
      el('h2', {}, question.question),
      ...options,
    ]));

    mount(foot, el('div', { style: { display: 'flex', gap: '10px' } }, [
      index > 0 ? el('button.btn.btn--ghost', { onclick: () => goTo(index - 1), 'aria-label': t('Câu trước') }, [spriteIcon('chevron-left-01-stroke', 20)]) : null,
      next,
    ]));
  }

  function goTo(target) {
    index = target;
    renderSegments();
    render();
    stage.scrollTo({ top: 0 });
  }

  async function submit() {
    const result = await guard(
      () => api.post(`/api/learn/modules/${encodeURIComponent(module.slug)}/quiz`, { answers }),
      t('Không gửi được bài làm'),
    );
    if (!result) return;

    close();

    const passed = result.correct === result.total;
    await celebrate({
      title: passed ? t('Đúng hết!') : t('Đúng {right}/{total}', { right: result.correct, total: result.total }),
      subtitle: passed
        ? t('Bạn đã nắm chắc mô đun này.')
        : t('Bạn có thể làm lại để cải thiện điểm. Chỉ điểm cao hơn mới được tính thưởng.'),
      image: passed ? '/assets/mascot/bot-1.png' : '/assets/mascot/bot-9.png',
      stats: [t('{right}/{total} câu đúng', { right: result.correct, total: result.total })],
      actionLabel: t('Xong'),
    });
    await celebrateRewards(result.rewards, { title: t('Thưởng trắc nghiệm') });

    await ctx.refreshWorld();
    ctx.navigate('/explore');
  }

  getOverlayRoot().append(player);
  lockScroll();
  renderSegments();
  render();
}
