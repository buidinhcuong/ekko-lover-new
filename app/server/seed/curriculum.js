/**
 * The starting curriculum. Admins edit all of this in the portal afterwards.
 *
 * Frame kinds and their payloads:
 *   text_image  { title, body, image?, imageAlt?, caption? }
 *   slide       { image, alt, caption? }            rendered at 1 : 1.371
 *   interactive { title, intro?, image, alt, hotspots: [{ x, y, label, text }] }
 *   quiz        { question, options: [{ text, correct, explain? }] }
 *
 * Hotspot x/y are percentages of the image box, so art can be swapped freely.
 */

const s = (image, caption, alt) => ({ kind: 'slide', payload: { image, caption, alt: alt || caption } });
const q = (question, options) => ({ kind: 'quiz', payload: { question, options } });

const LESSON = '/assets/lessons';
const GOALS = `${LESSON}/dat-muc-tieu`;
const MONEY = `${LESSON}/quan-ly-tien`;
const FINANCE = `${LESSON}/to-chuc-tai-chinh`;
const INSURE = `${LESSON}/bao-hiem`;
const SCAM = `${LESSON}/lua-dao`;
const LABOR = `${LESSON}/quyen-loi-lao-dong`;
const DIGITAL = `${LESSON}/tai-chinh-so`;
const FAMILY = `${LESSON}/tuong-lai-gia-dinh`;

export const MODULES = [
  // ------------------------------------------------------------------ 1
  // Mô đun từ thiết kế cũ trên Figma ("Giáo dục tài chính (New) 2" · Mô-đun 1
  // Session 1 và 2). Mỗi trang là nguyên tấm thẻ 350 × 480 xuất ra ảnh, đúng
  // khuôn khung slide 1 : 1.371. Câu trắc nghiệm viết mới theo nội dung slide.
  {
    slug: 'dat-muc-tieu-tai-chinh',
    title: 'Đặt mục tiêu tài chính',
    summary: 'Biến ước mơ thành mục tiêu rõ ràng, rồi lập kế hoạch tiết kiệm để đạt được chúng.',
    cover_image: `${GOALS}/cover.png`,
    unlock_level: 1,
    lessons: [
      {
        slug: 'muc-tieu-ngan-han-dai-han',
        title: 'Đặt mục tiêu ngắn hạn và dài hạn trong cuộc sống',
        summary: 'Xác định các mục tiêu của bạn và phân loại chúng theo ngắn hạn, trung hạn hay dài hạn.',
        cover_image: `${GOALS}/cover.png`,
        est_minutes: 5,
        frames: [
          s(`${GOALS}/s1-01.png`, null, 'Chào mừng!'),
          s(`${GOALS}/s1-02.png`, null, 'Bạn muốn đi đâu?'),
          s(`${GOALS}/s1-03.png`, null, 'Hãy suy nghĩ về mục tiêu của bạn'),
          s(`${GOALS}/s1-04.png`, null, 'Bạn có mục tiêu không?'),
          s(`${GOALS}/s1-05.png`, null, 'Mục tiêu ngắn hạn hay dài hạn?'),
          s(`${GOALS}/s1-06.png`, null, 'Mục tiêu và vòng đời của bạn'),
          s(`${GOALS}/s1-07.png`, null, 'Mục tiêu cá nhân của bạn có phù hợp với mục tiêu kinh doanh và gia đình không?'),
          s(`${GOALS}/s1-08.png`, null, 'Ôn lại những điều đã học'),
          q('Mục tiêu bạn muốn đạt được trong vòng một đến ba năm được gọi là gì?', [
            { text: 'Mục tiêu ngắn hạn', correct: false, explain: 'Mục tiêu ngắn hạn là mục tiêu đạt được trong vòng một năm.' },
            { text: 'Mục tiêu trung hạn', correct: true, explain: 'Đúng. Từ một đến ba năm là mục tiêu trung hạn.' },
            { text: 'Mục tiêu dài hạn', correct: false, explain: 'Mục tiêu dài hạn cần ba năm hoặc lâu hơn.' },
          ]),
          q('Sinh con, mua nhà, chi trả học phí thuộc nhóm mục tiêu nào?', [
            { text: 'Mục tiêu cá nhân', correct: false, explain: 'Mục tiêu cá nhân là điều bạn muốn cho riêng mình, như học tập hay mua điện thoại mới.' },
            { text: 'Mục tiêu gia đình', correct: true, explain: 'Đúng. Đây là những mục tiêu bạn muốn đạt được với tư cách một gia đình.' },
            { text: 'Mục tiêu kinh doanh', correct: false, explain: 'Mục tiêu kinh doanh gắn với công việc làm ăn và đối tác của bạn.' },
          ]),
          q('Vì sao mục tiêu của bạn thường thay đổi theo thời gian?', [
            { text: 'Vì mỗi giai đoạn cuộc đời có những sự kiện và nhu cầu khác nhau', correct: true, explain: 'Đúng. Học tập, đi làm, kết hôn, sinh con, nghỉ hưu, mỗi chặng đều mang mục tiêu mới.' },
            { text: 'Vì mục tiêu đặt ra rồi thì không cần giữ', correct: false, explain: 'Mục tiêu cần được giữ và xem lại, chỉ là nó thay đổi theo giai đoạn cuộc đời.' },
            { text: 'Vì chỉ mục tiêu ngắn hạn mới đáng theo đuổi', correct: false, explain: 'Mục tiêu dài hạn như mua nhà hay nghỉ hưu cũng quan trọng không kém.' },
          ]),
        ],
      },
      {
        slug: 'lap-ke-hoach-dat-muc-tieu',
        title: 'Lập kế hoạch để đạt được mục tiêu tài chính của bạn',
        summary: 'Bốn bước biến mục tiêu thành kế hoạch tiết kiệm: đặt mục tiêu, đánh giá chi phí, đặt ưu tiên, lập kế hoạch.',
        cover_image: `${GOALS}/cover.png`,
        est_minutes: 6,
        frames: [
          s(`${GOALS}/s2-01.png`, null, 'Một mục tiêu không có kế hoạch chỉ là một ước muốn'),
          s(`${GOALS}/s2-02.png`, null, 'Nếu bạn không lên kế hoạch thì có nghĩa là bạn đang lên kế hoạch cho việc thất bại'),
          s(`${GOALS}/s2-03.png`, null, 'Nếu bạn là Lan, chắc chắn bạn sẽ gặp khó khăn nếu không lên kế hoạch ngay từ đầu'),
          s(`${GOALS}/s2-04.png`, null, 'Các bước lập kế hoạch để đạt được mục tiêu'),
          s(`${GOALS}/s2-05.png`, null, 'Bước 1: Đặt mục tiêu'),
          s(`${GOALS}/s2-06.png`, null, 'Bước 2: Đánh giá chi phí của mục tiêu'),
          s(`${GOALS}/s2-07.png`, null, 'Bước 3: Đặt mức độ ưu tiên'),
          s(`${GOALS}/s2-08.png`, null, 'Bảng kế hoạch tiết kiệm mẫu'),
          s(`${GOALS}/s2-09.png`, null, 'Bước 4: Lập kế hoạch tiết kiệm'),
          s(`${GOALS}/s2-10.png`, null, 'Ôn lại: bốn bước xây dựng kế hoạch tiết kiệm'),
          q('Khi lập kế hoạch tiết kiệm, bước nào đến ngay sau "Đặt mục tiêu"?', [
            { text: 'Đánh giá chi phí của mục tiêu', correct: true, explain: 'Đúng. Biết mục tiêu rồi thì phải biết nó tốn bao nhiêu.' },
            { text: 'Đặt mức độ ưu tiên', correct: false, explain: 'Đây là bước thứ ba, sau khi đã biết chi phí của từng mục tiêu.' },
            { text: 'Lập kế hoạch tiết kiệm', correct: false, explain: 'Đây là bước cuối cùng, khi đã có đủ mục tiêu, chi phí và thứ tự ưu tiên.' },
          ]),
          q('Mua ô tô 700.000.000đ sau 16 tháng, đã có 200.000.000đ hỗ trợ. Mỗi tháng cần tiết kiệm bao nhiêu?', [
            { text: '43.750.000đ', correct: false, explain: 'Con số này chưa trừ 200.000.000đ được hỗ trợ.' },
            { text: '31.250.000đ', correct: true, explain: 'Đúng. Còn thiếu 500.000.000đ, chia cho 16 tháng là 31.250.000đ.' },
            { text: '12.500.000đ', correct: false, explain: 'Đây mới là khoản hỗ trợ chia cho 16 tháng, không phải phần bạn cần tự để dành.' },
          ]),
        ],
      },
      {
        // Bài giới thiệu chức năng Mục tiêu của app, dựng cùng khuôn slide với hai
        // bài trên, kèm ảnh chụp màn hình thật. Slide cuối có nút "Tạo mục tiêu
        // ngay": hoàn thành bài rồi mở thẳng chức năng để thực hành.
        slug: 'chuc-nang-muc-tieu',
        title: 'Dùng chức năng Mục tiêu trong app Ekko',
        summary: 'Đặt mục tiêu, để Ekko tính số tiền cần để dành mỗi kỳ, rồi nạp tiền và theo dõi tiến độ.',
        cover_image: `${GOALS}/cover.png`,
        est_minutes: 3,
        frames: [
          s(`${GOALS}/s3-01.png`, null, 'Chức năng Mục tiêu trong app Ekko'),
          s(`${GOALS}/s3-02.png`, null, 'Bắt đầu từ một mục tiêu gợi ý'),
          s(`${GOALS}/s3-03.png`, null, 'Điền ba thông tin: tên, số tiền và thời hạn'),
          s(`${GOALS}/s3-04.png`, null, 'Ekko tính số tiền cần tiết kiệm mỗi kỳ'),
          s(`${GOALS}/s3-05.png`, null, 'Nạp tiền và theo dõi tiến độ'),
          s(`${GOALS}/s3-06.png`, null, 'Ôn lại: dùng chức năng Mục tiêu'),
          {
            kind: 'slide',
            payload: {
              image: `${GOALS}/s3-07.png`,
              caption: null,
              alt: 'Đến lượt bạn thực hành: tạo mục tiêu đầu tiên',
              cta: { label: 'Tạo mục tiêu ngay', route: '/goals' },
            },
          },
          q('Sau khi bạn nhập số tiền và thời hạn, chức năng Mục tiêu giúp bạn điều gì?', [
            { text: 'Tính số tiền cần tiết kiệm mỗi tháng hoặc mỗi tuần', correct: true, explain: 'Đúng. Ekko chia số tiền còn thiếu cho số kỳ còn lại trước hạn.' },
            { text: 'Tự động trừ tiền từ tài khoản ngân hàng', correct: false, explain: 'Ekko không trừ tiền của bạn; bạn tự nạp mỗi khi để dành được.' },
            { text: 'Cho vay thêm để đạt mục tiêu sớm hơn', correct: false, explain: 'Chức năng Mục tiêu giúp bạn để dành, không phải đi vay.' },
          ]),
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ 2
  // Mô đun từ thiết kế cũ trên Figma ("Giáo dục tài chính (New) 2" · Mô-đun 2
  // Session 1–4), cùng cách làm với các mô đun trên.
  {
    slug: 'quan-ly-tien-bac-thong-minh',
    title: 'Quản lý tiền bạc thông minh',
    summary: 'Trang bị kỹ năng tài chính thiết thực giúp bạn làm chủ thu nhập, chi tiêu trong cuộc sống.',
    cover_image: `${MONEY}/cover.png`,
    unlock_level: 1,
    lessons: [
      {
        slug: 'chi-tieu-thong-minh',
        title: 'Hãy là người chi tiêu thông minh',
        summary: 'Phân biệt mong muốn với nhu cầu và tự tin đưa ra quyết định chi tiêu.',
        cover_image: `${MONEY}/cover.png`,
        est_minutes: 5,
        frames: [
          s(`${MONEY}/s1-01.png`, null, 'Tiền có từ trên trời rơi xuống không?'),
          s(`${MONEY}/s1-02.png`, null, 'Bạn có thể tuân thủ kế hoạch của mình không?'),
          s(`${MONEY}/s1-03.png`, null, 'Tại sao tôi lại phải tốn tiền vào việc đó nhỉ?'),
          s(`${MONEY}/s1-04.png`, null, 'Việc đưa ra quyết định chi tiêu thường rất khó khăn'),
          s(`${MONEY}/s1-05.png`, null, 'Mong muốn hay nhu cầu?'),
          s(`${MONEY}/s1-06.png`, null, 'Mong muốn, nhu cầu và cách tiết kiệm nhiều hơn'),
          s(`${MONEY}/s1-07.png`, null, 'Đối mặt với những kỳ vọng'),
          s(`${MONEY}/s1-08.png`, null, 'Khi bạn có thu nhập, bạn có trách nhiệm đưa ra quyết định chi tiêu'),
          q('Theo bài học, "mong muốn" là gì?', [
            { text: 'Những thứ tuỳ chọn, mang lại sự thoải mái nhưng không thiết yếu', correct: true, explain: 'Đúng. Bạn vẫn sống được mà không cần chúng.' },
            { text: 'Những thứ bạn phải có để có một cuộc sống tử tế', correct: false, explain: 'Đó là nhu cầu, những thứ thiết yếu.' },
            { text: 'Những khoản chi cố định mỗi tháng', correct: false, explain: 'Chi cố định có thể là nhu cầu hoặc mong muốn; điều phân biệt là nó có thiết yếu hay không.' },
          ]),
          q('Khoản nào sau đây bài học xem là một nhu cầu?', [
            { text: 'Chiếc điện thoại đời mới nhất', correct: false, explain: 'Đây là mong muốn: tiện, thích, nhưng không thiết yếu.' },
            { text: 'Tiết kiệm', correct: true, explain: 'Đúng. Tiết kiệm là một nhu cầu, là tấm đệm an toàn cho trường hợp khẩn cấp.' },
            { text: 'Bữa ăn nhà hàng cuối tuần', correct: false, explain: 'Đây là mong muốn, có thể cắt giảm để tiết kiệm nhiều hơn.' },
          ]),
        ],
      },
      {
        slug: 'tao-ngan-sach',
        title: 'Tạo ngân sách',
        summary: 'Lập ngân sách cá nhân và gia đình: thu nhập, chi phí và phần tiết kiệm còn lại.',
        cover_image: `${MONEY}/cover.png`,
        est_minutes: 6,
        frames: [
          s(`${MONEY}/s2-01.png`, null, 'Ngân sách là gì?'),
          s(`${MONEY}/s2-02.png`, null, 'Bảng ngân sách cá nhân mẫu'),
          s(`${MONEY}/s2-03.png`, null, 'Bảng ngân sách gia đình mẫu'),
          s(`${MONEY}/s2-04.png`, null, 'Thu nhập thường xuyên và không thường xuyên'),
          s(`${MONEY}/s2-05.png`, null, 'Các khoản chi phí trong bảng ngân sách'),
          s(`${MONEY}/s2-06.png`, null, 'Tiết kiệm: thặng dư hay thâm hụt'),
          s(`${MONEY}/s2-07.png`, null, 'Thiếu hụt ngoài dự kiến'),
          s(`${MONEY}/s2-08.png`, null, 'Mẹo đối phó với những thách thức'),
          s(`${MONEY}/s2-09.png`, null, 'Ngân sách là công cụ để quyết định, lập kế hoạch và sử dụng tiền của bạn tốt hơn'),
          q('Tiền thưởng và tiền làm thêm giờ thuộc loại thu nhập nào?', [
            { text: 'Thu nhập thường xuyên', correct: false, explain: 'Thu nhập thường xuyên là khoản ổn định như tiền lương.' },
            { text: 'Thu nhập không thường xuyên', correct: true, explain: 'Đúng. Đây là khoản biến động, không nên phụ thuộc vào nó.' },
            { text: 'Không tính là thu nhập', correct: false, explain: 'Vẫn là thu nhập, chỉ cần ghi riêng để theo dõi cách dùng.' },
          ]),
          q('Dòng tiết kiệm (tổng thu nhập trừ tổng chi tiêu) ra số âm nghĩa là gì?', [
            { text: 'Thặng dư, còn tiền để tiết kiệm', correct: false, explain: 'Thặng dư là khi con số này dương.' },
            { text: 'Thâm hụt, không đủ tiền trang trải các chi phí', correct: true, explain: 'Đúng. Khi đó cần tăng thu nhập hoặc giảm chi phí.' },
            { text: 'Ngân sách đã cân bằng', correct: false, explain: 'Cân bằng là khi thu và chi bằng nhau, con số bằng 0.' },
          ]),
        ],
      },
      {
        // Bài giới thiệu chức năng Ngân sách của app, ngay sau bài Tạo ngân sách:
        // cùng khuôn slide, kèm ảnh chụp màn hình thật. Slide cuối có nút "Đặt
        // ngân sách ngay": hoàn thành bài rồi mở thẳng chức năng để thực hành.
        slug: 'chuc-nang-ngan-sach',
        title: 'Dùng chức năng Ngân sách trong app Ekko',
        summary: 'Đặt hạn mức chi cho từng nhóm, để ngân sách tự lặp lại và theo dõi thanh tiến độ chạy theo chi tiêu thật.',
        cover_image: `${MONEY}/cover.png`,
        est_minutes: 3,
        frames: [
          s(`${MONEY}/ns-01.png`, null, 'Chức năng Ngân sách trong app Ekko'),
          s(`${MONEY}/ns-02.png`, null, 'Đặt hạn mức cho từng nhóm chi tiêu'),
          s(`${MONEY}/ns-03.png`, null, 'Để ngân sách tự làm việc: thông báo 80%, lặp lại, ghi chú'),
          s(`${MONEY}/ns-04.png`, null, 'Thanh tiến độ chạy theo chi tiêu thật'),
          s(`${MONEY}/ns-05.png`, null, 'Khi sắp chạm hoặc đã vượt hạn mức'),
          s(`${MONEY}/ns-06.png`, null, 'Ôn lại: dùng chức năng Ngân sách'),
          {
            kind: 'slide',
            payload: {
              image: `${MONEY}/ns-07.png`,
              caption: null,
              alt: 'Đến lượt bạn thực hành: đặt ngân sách cho tháng này',
              cta: { label: 'Đặt ngân sách ngay', route: '/budget' },
            },
          },
          q('Thanh tiến độ của một ngân sách chuyển sang màu đỏ nghĩa là gì?', [
            { text: 'Bạn đã chi vượt hạn mức của nhóm đó', correct: true, explain: 'Đúng. App còn báo số tiền vượt để bạn điều chỉnh ngay.' },
            { text: 'Bạn đã dùng hơn 80% hạn mức', correct: false, explain: 'Khi đó thanh chuyển màu vàng, báo hiệu bạn nên chậm lại.' },
            { text: 'Ngân sách đã được lặp lại sang tháng sau', correct: false, explain: 'Lặp lại không đổi màu thanh; màu chỉ phản ánh mức chi so với hạn mức.' },
          ]),
        ],
      },
      {
        slug: 'theo-doi-ngan-sach',
        title: 'Theo dõi và giữ đúng ngân sách của bạn',
        summary: 'Ghi lại thu nhập và chi phí bằng bảng theo dõi để luôn đi đúng ngân sách.',
        cover_image: `${MONEY}/cover.png`,
        est_minutes: 6,
        frames: [
          s(`${MONEY}/s3-01.png`, null, 'Giữ đúng phạm vi ngân sách là một hành động cân bằng!'),
          s(`${MONEY}/s3-02.png`, null, 'Bạn có kế hoạch để chi tiêu rõ ràng hay không?'),
          s(`${MONEY}/s3-03.png`, null, 'Bảng theo dõi thu nhập'),
          s(`${MONEY}/s3-04.png`, null, 'Cách điền bảng theo dõi thu nhập: tên, tháng và ngày'),
          s(`${MONEY}/s3-05.png`, null, 'Cách điền bảng theo dõi thu nhập: thu nhập, số tiền và tổng'),
          s(`${MONEY}/s3-06.png`, null, 'Bảng theo dõi chi phí'),
          s(`${MONEY}/s3-07.png`, null, 'Cách điền bảng theo dõi chi phí: tên, ngày và chi phí'),
          s(`${MONEY}/s3-08.png`, null, 'Cách điền bảng theo dõi chi phí: số tiền, tổng và tiết kiệm'),
          s(`${MONEY}/s3-09.png`, null, 'Việc tuân thủ ngân sách cho phép bạn tiết kiệm được số tiền đã lên kế hoạch cho mục tiêu'),
          q('Khi thấy mình chi tiêu nhiều hơn mức dự trù, bạn nên làm gì?', [
            { text: 'Điều chỉnh chi tiêu ngay', correct: true, explain: 'Đúng. Theo dõi sớm thì điều chỉnh sớm, trước khi thành thâm hụt.' },
            { text: 'Đợi hết năm rồi tính lại một lần', correct: false, explain: 'Đến lúc đó khoản vượt đã quá lớn để bù lại.' },
            { text: 'Ngừng ghi chép cho đỡ áp lực', correct: false, explain: 'Không ghi thì không biết mình đang vượt bao nhiêu.' },
          ]),
        ],
      },
      {
        slug: 'luu-giu-hoa-don',
        title: 'Lưu giữ hoá đơn, giấy tờ để quản lý tiền của bạn',
        summary: 'Những chứng từ, hoá đơn nên giữ và vì sao chúng giúp bạn quản lý tiền tốt hơn.',
        cover_image: `${MONEY}/cover.png`,
        est_minutes: 3,
        frames: [
          s(`${MONEY}/s4-01.png`, null, 'Tôi đã để hóa đơn đó ở đâu?'),
          s(`${MONEY}/s4-02.png`, null, 'Tôi sẽ lưu giữ những chứng từ, hóa đơn nào?'),
          s(`${MONEY}/s4-03.png`, null, 'Các lý do để lưu giữ hồ sơ, hóa đơn của bạn'),
          s(`${MONEY}/s4-04.png`, null, 'Luôn lưu giữ chứng từ, hóa đơn về các giao dịch tài chính để quản lý tiền tốt hơn'),
          q('Vì sao nên lưu giữ hoá đơn, chứng từ chi tiêu?', [
            { text: 'Để biết chính xác số tiền đã chi và điền ngân sách dễ hơn', correct: true, explain: 'Đúng. Hoá đơn cho con số cụ thể của từng khoản chi đã qua.' },
            { text: 'Chỉ để đổi trả hàng khi cần', correct: false, explain: 'Đổi trả là một lý do, nhưng giá trị lớn nhất là giúp bạn theo dõi tiền.' },
            { text: 'Không cần giữ nếu đã thanh toán xong', correct: false, explain: 'Chứng từ còn giúp đối chiếu khi có sai sót với ngân hàng hay nhà cung cấp.' },
          ]),
        ],
      },
      {
        // Bài giới thiệu chức năng Ghi chép chi tiêu, nối tiếp bài Lưu giữ hoá
        // đơn (chụp hoá đơn ngay khi ghi). Cùng khuôn slide, ảnh chụp màn hình
        // thật; slide cuối có nút "Ghi chép ngay" mở thẳng chức năng.
        slug: 'chuc-nang-ghi-chep',
        title: 'Dùng chức năng Ghi chép trong app Ekko',
        summary: 'Ghi mỗi khoản chi trong vài giây: gõ tắt số tiền, chụp hoá đơn, nhắn Ekko bot, rồi xem lại theo ngày, tuần và nhóm.',
        cover_image: `${MONEY}/cover.png`,
        est_minutes: 3,
        frames: [
          s(`${MONEY}/gc-01.png`, null, 'Chức năng Ghi chép trong app Ekko'),
          s(`${MONEY}/gc-02.png`, null, 'Ghi một khoản chi thật nhanh: gõ tắt số tiền, tự chọn phân loại'),
          s(`${MONEY}/gc-03.png`, null, 'Chụp hoá đơn thay cho ghi tay'),
          s(`${MONEY}/gc-04.png`, null, 'Ghi nhanh bằng một câu với Ekko bot'),
          s(`${MONEY}/gc-05.png`, null, 'Xem lại chi tiêu theo ngày, tuần và nhóm'),
          s(`${MONEY}/gc-06.png`, null, 'Ôn lại: dùng chức năng Ghi chép'),
          {
            kind: 'slide',
            payload: {
              image: `${MONEY}/gc-07.png`,
              caption: null,
              alt: 'Đến lượt bạn thực hành: ghi khoản chi đầu tiên hôm nay',
              cta: { label: 'Ghi chép ngay', route: '/expenses' },
            },
          },
          q('Vì sao nên chụp hoá đơn khi ghi một khoản chi?', [
            { text: 'Ekko đọc số tiền giúp bạn và giữ luôn ảnh hoá đơn làm chứng từ', correct: true, explain: 'Đúng. Vừa đỡ phải gõ, vừa không lo thất lạc hoá đơn.' },
            { text: 'Để khoản chi được tính gấp đôi điểm XP', correct: false, explain: 'Chụp hay gõ tay đều được tính như nhau; lợi ích nằm ở chứng từ.' },
            { text: 'Vì không chụp hoá đơn thì không ghi được khoản chi', correct: false, explain: 'Bạn vẫn ghi tay được; chụp hoá đơn chỉ giúp nhanh và chắc hơn.' },
          ]),
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ 3
  // Mô đun từ thiết kế cũ trên Figma ("Giáo dục tài chính (New) 2" · Mô-đun 3
  // Session 1–7), cùng cách làm với các mô đun trên.
  {
    slug: 'to-chuc-tai-chinh',
    title: 'Tự tin sử dụng các sản phẩm và dịch vụ của các tổ chức tài chính',
    summary: 'Hiểu các cách tiết kiệm, vay, thanh toán và chọn tổ chức tài chính phù hợp để sử dụng một cách tự tin.',
    cover_image: `${FINANCE}/cover.png`,
    unlock_level: 1,
    lessons: [
      {
        slug: 'so-sanh-phuong-phap-tiet-kiem',
        title: 'So sánh các phương pháp tiết kiệm',
        summary: 'Ưu, nhược điểm của tiết kiệm chính thức, cộng đồng và không chính thức.',
        cover_image: `${FINANCE}/cover.png`,
        est_minutes: 6,
        frames: [
          s(`${FINANCE}/s1-01.png`, null, 'Các phương thức tiết kiệm'),
          s(`${FINANCE}/s1-02.png`, null, 'Phương pháp tiết kiệm chính thức'),
          s(`${FINANCE}/s1-03.png`, null, 'Ưu, nhược điểm của tiết kiệm chính thức (1)'),
          s(`${FINANCE}/s1-04.png`, null, 'Ưu, nhược điểm của tiết kiệm chính thức (2)'),
          s(`${FINANCE}/s1-05.png`, null, 'Phương thức tiết kiệm cộng đồng'),
          s(`${FINANCE}/s1-06.png`, null, 'Ưu, nhược điểm của tiết kiệm cộng đồng'),
          s(`${FINANCE}/s1-07.png`, null, 'Phương pháp tiết kiệm không chính thức'),
          s(`${FINANCE}/s1-08.png`, null, 'Ưu, nhược điểm của tiết kiệm không chính thức'),
          s(`${FINANCE}/s1-09.png`, null, 'Bảy tiêu chí khi chọn phương thức tiết kiệm'),
          s(`${FINANCE}/s1-10.png`, null, 'Ôn lại: mỗi phương thức tiết kiệm đều có ưu và nhược điểm'),
          q('Phương pháp tiết kiệm nào an toàn nhất?', [
            { text: 'Chính thức: ngân hàng, quỹ tín dụng, tổ chức tài chính vi mô đã đăng ký', correct: true, explain: 'Đúng. Các kênh này được Nhà nước quản lý chặt chẽ.' },
            { text: 'Cộng đồng: nhóm tiết kiệm tự phát, hội tương trợ', correct: false, explain: 'Nhóm này chưa chịu sự giám sát đầy đủ của Nhà nước nên kém an toàn hơn.' },
            { text: 'Không chính thức: giữ tiền mặt tại nhà, mua vàng', correct: false, explain: 'Tự quản lý nên dễ mất, dễ bị trộm và dễ bị cám dỗ tiêu.' },
          ]),
        ],
      },
      {
        slug: 'chon-san-pham-tiet-kiem',
        title: 'Chọn sản phẩm tiết kiệm',
        summary: 'Các loại tài khoản tiết kiệm và điều cần cân nhắc khi chọn.',
        cover_image: `${FINANCE}/cover.png`,
        est_minutes: 5,
        frames: [
          s(`${FINANCE}/s2-01.png`, null, 'Các loại tài khoản tiết kiệm'),
          s(`${FINANCE}/s2-02.png`, null, 'Tài khoản tiết kiệm Target'),
          s(`${FINANCE}/s2-03.png`, null, 'Tài khoản tiết kiệm Flexi'),
          s(`${FINANCE}/s2-04.png`, null, 'Tài khoản tiết kiệm Smart Deposit'),
          s(`${FINANCE}/s2-05.png`, null, 'Tài khoản tiết kiệm thông thường hoặc sổ tiết kiệm'),
          s(`${FINANCE}/s2-06.png`, null, 'Tài khoản tiết kiệm theo hợp đồng'),
          s(`${FINANCE}/s2-07.png`, null, 'Tài khoản tiết kiệm tiền gửi có kỳ hạn'),
          s(`${FINANCE}/s2-08.png`, null, 'Những điều cần cân nhắc khi chọn sản phẩm tiết kiệm'),
          s(`${FINANCE}/s2-09.png`, null, 'Ôn lại: ba loại tài khoản tiết kiệm'),
          q('Loại tài khoản nào cho phép gửi hoặc rút tiền bất cứ lúc nào?', [
            { text: 'Tài khoản tiết kiệm thông thường (sổ tiết kiệm)', correct: true, explain: 'Đúng. Số tiền và thời gian gửi không bị ấn định trước.' },
            { text: 'Tài khoản tiền gửi có kỳ hạn', correct: false, explain: 'Tiền gửi có kỳ hạn cam kết không động đến trong suốt kỳ hạn.' },
            { text: 'Tài khoản tiết kiệm theo hợp đồng', correct: false, explain: 'Loại này yêu cầu gửi một khoản cố định đều đặn để đạt một mục tiêu.' },
          ]),
        ],
      },
      {
        // Bài giới thiệu chức năng Tiết kiệm của app, ngay sau bài Chọn sản phẩm
        // tiết kiệm: cùng khuôn slide, ảnh chụp màn hình thật. Slide cuối có nút
        // "Tiết kiệm ngay": hoàn thành bài rồi mở thẳng chức năng để thực hành.
        slug: 'chuc-nang-tiet-kiem',
        title: 'Dùng chức năng Tiết kiệm trong app Ekko',
        summary: 'Theo dõi mọi khoản tiết kiệm ở một nơi, so sánh lãi suất các ngân hàng và gửi tiết kiệm cùng Ekko với lãi dự kiến tính sẵn.',
        cover_image: `${FINANCE}/cover.png`,
        est_minutes: 3,
        frames: [
          s(`${FINANCE}/tk-01.png`, null, 'Chức năng Tiết kiệm trong app Ekko'),
          s(`${FINANCE}/tk-02.png`, null, 'So sánh lãi suất tiết kiệm 12 tháng trước khi gửi'),
          s(`${FINANCE}/tk-03.png`, null, 'Thêm khoản tiết kiệm bạn đang có'),
          s(`${FINANCE}/tk-04.png`, null, 'Gửi tiết kiệm cùng Ekko và xem lãi khi đáo hạn'),
          s(`${FINANCE}/tk-05.png`, null, 'Theo dõi tổng tiết kiệm, rút tiết kiệm hoặc vay'),
          s(`${FINANCE}/tk-06.png`, null, 'Ôn lại: dùng chức năng Tiết kiệm'),
          {
            kind: 'slide',
            payload: {
              image: `${FINANCE}/tk-07.png`,
              caption: null,
              alt: 'Đến lượt bạn thực hành: thêm khoản tiết kiệm đầu tiên',
              cta: { label: 'Tiết kiệm ngay', route: '/savings' },
            },
          },
          q('Gửi 20.000.000đ kỳ hạn 12 tháng với lãi suất 8,6%/năm thì lãi khi đáo hạn khoảng bao nhiêu?', [
            { text: '172.000đ', correct: false, explain: 'Con số này nhỏ hơn mười lần: 8,6% của 20.000.000đ là 1.720.000đ.' },
            { text: '1.720.000đ', correct: true, explain: 'Đúng. 20.000.000đ × 8,6% × 12/12 tháng = 1.720.000đ — Ekko tính sẵn cho bạn.' },
            { text: '17.200.000đ', correct: false, explain: 'Gần bằng số tiền gốc; lãi một năm chỉ là 8,6% của số tiền gửi.' },
          ]),
        ],
      },
      {
        slug: 'so-sanh-lua-chon-tai-chinh',
        title: 'So sánh các lựa chọn tài chính',
        summary: 'Bán tài sản, dùng tiền tiết kiệm hay đi vay: so sánh các cách huy động tiền.',
        cover_image: `${FINANCE}/cover.png`,
        est_minutes: 3,
        frames: [
          s(`${FINANCE}/s3-01.png`, null, 'Ba lý do chính khiến mọi người vay tiền'),
          s(`${FINANCE}/s3-02.png`, null, 'Bán tài sản hay dùng tiền tiết kiệm: ưu và nhược điểm'),
          s(`${FINANCE}/s3-03.png`, null, 'Vay tổ chức tài chính hay vay không chính thức: ưu và nhược điểm'),
          s(`${FINANCE}/s3-04.png`, null, 'Ôn lại: bạn có nhiều lựa chọn để huy động tài chính'),
          q('Khi cần huy động tiền cho một dự án, lời khuyên nào đúng?', [
            { text: 'Chọn phương án ít tốn kém nhất, tránh các khoản vay lãi suất cao', correct: true, explain: 'Đúng. Tổ chức tài chính chính thức thường có lãi suất thấp hơn người cho vay tiền.' },
            { text: 'Vay người cho vay không chính thức vì nhanh nhất', correct: false, explain: 'Nhanh nhưng thường lãi cao và rủi ro hơn.' },
            { text: 'Luôn bán tài sản trước tiên', correct: false, explain: 'Tài sản có thể mất giá, và bán tài sản sản xuất là mất nguồn thu.' },
          ]),
        ],
      },
      {
        slug: 'vay-von-cho-du-an',
        title: 'Vay vốn để tài trợ cho các dự án của bạn',
        summary: 'Vay ở đâu, cần gì để vay, các thuật ngữ tín dụng và trách nhiệm trả nợ.',
        cover_image: `${FINANCE}/cover.png`,
        est_minutes: 5,
        frames: [
          s(`${FINANCE}/s4-01.png`, null, 'Khoản vay là gì?'),
          s(`${FINANCE}/s4-02.png`, null, 'Tôi có thể vay tiền ở đâu?'),
          s(`${FINANCE}/s4-03.png`, null, 'Cần những gì để được vay tiền?'),
          s(`${FINANCE}/s4-04.png`, null, 'Thuật ngữ tín dụng: lãi suất, tài sản thế chấp, thời hạn vay, trả nợ sớm'),
          s(`${FINANCE}/s4-05.png`, null, 'Thuật ngữ tín dụng: người bảo lãnh, thời gian ân hạn, thời gian chờ, số tiền gốc'),
          s(`${FINANCE}/s4-06.png`, null, 'Hiểu trách nhiệm của bạn khi vay'),
          s(`${FINANCE}/s4-07.png`, null, 'Tôi nên cân nhắc những gì khi nộp đơn xin vay?'),
          s(`${FINANCE}/s4-08.png`, null, 'Ôn lại: dùng sản phẩm tín dụng hiệu quả'),
          q('Người bảo lãnh trong một khoản vay là ai?', [
            { text: 'Người sẽ trả khoản vay nếu bạn không trả được', correct: true, explain: 'Đúng. Người này có thể phải đồng ký hợp đồng vay với bên cho vay.' },
            { text: 'Người cho bạn vay tiền', correct: false, explain: 'Đó là bên cho vay.' },
            { text: 'Người thẩm định hồ sơ vay của bạn', correct: false, explain: 'Thẩm định là việc của tổ chức cho vay, không phải người bảo lãnh.' },
          ]),
        ],
      },
      {
        slug: 'vo-no-va-no-qua-muc',
        title: 'Nguy cơ vỡ nợ và nợ quá mức',
        summary: 'Vì sao người ta nợ quá mức, hậu quả và cách thoát khỏi nợ nần.',
        cover_image: `${FINANCE}/cover.png`,
        est_minutes: 4,
        frames: [
          s(`${FINANCE}/s5-01.png`, null, 'Nợ nần chồng chất'),
          s(`${FINANCE}/s5-02.png`, null, 'Quản lý kém hay xui xẻo: những lý do xui xẻo'),
          s(`${FINANCE}/s5-03.png`, null, 'Quản lý kém hay xui xẻo: những lý do quản lý kém'),
          s(`${FINANCE}/s5-04.png`, null, 'Hậu quả của việc nợ quá nhiều'),
          s(`${FINANCE}/s5-05.png`, null, 'Làm thế nào để thoát khỏi tình trạng nợ nần chồng chất'),
          s(`${FINANCE}/s5-06.png`, null, 'Ôn lại: nợ quá mức là không có khả năng trả nợ'),
          q('Nếu không trả được khoản nợ tháng này, bạn nên làm gì?', [
            { text: 'Báo sớm và trung thực với bên cho vay để cùng tìm giải pháp', correct: true, explain: 'Đúng. Hành động càng sớm thì càng nhiều cách xử lý.' },
            { text: 'Im lặng chờ đến khi có tiền', correct: false, explain: 'Im lặng làm mất lòng tin và hậu quả sẽ nặng hơn.' },
            { text: 'Vay một khoản lãi cao khác để trả', correct: false, explain: 'Vay chồng vay là con đường nhanh nhất dẫn đến nợ quá mức.' },
          ]),
        ],
      },
      {
        slug: 'phuong-thuc-thanh-toan',
        title: 'Hiểu và sử dụng các phương thức thanh toán khác nhau',
        summary: 'Thẻ ngân hàng, chuyển khoản và thanh toán qua ứng dụng, cùng lời khuyên an toàn.',
        cover_image: `${FINANCE}/cover.png`,
        est_minutes: 6,
        frames: [
          s(`${FINANCE}/s6-01.png`, null, 'Các phương thức thanh toán phổ biến'),
          s(`${FINANCE}/s6-02.png`, null, 'Thẻ ngân hàng: cách dùng, thuận lợi và nhược điểm'),
          s(`${FINANCE}/s6-03.png`, null, 'Thẻ ngân hàng: cách dùng'),
          s(`${FINANCE}/s6-04.png`, null, 'Thẻ ngân hàng: thuận lợi và nhược điểm'),
          s(`${FINANCE}/s6-05.png`, null, 'Tài khoản ngân hàng: cách dùng'),
          s(`${FINANCE}/s6-06.png`, null, 'Tài khoản ngân hàng: thuận lợi và nhược điểm'),
          s(`${FINANCE}/s6-07.png`, null, 'Thanh toán qua ứng dụng: cách dùng'),
          s(`${FINANCE}/s6-08.png`, null, 'Thanh toán qua ứng dụng: thuận lợi và nhược điểm'),
          s(`${FINANCE}/s6-09.png`, null, 'Lời khuyên an toàn khi thanh toán'),
          s(`${FINANCE}/s6-10.png`, null, 'Ôn lại: có nhiều phương thức thanh toán khác nhau'),
          q('Nhược điểm của thanh toán qua ứng dụng mà bài học nhắc tới là gì?', [
            { text: 'Dễ chi tiêu quá mức vì quá tiện', correct: true, explain: 'Đúng. Càng dễ trả tiền thì càng cần theo dõi chi tiêu.' },
            { text: 'Chỉ thanh toán được trong giờ hành chính', correct: false, explain: 'Thanh toán qua ứng dụng dùng được 24/7.' },
            { text: 'Bắt buộc phải có tài khoản ngân hàng', correct: false, explain: 'Nhiều ví chỉ cần số điện thoại.' },
          ]),
        ],
      },
      {
        slug: 'to-chuc-tai-chinh-tu-tin',
        title: 'Biết và sử dụng các tổ chức tài chính một cách tự tin',
        summary: 'Chọn tổ chức tài chính phù hợp và biết các quyền của bạn khi là khách hàng.',
        cover_image: `${FINANCE}/cover.png`,
        est_minutes: 8,
        frames: [
          s(`${FINANCE}/s7-01.png`, null, 'Tổ chức tài chính là gì?'),
          s(`${FINANCE}/s7-02.png`, null, 'Đặc điểm của tổ chức tài chính'),
          s(`${FINANCE}/s7-03.png`, null, 'Đặc điểm của sản phẩm tiết kiệm'),
          s(`${FINANCE}/s7-04.png`, null, 'Những đặc điểm cần lưu ý khi chọn tổ chức tài chính'),
          s(`${FINANCE}/s7-05.png`, null, 'Dịch vụ ngân hàng di động, uy tín và chất lượng dịch vụ'),
          s(`${FINANCE}/s7-06.png`, null, 'Yêu cầu gia nhập và sự minh bạch về giá cả'),
          s(`${FINANCE}/s7-07.png`, null, 'Sản phẩm phù hợp với từng khách hàng và trách nhiệm xã hội'),
          s(`${FINANCE}/s7-08.png`, null, 'Bạn có trách nhiệm, và bạn cũng có quyền'),
          s(`${FINANCE}/s7-09.png`, null, 'Bảy tình huống của khách hàng (1)'),
          s(`${FINANCE}/s7-10.png`, null, 'Bảy tình huống của khách hàng (2)'),
          s(`${FINANCE}/s7-11.png`, null, 'Thiết kế và phân phối sản phẩm phù hợp'),
          s(`${FINANCE}/s7-12.png`, null, 'Đảm bảo sự riêng tư của dữ liệu khách hàng'),
          s(`${FINANCE}/s7-13.png`, null, 'Tránh nợ quá nhiều'),
          s(`${FINANCE}/s7-14.png`, null, 'Sử dụng giá cả có trách nhiệm'),
          s(`${FINANCE}/s7-15.png`, null, 'Đảm bảo tính minh bạch'),
          s(`${FINANCE}/s7-16.png`, null, 'Đảm bảo sự đối xử công bằng và tôn trọng đối với khách hàng'),
          s(`${FINANCE}/s7-17.png`, null, 'Ôn lại những điều đã học'),
          q('Tổ chức tài chính có được cho người thân trong gia đình bạn biết thông tin tài khoản của bạn không?', [
            { text: 'Không, họ phải bảo mật dữ liệu của khách hàng', correct: true, explain: 'Đúng. Đây là nguyên tắc cơ bản, và bạn có quyền báo cáo nếu bị vi phạm.' },
            { text: 'Có, nếu đó là người thân', correct: false, explain: 'Kể cả người thân cũng không được biết nếu bạn không đồng ý.' },
            { text: 'Có, nếu người đó nêu được lý do', correct: false, explain: 'Lý do nào cũng không thay được sự đồng ý của bạn.' },
          ]),
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ 4
  // Mô đun từ thiết kế cũ trên Figma ("Giáo dục tài chính (New) 2" · Mô-đun 4
  // Session 1–2), cùng cách làm với các mô đun trên.
  {
    slug: 'bao-hiem-quan-ly-rui-ro',
    title: 'Bảo hiểm quản lý rủi ro',
    summary: 'Hiểu rủi ro, lập quỹ khẩn cấp và nắm các thuật ngữ bảo hiểm để bảo vệ bản thân, gia đình và doanh nghiệp.',
    cover_image: `${INSURE}/cover.png`,
    unlock_level: 1,
    lessons: [
      {
        slug: 'hieu-ve-rui-ro',
        title: 'Hiểu về rủi ro và cách tự bảo vệ mình',
        summary: 'Rủi ro là gì, vì sao không tránh được, và cần để dành bao nhiêu cho trường hợp khẩn cấp.',
        cover_image: `${INSURE}/cover.png`,
        est_minutes: 3,
        frames: [
          s(`${INSURE}/s1-01.png`, null, 'Rủi ro là khả năng mất mát hoặc thương tích'),
          s(`${INSURE}/s1-02.png`, null, 'Rủi ro là điều không thể tránh khỏi trong cuộc sống'),
          s(`${INSURE}/s1-03.png`, null, 'Tôi nên dành bao nhiêu tiền cho trường hợp khẩn cấp?'),
          s(`${INSURE}/s1-04.png`, null, 'Ôn lại: hiểu về rủi ro và cách tự bảo vệ mình'),
          q('Theo nguyên tắc chung, quỹ khẩn cấp cho bạn và gia đình nên có ít nhất bao nhiêu?', [
            { text: 'Ba lần thu nhập trung bình hàng tháng', correct: true, explain: 'Đúng. Càng chăm lo cho nhiều người thì quỹ càng cần lớn hơn.' },
            { text: 'Một tuần thu nhập', correct: false, explain: 'Một tuần thu nhập khó đủ cho một sự cố thật sự.' },
            { text: 'Không cần nếu đã có bảo hiểm', correct: false, explain: 'Tiết kiệm là chìa khoá; bảo hiểm dùng khi tiết kiệm không đủ.' },
          ]),
          q('Với doanh nghiệp, quỹ khẩn cấp nên đủ để làm gì?', [
            { text: 'Trang trải chi phí cố định ít nhất một đến ba tháng', correct: true, explain: 'Đúng. Đủ để doanh nghiệp đứng vững qua một giai đoạn khó.' },
            { text: 'Trả thưởng cuối năm cho nhân viên', correct: false, explain: 'Thưởng là khoản dự kiến, không phải trường hợp khẩn cấp.' },
            { text: 'Mở rộng kinh doanh', correct: false, explain: 'Mở rộng cần một kế hoạch vốn riêng, không lấy từ quỹ khẩn cấp.' },
          ]),
        ],
      },
      {
        slug: 'gioi-thieu-bao-hiem',
        title: 'Giới thiệu về bảo hiểm',
        summary: 'Bảo hiểm là gì và các thuật ngữ cần biết trước khi mua.',
        cover_image: `${INSURE}/cover.png`,
        est_minutes: 3,
        frames: [
          s(`${INSURE}/s2-01.png`, null, 'Bảo hiểm là biện pháp bảo vệ bạn khỏi rủi ro'),
          s(`${INSURE}/s2-02.png`, null, 'Định nghĩa bảo hiểm: hợp đồng, phí bảo hiểm, số tiền bồi thường, người thụ hưởng'),
          s(`${INSURE}/s2-03.png`, null, 'Định nghĩa bảo hiểm: yêu cầu bồi thường, thẻ bảo hiểm, loại trừ'),
          s(`${INSURE}/s2-04.png`, null, 'Ôn lại: bảo hiểm là công cụ đảm bảo thu nhập và an sinh xã hội'),
          q('Phí bảo hiểm là gì?', [
            { text: 'Số tiền người được bảo hiểm trả cho công ty bảo hiểm để hợp đồng có hiệu lực', correct: true, explain: 'Đúng. Ngừng đóng phí thì hợp đồng có thể mất hiệu lực.' },
            { text: 'Số tiền công ty bảo hiểm trả khi sự kiện xảy ra', correct: false, explain: 'Đó là số tiền bồi thường.' },
            { text: 'Người nhận tiền bảo hiểm', correct: false, explain: 'Đó là người thụ hưởng.' },
          ]),
          q('"Loại trừ" trong hợp đồng bảo hiểm nghĩa là gì?', [
            { text: 'Những tình huống được ghi rõ là không được bảo hiểm', correct: true, explain: 'Đúng. Đọc kỹ phần này trước khi ký để không bất ngờ khi cần bồi thường.' },
            { text: 'Những người không được phép mua bảo hiểm', correct: false, explain: 'Loại trừ nói về tình huống, không phải về người mua.' },
            { text: 'Khoản phí được giảm', correct: false, explain: 'Loại trừ không liên quan đến mức phí.' },
          ]),
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ 5
  // Mô đun từ thiết kế cũ trên Figma ("Giáo dục tài chính (New 2) 2" · Mô-đun 1,
  // Session 1–4), cùng cách làm với các mô đun trên.
  {
    slug: 'phong-chong-lua-dao',
    title: 'Phòng chống lừa đảo tài chính',
    summary: 'Nhận diện các chiêu lừa đảo phổ biến, kiểm tra tổ chức tài chính hợp pháp và biết phải làm gì nếu bị lừa.',
    cover_image: `${SCAM}/cover.png`,
    unlock_level: 1,
    lessons: [
      {
        slug: 'nhan-dien-chieu-tro-lua-dao',
        title: 'Nhận diện các chiêu trò lừa đảo phổ biến',
        summary: 'Ba loại lừa đảo phổ biến, dấu hiệu nhận biết và quy tắc vàng trước khi hành động.',
        cover_image: `${SCAM}/cover.png`,
        est_minutes: 5,
        frames: [
          s(`${SCAM}/s1-01.png`, null, 'Mục tiêu bài học: nhận diện lừa đảo'),
          s(`${SCAM}/s1-02.png`, null, 'Vì sao người lao động hay bị nhắm đến?'),
          s(`${SCAM}/s1-03.png`, null, 'Loại 1: đa cấp, đầu tư "lãi khủng"'),
          s(`${SCAM}/s1-04.png`, null, 'Loại 2: vay tiền nhanh online, tín dụng đen'),
          s(`${SCAM}/s1-05.png`, null, 'Loại 3: giả mạo nhân viên ngân hàng, cơ quan nhà nước'),
          s(`${SCAM}/s1-06.png`, null, 'Quy tắc vàng khi gặp lời mời hấp dẫn'),
          s(`${SCAM}/s1-07.png`, null, 'Ôn lại: ba loại lừa đảo phổ biến'),
          q('Dấu hiệu nào cho thấy một lời mời đầu tư có thể là lừa đảo đa cấp?', [
            { text: 'Hứa lãi rất cao và phải giới thiệu thêm người mới nhận được tiền', correct: true, explain: 'Đúng. Lãi 20–40%/tháng là không thể có một cách hợp pháp.' },
            { text: 'Có hợp đồng rõ ràng và lãi suất công bố công khai', correct: false, explain: 'Đây là dấu hiệu của tổ chức hợp pháp.' },
            { text: 'Có văn phòng, biển hiệu để đến tận nơi', correct: false, explain: 'Địa chỉ thật là dấu hiệu tốt, dù vẫn nên tra cứu thêm.' },
          ]),
          q('Một người tự xưng công an gọi điện yêu cầu bạn chuyển tiền vào "tài khoản an toàn". Bạn nên làm gì?', [
            { text: 'Cúp máy ngay, cơ quan điều tra không bao giờ yêu cầu chuyển tiền qua điện thoại', correct: true, explain: 'Đúng. Sau đó hãy báo cho công an nơi gần nhất.' },
            { text: 'Chuyển tiền và giữ bí mật như được yêu cầu', correct: false, explain: 'Yêu cầu giữ bí mật chính là dấu hiệu lừa đảo.' },
            { text: 'Chuyển trước một nửa để thử', correct: false, explain: 'Chuyển đồng nào là mất đồng đó.' },
          ]),
        ],
      },
      {
        slug: 'kiem-tra-to-chuc-hop-phap',
        title: 'Cách kiểm tra tổ chức tài chính có hợp pháp không',
        summary: 'Kiểm tra giấy phép trong 3 bước, 5 dấu hiệu cảnh báo và những câu nên hỏi trước khi vay.',
        cover_image: `${SCAM}/cover.png`,
        est_minutes: 4,
        frames: [
          s(`${SCAM}/s2-01.png`, null, 'Mục tiêu bài học: kiểm tra tổ chức tài chính'),
          s(`${SCAM}/s2-02.png`, null, 'Tổ chức tài chính hợp pháp là gì?'),
          s(`${SCAM}/s2-03.png`, null, 'Cách kiểm tra nhanh trong 3 bước'),
          s(`${SCAM}/s2-04.png`, null, '5 dấu hiệu cảnh báo cần dừng lại ngay'),
          s(`${SCAM}/s2-05.png`, null, 'Câu hỏi nên hỏi trước khi vay hoặc đầu tư'),
          s(`${SCAM}/s2-06.png`, null, 'Ôn lại: kiểm tra tổ chức tài chính hợp pháp'),
          q('Dấu hiệu nào là của một tổ chức cho vay hợp pháp?', [
            { text: 'Không thu tiền trước; phí được trừ vào khoản vay hoặc trả sau', correct: true, explain: 'Đúng. Thu "phí giải ngân" trước là dấu hiệu cần dừng lại.' },
            { text: 'Yêu cầu giữ bản gốc CCCD của bạn', correct: false, explain: 'Giữ bản gốc giấy tờ là vi phạm pháp luật; chỉ cần bản sao công chứng.' },
            { text: 'Chỉ liên hệ qua Zalo hoặc Facebook', correct: false, explain: 'Chỉ hoạt động qua mạng xã hội là lý do để thận trọng.' },
          ]),
          q('Cách nhanh nhất để biết một tổ chức tài chính có được cấp phép không?', [
            { text: 'Tra tên trên website Ngân hàng Nhà nước (sbv.gov.vn)', correct: true, explain: 'Đúng. Có trong danh sách thì mới là hợp pháp.' },
            { text: 'Xem trang mạng xã hội của họ có nhiều lượt thích không', correct: false, explain: 'Lượt thích có thể mua được, không chứng minh điều gì.' },
            { text: 'Hỏi người đã giới thiệu cho bạn', correct: false, explain: 'Người giới thiệu có thể cũng đang bị lừa hoặc hưởng hoa hồng.' },
          ]),
        ],
      },
      {
        slug: 'bi-lua-phai-lam-gi',
        title: 'Tôi bị lừa – Phải làm gì?',
        summary: 'Bốn việc cần làm ngay, nơi báo cáo và cách không bị lừa lần thứ hai.',
        cover_image: `${SCAM}/cover.png`,
        est_minutes: 5,
        frames: [
          s(`${SCAM}/s3-01.png`, null, 'Mục tiêu bài học: khi bị lừa'),
          s(`${SCAM}/s3-02.png`, null, 'Đừng xấu hổ, hãy hành động ngay'),
          s(`${SCAM}/s3-03.png`, null, 'Bước 1–2: dừng giao dịch và lưu bằng chứng'),
          s(`${SCAM}/s3-04.png`, null, 'Bước 3: liên hệ ngân hàng ngay nếu vừa chuyển khoản'),
          s(`${SCAM}/s3-05.png`, null, 'Bước 4: báo cáo cơ quan chức năng'),
          s(`${SCAM}/s3-06.png`, null, 'Bảo vệ bản thân khỏi bị lừa lần nữa'),
          s(`${SCAM}/s3-07.png`, null, 'Ôn lại: phải làm gì khi bị lừa'),
          q('Việc đầu tiên nên làm khi phát hiện mình bị lừa là gì?', [
            { text: 'Dừng chuyển tiền và dừng cung cấp thông tin cá nhân', correct: true, explain: 'Đúng. Sau đó lưu bằng chứng và gọi ngân hàng ngay.' },
            { text: 'Đầu tư thêm để lấy lại tiền', correct: false, explain: 'Đây là chiêu để lừa bạn thêm lần nữa.' },
            { text: 'Giữ im lặng vì xấu hổ', correct: false, explain: 'Im lặng giúp kẻ lừa đảo tiếp tục; báo sớm giúp tăng khả năng lấy lại tiền.' },
          ]),
          q('Sau khi bị lừa, có người hứa "lấy lại tiền" cho bạn nếu trả phí trước. Đây là gì?', [
            { text: 'Lừa đảo lần thứ hai', correct: true, explain: 'Đúng. Không có dịch vụ thu hồi tiền lừa đảo hợp pháp nào thu phí trước.' },
            { text: 'Dịch vụ thu hồi tiền hợp pháp', correct: false, explain: 'Dịch vụ như vậy không tồn tại một cách hợp pháp.' },
            { text: 'Thủ tục bắt buộc của cơ quan điều tra', correct: false, explain: 'Cơ quan điều tra không thu tiền của nạn nhân.' },
          ]),
        ],
      },
      {
        slug: 'thuc-hanh-nhan-dien-that-gia',
        title: 'Thực hành – Nhận diện thật/giả qua tình huống',
        summary: 'Năm tình huống thực tế để luyện phản xạ nhận diện lừa đảo trước khi hành động.',
        cover_image: `${SCAM}/cover.png`,
        est_minutes: 5,
        frames: [
          s(`${SCAM}/s4-01.png`, null, 'Mục tiêu bài học: thực hành nhận diện'),
          s(`${SCAM}/s4-02.png`, null, 'Tình huống 1: tin nhắn trúng thưởng'),
          s(`${SCAM}/s4-03.png`, null, 'Tình huống 2: bạn bè rủ đầu tư'),
          s(`${SCAM}/s4-04.png`, null, 'Tình huống 3: vay tiền online'),
          s(`${SCAM}/s4-05.png`, null, 'Tình huống 4: cuộc gọi từ "công an"'),
          s(`${SCAM}/s4-06.png`, null, 'Tình huống 5: nhận ra tổ chức hợp pháp'),
          s(`${SCAM}/s4-07.png`, null, 'Ôn lại toàn mô đun'),
          q('Khoản vay online lãi 0,5%/ngày tương đương khoảng bao nhiêu mỗi năm?', [
            { text: '5%/năm', correct: false, explain: '0,5% mỗi ngày, nhân với 365 ngày thì lớn hơn nhiều.' },
            { text: '18%/năm', correct: false, explain: 'Vẫn còn thấp hơn nhiều so với con số thật.' },
            { text: '182,5%/năm', correct: true, explain: 'Đúng. Cao gấp khoảng 20 lần lãi vay ngân hàng thông thường.' },
          ]),
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ 6
  // Mô đun từ thiết kế cũ trên Figma ("Giáo dục tài chính (New 2) 2" · Mô-đun 2,
  // Session 1–4), cùng cách làm với các mô đun trên.
  {
    slug: 'quyen-loi-lao-dong',
    title: 'Hiểu và bảo vệ quyền lợi lao động',
    summary: 'Đọc hiểu hợp đồng lao động, nắm quyền lợi bảo hiểm, biết đòi quyền lợi và quản lý thu nhập khi lương thay đổi.',
    cover_image: `${LABOR}/cover.png`,
    unlock_level: 1,
    lessons: [
      {
        slug: 'hop-dong-lao-dong',
        title: 'Hợp đồng lao động – Tôi cần đọc gì trước khi ký?',
        summary: 'Lương, thưởng, làm thêm giờ, phụ cấp: 7 mục phải đọc kỹ và các câu nên hỏi HR.',
        cover_image: `${LABOR}/cover.png`,
        est_minutes: 6,
        frames: [
          s(`${LABOR}/s1-01.png`, null, 'Mục tiêu bài học: hợp đồng lao động'),
          s(`${LABOR}/s1-02.png`, null, 'Hợp đồng lao động là gì?'),
          s(`${LABOR}/s1-03.png`, null, 'Ba loại hợp đồng lao động phổ biến'),
          s(`${LABOR}/s1-04.png`, null, 'Mục 1: lương và lương tối thiểu vùng'),
          s(`${LABOR}/s1-05.png`, null, 'Mục 2–3: phụ cấp và thưởng'),
          s(`${LABOR}/s1-06.png`, null, 'Mục 4–5: giờ làm, làm thêm giờ và bảo hiểm'),
          s(`${LABOR}/s1-07.png`, null, 'Mục 6–7: nghỉ phép và điều khoản nghỉ việc'),
          s(`${LABOR}/s1-08.png`, null, 'Những câu hỏi nên hỏi HR trước khi ký'),
          s(`${LABOR}/s1-09.png`, null, 'Ôn lại: đọc hợp đồng lao động trước khi ký'),
          q('Làm việc mà không có hợp đồng lao động thì sao?', [
            { text: 'Chủ sử dụng lao động vi phạm luật; bạn có quyền yêu cầu ký hợp đồng ngay từ ngày đầu', correct: true, explain: 'Đúng. Hợp đồng là căn cứ pháp lý bảo vệ bạn khi có tranh chấp.' },
            { text: 'Bình thường nếu làm dưới một năm', correct: false, explain: 'Thời gian làm không thay đổi nghĩa vụ ký hợp đồng.' },
            { text: 'Người lao động bị phạt', correct: false, explain: 'Vi phạm thuộc về phía chủ sử dụng lao động.' },
          ]),
          q('Làm thêm giờ vào ngày thường được trả ít nhất bao nhiêu?', [
            { text: '100% lương giờ thường', correct: false, explain: 'Luật quy định cao hơn mức lương giờ thường.' },
            { text: '150% lương giờ thường', correct: true, explain: 'Đúng. Ngày nghỉ tuần và ngày lễ còn cao hơn nữa.' },
            { text: '120% lương giờ thường', correct: false, explain: 'Vẫn thấp hơn mức tối thiểu theo luật.' },
          ]),
        ],
      },
      {
        slug: 'bao-hiem-xa-hoi-y-te',
        title: 'Bảo hiểm xã hội và bảo hiểm y tế – Quyền lợi của tôi là gì?',
        summary: 'BHXH, BHYT, BHTN chi trả những gì và cách kiểm tra công ty có đóng đúng không.',
        cover_image: `${LABOR}/cover.png`,
        est_minutes: 6,
        frames: [
          s(`${LABOR}/s2-01.png`, null, 'Mục tiêu bài học: BHXH, BHYT, BHTN'),
          s(`${LABOR}/s2-02.png`, null, 'Bảo hiểm xã hội: lưới an toàn cả cuộc đời'),
          s(`${LABOR}/s2-03.png`, null, 'Quyền lợi từ BHXH: ốm đau và thai sản'),
          s(`${LABOR}/s2-04.png`, null, 'Quyền lợi từ BHXH: tai nạn lao động và hưu trí'),
          s(`${LABOR}/s2-05.png`, null, 'Bảo hiểm y tế: khám chữa bệnh giá rẻ'),
          s(`${LABOR}/s2-06.png`, null, 'Bảo hiểm thất nghiệp: tiền hỗ trợ khi mất việc'),
          s(`${LABOR}/s2-07.png`, null, 'Kiểm tra công ty có đóng bảo hiểm đúng không'),
          s(`${LABOR}/s2-08.png`, null, 'Ôn lại: quyền lợi bảo hiểm của người lao động'),
          q('Làm sao kiểm tra công ty có đóng bảo hiểm cho bạn hay không?', [
            { text: 'Xem trên ứng dụng VssID của BHXH Việt Nam', correct: true, explain: 'Đúng. Hoặc gọi tổng đài 1900 9068 để hỏi.' },
            { text: 'Xem phiếu lương là đủ', correct: false, explain: 'Phần công ty đóng không hiện trên phiếu lương của bạn.' },
            { text: 'Không có cách nào kiểm tra', correct: false, explain: 'Có nhiều cách: ứng dụng, tổng đài, hoặc đến cơ quan BHXH.' },
          ]),
          q('Bảo hiểm thất nghiệp trả bao nhiêu mỗi tháng?', [
            { text: '60% lương bình quân 6 tháng trước khi nghỉ', correct: true, explain: 'Đúng. Thời gian hưởng từ 3 đến 12 tháng tùy số tháng đã đóng.' },
            { text: '100% lương cũ', correct: false, explain: 'Mức hưởng thấp hơn lương cũ.' },
            { text: 'Một khoản cố định như nhau cho mọi người', correct: false, explain: 'Mức hưởng tính theo lương bạn đã đóng bảo hiểm.' },
          ]),
        ],
      },
      {
        slug: 'no-luong-thoi-viec-trai-luat',
        title: 'Khi bị nợ lương, thôi việc trái luật – Tôi làm gì?',
        summary: 'Quyền của bạn theo luật, 4 bước đòi quyền lợi và cơ quan cần liên hệ.',
        cover_image: `${LABOR}/cover.png`,
        est_minutes: 5,
        frames: [
          s(`${LABOR}/s3-01.png`, null, 'Mục tiêu bài học: nợ lương và thôi việc trái luật'),
          s(`${LABOR}/s3-02.png`, null, 'Công ty nợ lương: luật nói gì?'),
          s(`${LABOR}/s3-03.png`, null, 'Bị thôi việc: hợp pháp hay trái luật?'),
          s(`${LABOR}/s3-04.png`, null, 'Bồi thường khi bị sa thải trái luật và bước 1: thu thập bằng chứng'),
          s(`${LABOR}/s3-05.png`, null, 'Bước 2–3: nói chuyện với HR và yêu cầu hòa giải'),
          s(`${LABOR}/s3-06.png`, null, 'Bước 4: khởi kiện ra Tòa án'),
          s(`${LABOR}/s3-07.png`, null, 'Ôn lại: đòi quyền lợi khi bị nợ lương'),
          q('Khi bị nợ lương hoặc thôi việc trái luật, bước đầu tiên nên làm là gì?', [
            { text: 'Thu thập và lưu giữ bằng chứng: hợp đồng, phiếu lương, tin nhắn', correct: true, explain: 'Đúng. Bằng chứng là vũ khí quan trọng nhất của bạn.' },
            { text: 'Nghỉ việc ngay mà không báo', correct: false, explain: 'Nghỉ ngang có thể làm bạn mất quyền lợi.' },
            { text: 'Chờ đợi, không làm gì', correct: false, explain: 'Thời hiệu khởi kiện có hạn, chờ lâu có thể mất quyền.' },
          ]),
          q('Công ty cho bạn thôi việc khi bạn đang nghỉ thai sản. Đây là gì?', [
            { text: 'Sa thải trái luật', correct: true, explain: 'Đúng. Bạn có quyền đòi được nhận lại và được bồi thường.' },
            { text: 'Hợp pháp nếu báo trước 30 ngày', correct: false, explain: 'Báo trước không làm việc này hợp pháp.' },
            { text: 'Hợp pháp nếu công ty đang khó khăn', correct: false, explain: 'Lao động nữ đang nghỉ thai sản được luật bảo vệ.' },
          ]),
        ],
      },
      {
        slug: 'thu-nhap-khi-luong-thay-doi',
        title: 'Quản lý thu nhập khi lương thay đổi',
        summary: 'Thời vụ, làm thêm, mất việc: lập vùng đệm an toàn và kế hoạch tài chính khi thu nhập biến động.',
        cover_image: `${LABOR}/cover.png`,
        est_minutes: 6,
        frames: [
          s(`${LABOR}/s4-01.png`, null, 'Mục tiêu bài học: thu nhập thay đổi'),
          s(`${LABOR}/s4-02.png`, null, 'Thu nhập người lao động nhà máy biến động thế nào?'),
          s(`${LABOR}/s4-03.png`, null, 'Nguyên tắc 50-30-20 điều chỉnh cho công nhân'),
          s(`${LABOR}/s4-04.png`, null, 'Xây dựng quỹ khẩn cấp cho người lao động'),
          s(`${LABOR}/s4-05.png`, null, 'Khi thu nhập bị giảm đột ngột'),
          s(`${LABOR}/s4-06.png`, null, 'Ba bước xử lý khi thu nhập giảm'),
          s(`${LABOR}/s4-07.png`, null, 'Khi mất việc: kế hoạch 90 ngày'),
          s(`${LABOR}/s4-08.png`, null, 'Ôn lại toàn mô đun'),
          q('Theo bài học, thu nhập từ làm thêm giờ và thưởng nên dùng thế nào?', [
            { text: 'Dành toàn bộ để tiết kiệm hoặc trả nợ', correct: true, explain: 'Đúng. Chi tiêu dựa trên lương cơ bản để tháng thấp điểm không thiếu hụt.' },
            { text: 'Chi tiêu theo mức tháng cao điểm', correct: false, explain: 'Đây chính là lý do tháng thấp điểm hay bị thiếu tiền.' },
            { text: 'Dùng để mua sắm cho xứng công sức', correct: false, explain: 'Thu nhập không đều nên cần giữ lại làm vùng đệm.' },
          ]),
          q('Khi thu nhập giảm đột ngột, điều nào KHÔNG nên làm?', [
            { text: 'Cắt giảm chi tiêu không thiết yếu', correct: false, explain: 'Đây là việc nên làm.' },
            { text: 'Vay tín dụng đen hoặc vay tiêu dùng lãi cao để bù', correct: true, explain: 'Đúng. Vay lãi cao để bù thu nhập tạo vòng xoáy nợ khó thoát.' },
            { text: 'Tìm thêm việc làm buổi tối hoặc cuối tuần', correct: false, explain: 'Đây là việc nên làm để tăng thu nhập tạm thời.' },
          ]),
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ 7
  // Mô đun từ thiết kế cũ trên Figma ("Giáo dục tài chính (New 2) 2" · Mô-đun 3,
  // Session 1–3), cùng cách làm với các mô đun trên.
  {
    slug: 'tai-chinh-so-thong-minh',
    title: 'Sử dụng dịch vụ tài chính số thông minh',
    summary: 'Dùng ví điện tử, chuyển khoản và QR đúng cách, hiểu lãi suất thực của khoản vay online và bảo vệ tài khoản khỏi các chiêu lừa.',
    cover_image: `${DIGITAL}/cover.png`,
    unlock_level: 1,
    lessons: [
      {
        slug: 'vi-dien-tu-chuyen-khoan-qr',
        title: 'Ví điện tử, chuyển khoản, QR code — Dùng đúng cách, tránh mất tiền',
        summary: 'Sự khác nhau giữa ví điện tử, ngân hàng số và QR code, cùng 6 bẫy mất tiền phổ biến.',
        cover_image: `${DIGITAL}/cover.png`,
        est_minutes: 6,
        frames: [
          s(`${DIGITAL}/s1-01.png`, null, 'Mục tiêu bài học: tiền số'),
          s(`${DIGITAL}/s1-02.png`, null, 'Tiền số hoạt động như thế nào?'),
          s(`${DIGITAL}/s1-03.png`, null, 'Ví điện tử: dùng đúng cách'),
          s(`${DIGITAL}/s1-04.png`, null, 'Thanh toán bằng QR code'),
          s(`${DIGITAL}/s1-05.png`, null, 'Chuyển khoản ngân hàng số: 5 bước an toàn'),
          s(`${DIGITAL}/s1-06.png`, null, 'Sáu bẫy mất tiền khi dùng tiền số (1)'),
          s(`${DIGITAL}/s1-07.png`, null, 'Sáu bẫy mất tiền khi dùng tiền số (2)'),
          s(`${DIGITAL}/s1-08.png`, null, 'Sáu bẫy mất tiền khi dùng tiền số (3)'),
          s(`${DIGITAL}/s1-09.png`, null, 'Sáu bẫy mất tiền khi dùng tiền số (4)'),
          s(`${DIGITAL}/s1-10.png`, null, 'So sánh các ví điện tử phổ biến tại Việt Nam'),
          s(`${DIGITAL}/s1-11.png`, null, 'Ôn lại: dùng tiền số an toàn'),
          q('Một người tự xưng nhân viên ngân hàng gọi điện xin mã OTP để "xác minh tài khoản". Bạn nên làm gì?', [
            { text: 'Không đọc mã, cúp máy và gọi lại hotline chính thức', correct: true, explain: 'Đúng. Ngân hàng không bao giờ hỏi OTP.' },
            { text: 'Đọc mã vì họ biết tên và số tài khoản của bạn', correct: false, explain: 'Kẻ gian có thể đã mua được thông tin đó.' },
            { text: 'Chỉ đọc một nửa mã cho an toàn', correct: false, explain: 'Không chia sẻ bất kỳ phần nào của OTP.' },
          ]),
          q('Có người gửi ảnh chứa mã QR và nhờ bạn quét để "nhận tiền". Đây là gì?', [
            { text: 'Một cái bẫy: mã QR đó thường là lệnh chuyển tiền đi', correct: true, explain: 'Đúng. Chỉ quét QR của người, nơi đang ở trước mặt bạn.' },
            { text: 'Cách nhận tiền nhanh và tiện', correct: false, explain: 'Để nhận tiền, bạn đưa QR của mình cho người khác quét.' },
            { text: 'An toàn nếu người gửi là người quen', correct: false, explain: 'Tài khoản của người quen cũng có thể bị chiếm.' },
          ]),
        ],
      },
      {
        slug: 'vay-tieu-dung-online-apr',
        title: 'Vay tiêu dùng online — Lãi suất thực sự là bao nhiêu?',
        summary: 'APR là gì, cách tự tính chi phí thực của khoản vay và phân biệt vay hợp pháp với tín dụng đen.',
        cover_image: `${DIGITAL}/cover.png`,
        est_minutes: 5,
        frames: [
          s(`${DIGITAL}/s2-01.png`, null, 'Mục tiêu bài học: APR'),
          s(`${DIGITAL}/s2-02.png`, null, 'Vì sao lãi suất quảng cáo thường gây hiểu nhầm?'),
          s(`${DIGITAL}/s2-03.png`, null, 'APR là gì?'),
          s(`${DIGITAL}/s2-04.png`, null, 'Ví dụ: cùng vay 10 triệu trong 6 tháng'),
          s(`${DIGITAL}/s2-05.png`, null, 'Tự tính khoản vay trước khi quyết định'),
          s(`${DIGITAL}/s2-06.png`, null, 'Phân biệt vay hợp pháp và tín dụng đen công nghệ'),
          s(`${DIGITAL}/s2-07.png`, null, 'Các nguồn vay hợp pháp lãi suất thấp cho công nhân'),
          s(`${DIGITAL}/s2-08.png`, null, 'Ôn lại: lãi suất thực của khoản vay'),
          q('Khi so sánh các khoản vay, con số nào quan trọng nhất cần hỏi?', [
            { text: 'APR – lãi suất phần trăm hàng năm, đã gồm mọi khoản phí', correct: true, explain: 'Đúng. APR cho biết chi phí thực của khoản vay.' },
            { text: 'Tiền lãi mỗi ngày trong quảng cáo', correct: false, explain: 'Con số này thường chưa gồm các loại phí.' },
            { text: 'Số tiền được giải ngân nhanh cỡ nào', correct: false, explain: 'Nhanh không có nghĩa là rẻ hay an toàn.' },
          ]),
          q('Theo bài học, tiền trả góp hằng tháng không nên vượt quá bao nhiêu phần trăm thu nhập?', [
            { text: '30%', correct: true, explain: 'Đúng. Vượt mức này dễ thiếu tiền sinh hoạt.' },
            { text: '50%', correct: false, explain: 'Quá cao, rủi ro lỡ hạn trả và bị phạt chồng lãi.' },
            { text: '70%', correct: false, explain: 'Gần như không còn tiền cho sinh hoạt.' },
          ]),
        ],
      },
      {
        slug: 'bao-mat-tai-khoan',
        title: 'Bảo mật tài khoản — OTP, mật khẩu, SIM đổi chủ và các bẫy phổ biến',
        summary: 'Giữ OTP, đặt mật khẩu mạnh, đề phòng SIM đổi chủ và biết phản ứng khi tài khoản bị xâm nhập.',
        cover_image: `${DIGITAL}/cover.png`,
        est_minutes: 6,
        frames: [
          s(`${DIGITAL}/s3-01.png`, null, 'Mục tiêu bài học: bảo mật tài khoản'),
          s(`${DIGITAL}/s3-02.png`, null, 'OTP là gì và tại sao quan trọng như chìa khóa nhà?'),
          s(`${DIGITAL}/s3-03.png`, null, 'Các chiêu đánh cắp OTP phổ biến nhất'),
          s(`${DIGITAL}/s3-04.png`, null, 'App độc hại đọc trộm tin nhắn SMS'),
          s(`${DIGITAL}/s3-05.png`, null, 'SIM đổi chủ: rủi ro ít ai ngờ đến'),
          s(`${DIGITAL}/s3-06.png`, null, 'Đặt mật khẩu mạnh và nhớ được'),
          s(`${DIGITAL}/s3-07.png`, null, '10 thói quen bảo mật số hằng ngày'),
          s(`${DIGITAL}/s3-08.png`, null, 'Khi tài khoản bị xâm nhập: phản ứng trong 5 phút'),
          s(`${DIGITAL}/s3-09.png`, null, 'Ôn lại toàn mô đun'),
          q('Điện thoại đột nhiên mất sóng và bạn nhận tin "thay SIM thành công" dù không hề làm. Nên làm gì ngay?', [
            { text: 'Dùng máy khác gọi nhà mạng và ngân hàng để khóa tạm thời', correct: true, explain: 'Đúng. Kẻ gian có thể đang nhận OTP của bạn.' },
            { text: 'Đợi đến sáng mai xem sao', correct: false, explain: 'Mỗi phút chờ là thêm cơ hội cho kẻ gian.' },
            { text: 'Khởi động lại máy rồi bỏ qua', correct: false, explain: 'Đây là dấu hiệu SIM bị đánh cắp, không phải lỗi máy.' },
          ]),
          q('Mật khẩu nào sau đây mạnh nhất?', [
            { text: '01011990', correct: false, explain: 'Ngày sinh bị bẻ khóa trong chưa tới một giây.' },
            { text: 'Lan2000', correct: false, explain: 'Tên và năm sinh rất dễ đoán.' },
            { text: 'Toi@YeuCon#2024!', correct: true, explain: 'Đúng. Cụm từ dài kèm ký tự đặc biệt mất nhiều năm mới bẻ được.' },
          ]),
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ 8
  // Mô đun từ thiết kế cũ trên Figma ("Giáo dục tài chính (New 2) 2" · Mô-đun 4,
  // Session 1–4), cùng cách làm với các mô đun trên.
  {
    slug: 'tuong-lai-gia-dinh',
    title: 'Xây dựng tương lai gia đình',
    summary: 'Tiết kiệm cho con đi học, tính chuyện mua hay thuê nhà, hiểu lương hưu và lập kế hoạch tài chính cùng vợ hoặc chồng.',
    cover_image: `${FAMILY}/cover.png`,
    unlock_level: 1,
    lessons: [
      {
        slug: 'tiet-kiem-cho-con-di-hoc',
        title: 'Tiết kiệm cho con đi học — Bắt đầu từ bao giờ, bao nhiêu mỗi tháng?',
        summary: 'Chi phí giáo dục thực tế, cách tính số tiền cần để dành mỗi tháng và các hình thức tiết kiệm dài hạn.',
        cover_image: `${FAMILY}/cover.png`,
        est_minutes: 5,
        frames: [
          s(`${FAMILY}/s1-01.png`, null, 'Mục tiêu bài học: tiết kiệm cho con đi học'),
          s(`${FAMILY}/s1-02.png`, null, 'Chi phí học hành: con số thực tế'),
          s(`${FAMILY}/s1-03.png`, null, 'Bảng chi phí giáo dục từ mầm non đến đại học'),
          s(`${FAMILY}/s1-04.png`, null, 'Quy tắc vàng: bắt đầu càng sớm càng nhẹ gánh'),
          s(`${FAMILY}/s1-05.png`, null, 'Tính toán cụ thể cho gia đình bạn'),
          s(`${FAMILY}/s1-06.png`, null, 'Các hình thức tiết kiệm cho tương lai con'),
          s(`${FAMILY}/s1-07.png`, null, 'Ôn lại: tiết kiệm cho con đi học'),
          q('Vì sao nên bắt đầu tiết kiệm học phí cho con càng sớm càng tốt?', [
            { text: 'Càng nhiều năm thì số tiền cần để dành mỗi tháng càng nhỏ', correct: true, explain: 'Đúng. Bắt đầu từ khi con mới sinh cần ít hơn khoảng 12 lần so với lúc con 15 tuổi.' },
            { text: 'Vì học phí sẽ giảm dần theo thời gian', correct: false, explain: 'Ngược lại, học phí tăng trung bình 8–12% mỗi năm.' },
            { text: 'Vì ngân hàng chỉ nhận tiết kiệm cho trẻ nhỏ', correct: false, explain: 'Không có quy định như vậy.' },
          ]),
        ],
      },
      {
        slug: 'mua-nha-thue-nha',
        title: 'Mua nhà / Thuê nhà — Tính toán như thế nào cho hợp lý?',
        summary: 'So sánh mua và thuê, 5 câu hỏi kiểm tra độ sẵn sàng và cách tính vốn, tiền trả góp.',
        cover_image: `${FAMILY}/cover.png`,
        est_minutes: 6,
        frames: [
          s(`${FAMILY}/s2-01.png`, null, 'Mục tiêu bài học: mua nhà hay thuê nhà'),
          s(`${FAMILY}/s2-02.png`, null, 'Mua hay thuê: không có câu trả lời đúng cho tất cả'),
          s(`${FAMILY}/s2-03.png`, null, 'So sánh mua nhà và thuê nhà'),
          s(`${FAMILY}/s2-04.png`, null, 'Sẵn sàng mua nhà chưa? 5 câu hỏi kiểm tra'),
          s(`${FAMILY}/s2-05.png`, null, 'Tính toán tài chính trước khi mua nhà'),
          s(`${FAMILY}/s2-06.png`, null, 'Tính tiền trả góp hằng tháng'),
          s(`${FAMILY}/s2-07.png`, null, 'Lộ trình tích lũy vốn mua nhà từ con số 0'),
          s(`${FAMILY}/s2-08.png`, null, 'Ôn lại: mua nhà hay thuê nhà'),
          q('Theo bài học, giá nhà hợp lý không nên vượt quá bao nhiêu?', [
            { text: '5 lần thu nhập hằng năm của gia đình', correct: true, explain: 'Đúng. Ví dụ thu nhập 15 triệu/tháng thì nhà khoảng 900 triệu.' },
            { text: '20 lần thu nhập hằng năm', correct: false, explain: 'Quá cao, gánh nợ sẽ rất nặng.' },
            { text: 'Đúng bằng một năm thu nhập', correct: false, explain: 'Mức này hợp lý nhưng hiếm khi mua được nhà.' },
          ]),
          q('Tiền trả góp nhà hằng tháng nên không vượt quá bao nhiêu thu nhập gia đình?', [
            { text: '35%', correct: true, explain: 'Đúng. Còn lại để lo sinh hoạt và quỹ khẩn cấp.' },
            { text: '60%', correct: false, explain: 'Quá cao, dễ thiếu tiền khi có biến cố.' },
            { text: '80%', correct: false, explain: 'Gần như không còn tiền cho sinh hoạt.' },
          ]),
        ],
      },
      {
        slug: 'luong-huu-bhxh',
        title: 'Lương hưu & BHXH — Tôi nhận được gì khi về già?',
        summary: 'Điều kiện và cách tính lương hưu, và vì sao cần thêm nguồn khác ngoài lương hưu.',
        cover_image: `${FAMILY}/cover.png`,
        est_minutes: 5,
        frames: [
          s(`${FAMILY}/s3-01.png`, null, 'Mục tiêu bài học: lương hưu'),
          s(`${FAMILY}/s3-02.png`, null, 'Tại sao lương hưu quan trọng hơn bạn nghĩ?'),
          s(`${FAMILY}/s3-03.png`, null, 'Điều kiện được hưởng lương hưu'),
          s(`${FAMILY}/s3-04.png`, null, 'Cách tính lương hưu: công thức và ví dụ'),
          s(`${FAMILY}/s3-05.png`, null, 'Nếu chưa đủ điều kiện hưu trí thì sao?'),
          s(`${FAMILY}/s3-06.png`, null, 'Lương hưu chỉ là một chân, cần ba chân để vững'),
          s(`${FAMILY}/s3-07.png`, null, 'Ôn lại: lương hưu và BHXH'),
          q('Theo bài học, cần đóng BHXH tối thiểu bao nhiêu năm để hưởng lương hưu?', [
            { text: '5 năm', correct: false, explain: 'Quá ít để đủ điều kiện hưởng lương hưu hằng tháng.' },
            { text: '20 năm', correct: true, explain: 'Đúng, kèm điều kiện về tuổi nghỉ hưu.' },
            { text: '40 năm', correct: false, explain: 'Không cần nhiều đến vậy, dù đóng càng lâu thì lương hưu càng cao.' },
          ]),
          q('Vì sao nên cân nhắc kỹ trước khi rút BHXH một lần?', [
            { text: 'Rút một lần là mất quyền hưởng lương hưu cả đời', correct: true, explain: 'Đúng. Nếu còn trẻ và còn thời gian đóng tiếp, hãy cân nhắc kỹ.' },
            { text: 'Vì phải đóng một khoản phạt lớn', correct: false, explain: 'Điều đáng lo là mất lương hưu, không phải tiền phạt.' },
            { text: 'Không có lý do gì phải cân nhắc', correct: false, explain: 'Đây là quyết định ảnh hưởng suốt tuổi già.' },
          ]),
        ],
      },
      {
        slug: 'ke-hoach-tai-chinh-gia-dinh',
        title: 'Kế hoạch tài chính gia đình — Cả vợ chồng cùng ngồi lại',
        summary: 'Cách trò chuyện về tiền với vợ hoặc chồng và lập kế hoạch tài chính gia đình 1 trang.',
        cover_image: `${FAMILY}/cover.png`,
        est_minutes: 5,
        frames: [
          s(`${FAMILY}/s4-01.png`, null, 'Mục tiêu bài học: kế hoạch tài chính gia đình'),
          s(`${FAMILY}/s4-02.png`, null, 'Tại sao vợ chồng cần nói chuyện về tiền?'),
          s(`${FAMILY}/s4-03.png`, null, 'Hướng dẫn cuộc họp tài chính gia đình hằng tháng'),
          s(`${FAMILY}/s4-04.png`, null, 'Kế hoạch tài chính gia đình 1 trang: thu nhập và chi tiêu'),
          s(`${FAMILY}/s4-05.png`, null, 'Kế hoạch tài chính gia đình 1 trang: tiết kiệm, mục tiêu và cam kết'),
          s(`${FAMILY}/s4-06.png`, null, '6 nguyên tắc vàng cho tài chính gia đình bền vững'),
          s(`${FAMILY}/s4-07.png`, null, 'Kiến thức và công cụ đã có'),
          q('Nguyên tắc "Trả mình trước" nghĩa là gì?', [
            { text: 'Tiết kiệm trước, rồi chi tiêu bằng phần còn lại', correct: true, explain: 'Đúng. Tiết kiệm không còn phụ thuộc vào việc cuối tháng có dư hay không.' },
            { text: 'Trả nợ riêng của mình trước nợ chung', correct: false, explain: 'Nguyên tắc này nói về tiết kiệm, không phải thứ tự trả nợ.' },
            { text: 'Mua sắm cho mình trước khi lo cho gia đình', correct: false, explain: 'Ngược lại, đây là cách ưu tiên mục tiêu chung.' },
          ]),
        ],
      },
    ],
  },
];
