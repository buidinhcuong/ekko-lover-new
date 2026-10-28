/**
 * Thông tin cá nhân (Ekko Lover): tên hiển thị, giới tính, ngày sinh, công ty,
 * chức vụ, phòng ban, nơi làm việc.
 *
 * Hai lối vào:
 * - `/profile?welcome`: tự mở một lần sau 3 màn onboarding và tour chỉ dẫn
 *   (onboarding.js). Có lời chào và nút "Để sau"; lưu xong thì về màn chủ.
 * - `/profile`: nút "Chỉnh sửa thông tin cá nhân" ở trang Cấp độ heo; lưu xong
 *   thì quay lại trang đó.
 *
 * Chọn giới tính thì ảnh heo ở đầu màn đổi ngay (Nữ dùng ảnh heo nữ của cấp đang
 * đứng, Admin chưa tải ảnh nữ thì vẫn là ảnh chung). Server lưu ở
 * `user_profiles` — xem services/profile.js.
 */
import { api, el, singleFlight, toast, uiIcon } from '/shared/client.js';
import { t } from '../i18n.js';

const GENDERS = [['male', 'Nam'], ['female', 'Nữ'], ['other', 'Khác']];

export default async function profileView(ctx) {
  const welcome = new URLSearchParams(location.hash.split('?')[1] || '').has('welcome');
  const { profile, avatars } = await api.get('/api/me/profile');
  const level = ctx.world.level;

  let gender = profile.gender;
  const avatar = el('img', { src: avatarFor(gender), alt: '' });
  function avatarFor(value) { return value === 'female' ? avatars.female : avatars.male; }

  const text = (value, { placeholder = '', maxlength = '80', autocomplete = 'off' } = {}) => el('input.input', {
    value: value || '', placeholder: t(placeholder), maxlength, autocomplete,
  });
  const nameInput = text(profile.displayName, { placeholder: 'VD: Nguyễn Thu Hà', maxlength: '60', autocomplete: 'name' });
  const birthInput = el('input.input', { type: 'date', value: profile.birthDate || '', min: '1940-01-01', max: ctx.world.today });
  const companyInput = text(profile.company, { placeholder: 'VD: Công ty May Việt Tiến', maxlength: '120', autocomplete: 'organization' });
  const jobInput = text(profile.jobTitle, { placeholder: 'VD: Công nhân, Tổ trưởng, Kế toán', autocomplete: 'organization-title' });
  const departmentInput = text(profile.department, { placeholder: 'VD: Xưởng may 2' });
  const cityInput = text(profile.city, { placeholder: 'VD: TP. Hồ Chí Minh' });

  const genderPick = el('div.segmented', { role: 'radiogroup', 'aria-label': t('Giới tính') }, GENDERS.map(([code, label]) => el('button', {
    type: 'button',
    role: 'radio',
    'aria-pressed': String(code === gender),
    'aria-checked': String(code === gender),
    onclick: (event) => {
      gender = code;
      for (const child of genderPick.children) {
        const on = child === event.currentTarget;
        child.setAttribute('aria-pressed', String(on));
        child.setAttribute('aria-checked', String(on));
      }
      avatar.src = avatarFor(gender);
    },
  }, t(label))));

  const field = (label, control, hint = null) => el('label.field', {}, [
    el('span', {}, t(label)),
    control,
    hint ? el('p.field__hint', {}, t(hint)) : null,
  ]);

  const finish = async () => {
    await ctx.refreshWorld();
    if (welcome) ctx.navigate('/');
    else ctx.goBack();
  };

  const save = singleFlight(async () => {
    const body = {
      displayName: nameInput.value,
      gender,
      birthDate: birthInput.value || null,
      company: companyInput.value,
      jobTitle: jobInput.value,
      department: departmentInput.value,
      city: cityInput.value,
    };
    if (!body.displayName.trim()) { toast(t('Hãy nhập tên của bạn'), 'error'); nameInput.focus(); return; }
    try {
      await api.put('/api/me/profile', body);
    } catch (err) {
      toast(err.message || t('Không lưu được, thử lại nhé'), 'error');
      return;
    }
    toast(t('Đã lưu thông tin cá nhân'), 'success');
    await finish();
  });

  const form = el(`form.profileedit${welcome ? '.profileedit--welcome' : ''}`, {
    novalidate: true,
    onsubmit: (event) => { event.preventDefault(); save(); },
  }, [
    el('div.profileedit__hero', {}, [
      // Khung tròn bọc ảnh: chỉ lấy mặt, cổ và ngực heo như avatar thẻ hồ sơ (style.css).
      el('span.profileedit__avatar', {}, [avatar]),
      el('span.profileedit__level', {}, [
        uiIcon('flash', 16),
        t('Cấp {n}', { n: level?.order_index ?? 1 }),
        level?.name ? ` · ${level.name}` : '',
      ]),
    ]),
    welcome
      ? el('div.profileedit__intro', {}, [
        el('h2', {}, t('Cho Ekko biết thêm về bạn')),
        el('p.muted', {}, t('Ekko dùng thông tin này để gợi ý bài học và mục tiêu hợp với bạn. Bạn sửa lại được bất cứ lúc nào ở trang Cấp độ heo.')),
      ])
      : null,

    el('div.card.profileedit__card', {}, [
      field('Tên hiển thị', nameInput),
      el('div.field', { role: 'group' }, [el('span', {}, t('Giới tính')), genderPick]),
      field('Ngày sinh', birthInput),
    ]),
    el('div.section-title', {}, [t('Công việc')]),
    el('div.card.profileedit__card', {}, [
      field('Công ty', companyInput),
      field('Chức vụ', jobInput),
      field('Phòng ban / bộ phận', departmentInput),
      field('Tỉnh / thành phố nơi làm việc', cityInput),
    ]),

    el('div.profileedit__actions', {}, [
      el('button.btn.btn--block', { type: 'submit' }, t('Lưu thông tin')),
      welcome ? el('button.btn.btn--block.btn--ghost', { type: 'button', onclick: () => ctx.navigate('/') }, t('Để sau')) : null,
    ]),
  ]);

  return form;
}
