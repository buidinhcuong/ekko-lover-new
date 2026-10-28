/**
 * Heo Dream Team (tab thứ hai của tabbar Ekko Lover) — xem server/services/teams.js.
 *
 * Từ trên xuống: ID của mình (bấm để chép) + ô mời bạn bằng ID → thông báo bị
 * mời ra khỏi đội / được trao quyền trưởng đội → lời nhắc giữ streak vừa nhận →
 * lời mời đang chờ mình trả lời → đội của mình (xếp theo cấp heo, kèm tiến độ
 * và nút "Nhắc giữ streak"; trưởng đội có thêm nút ⋮ trên từng bạn để trao quyền
 * trưởng đội hoặc mời ra khỏi đội) → lời mời mình đã gửi → Rời đội.
 */
import { api, el, guard, mount, spriteIcon, toast, uiIcon } from '/shared/client.js';
import { t } from '../i18n.js';
import { closeSheet, confirmSheet, friendCodeChip, sheet } from '../ui.js';

// Khung tròn bọc ảnh heo: Ekko Lover chỉ lấy mặt, cổ và ngực (style.css · .teamrow__pig).
const pig = (level) => el('span.teamrow__pig', {}, [el('img', { src: level?.image || '/assets/levels/pig-1.png', alt: '' })]);
const levelLine = (p) => t('Cấp {n} · {name}', { n: p.level?.order ?? 1, name: p.level?.name ?? '' });

export default async function teamView(ctx) {
  const root = el('div.team');
  let board = await api.get('/api/team');

  // Mở màn Dream Team cũng là đã xem lời nhắc giữ streak.
  if (board.nudges.length) {
    api.post('/api/team/nudges/seen', {}).then(() => ctx.refreshWorld()).catch(() => {});
  }
  const nudgesToShow = board.nudges;
  // Thông báo trưởng đội (bị mời ra / được trao quyền): hiện một lần rồi thôi.
  const noticesToShow = board.notices || [];
  if (noticesToShow.length) {
    api.post('/api/team/notices/seen', {}).then(() => ctx.refreshWorld()).catch(() => {});
  }

  /** Gọi một lệnh ghi, vẽ lại bằng bảng mới server trả về. */
  const act = async (button, call, success) => {
    if (button) button.disabled = true;
    const result = await guard(call);
    if (!result) { if (button) button.disabled = false; return; }
    board = result.board;
    if (success) toast(success, 'success');
    draw();
    ctx.refreshWorld().catch(() => {});
  };

  // --- ID của mình + mời bạn ------------------------------------------------
  function inviteCard() {
    const input = el('input.input.teaminvite__input', {
      placeholder: t('Nhập ID bạn heo, VD: EK7KQ2M9'),
      maxlength: '16',
      autocomplete: 'off',
      autocapitalize: 'characters',
      'aria-label': t('ID của bạn heo muốn mời'),
    });
    const button = el('button.btn.teaminvite__btn', { type: 'submit' }, t('Mời'));
    const form = el('form.teaminvite', {
      onsubmit: (event) => {
        event.preventDefault();
        const code = input.value.trim();
        if (!code) { input.focus(); return; }
        act(button, () => api.post('/api/team/invites', { code }), t('Đã gửi lời mời'));
      },
    }, [input, button]);

    return el('div.card.teamhead', {}, [
      el('div.teamhead__top', {}, [
        el('span.teamhead__icon', {}, uiIcon('user-multiple', 24)),
        el('div', {}, [
          el('div.teamhead__title', {}, t('Heo Dream Team')),
          el('div.muted', {}, t('Rủ bạn bè vào chung đội, nhắc nhau giữ streak mỗi ngày.')),
        ]),
      ]),
      el('div.teamhead__me', {}, [el('span.muted', {}, t('ID của bạn')), friendCodeChip(board.me.friendCode)]),
      form,
    ]);
  }

  // --- thông báo trưởng đội ----------------------------------------------------
  function noticeBanners() {
    return noticesToShow.map((n) => el(`div.card.teamnotice.teamnotice--${n.kind}`, {}, [
      el('span.teamnotice__icon', {}, uiIcon(n.kind === 'leader' ? 'crown' : 'user-multiple', 20)),
      el('div', {}, n.kind === 'leader'
        ? [
          el('b', {}, t('{name} đã trao quyền trưởng đội cho bạn', { name: n.fromName || t('Trưởng đội cũ') })),
          el('div.muted', {}, t('Giờ bạn mời được bạn ra khỏi đội và trao quyền trưởng đội cho người khác.')),
        ]
        : [
          el('b', {}, t('{name} đã mời bạn ra khỏi đội', { name: n.fromName || t('Trưởng đội') })),
          el('div.muted', {}, t('Bạn vẫn giữ nguyên cấp heo, XP và streak. Lập đội mới hoặc nhận lời mời khác nhé.')),
        ]),
    ]));
  }

  // --- lời nhắc vừa nhận -----------------------------------------------------
  function nudgeBanner() {
    if (!nudgesToShow.length) return null;
    const names = [...new Set(nudgesToShow.map((n) => n.fromName))].join(', ');
    return el('div.card.teamnudge', {}, [
      el('span.teamnudge__icon', {}, uiIcon('fire', 20)),
      el('div', {}, [
        el('b', {}, t('{names} nhắc bạn giữ streak hôm nay', { names })),
        el('div.muted', {}, t('Học một bài hoặc ghi một khoản chi để giữ chuỗi nhé!')),
      ]),
    ]);
  }

  // --- lời mời gửi tới mình ---------------------------------------------------
  function incomingSection() {
    const list = board.invites.incoming;
    if (!list.length) return null;
    return [
      el('div.section-title', {}, [t('Lời mời vào đội'), el('span', {}, String(list.length))]),
      el('div.card.teamlist', {}, list.map((invite) => {
        const accept = el('button.btn.btn--sm', {
          type: 'button',
          disabled: board.inTeamWithOthers,
          onclick: () => act(accept, () => api.post(`/api/team/invites/${invite.id}/accept`, {}), t('Đã vào đội của {name}', { name: invite.from.name })),
        }, t('Đồng ý'));
        const decline = el('button.btn.btn--sm.btn--ghost', {
          type: 'button',
          onclick: () => act(decline, () => api.post(`/api/team/invites/${invite.id}/decline`, {})),
        }, t('Từ chối'));
        return el('div.teamrow', {}, [
          pig(invite.from.level),
          el('div.teamrow__main', {}, [
            el('div.teamrow__name', {}, t('{name} mời bạn vào đội', { name: invite.from.name })),
            el('div.teamrow__meta', {}, levelLine(invite.from)),
            board.inTeamWithOthers ? el('div.teamrow__note', {}, t('Rời đội hiện tại rồi mới vào được đội này')) : null,
            el('div.teamrow__actions', {}, [decline, accept]),
          ]),
        ]);
      })),
    ];
  }

  // --- đội của mình ------------------------------------------------------------
  function memberStatus(m) {
    if (m.streak.countedToday) return el('span.teamstatus.teamstatus--done', {}, [uiIcon('tick-02', 14), t('Đã giữ streak')]);
    if (m.openedToday) return el('span.teamstatus.teamstatus--warn', {}, t('Chưa giữ streak'));
    return el('span.teamstatus.teamstatus--off', {}, t('Chưa vào app'));
  }

  /** Trưởng đội: trao quyền trưởng đội hoặc mời một bạn ra khỏi đội. */
  function openMemberMenu(m) {
    const transfer = async () => {
      closeSheet();
      const ok = await confirmSheet({
        title: t('Trao quyền trưởng đội?'),
        message: t('{name} sẽ làm trưởng đội. Bạn vẫn ở trong đội nhưng không còn mời được ai ra khỏi đội nữa.', { name: m.name }),
        confirmLabel: t('Trao quyền'),
        tone: 'primary',
      });
      if (ok) act(null, () => api.post(`/api/team/members/${m.userId}/owner`, {}), t('{name} giờ là trưởng đội', { name: m.name }));
    };
    const remove = async () => {
      closeSheet();
      const ok = await confirmSheet({
        title: t('Mời {name} ra khỏi đội?', { name: m.name }),
        message: t('{name} sẽ không còn ở trong đội và nhận được thông báo. Muốn quay lại thì cần được mời lại.', { name: m.name }),
        confirmLabel: t('Mời ra khỏi đội'),
      });
      if (ok) act(null, () => api.post(`/api/team/members/${m.userId}/remove`, {}), t('Đã mời {name} ra khỏi đội', { name: m.name }));
    };
    sheet({
      title: m.name,
      body: [
        el('div.teammenu__who', {}, [pig(m.level), el('div', {}, [el('b', {}, m.name), el('div.muted', {}, levelLine(m))])]),
        el('div.teammenu__actions', {}, [
          el('button.btn.btn--ghost.btn--block.teammenu__btn', { type: 'button', onclick: transfer }, [uiIcon('crown', 18), t('Trao quyền trưởng đội')]),
          el('button.btn.btn--danger.btn--block.teammenu__btn', { type: 'button', onclick: remove }, [uiIcon('cancel-01', 18), t('Mời ra khỏi đội')]),
        ]),
      ],
    });
  }

  function memberRow(m) {
    let action = null;
    if (!m.isMe && !m.streak.countedToday) {
      action = m.nudgedToday
        ? el('button.btn.btn--sm.btn--ghost.teamrow__nudge', { type: 'button', disabled: true }, t('Đã nhắc'))
        : el('button.btn.btn--sm.teamrow__nudge', {
          type: 'button',
          title: t('Nhắc {name} giữ streak', { name: m.name }),
          'aria-label': t('Nhắc {name} giữ streak', { name: m.name }),
          onclick: (event) => act(event.currentTarget, () => api.post(`/api/team/members/${m.userId}/nudge`, {}), t('Đã nhắc {name} giữ streak', { name: m.name })),
        }, [uiIcon('fire', 16), t('Nhắc')]);
    }
    return el(`div.teamrow${m.isMe ? '.is-me' : ''}`, {}, [
      el('span.teamrow__rank', {}, String(m.rank)),
      pig(m.level),
      el('div.teamrow__main', {}, [
        el('div.teamrow__name', {}, [
          el('span.teamrow__nametext', {}, m.name),
          m.isMe ? el('span.teamrow__tag', {}, t('Bạn')) : null,
          m.isOwner ? el('span.teamrow__owner', { title: t('Trưởng đội') }, uiIcon('crown', 14)) : null,
        ]),
        el('div.teamrow__meta', {}, levelLine(m)),
        // Thanh tiến độ ngắn + số XP ngay bên phải.
        el('div.teamrow__progress', {}, [
          el('div.teamrow__bar', { title: m.nextLevelName ? t('Còn {xp} XP nữa lên {name}', { xp: m.xpToNextLevel, name: m.nextLevelName }) : t('Bạn đã ở cấp cao nhất') }, [
            el('i', { style: { width: `${Math.min(100, m.percent || 0)}%` } }),
          ]),
          el('span.teamrow__xp', {}, `${m.xp} XP`),
        ]),
      ]),
      // Cột phải: streak, trạng thái hôm nay, nút nhắc. Cao cố định để mọi dòng
      // (đã giữ streak / chưa giữ / chưa vào app) cao bằng nhau.
      el('div.teamrow__side', {}, [
        // Trưởng đội: nút ⋮ cạnh streak (đặt ở cột phải để không lấn chỗ của tên).
        el('div.teamrow__sidetop', {}, [
          el('span.teamrow__streak', {}, [uiIcon(m.streak.status === 'frozen' ? 'snow' : 'fire', 14), t('{n} ngày', { n: m.streak.count })]),
          board.team.isOwner && !m.isMe
            ? el('button.teamrow__more', {
              type: 'button',
              title: t('Tuỳ chọn cho {name}', { name: m.name }),
              'aria-label': t('Tuỳ chọn cho {name}', { name: m.name }),
              onclick: () => openMemberMenu(m),
            }, spriteIcon('more-vertical-stroke', 16))
            : null,
        ]),
        memberStatus(m),
        action,
      ]),
    ]);
  }

  function teamSection() {
    const team = board.team;
    if (!team) {
      return el('div.card.teamempty', {}, [
        el('img', { src: '/assets/mascot/ekko-lover-mascot.png', alt: '' }),
        el('b', {}, t('Bạn chưa có đội')),
        el('p.muted', {}, t('Gửi ID của bạn cho bạn bè, hoặc nhập ID của họ ở trên để lập Heo Dream Team.')),
      ]);
    }
    return [
      el('div.section-title', {}, [
        team.isOwner ? t('Đội của bạn') : t('Đội của {name}', { name: team.ownerName }),
        el('span', {}, t('{n}/{max} heo', { n: team.members.length, max: team.max })),
      ]),
      el('div.card.teamlist', {}, team.members.map(memberRow)),
      team.members.length === 1 ? el('p.muted.teamhint', {}, t('Mời thêm bạn bằng ID để cùng nhau giữ streak.')) : null,
    ];
  }

  function outgoingSection() {
    const list = board.invites.outgoing;
    if (!list.length) return null;
    return [
      el('div.section-title', {}, [t('Đang chờ trả lời'), el('span', {}, String(list.length))]),
      el('div.card.teamlist', {}, list.map((invite) => {
        const cancel = el('button.btn.btn--sm.btn--ghost', {
          type: 'button',
          onclick: () => act(cancel, () => api.delete(`/api/team/invites/${invite.id}`)),
        }, t('Huỷ lời mời'));
        return el('div.teamrow.teamrow--pending', {}, [
          el('span.teamrow__wait', {}, uiIcon('clock-01', 20)),
          el('div.teamrow__main', {}, [el('div.teamrow__name', {}, invite.to.name), el('div.teamrow__meta', {}, t('Chưa trả lời lời mời'))]),
          cancel,
        ]);
      })),
    ];
  }

  function leaveButton() {
    if (!board.team) return null;
    const button = el('button.btn.btn--ghost.btn--block.teamleave', {
      type: 'button',
      onclick: async () => {
        // Trưởng đội rời đi: người vào đội sớm nhất làm trưởng đội (services/teams.js).
        const heir = board.team.isOwner
          ? board.team.members.filter((m) => !m.isMe).sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.userId - b.userId)[0]
          : null;
        const ok = await confirmSheet({
          title: t('Rời đội?'),
          message: board.team.members.length === 1
            ? t('Đội chỉ còn mình bạn, rời đi thì đội sẽ giải tán.')
            : heir
              ? t('Bạn đang là trưởng đội. Rời đi thì {name} (vào đội sớm nhất) làm trưởng đội. Muốn chọn người khác, hãy trao quyền trưởng đội trước.', { name: heir.name })
              : t('Bạn sẽ không còn thấy tiến độ của các bạn trong đội. Muốn quay lại thì cần được mời lại.'),
          confirmLabel: t('Rời đội'),
        });
        if (ok) act(button, () => api.post('/api/team/leave', {}), t('Đã rời đội'));
      },
    }, t('Rời đội'));
    return button;
  }

  function draw() {
    mount(root, inviteCard(), noticeBanners(), nudgeBanner(), incomingSection(), teamSection(), outgoingSection(), leaveButton());
  }
  draw();
  return root;
}
