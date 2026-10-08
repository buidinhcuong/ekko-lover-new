/**
 * Cổng vào preview: hai tab nhúng giao diện thật trong iframe, cộng một tab
 * Giới thiệu phát video giới thiệu tính năng Học tập.
 *
 * Cả hai dùng chung một phiên đăng nhập, nên tài khoản demo phải có quyền quản
 * trị: chỉ có một cookie phiên, không thể đồng thời là hai người khác nhau. Vì
 * vậy trang này đăng nhập bằng tài khoản quản trị, và app người dùng hiển thị
 * đúng tiến độ của tài khoản đó.
 */
import { api, el, mount, spriteIcon, uiIcon } from '/shared/client.js';

const root = document.getElementById('preview');

// Hai người dùng mẫu (cùng nút với app khi mở riêng /app/): bấm là dựng lại
// tài khoản từ đầu rồi quay về trang này, tab App hiện đúng người đó.
const PERSONAS = [
  { key: 'new', icon: 'plant-02', label: 'Người dùng mới: heo cấp 1, chưa học, chưa có dữ liệu' },
  { key: 'mid', icon: 'mortarboard-01', label: 'Người dùng đang học: học được khoảng 30% số bài, đã có dữ liệu' },
  { key: 'veteran', icon: 'crown', label: 'Người dùng lâu năm: học hết bài, heo cấp 10, đủ dữ liệu' },
];

// Ba concept: bấm là đổi giao diện cho cả bản demo rồi quay lại trang này.
const CONCEPTS = [
  { code: 'lover', icon: () => uiIcon('piggy-bank', 20), label: 'Concept 1 · Ekko Lover' },
  { code: 'lover-colors', icon: () => uiIcon('paint-board', 20), label: 'Concept 2 · Ekko Lover Colors' },
  { code: 'simple', icon: () => spriteIcon('zoom-in-area-stroke', 20), label: 'Concept 3 · Simple mode' },
];

const TABS = [
  { key: 'app', icon: 'smart-phone-01', label: 'App người dùng', src: '/app/' },
  { key: 'admin', icon: 'folder-01', label: 'Admin portal', src: '/admin/' },
  // Video giới thiệu tính năng Học tập: bản mới (2:26, dựng lại 10/2026 theo app mới, nguồn ở
  // video-src/) cạnh bản cũ (1:33) để so sánh. `?v=` để trình duyệt không phát bản đã lưu đệm.
  {
    key: 'intro', icon: 'play', label: 'Giới thiệu', video: true,
    videos: [
      { src: '/assets/video/ekko-hoc-tap.mp4?v=5', label: 'Bản mới · 10/2026', note: '2:26 · Cuộc đua Ekko Lover + mã đăng ký' },
      { src: '/assets/video/ekko-hoc-tap-v1.mp4', label: 'Bản cũ', note: '1:33 · giao diện trước đây' },
    ],
  },
];

let active = 'app';
const frames = new Map();   // key -> panel node, built on first activation

async function boot() {
  let session = { authenticated: false };
  try {
    session = await api.get('/api/session/whoami');
  } catch { /* treated as signed out */ }

  if (!session.authenticated || session.role !== 'admin') {
    return renderSignIn(session);
  }

  const tabs = el('div.pv__tabs', { role: 'tablist' });
  const stage = el('div.pv__stage');

  const renderTabs = () => mount(tabs, TABS.map((tab) => el('button', {
    role: 'tab',
    'aria-selected': String(tab.key === active),
    onclick: () => {
      active = tab.key;
      renderTabs();
      show(stage, tab);
    },
  }, [el('em', {}, uiIcon(tab.icon, 20)), tab.label])));

  mount(root,
    el('div.pv__bar', {}, [
      el('div.pv__brand', {}, [
        el('img', { src: '/assets/logo/Ekko_Primary_Logo_PaydayBlue.svg', alt: 'Ekko' }),
        el('span', {}, 'Giáo dục tài chính'),
      ]),
      tabs,
      el('div.pv__right', {}, [
        el('div.pv__personas', { role: 'group', 'aria-label': 'Đổi người dùng mẫu' }, PERSONAS.map((p) => el(
          `a.pv__persona${session.persona === p.key ? '.is-active' : ''}`,
          {
            href: `/dev/persona?as=${p.key}&redirect=/`, title: p.label, 'aria-label': p.label,
            'aria-current': session.persona === p.key ? 'true' : null,
          },
          uiIcon(p.icon, 20),
        ))),
        el('span.pv__sep', { 'aria-hidden': 'true' }),
        el('div.pv__personas', { role: 'group', 'aria-label': 'Đổi concept' }, CONCEPTS.map((c) => el(
          `a.pv__persona${session.concept === c.code ? '.is-active' : ''}`,
          {
            href: `/dev/concept?code=${c.code}&redirect=/`, title: c.label, 'aria-label': c.label,
            'aria-current': session.concept === c.code ? 'true' : null,
          },
          c.icon(),
        ))),
        el('span.pv__who', {}, ['Đang xem với ', el('b', {}, session.name)]),
        el('a.ekko-btn.ekko-btn--secondary.ekko-btn--sm', {
          href: '#',
          onclick: (event) => {
            event.preventDefault();
            window.open(TABS.find((t) => t.key === active).src, '_blank');
          },
        }, 'Mở tab mới ↗'),
      ]),
    ]),
    stage,
  );

  renderTabs();
  show(stage, TABS[0]);
}

/** Panels are created lazily and then kept, so switching back keeps the state. */
function show(stage, tab) {
  if (!frames.has(tab.key)) {
    const panel = tab.video ? videoPanel(tab)
      : el('div.pv__panel', {}, [
        // `allow="microphone"`: app bên trong iframe cần micro cho "Nói để ghi".
        el('iframe', { src: tab.src, title: tab.label, loading: 'lazy', allow: 'microphone' }),
      ]);
    frames.set(tab.key, panel);
    stage.append(panel);
  }
  for (const [key, panel] of frames) {
    panel.classList.toggle('is-active', key === tab.key);
    // Rời tab Giới thiệu thì dừng video, không để tiếng chạy ngầm.
    if (key !== tab.key) panel.querySelectorAll('video').forEach((v) => v.pause());
  }
}

/**
 * Tab Giới thiệu: các bản video đặt cạnh nhau. "Phát cùng lúc" chạy tất cả từ đầu,
 * chỉ bản đầu tiên có tiếng (hai giọng đọc chồng lên nhau thì không nghe được gì).
 */
function videoPanel(tab) {
  const players = tab.videos.map((v) => el('video', {
    src: v.src, poster: v.src.replace(/\.mp4(\?.*)?$/, '-poster.jpg'), controls: '', playsinline: '', preload: 'metadata', title: v.label,
  }));
  const playAll = () => players.forEach((video, i) => {
    video.currentTime = 0;
    video.muted = i > 0;
    video.play().catch(() => {});
  });
  return el('div.pv__panel.pv__panel--video', {}, [
    el('div.pv__videos', {}, tab.videos.map((v, i) => el('figure.pv__video', {}, [
      el('figcaption', {}, [el('b', {}, v.label), el('span', {}, v.note)]),
      players[i],
    ]))),
    el('button.pv__playall', { type: 'button', onclick: playAll }, '▶ Phát cùng lúc (tiếng của bản mới)'),
  ]);
}

/**
 * Chưa đăng nhập (hoặc không phải quản trị viên). Bản chạy thật (NODE_ENV=production)
 * không có đăng nhập demo: chuyển thẳng tới /app/ — màn đăng nhập / đăng ký thật.
 * Quản trị viên đăng nhập ở /admin/ rồi quay lại đây thì xem được trang preview.
 */
async function renderSignIn(session) {
  let auth = null;
  try { auth = await api.get('/api/auth/config'); } catch { /* coi như bản demo */ }
  if (auth && !auth.demo) {
    location.replace('/app/');
    return;
  }
  mount(root, el('div.pv__note', { style: { margin: 'auto' } }, [
    el('img', { src: '/assets/logo/Ekko_Primary_Logo_PaydayBlue.svg', alt: 'Ekko', style: { height: '30px', marginBottom: '20px' } }),
    el('h2', {}, 'Mở bản demo'),
    el('p', {}, session.authenticated
      ? `Bạn đang đăng nhập với vai trò ${session.role}. Trang preview cần một tài khoản có quyền quản trị để xem được cả hai giao diện trong cùng một phiên.`
      : 'Trang này nhúng cả app người dùng và Admin portal. Cả hai dùng chung một phiên nên cần đăng nhập bằng tài khoản quản trị.'),
    el('a.ekko-btn.ekko-btn--primary.ekko-btn--md', { href: '/dev/login?role=admin&redirect=/' }, 'Đăng nhập demo'),
  ]));
}

boot().catch((err) => {
  mount(root, el('div.pv__note', { style: { margin: 'auto' } }, [
    el('h2', {}, 'Không mở được trang preview'),
    el('p', {}, String(err.message || err)),
  ]));
});
