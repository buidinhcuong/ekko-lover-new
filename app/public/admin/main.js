/**
 * Admin portal shell and router.
 *
 * Pages live in ./pages/*.js and export `render(ctx)`. `ctx` carries the API,
 * the metadata options (asset lists, badge rules, frame kinds) and a `reload()`
 * that re-renders the current page after a mutation.
 */
import { api, ApiError, el, mount, uiIcon } from '/shared/client.js';
import { closeDrawer, notify } from './ui.js';

import dashboard from './pages/dashboard.js';
import levels from './pages/levels.js';
import badges from './pages/badges.js';
import challenges from './pages/challenges.js';
import content from './pages/content.js';
import lesson from './pages/lesson.js';
import features from './pages/features.js';
import savings from './pages/savings.js';
import bankRates from './pages/bankRates.js';
import categories from './pages/categories.js';
import members from './pages/members.js';
import concepts from './pages/concepts.js';
import news from './pages/news.js';
import aiUsage from './pages/aiUsage.js';
import feedPage from './pages/feed.js';

const root = document.getElementById('admin');

/**
 * Mounts into #admin and drops the boot placeholder's padding. Leaving that
 * class on pushed the whole shell down 48px, so the 100dvh sidebar hung below
 * the fold and clipped its own footer.
 */
function mountRoot(...children) {
  root.classList.remove('admin-boot');
  mount(root, ...children);
}

const PAGES = {
  '/': dashboard,
  '/levels': levels,
  '/badges': badges,
  '/challenges': challenges,
  '/content': content,
  '/lesson': lesson,
  '/features': features,
  '/savings': savings,
  '/bank-rates': bankRates,
  '/categories': categories,
  '/members': members,
  '/concepts': concepts,
  '/news': news,
  '/ai-usage': aiUsage,
  '/feed': feedPage,
};

const NAV = [
  { group: 'Tổng quan' },
  { route: '/', icon: 'analytics-01', label: 'Bảng điều khiển' },
  { route: '/members', icon: 'user-multiple', label: 'Người học' },
  { route: '/ai-usage', icon: 'robot-01', label: 'Sử dụng AI' },
  { route: '/feed', icon: 'bubble-chat', label: 'EkkoFeed' },
  { group: 'Trò chơi hoá' },
  { route: '/concepts', icon: 'paint-board', label: 'Concept' },
  { route: '/levels', icon: 'piggy-bank', label: 'Cấp độ heo' },
  { route: '/badges', icon: 'medal-01', label: 'Huy hiệu' },
  { route: '/challenges', icon: 'target-02', label: 'Thử thách' },
  { group: 'Nội dung' },
  { route: '/content', icon: 'books-01', label: 'Mô đun & bài học' },
  { group: 'Chức năng' },
  { route: '/features', icon: 'compass-01', label: 'Chức năng' },
  { route: '/savings', icon: 'bank', label: 'Tiết kiệm cùng Ekko' },
  { route: '/bank-rates', icon: 'chart-increase', label: 'Lãi suất ngân hàng' },
  { route: '/news', icon: 'news', label: 'Tin tức' },
];

let meta = null;
let sidebar = null;
let sideNav = null;   // just the link list; the brand and footer live outside it
let mainNode = null;

const ctx = {
  api,
  get meta() { return meta; },
  navigate(route) {
    if (location.hash.slice(1) === route) render();
    else location.hash = route;
  },
  async reload() {
    meta = hrMode ? {} : await api.get('/api/admin/meta/options');
    await render();
  },
  notify,
  uploader: (body) => api.post('/api/admin/upload', body),
};

// HR doanh nghiệp (EkkoFeed): chỉ thấy đúng trang EkkoFeed của công ty mình.
const HR_NAV = [{ group: 'Doanh nghiệp' }, { route: '/feed', icon: 'bubble-chat', label: 'EkkoFeed' }];
let hrMode = false;

function renderNav(active) {
  mount(sideNav, (hrMode ? HR_NAV : NAV).map((item) => (item.group
    ? el('div.sidebar__group', {}, item.group)
    : el('button.navlink', {
      onclick: () => ctx.navigate(item.route),
      'aria-current': active === item.route ? 'page' : null,
    }, [uiIcon(item.icon, 20), item.label]))));
}

async function render() {
  closeDrawer();
  const hash = location.hash.slice(1) || '/';
  const [path] = hash.split('?');
  const page = hrMode ? feedPage : (PAGES[path] || PAGES['/']);

  renderNav(path);
  mount(mainNode, el('div.empty-state', {}, 'Đang tải…'));

  try {
    mount(mainNode, await page(ctx));
    window.scrollTo({ top: 0 });
  } catch (err) {
    mount(mainNode, el('div.panel', {}, [
      el('h2', {}, 'Không tải được trang'),
      el('p.hint', {}, err instanceof ApiError ? err.message : String(err)),
    ]));
  }
}

async function boot() {
  let session;
  try {
    session = await api.get('/api/session/whoami');
  } catch {
    session = { authenticated: false };
  }

  hrMode = Boolean(session.authenticated && session.role !== 'admin' && session.feed);
  if (!session.authenticated || (session.role !== 'admin' && !hrMode)) {
    mountRoot(el('div', { style: { display: 'grid', placeContent: 'center', minHeight: '100dvh', gap: '16px', textAlign: 'center' } }, [
      el('img', { src: '/assets/logo/Ekko_Primary_Logo_PaydayBlue.svg', alt: 'Ekko', style: { height: '32px' } }),
      el('h1', { style: { margin: '0', fontSize: 'var(--font-size-text-xl)' } }, 'Cần quyền quản trị viên'),
      el('p.hint', {}, session.authenticated
        ? `Bạn đang đăng nhập với vai trò ${session.role}. Admin portal chỉ dành cho quản trị viên.`
        : 'Đăng nhập bằng tài khoản quản trị Ekko hoặc tài khoản HR doanh nghiệp để tiếp tục.'),
      await adminLoginForm(),
    ]));
    return;
  }

  // HR không gọi được API quản trị chung — chỉ API EkkoFeed.
  meta = hrMode ? {} : await api.get('/api/admin/meta/options');
  if (hrMode && !location.hash.startsWith('#/feed')) location.hash = '/feed';

  sideNav = el('div', { style: { display: 'contents' } });
  mainNode = el('main.main');
  sidebar = el('nav.sidebar', { 'aria-label': 'Điều hướng quản trị' }, [
    el('div.sidebar__brand', {}, [
      el('img', { src: '/assets/logo/Ekko_Primary_Logo_PaydayBlue.svg', alt: 'Ekko' }),
      el('span', {}, 'Giáo dục tài chính'),
    ]),
    sideNav,
    el('div.sidebar__foot', {}, [
      el('div', {}, session.name),
      el('a', { href: '/app/', style: { fontSize: 'var(--font-size-text-xs)' } }, 'Mở app người học →'),
      el('button', {
        type: 'button',
        style: { all: 'unset', display: 'block', marginTop: '6px', cursor: 'pointer', fontSize: 'var(--font-size-text-xs)', color: 'var(--text-secondary)' },
        onclick: async () => {
          try { await api.post('/api/session/logout', {}); } catch { /* đã hết phiên */ }
          location.reload();
        },
      }, 'Đăng xuất'),
    ]),
  ]);

  mountRoot(el('div.shell', {}, [sidebar, mainNode]));

  window.addEventListener('hashchange', render);
  await render();
}

boot().catch((err) => {
  console.error(err);
  mountRoot(el('div.panel', { style: { margin: '48px' } }, [
    el('h2', {}, 'Không khởi động được Admin portal'),
    el('p.hint', {}, String(err.message || err)),
  ]));
});

/**
 * Chưa đăng nhập (hoặc không phải quản trị viên): đăng nhập bằng email + mật khẩu
 * khi bật đăng ký nội bộ, và nút đăng nhập demo khi đang ở chế độ demo.
 */
async function adminLoginForm() {
  let auth = { localAuth: false, demo: false };
  try { auth = await api.get('/api/auth/config'); } catch { /* chỉ còn nút demo */ }
  const demo = auth.demo ? el('a.ekko-btn.ekko-btn--secondary.ekko-btn--md', { href: '/dev/login?role=admin' }, 'Đăng nhập demo (quản trị)') : null;
  // Luôn có form email + mật khẩu: kể cả khi tắt đăng nhập email cho người lao
  // động (bản thật dùng SSO), quản trị Ekko và HR doanh nghiệp vẫn đăng nhập ở đây.

  const email = el('input', { type: 'email', autocomplete: 'email', placeholder: 'Email', required: true });
  const password = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Mật khẩu', required: true });
  const error = el('p.hint', { style: { color: 'var(--text-error)', margin: 0 } });
  const submit = el('button.ekko-btn.ekko-btn--primary.ekko-btn--md', { type: 'submit' }, 'Đăng nhập');
  return el('form', {
    style: { display: 'grid', gap: '10px', width: 'min(320px, 90vw)', justifySelf: 'center', textAlign: 'left' },
    onsubmit: async (event) => {
      event.preventDefault();
      error.textContent = '';
      submit.disabled = true;
      try {
        await api.post('/api/auth/login', { email: email.value, password: password.value });
        // Đăng nhập đúng mà phiên không giữ được (cookie bị proxy / gateway chặn):
        // báo rõ, đừng lặng lẽ hiện lại form trống.
        const after = await api.get('/api/session/whoami').catch(() => ({ authenticated: false }));
        if (!after.authenticated) {
          error.textContent = 'Đăng nhập đúng nhưng trình duyệt không giữ được phiên: cookie ekko_gdtc_session bị chặn trên đường đi (proxy / cổng đăng nhập của công ty, hoặc trang mở bằng http://). Báo team hạ tầng — xem DEPLOY.md, mục Xử lý sự cố.';
          submit.disabled = false;
          return;
        }
        location.reload();
      } catch (err) {
        error.textContent = err instanceof ApiError ? err.message : 'Không kết nối được';
        submit.disabled = false;
      }
    },
  }, [
    el('span.ekko-input.ekko-input--md', {}, [email]),
    el('span.ekko-input.ekko-input--md', {}, [password]),
    error,
    submit,
    el('p.hint', { style: { margin: 0 } }, 'HR doanh nghiệp: dùng email + mật khẩu tạm Ekko gửi. Chưa có tài khoản thì nhờ quản trị Ekko cấp.'),
    demo,
  ]);
}

