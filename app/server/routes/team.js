/**
 * Heo Dream Team (services/teams.js): mã ID, lời mời, rời đội, nhắc giữ streak,
 * trưởng đội mời một bạn ra khỏi đội / trao quyền trưởng đội.
 * Mọi lệnh ghi trả lại cả bảng mới (`board`) để app vẽ lại ngay, khỏi gọi thêm.
 */
import { bad, Router } from '../lib/http.js';
import {
  acceptInvite, cancelInvite, declineInvite, inviteByCode, leaveTeam, markNoticesSeen, markNudgesSeen, nudgeMember,
  removeFromTeam, teamBoard, transferOwnership,
} from '../services/teams.js';

export const teamRouter = new Router();

const withBoard = (userId, result) => {
  if (result.error) throw bad(result.error);
  return { ...result, board: teamBoard(userId) };
};

teamRouter.get('/api/team', ({ user }) => teamBoard(user.id));

teamRouter.post('/api/team/invites', ({ user, body }) => withBoard(user.id, inviteByCode(user.id, body?.code)));
teamRouter.post('/api/team/invites/:id/accept', ({ user, params }) => withBoard(user.id, acceptInvite(user.id, params.id)));
teamRouter.post('/api/team/invites/:id/decline', ({ user, params }) => withBoard(user.id, declineInvite(user.id, params.id)));
teamRouter.delete('/api/team/invites/:id', ({ user, params }) => withBoard(user.id, cancelInvite(user.id, params.id)));

teamRouter.post('/api/team/leave', ({ user }) => withBoard(user.id, leaveTeam(user.id)));
teamRouter.post('/api/team/members/:id/nudge', ({ user, params }) => withBoard(user.id, nudgeMember(user.id, params.id)));
teamRouter.post('/api/team/nudges/seen', ({ user }) => { markNudgesSeen(user.id); return { ok: true }; });
teamRouter.post('/api/team/notices/seen', ({ user }) => { markNoticesSeen(user.id); return { ok: true }; });

// Chỉ trưởng đội.
teamRouter.post('/api/team/members/:id/remove', ({ user, params }) => withBoard(user.id, removeFromTeam(user.id, params.id)));
teamRouter.post('/api/team/members/:id/owner', ({ user, params }) => withBoard(user.id, transferOwnership(user.id, params.id)));
