/**
 * Tabbar ở đáy hai màn gốc của Ekko Lover: **Heo cá nhân** (màn chủ, `/`) và
 * **Heo Dream Team** (`/team`). Giữa thanh là chỗ lõm ôm nút tròn — chính là
 * mascot Ekko (mascot.js) "đậu" vào đó: chạm để mở Ekko bot, ấn giữ 2 giây để
 * ghi nhanh, như mascot nổi ở các màn khác.
 *
 * Khung thanh (nền trắng cao 68, chỗ lõm 112 × 68) giữ đúng tabbar app Ekko
 * trong Figma; main.js quyết định hiện ở màn nào (class `has-tabbar` trên <html>).
 */
import { el, uiIcon } from '/shared/client.js';
import { t } from './i18n.js';

/**
 * Chỗ lõm trên mép thanh, ôm lấy nút tròn ở giữa: đúng đường cong của
 * "Rectangle 2965" trong Figma, cắt riêng phần giữa (112 × 68) để hai bên thanh
 * giãn theo bề ngang màn hình mà đường cong không bị kéo méo.
 */
const NOTCH = '<svg class="ekkotabbar__notch" width="112" height="68" viewBox="0 0 112.07 68" aria-hidden="true">'
  + '<path d="M0 0c7.4 0 14.65 2.05 20.96 5.93l19.36 11.91c9.64 5.93 21.8 5.93 31.43 0l19.36-11.91C97.42 2.05 104.67 0 112.07 0V68H0Z" fill="currentColor"/></svg>';

export const TAB_ROUTES = ['/', '/team'];

/**
 * @param {(route: string) => void} navigate
 * @returns {HTMLElement} thanh tabbar; gọi `bar.update(path, world)` mỗi lần đổi màn
 */
export function buildTabbar(navigate) {
  const tab = (route, icon, label) => el('button.ekkotabbar__tab', {
    type: 'button',
    dataset: { route },
    onclick: () => navigate(route),
  }, [
    el('span.ekkotabbar__icon', {}, [uiIcon(icon, 24), el('i.ekkotabbar__dot', { 'aria-hidden': 'true' })]),
    el('span.ekkotabbar__label', {}, label),
  ]);

  const bar = el('nav.ekkotabbar', { 'aria-label': t('Điều hướng chính') }, [
    el('div.ekkotabbar__bg', { html: `<span class="ekkotabbar__side"></span><span class="ekkotabbar__mid">${NOTCH}<span class="ekkotabbar__fill"></span></span><span class="ekkotabbar__side"></span>` }),
    el('div.ekkotabbar__tabs', {}, [
      tab('/', 'piggy-bank', t('Heo cá nhân')),
      // Chỗ trống cho mascot đậu vào giữa thanh.
      el('span.ekkotabbar__gap', { 'aria-hidden': 'true' }),
      tab('/team', 'user-multiple', t('Heo Dream Team')),
    ]),
  ]);

  bar.update = (path, world) => {
    for (const button of bar.querySelectorAll('.ekkotabbar__tab')) {
      const active = button.dataset.route === (path || '/');
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    }
    // Chấm đỏ ở tab Dream Team: có lời mời đang chờ hoặc lời nhắc chưa xem.
    const alerts = world?.team;
    const teamTab = bar.querySelector('[data-route="/team"]');
    teamTab?.classList.toggle('has-dot', Boolean(alerts && (alerts.invites || alerts.nudges?.length)));
  };
  return bar;
}
