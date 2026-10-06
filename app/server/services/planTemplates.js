/**
 * Bộ kế hoạch gợi ý cho màn "Nhiệm vụ".
 *
 * Người dùng chọn một kế hoạch có sẵn thay vì đối diện một form trống: tên, số
 * nhiệm vụ và thời hạn đã được điền trước, chỉ cần sửa cho khớp hoàn cảnh.
 *
 * Danh sách nằm ở server để app, Ekko bot và (sau này) Admin portal dùng chung
 * một nguồn duy nhất.
 */

export const PLAN_GROUPS = [
  {
    code: 'learn',
    label: 'Học tập',
    icon: 'book-open-stroke',
    templates: [
      { code: 'course', name: 'Hoàn thành khóa học', emoji: 'books-01', hint: 'Nhiệm vụ học tập', tasks: 5, months: 3 },
      { code: 'reading', name: 'Đọc sách tiết kiệm', emoji: 'book-open-01', hint: 'Đọc đều mỗi tuần', tasks: 12, months: 6 },
      { code: 'skill', name: 'Học kỹ năng mới', emoji: 'bulb', hint: 'Phát triển bản thân', tasks: 8, months: 4 },
    ],
  },
  {
    code: 'finance',
    label: 'Tài chính',
    icon: 'wallet-stroke',
    templates: [
      { code: 'save', name: 'Tiết kiệm đều đặn', emoji: 'money-bag-02', hint: 'Tiết kiệm hàng tháng', tasks: 4, months: 6 },
      { code: 'invest', name: 'Bắt đầu đầu tư', emoji: 'chart-increase', hint: 'Nhiệm vụ đầu tư', tasks: 6, months: 12 },
      { code: 'debt', name: 'Trả hết nợ', emoji: 'credit-card', hint: 'Lập lịch trả nợ', tasks: 8, months: 12 },
    ],
  },
  {
    code: 'lifestyle',
    label: 'Lối sống',
    icon: 'heart-stroke',
    templates: [
      { code: 'fitness', name: 'Nhiệm vụ thể dục', emoji: 'dumbbell-01', hint: 'Tập thể dục đều đặn', tasks: 20, months: 3 },
      { code: 'health', name: 'Sức khỏe tốt hơn', emoji: 'hospital-01', hint: 'Cải thiện sức khỏe', tasks: 10, months: 6 },
      { code: 'habit', name: 'Xây dựng thói quen', emoji: 'flash', hint: 'Thói quen mới', tasks: 30, months: 3 },
    ],
  },
  {
    code: 'custom',
    label: 'Tự do',
    icon: 'star-stroke',
    templates: [
      { code: 'free', name: 'Nhiệm vụ tự do', emoji: 'sparkles', hint: 'Bạn tự đặt tên', tasks: 0, months: 3 },
    ],
  },
];

const BY_CODE = new Map(
  PLAN_GROUPS.flatMap((group) => group.templates.map((template) => [
    template.code,
    { ...template, group: group.label, groupCode: group.code },
  ])),
);

export const templateByCode = (code) => BY_CODE.get(String(code || '')) || null;

export const PLAN_PERIODS = { month: 'Mỗi tháng', week: 'Mỗi tuần' };
