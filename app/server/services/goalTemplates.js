/**
 * Bộ mục tiêu gợi ý cho màn "Mục tiêu tài chính".
 *
 * Người dùng chọn một mục tiêu có sẵn thay vì đối diện một form trống: tên, số
 * tiền và thời hạn đã được điền trước, chỉ cần sửa cho khớp hoàn cảnh. Số tiền
 * và số tháng ở đây là điểm khởi đầu hợp lý với thu nhập phổ thông ở Việt Nam,
 * không phải khuyến nghị tài chính.
 *
 * Danh sách nằm ở server để app, Ekko bot và (sau này) Admin portal dùng chung
 * một nguồn duy nhất.
 */

export const GOAL_GROUPS = [
  {
    code: 'safety',
    label: 'Quỹ khẩn cấp',
    icon: 'save-money-dollar-stroke',
    templates: [
      { code: 'emergency', name: 'Quỹ khẩn cấp', emoji: 'umbrella', hint: 'Bằng 1–3 tháng lương', amount: 18000000, months: 12 },
    ],
  },
  {
    code: 'assets',
    label: 'Mua sắm tài sản',
    icon: 'credit-card-stroke',
    templates: [
      { code: 'motorbike', name: 'Mua xe máy', emoji: 'motorbike-01', hint: 'Tài sản cá nhân', amount: 30000000, months: 18 },
      { code: 'phone', name: 'Mua điện thoại', emoji: 'smart-phone-01', hint: 'Nâng cấp thiết bị', amount: 12000000, months: 8 },
      { code: 'laptop', name: 'Mua laptop', emoji: 'laptop', hint: 'Học tập & công việc', amount: 20000000, months: 12 },
    ],
  },
  {
    code: 'family',
    label: 'Gia đình',
    icon: 'home-01-stroke',
    templates: [
      { code: 'tuition', name: 'Học phí cho con', emoji: 'backpack-01', hint: 'Chuẩn bị năm học', amount: 10000000, months: 6 },
      { code: 'house', name: 'Xây / sửa nhà', emoji: 'house-03', hint: 'Cho tổ ấm', amount: 100000000, months: 24 },
      { code: 'tet', name: 'Tết sum vầy', emoji: 'lantern', hint: 'Quà, biếu, du xuân', amount: 15000000, months: 6 },
    ],
  },
  {
    code: 'free',
    label: 'Tự do',
    icon: 'star-stroke',
    templates: [
      // Số tiền để trống: mục tiêu này để người dùng tự đặt tên và tự định giá.
      { code: 'custom', name: 'Mục tiêu tự do', emoji: 'sparkles', hint: 'Bạn tự đặt tên', amount: 0, months: 12 },
    ],
  },
];

const BY_CODE = new Map(
  GOAL_GROUPS.flatMap((group) => group.templates.map((template) => [
    template.code,
    { ...template, group: group.label, groupCode: group.code },
  ])),
);

export const templateByCode = (code) => BY_CODE.get(String(code || '')) || null;

export const GOAL_PERIODS = { month: 'Mỗi tháng', week: 'Mỗi tuần' };
