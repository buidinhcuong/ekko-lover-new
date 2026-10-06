/**
 * Đợt tin tức thứ hai (20 bài) cho carousel "Tin tức" và màn "Xem tất cả".
 *
 * Bài viết dạng kiến thức / cảnh báo dùng được lâu, không phải tin thời sự có
 * ngày tháng: không nêu con số lãi suất, giá vàng hay quy định cụ thể dễ lỗi
 * thời. Admin sửa hoặc ẩn từng bài ở Admin → Tin tức.
 *
 * Mỗi bài để bản tiếng Anh ngay cạnh (`en`) để không lệch giữa hai bản;
 * `NEWS_EN` ghép vào bảng đối chiếu ở server/i18n/en.js. Ảnh nằm ở
 * public/assets/news/.
 */

const img = (name) => `/assets/news/${name}.svg`;

export const NEWS_CATEGORY_EN = {
  'Cảnh giác': 'Stay alert',
  'Quyền lợi': 'Your rights',
  'Ngân hàng số': 'Digital banking',
};

export const MORE_NEWS = [
  {
    title: 'Tin nhắn giả danh ngân hàng: nhận diện trong 10 giây',
    summary: 'Đường link lạ, giọng hối thúc, đòi mã OTP — ba dấu hiệu đủ để bạn dừng tay.',
    category: 'Cảnh giác',
    image: img('tin-nhan-gia-danh'),
    read_minutes: 3,
    body: `"Tài khoản của quý khách sẽ bị khoá trong 24 giờ, bấm vào đường link để xác minh." Kiểu tin nhắn này đến hằng ngày, và chỉ cần một lần bấm nhầm là mất tiền.

**Ba dấu hiệu nhận diện:**

- Có đường link lạ, nhìn gần giống tên ngân hàng nhưng sai vài chữ
- Giọng hối thúc: khoá tài khoản, mất quyền lợi, chỉ còn vài giờ
- Đòi mã OTP, mật khẩu hoặc ảnh thẻ — ngân hàng thật không bao giờ hỏi những thứ này

Tin nhắn giả có thể nằm chung luồng với tin nhắn thật của ngân hàng, nên tên người gửi không đủ để tin.

> Nghi ngờ thì gọi lại tổng đài in trên mặt sau thẻ, đừng gọi số có trong tin nhắn.

Lỡ bấm hoặc lỡ đưa mã rồi? Gọi ngay ngân hàng để khoá tài khoản, càng sớm càng giữ được tiền.`,
    en: {
      title: 'Fake bank texts: spot them in 10 seconds',
      summary: 'A strange link, a rushed tone, a request for your OTP — three signs that are enough to stop.',
      body: `"Your account will be locked in 24 hours, tap the link to verify." Messages like this arrive every day, and a single wrong tap is enough to lose money.

**Three signs to look for:**

- A strange link that looks like the bank's name but is a few letters off
- A rushed tone: account locked, benefits lost, only a few hours left
- A request for your OTP, password or a photo of your card — a real bank never asks for these

Fake messages can land in the same thread as your bank's real ones, so the sender name alone is not enough to trust.

> If in doubt, call the hotline printed on the back of your card, not the number in the message.

Already tapped or shared the code? Call your bank straight away to lock the account — the sooner you do, the more you keep.`,
    },
  },
  {
    title: 'Mã QR dán đè: chiêu lừa ở quầy thanh toán',
    summary: 'Trước khi chuyển khoản qua mã QR, nhìn kỹ tên người nhận hiện trên màn hình.',
    category: 'Cảnh giác',
    image: img('ma-qr-dan-de'),
    read_minutes: 3,
    body: `Quét mã QR để trả tiền đã quen như đưa tiền mặt. Chính vì quen nên ít ai để ý khi mã ở quầy bị dán đè bằng một mã khác — tiền đi thẳng vào tài khoản kẻ gian.

**Thói quen 5 giây cứu được tiền:**

- Sau khi quét, đọc **tên người nhận** trên màn hình trước khi bấm chuyển
- Tên không khớp với cửa hàng thì hỏi lại người bán
- Mã QR dán lệch, mép bong, dán chồng lên mã khác — đừng quét

Với các khoản lớn, nhờ người bán đọc số tài khoản hoặc cho xem mã trên máy của họ.

Lỡ chuyển nhầm vào tài khoản lạ: chụp lại giao dịch, báo ngay ngân hàng và báo cửa hàng để họ kiểm tra mã ở quầy.`,
    en: {
      title: 'Stuck-on QR codes: a checkout scam',
      summary: 'Before you pay by QR code, read the recipient name on your screen carefully.',
      body: `Scanning a QR code to pay has become as normal as handing over cash. Because it is so normal, few people notice when the code at the counter has a different one stuck over it — and the money goes straight to a scammer.

**A five-second habit that saves money:**

- After scanning, read the **recipient name** on screen before you confirm
- If the name does not match the shop, ask the seller
- If the code is crooked, peeling, or stuck over another code — do not scan it

For larger amounts, ask the seller to read out their account number or show the code on their own device.

Paid the wrong account by mistake? Screenshot the transaction, tell your bank straight away and tell the shop so they can check the code at the counter.`,
    },
  },
  {
    title: 'Đừng cho mượn CCCD hay tài khoản ngân hàng',
    summary: 'Cho mượn để "giúp bạn nhận tiền" có thể khiến bạn dính vào đường dây rửa tiền.',
    category: 'Cảnh giác',
    image: img('khong-cho-muon-tai-khoan'),
    read_minutes: 3,
    body: `"Cho mình mượn tài khoản nhận tiền hộ, mình gửi lại 500 nghìn tiền công." Lời nhờ nghe vô hại, nhưng tài khoản đứng tên bạn có thể bị dùng để nhận tiền lừa đảo.

Khi có người báo bị lừa, dòng tiền được lần theo — và điểm dừng đầu tiên là **tài khoản đứng tên bạn**. Bạn có thể bị phong toả tài khoản, bị mời làm việc với cơ quan chức năng, và rất khó chứng minh mình không liên quan.

**Những thứ không bao giờ nên cho mượn hay bán:**

- Căn cước công dân, kể cả ảnh chụp hai mặt
- Tài khoản ngân hàng, thẻ ATM, ứng dụng ngân hàng đã đăng nhập
- Số điện thoại nhận mã OTP

Lỡ cho mượn rồi thì đổi mật khẩu, khoá thẻ, báo ngân hàng và giữ lại tin nhắn trao đổi làm bằng chứng.`,
    en: {
      title: 'Never lend your ID card or bank account',
      summary: 'Lending them to "help a friend receive money" can pull you into a money-laundering ring.',
      body: `"Let me use your account to receive some money, I'll give you 500k for the trouble." It sounds harmless, but an account in your name can be used to collect money from scams.

When someone reports being scammed, the money is traced — and the first stop is **the account in your name**. Your account can be frozen, you can be called in by the authorities, and it is very hard to prove you had nothing to do with it.

**Things you should never lend or sell:**

- Your citizen ID card, including photos of both sides
- Your bank account, ATM card, or a logged-in banking app
- The phone number that receives your OTP codes

Already lent them? Change your passwords, lock the card, tell your bank and keep the messages as evidence.`,
    },
  },
  {
    title: 'App vay "lãi 0%" và cái giá thật phía sau',
    summary: 'Phí hồ sơ, phí dịch vụ, phạt trễ hạn — tính tổng tiền phải trả trước khi bấm vay.',
    category: 'Cảnh giác',
    image: img('app-vay-lai-0'),
    read_minutes: 4,
    body: `Quảng cáo "vay 5 triệu, duyệt trong 5 phút, lãi 0%" xuất hiện khắp mạng xã hội. Lãi có thể bằng 0 thật, nhưng tiền phải trả thì không.

**Chi phí hay giấu sau chữ "0%":**

- Phí hồ sơ, phí thẩm định trừ thẳng vào tiền giải ngân — vay 5 triệu, nhận về 4 triệu
- Phí dịch vụ, phí bảo hiểm khoản vay tính theo ngày
- Phạt trễ hạn rất nặng, cộng dồn chỉ sau vài ngày

Nguy hiểm hơn là các app đòi quyền đọc danh bạ: trễ hạn một ngày là người thân, đồng nghiệp bị gọi điện, nhắn tin đòi nợ.

**Trước khi vay, hỏi ba câu:**

- Tổng số tiền tôi phải trả là bao nhiêu, vào ngày nào?
- Đây có phải công ty tài chính hoặc ngân hàng được cấp phép không?
- App có đòi quyền truy cập danh bạ, ảnh không?

Cần tiền gấp vì đã làm đủ ngày công, hỏi doanh nghiệp về ứng lương — thường rẻ và an toàn hơn nhiều.`,
    en: {
      title: '"0% interest" loan apps and the real cost behind them',
      summary: 'Processing fees, service fees, late penalties — add up the total before you tap borrow.',
      body: `Ads for "borrow 5 million, approved in 5 minutes, 0% interest" are all over social media. The interest may really be zero, but what you repay is not.

**Costs that often hide behind "0%":**

- Processing and appraisal fees taken straight out of the payout — borrow 5 million, receive 4
- Daily service fees or loan insurance fees
- Heavy late penalties that pile up after just a few days

Worse still are apps that ask to read your contacts: one day late and your family and colleagues start getting debt-collection calls and messages.

**Before borrowing, ask three questions:**

- What is the total I must repay, and on which date?
- Is this a licensed finance company or bank?
- Does the app want access to my contacts or photos?

If you need money urgently for days you have already worked, ask your employer about a salary advance — usually much cheaper and safer.`,
    },
  },
  {
    title: 'Hụi, họ: trước khi tham gia cần biết gì',
    summary: 'Góp vốn xoay vòng giúp có khoản lớn sớm, nhưng rủi ro "vỡ hụi" là có thật.',
    category: 'Cảnh giác',
    image: img('hui-ho'),
    read_minutes: 4,
    body: `Hụi (họ, phường) là cách góp tiền xoay vòng quen thuộc: mỗi kỳ mọi người cùng góp, một người được nhận cả khoản. Ai cần tiền sớm thì bỏ lãi để được nhận trước.

**Vì sao nhiều người vẫn chơi:** có khoản lớn sớm mà không phải vay ngân hàng, lại có kỷ luật góp đều.

**Rủi ro lớn nhất là vỡ hụi:** chủ hụi hoặc người đã nhận tiền bỏ trốn, những người góp sau mất trắng. Khoản góp không được bảo hiểm như tiền gửi ngân hàng, và đòi lại rất mất thời gian.

**Nếu vẫn tham gia:**

- Chỉ chơi với người thật sự quen biết lâu, minh bạch sổ sách
- Ghi chép rõ từng kỳ góp, có chữ ký hoặc tin nhắn xác nhận
- Không góp bằng tiền vay hoặc tiền của quỹ khẩn cấp
- Cẩn thận với hụi online do người lạ lập, lãi hứa hẹn cao bất thường

Mục tiêu chỉ là để dành đều đặn? Một khoản gửi tiết kiệm định kỳ ở ngân hàng làm được việc đó mà an toàn hơn.`,
    en: {
      title: 'Rotating savings groups (hụi): know this before you join',
      summary: 'Pooling money helps you get a lump sum early, but the risk of the group collapsing is real.',
      body: `A hụi (also called họ or phường) is a familiar rotating savings group: every round, everyone pays in and one member takes the whole pot. Whoever needs money sooner bids interest to collect early.

**Why many people still join:** you get a large sum early without a bank loan, plus the discipline of paying in regularly.

**The biggest risk is collapse:** the organiser or someone who has already collected runs off, and the members due later lose everything. Contributions are not insured like bank deposits, and getting money back takes a long time.

**If you still join:**

- Only join with people you have known well for a long time, with open records
- Record every contribution clearly, with a signature or a confirming message
- Never contribute borrowed money or your emergency fund
- Be wary of online groups set up by strangers that promise unusually high returns

If you just want to save regularly, a recurring savings deposit at a bank does the same job more safely.`,
    },
  },
  {
    title: 'Đọc phiếu lương: 5 dòng cần kiểm mỗi tháng',
    summary: 'Ngày công, tăng ca, phụ cấp, khoản trích bảo hiểm — sai một dòng là thiệt cả tháng.',
    category: 'Quyền lợi',
    image: img('doc-phieu-luong'),
    read_minutes: 4,
    body: `Lương về tài khoản, nhiều người chỉ nhìn con số cuối cùng. Nhưng phiếu lương là nơi duy nhất cho biết con số đó được tính thế nào — và có đúng không.

**Năm dòng nên kiểm mỗi tháng:**

- **Ngày công thực tế** — khớp với số ngày bạn đã đi làm
- **Giờ tăng ca** — đủ giờ, đúng hệ số ngày thường, ngày nghỉ, ngày lễ
- **Phụ cấp** — ăn trưa, đi lại, chuyên cần, độc hại… có đủ như hợp đồng
- **Các khoản trích** — bảo hiểm xã hội, y tế, thất nghiệp, công đoàn
- **Khoản trừ khác** — ứng lương, phạt, đồng phục: có đúng và có báo trước không

Giữ phiếu lương (ảnh chụp cũng được) ít nhất vài năm. Khi cần làm hồ sơ vay, chứng minh thu nhập hay giải quyết tranh chấp, đây là bằng chứng quan trọng.

Thấy sai, hỏi bộ phận nhân sự càng sớm càng tốt — sửa trong tháng dễ hơn nhiều so với truy lại sau một năm.`,
    en: {
      title: 'Reading your payslip: 5 lines to check every month',
      summary: 'Days worked, overtime, allowances, insurance deductions — one wrong line costs you a whole month.',
      body: `When pay lands in the account, many people only look at the final figure. But the payslip is the only place that shows how that figure was worked out — and whether it is right.

**Five lines worth checking every month:**

- **Days actually worked** — matches the days you went to work
- **Overtime hours** — all hours counted, at the right rate for weekdays, rest days and holidays
- **Allowances** — meals, travel, attendance, hazard pay… everything in your contract
- **Deductions** — social insurance, health insurance, unemployment insurance, union fees
- **Other deductions** — salary advances, fines, uniforms: correct and announced in advance?

Keep your payslips (a photo is fine) for at least a few years. For a loan application, proof of income or a dispute, they are important evidence.

Spot a mistake? Ask HR as soon as possible — fixing it within the month is much easier than chasing it a year later.`,
    },
  },
  {
    title: 'Bảo hiểm xã hội: vì sao nên giữ chặng đường dài',
    summary: 'Mỗi tháng đóng là một viên gạch cho lương hưu, thai sản, ốm đau sau này.',
    category: 'Quyền lợi',
    image: img('bao-hiem-xa-hoi'),
    read_minutes: 4,
    body: `Khoản trích bảo hiểm xã hội trên phiếu lương dễ bị coi là "tiền mất đi". Thực ra đó là phần bạn và doanh nghiệp cùng góp cho chính những lúc bạn khó khăn nhất.

**Bảo hiểm xã hội bắt buộc giúp gì:**

- Ốm đau, tai nạn lao động: được hưởng trợ cấp trong thời gian nghỉ
- Thai sản: được nghỉ và hưởng chế độ khi sinh con
- Thất nghiệp: có trợ cấp và hỗ trợ học nghề khi mất việc (bảo hiểm thất nghiệp)
- Về già: thời gian đóng được cộng dồn để tính lương hưu

**Vì sao nên cân nhắc kỹ trước khi rút một lần:** rút ra là cắt đứt quãng thời gian đã đóng, mất quyền lương hưu cho quãng đó. Khoản tiền nhận ngay có thể nhỏ hơn nhiều so với giá trị lâu dài.

Nghỉ việc hay chuyển chỗ làm, bạn có thể **bảo lưu** thời gian đóng và đóng tiếp ở nơi mới. Quy định có thể thay đổi theo từng thời kỳ — hỏi cơ quan bảo hiểm xã hội nơi bạn sống trước khi quyết định.

Mẹo: tra cứu quá trình đóng trên ứng dụng VssID để chắc doanh nghiệp đóng đủ, đúng hạn.`,
    en: {
      title: 'Social insurance: why it pays to stay the course',
      summary: 'Every month you contribute is a brick in your pension and your sickness and maternity cover.',
      body: `The social insurance deduction on your payslip is easy to see as "money gone". In fact it is what you and your employer pay in for the very times you will need it most.

**What compulsory social insurance covers:**

- Sickness and workplace accidents: benefits while you are off work
- Maternity: leave and benefits when you have a child
- Unemployment: an allowance and training support if you lose your job (unemployment insurance)
- Old age: your contribution years add up towards a pension

**Why to think hard before taking a one-off withdrawal:** withdrawing cuts off the years you have paid, and you lose the pension rights for them. The cash now may be worth far less than the long-term value.

When you quit or change jobs, you can **keep** your contribution record and continue at the new workplace. Rules can change over time — ask the social insurance office where you live before you decide.

Tip: check your contribution history in the VssID app to make sure your employer pays in full and on time.`,
    },
  },
  {
    title: 'Thẻ bảo hiểm y tế: dùng đúng để đỡ tốn',
    summary: 'Đi khám đúng tuyến, mang theo thẻ (hoặc VssID), hỏi rõ khoản nào được chi trả.',
    category: 'Quyền lợi',
    image: img('bao-hiem-y-te'),
    read_minutes: 3,
    body: `Có thẻ bảo hiểm y tế nhưng nhiều người vẫn trả trọn tiền viện phí — vì quên mang thẻ, khám sai nơi đăng ký, hoặc không biết khoản nào được chi trả.

**Để thẻ phát huy tác dụng:**

- Biết **nơi đăng ký khám chữa bệnh ban đầu** in trên thẻ, ưu tiên khám ở đó
- Luôn mang thẻ, hoặc mở thẻ điện tử trên ứng dụng VssID
- Cấp cứu thì đến cơ sở gần nhất, bảo hiểm vẫn được tính
- Hỏi trước khi làm xét nghiệm, dùng thuốc: khoản nào bảo hiểm trả, khoản nào tự trả

Nếu bạn làm việc theo hợp đồng lao động, doanh nghiệp thường đóng bảo hiểm y tế cùng bảo hiểm xã hội. Kiểm tra thẻ còn hạn, nhất là khi vừa chuyển chỗ làm.

Một lần nằm viện có thể bằng vài tháng lương. Vài phút tìm hiểu cách dùng thẻ giúp bạn tiết kiệm đáng kể.`,
    en: {
      title: 'Health insurance cards: use them right and pay less',
      summary: 'Go to the right clinic, bring your card (or VssID), and ask what is covered.',
      body: `Many people with a health insurance card still pay hospital bills in full — because they forgot the card, went somewhere other than their registered clinic, or did not know what was covered.

**To get the most from your card:**

- Know the **registered first-contact clinic** printed on the card, and go there first
- Always carry the card, or open the digital version in the VssID app
- In an emergency, go to the nearest facility — insurance still applies
- Ask before tests or medicine: what does insurance pay, and what do you pay

If you work under a labour contract, your employer usually pays health insurance along with social insurance. Check your card is still valid, especially after changing jobs.

One hospital stay can cost several months' pay. A few minutes learning how to use the card can save you a lot.`,
    },
  },
  {
    title: 'Thưởng Tết về: chia thế nào cho khỏi hụt sau Tết',
    summary: 'Chia khoản thưởng thành ba phần trước khi tiêu đồng nào.',
    category: 'Mẹo',
    image: img('thuong-tet'),
    read_minutes: 3,
    body: `Thưởng Tết là khoản tiền lớn nhất trong năm của nhiều người — và cũng là khoản biến mất nhanh nhất. Qua rằm tháng Giêng, ví đã trống mà lương tháng sau còn xa.

**Chia ngay khi nhận, trước khi tiêu:**

- **Phần cho Tết** — quà biếu, lì xì, đi lại, mâm cỗ. Đặt một con số và giữ đúng
- **Phần cho sau Tết** — tiền nhà, sinh hoạt tháng Giêng, khi lương thường về muộn
- **Phần cho mình** — bổ sung quỹ khẩn cấp hoặc một mục tiêu đã đặt

Một tỷ lệ dễ nhớ để bắt đầu: một nửa cho Tết, một phần tư cho tháng sau Tết, một phần tư để dành. Điều chỉnh theo hoàn cảnh, nhưng đừng để phần cuối bằng không.

> Lì xì nhiều không đo bằng tấm lòng. Một con số vừa sức giúp cả năm sau nhẹ nhàng hơn.

Ghi lại các khoản chi trong dịp Tết — năm sau bạn sẽ biết chính xác cần chuẩn bị bao nhiêu.`,
    en: {
      title: 'Tết bonus is in: how to split it so you are not short after the holiday',
      summary: 'Divide the bonus into three parts before you spend a single đồng.',
      body: `The Tết bonus is the largest payment of the year for many people — and the one that vanishes fastest. By the full moon of the first lunar month the wallet is empty and next payday is still far off.

**Split it the moment it arrives, before spending:**

- **For Tết** — gifts, lucky money, travel, the family feast. Set a figure and stick to it
- **For after Tết** — rent and living costs in the first month, when the normal salary often comes late
- **For yourself** — top up your emergency fund or a goal you have set

An easy ratio to start with: half for Tết, a quarter for the month after, a quarter saved. Adjust to your situation, but do not let the last part be zero.

> Generosity is not measured by the size of the red envelope. An amount you can afford makes the whole year easier.

Log what you spend over Tết — next year you will know exactly how much to prepare.`,
    },
  },
  {
    title: 'Mua trước trả sau: tiện nhưng dễ trượt tay',
    summary: 'Chia nhỏ khoản thanh toán làm món đồ trông rẻ hơn thực tế.',
    category: 'Kiến thức',
    image: img('mua-truoc-tra-sau'),
    read_minutes: 4,
    body: `"Chỉ 299 nghìn mỗi tháng" — chia nhỏ khoản thanh toán làm một chiếc điện thoại 7 triệu trông như món đồ vừa túi tiền. Đó chính là lý do mua trước trả sau (trả góp, BNPL) dễ khiến người ta mua nhiều hơn dự định.

**Ưu điểm là thật:** không phải bỏ ra một khoản lớn ngay, một số chương trình không tính lãi nếu trả đúng hạn.

**Rủi ro cũng thật:**

- Nhiều khoản nhỏ cộng lại thành gánh nặng lớn mỗi tháng
- Trễ một kỳ là phí phạt, lãi phạt, có thể ảnh hưởng lịch sử tín dụng
- Dễ quên vì mỗi khoản nằm ở một app khác nhau

**Quy tắc an toàn:**

- Chỉ trả góp món **cần**, không phải món muốn mua ngay
- Cộng tất cả khoản trả góp đang chạy — đừng để vượt khoảng 10–15% thu nhập tháng
- Đặt nhắc lịch trước ngày đến hạn vài hôm

Ghi khoản trả góp hằng tháng vào nhóm Trả nợ trong ngân sách để thấy rõ nó chiếm bao nhiêu.`,
    en: {
      title: 'Buy now, pay later: handy, but easy to slip',
      summary: 'Splitting payments makes things look cheaper than they really are.',
      body: `"Only 299k a month" — splitting the payment makes a 7-million phone look affordable. That is exactly why buy now, pay later (instalments, BNPL) makes people buy more than they planned.

**The upside is real:** no large payment up front, and some schemes charge no interest if you pay on time.

**So are the risks:**

- Many small payments add up to a heavy monthly load
- Miss one and there are fees and penalty interest, and your credit history may suffer
- They are easy to forget because each sits in a different app

**Safe rules:**

- Only use instalments for things you **need**, not things you want right now
- Add up every running instalment — try not to go above about 10–15% of your monthly income
- Set a reminder a few days before each due date

Log your monthly instalments under Debt in your budget to see clearly how much they take.`,
    },
  },
  {
    title: 'Lạm phát lặng lẽ ăn mòn tiền nhàn rỗi thế nào',
    summary: 'Tiền để yên một chỗ không mất đi, nhưng mua được ít hơn mỗi năm.',
    category: 'Kiến thức',
    image: img('lam-phat'),
    read_minutes: 4,
    body: `Năm năm trước, một tô phở giá bao nhiêu? Bây giờ giá bao nhiêu? Khoảng chênh đó chính là lạm phát — giá cả tăng dần theo thời gian, nên cùng một số tiền mua được ít hàng hơn.

**Ví dụ dễ hình dung:** nếu giá cả tăng khoảng 4% mỗi năm, 10 triệu để trong tủ sau 5 năm chỉ còn sức mua gần bằng 8,2 triệu hôm nay. Tiền không mất tờ nào, nhưng giá trị thì có.

**Điều đó có nghĩa là:**

- Tiền mặt để lâu ở nhà là cách giữ tiền "đắt" nhất
- Lãi tiết kiệm nên được so với mức tăng giá, không chỉ so với con số 0
- Mục tiêu dài hạn (mua nhà, học phí cho con) cần tính thêm phần tăng giá

**Không có nghĩa là:** phải lao vào kênh đầu tư rủi ro cao. Quỹ khẩn cấp vẫn cần nằm ở chỗ an toàn, rút được ngay. Phần tiền dài hạn mới là phần nên tìm nơi sinh lời tốt hơn tốc độ tăng giá.`,
    en: {
      title: 'How inflation quietly eats idle money',
      summary: 'Money left in one place does not disappear, but it buys less every year.',
      body: `How much did a bowl of phở cost five years ago? How much now? That gap is inflation — prices creep up over time, so the same amount of money buys less.

**An easy example:** if prices rise about 4% a year, 10 million kept in a drawer has, after 5 years, the buying power of roughly 8.2 million today. Not a single note is lost, but value is.

**What this means:**

- Cash kept at home for a long time is the most "expensive" way to hold money
- Savings interest should be compared with price rises, not just with zero
- Long-term goals (a home, school fees for your children) need to allow for rising prices

**What it does not mean:** that you must rush into high-risk investments. Your emergency fund still belongs somewhere safe and instantly available. It is the long-term money that should look for a return above the rate prices rise.`,
    },
  },
  {
    title: 'Gửi tiết kiệm có kỳ hạn: rút trước hạn mất gì?',
    summary: 'Rút sớm thường chỉ được lãi không kỳ hạn — chia sổ nhỏ để linh hoạt hơn.',
    category: 'Kiến thức',
    image: img('rut-truoc-han'),
    read_minutes: 3,
    body: `Gửi tiết kiệm có kỳ hạn được lãi cao hơn gửi không kỳ hạn, đổi lại bạn hứa để yên tiền đến ngày đáo hạn. Phá sổ trước hạn thì phần lớn ngân hàng chỉ trả **lãi không kỳ hạn** — thấp hơn nhiều — cho cả quãng đã gửi.

**Ví dụ:** gửi 6 tháng, đến tháng thứ 5 cần tiền rút ra, gần như mất hết phần lãi chênh lệch của 5 tháng đó.

**Cách giữ được lãi mà vẫn linh hoạt:**

- **Chia nhỏ sổ**: thay vì một sổ 30 triệu, gửi ba sổ 10 triệu. Cần tiền thì chỉ phá một sổ
- **Xếp bậc kỳ hạn**: các sổ đáo hạn lệch nhau (1, 3, 6 tháng) để tháng nào cũng có sổ sắp đến hạn
- Để quỹ khẩn cấp ở chỗ rút được ngay, chỉ gửi kỳ hạn phần tiền thật sự chưa dùng tới

Đọc kỹ điều khoản rút trước hạn của từng ngân hàng — mỗi nơi một cách tính.

Trong Ekko, khoản tiết kiệm có kỳ hạn chỉ cộng lãi khi đã đến ngày đáo hạn, đúng như cách ngân hàng trả.`,
    en: {
      title: 'Fixed-term savings: what do you lose by withdrawing early?',
      summary: 'Early withdrawal usually earns only demand-deposit interest — split your deposits to stay flexible.',
      body: `A fixed-term deposit pays more than a demand deposit; in return you promise to leave the money until it matures. Break it early and most banks pay only **demand-deposit interest** — much lower — for the whole period.

**Example:** you deposit for 6 months, need the money in month 5, and lose almost all the extra interest for those 5 months.

**How to keep the interest and stay flexible:**

- **Split your deposits**: instead of one 30-million deposit, make three of 10 million. If you need money, break only one
- **Ladder the terms**: stagger maturities (1, 3, 6 months) so something is always about to mature
- Keep your emergency fund somewhere instantly available; only lock away money you truly will not need

Read each bank's early-withdrawal terms carefully — every bank calculates it differently.

In Ekko, a fixed-term savings item only adds interest once it reaches maturity, just as the bank pays it.`,
    },
  },
  {
    title: 'Gửi tiết kiệm online: an toàn nếu làm đúng 4 điều',
    summary: 'Chỉ dùng ứng dụng chính thức của ngân hàng, và kiểm tra sổ sau khi mở.',
    category: 'Ngân hàng số',
    image: img('tiet-kiem-online'),
    read_minutes: 3,
    body: `Mở sổ tiết kiệm ngay trên điện thoại giờ chỉ mất vài phút, lãi suất nhiều khi còn cao hơn gửi tại quầy. Tiền gửi online vẫn là tiền gửi ngân hàng — miễn là bạn gửi đúng chỗ.

**Bốn điều cần làm đúng:**

- Chỉ dùng **ứng dụng chính thức** tải từ App Store / Google Play, đúng tên nhà phát hành là ngân hàng
- Không gửi qua đường link hay "nhân viên tư vấn" nhắn tin mời lãi cao bất thường
- Sau khi mở, kiểm tra sổ hiện trong mục Tiết kiệm của app, có số sổ, kỳ hạn, ngày đáo hạn
- Chọn rõ cách xử lý khi đáo hạn: tự động gửi tiếp hay chuyển về tài khoản

> Lãi suất cao hơn hẳn mặt bằng chung kèm lời hứa "cam kết" là dấu hiệu nên dừng lại.

Thêm khoản đó vào mục Tiết kiệm trong Ekko để theo dõi ngày đáo hạn và tiền lãi dự kiến.`,
    en: {
      title: 'Saving online: safe if you get 4 things right',
      summary: 'Only use the bank\'s official app, and check the deposit after you open it.',
      body: `Opening a savings deposit on your phone now takes a few minutes, and the rate is often higher than at the counter. An online deposit is still a bank deposit — as long as you put it in the right place.

**Four things to get right:**

- Use only the **official app** from the App Store / Google Play, published by the bank itself
- Never deposit through a link or a "consultant" who messages you with an unusually high rate
- After opening, check the deposit appears under Savings in the app, with a number, term and maturity date
- Choose clearly what happens at maturity: roll over automatically or pay back to your account

> A rate far above the market, paired with a "guaranteed" promise, is a sign to stop.

Add the deposit to Savings in Ekko to track its maturity date and expected interest.`,
    },
  },
  {
    title: 'Giá vàng lên xuống: mua vàng tích trữ cần nhớ gì',
    summary: 'Chênh lệch mua – bán và nơi cất giữ quan trọng không kém giá hôm nay.',
    category: 'Kiến thức',
    image: img('vang-tich-tru'),
    read_minutes: 4,
    body: `Mỗi lần giá vàng tăng mạnh, nhiều người vội đi mua vì sợ lỡ. Vàng là kênh giữ giá quen thuộc, nhưng mua lúc nào và mua thế nào ảnh hưởng nhiều đến chuyện lời hay lỗ.

**Ba điều nên biết trước khi mua:**

- **Chênh lệch giá mua – bán**: tiệm bán cho bạn giá cao, mua lại giá thấp hơn. Mua xong bán ngay là lỗ phần chênh này
- **Giá biến động mạnh**: có thể đi xuống trong nhiều tháng. Vàng hợp với tiền để lâu, không hợp với tiền sắp dùng
- **Cất giữ**: để ở nhà có rủi ro mất trộm; giữ hoá đơn, mua ở nơi uy tín

**Cách mua bình tĩnh hơn:**

- Mua đều đặn từng ít một thay vì dồn một lần lúc giá đang nóng
- Không vay tiền để mua vàng
- Chỉ dùng phần tiền đã có quỹ khẩn cấp đủ

Xem giá vàng tham khảo trong mục Tiết kiệm của Ekko trước khi ra tiệm.`,
    en: {
      title: 'Gold prices up and down: what to remember when buying to hold',
      summary: 'The buy–sell spread and where you keep it matter as much as today\'s price.',
      body: `Every time gold jumps, many people rush to buy for fear of missing out. Gold is a familiar way to hold value, but when and how you buy has a big effect on whether you gain or lose.

**Three things to know before buying:**

- **The buy–sell spread**: the shop sells to you high and buys back lower. Buy and sell straight away and you lose that gap
- **Prices swing a lot**: they can fall for months. Gold suits money you will hold for a long time, not money you will need soon
- **Storage**: keeping it at home risks theft; keep your receipts and buy from reputable shops

**A calmer way to buy:**

- Buy a little regularly instead of all at once when prices are hot
- Never borrow to buy gold
- Only use money left over once your emergency fund is in place

Check reference gold prices under Savings in Ekko before you go to the shop.`,
    },
  },
  {
    title: 'Bật sinh trắc học cho app ngân hàng: vì sao nên làm',
    summary: 'Khuôn mặt, vân tay khó bị đánh cắp hơn mã OTP gửi qua tin nhắn.',
    category: 'Ngân hàng số',
    image: img('sinh-trac-hoc'),
    read_minutes: 3,
    body: `Nhiều ngân hàng yêu cầu xác thực bằng khuôn mặt cho các giao dịch lớn hoặc khi đăng nhập trên điện thoại mới. Thêm một bước, nhưng đổi lại tiền của bạn an toàn hơn nhiều.

**Vì sao sinh trắc học an toàn hơn:** mã OTP có thể bị lừa lấy qua điện thoại hay tin nhắn, còn khuôn mặt, vân tay của bạn thì kẻ gian không "xin" được.

**Để lớp bảo vệ này phát huy:**

- Cập nhật thông tin sinh trắc học trực tiếp trong app chính thức hoặc tại quầy
- **Không** làm theo người lạ hướng dẫn qua điện thoại "cập nhật sinh trắc học giúp" — đây là chiêu lừa phổ biến
- Không cài ứng dụng lạ theo đường link, nhất là app đòi quyền điều khiển màn hình
- Đặt khoá màn hình cho điện thoại

Đổi điện thoại hay mất máy, báo ngân hàng để khoá đăng nhập trên máy cũ.`,
    en: {
      title: 'Turn on biometrics in your banking app: here is why',
      summary: 'Your face or fingerprint is much harder to steal than an OTP sent by text.',
      body: `Many banks require face verification for large transactions or when you log in on a new phone. It is one extra step, but it makes your money much safer.

**Why biometrics are safer:** an OTP can be tricked out of you over the phone or by text, but a scammer cannot "ask" for your face or fingerprint.

**To make this protection work:**

- Update your biometric details only in the official app or at the bank counter
- **Do not** follow a stranger on the phone who offers to "help update your biometrics" — this is a common scam
- Do not install unknown apps from links, especially ones asking to control your screen
- Set a screen lock on your phone

If you change or lose your phone, tell your bank so it can block logins on the old device.`,
    },
  },
  {
    title: 'Chuyển khoản nhầm: làm gì ngay để lấy lại tiền',
    summary: 'Báo ngân hàng càng sớm càng tốt, và cẩn thận với người "chuyển nhầm" cho bạn.',
    category: 'Ngân hàng số',
    image: img('chuyen-nham'),
    read_minutes: 3,
    body: `Gõ sai một số tài khoản, tiền đã đi. Đừng hoảng — nhưng cũng đừng chờ.

**Khi bạn chuyển nhầm:**

- Chụp màn hình giao dịch, ghi lại mã giao dịch
- Gọi ngay tổng đài ngân hàng của bạn, đề nghị tra soát và liên hệ người nhận
- Nếu ngân hàng không thu hồi được, có thể trình báo công an nơi cư trú

**Khi có người "chuyển nhầm" cho bạn:** đây là chiêu lừa phổ biến. Sau đó sẽ có người gọi tự xưng nhân viên ngân hàng hoặc công ty tài chính, đòi bạn chuyển trả kèm "lãi".

- **Không** chuyển trả theo số tài khoản người lạ đưa
- Báo ngân hàng của bạn, để ngân hàng xử lý hoàn tiền đúng quy trình
- Không tiêu khoản tiền không phải của mình

Mẹo phòng: dùng danh bạ người nhận đã lưu trong app, và đọc tên người nhận trước khi bấm chuyển.`,
    en: {
      title: 'Sent money to the wrong account: what to do right away',
      summary: 'Tell your bank as soon as possible — and be careful with anyone who "sent money to you by mistake".',
      body: `One wrong digit in the account number and the money is gone. Do not panic — but do not wait either.

**If you sent money by mistake:**

- Screenshot the transaction and note the transaction reference
- Call your bank's hotline right away and ask it to trace the payment and contact the recipient
- If the bank cannot recover it, you can report it to the police where you live

**If someone "sent money to you by mistake":** this is a common scam. Next comes a call from someone claiming to be from a bank or finance company, demanding you send it back with "interest".

- **Do not** send money to an account number a stranger gives you
- Tell your own bank so it can return the money through the proper process
- Do not spend money that is not yours

Prevention tip: use saved recipients in your banking app, and read the recipient name before you confirm.`,
    },
  },
  {
    title: 'Gửi tiền về quê đều đặn mà vẫn để dành được',
    summary: 'Coi khoản gửi gia đình là một dòng cố định trong ngân sách, không phải khoản "còn bao nhiêu gửi bấy nhiêu".',
    category: 'Mẹo',
    image: img('gui-tien-ve-que'),
    read_minutes: 3,
    body: `Với nhiều người lao động xa nhà, gửi tiền về quê là việc đầu tiên khi lương về. Đó là trách nhiệm đáng quý — nhưng nếu không có kế hoạch, chính mình lại hụt tiền cuối tháng.

**Biến khoản gửi thành một dòng cố định:**

- Thống nhất với gia đình **một con số đều đặn** mỗi tháng, thay vì gửi theo cảm tính
- Đưa khoản này vào ngân sách ngay đầu tháng, cùng tiền nhà và ăn uống
- Để riêng một quỹ nhỏ cho việc đột xuất ở quê (ốm đau, hiếu hỉ), tránh phải vay

**Nói chuyện tiền bạc với gia đình:** chia sẻ thật thu nhập và chi phí ở thành phố giúp người nhà hiểu và cùng tính toán. Một con số vừa sức, đều đặn, thường giúp gia đình nhiều hơn những khoản lớn thất thường.

Đừng quên phần của chính mình: một khoản để dành nhỏ mỗi tháng là để sau này bạn còn giúp được gia đình lâu dài.`,
    en: {
      title: 'Sending money home regularly and still saving',
      summary: 'Treat money for your family as a fixed budget line, not "whatever is left over".',
      body: `For many workers living away from home, sending money back is the first thing they do on payday. It is a responsibility to be proud of — but without a plan, you end up short at the end of the month.

**Make the transfer a fixed line:**

- Agree with your family on **one regular amount** each month, rather than sending on impulse
- Put it in your budget at the start of the month, alongside rent and food
- Keep a small separate pot for surprises back home (illness, weddings, funerals) so you do not have to borrow

**Talk about money with your family:** being open about your income and city costs helps them understand and plan with you. A steady, affordable amount often helps a family more than large, irregular sums.

Do not forget your own share: a small saving each month is what lets you keep helping your family for the long run.`,
    },
  },
  {
    title: 'Thẻ tín dụng: hiểu kỳ sao kê để không trả lãi oan',
    summary: 'Trả đủ dư nợ trước hạn thanh toán là được miễn lãi; chỉ trả tối thiểu là bắt đầu tính lãi.',
    category: 'Kiến thức',
    image: img('the-tin-dung'),
    read_minutes: 4,
    body: `Thẻ tín dụng có thể là công cụ tiện lợi, miễn lãi gần cả tháng — hoặc một khoản nợ lãi cao kéo dài. Khác biệt nằm ở việc bạn hiểu kỳ sao kê hay không.

**Ba mốc cần nhớ:**

- **Ngày sao kê**: ngân hàng chốt các khoản bạn đã chi trong kỳ
- **Hạn thanh toán**: thường vài tuần sau ngày sao kê
- **Khoản thanh toán tối thiểu**: con số nhỏ in trên sao kê, chỉ để không bị phạt trễ hạn

**Trả đủ toàn bộ dư nợ trước hạn** thì không mất lãi. **Chỉ trả tối thiểu** thì phần còn lại bị tính lãi — lãi thẻ tín dụng thuộc loại cao nhất.

**Thói quen an toàn:**

- Cài trích nợ tự động trả đủ dư nợ mỗi kỳ
- Không rút tiền mặt từ thẻ tín dụng — phí và lãi tính ngay
- Chỉ quẹt những khoản đã có sẵn tiền để trả

Ghi các khoản quẹt thẻ vào Ekko như chi tiêu thường để không bất ngờ khi sao kê về.`,
    en: {
      title: 'Credit cards: understand the statement cycle and avoid needless interest',
      summary: 'Pay the full balance by the due date and there is no interest; pay only the minimum and interest starts.',
      body: `A credit card can be a handy tool with almost a month interest-free — or a long-running high-interest debt. The difference is whether you understand the statement cycle.

**Three dates to remember:**

- **Statement date**: the bank totals what you spent during the cycle
- **Payment due date**: usually a few weeks after the statement date
- **Minimum payment**: the small figure on the statement, only there to avoid a late fee

**Pay the full balance by the due date** and you pay no interest. **Pay only the minimum** and the rest is charged interest — card interest is among the highest there is.

**Safe habits:**

- Set up automatic payment of the full balance every cycle
- Never withdraw cash on a credit card — fees and interest apply immediately
- Only charge what you already have the money to pay

Log card purchases in Ekko like normal spending so the statement holds no surprises.`,
    },
  },
  {
    title: 'Cuối tháng cháy túi? Thử chia lương theo tuần',
    summary: 'Chia tiền sinh hoạt thành bốn phần bằng nhau để tuần cuối không phải nhịn.',
    category: 'Mẹo',
    image: img('chia-luong-theo-tuan'),
    read_minutes: 3,
    body: `Tuần đầu sau lương thoải mái, tuần cuối đếm từng đồng — vòng lặp quen thuộc của rất nhiều người. Nguyên nhân thường không phải lương thấp, mà là tiêu không đều.

**Cách chia lương theo tuần:**

- Trừ trước các khoản cố định: tiền nhà, điện nước, gửi gia đình, tiết kiệm
- Phần còn lại cho sinh hoạt (ăn uống, đi lại, lặt vặt) **chia làm bốn**
- Mỗi tuần chỉ tiêu trong phần của tuần đó; dư thì dồn sang tuần sau hoặc để dành

**Mẹo để giữ được:**

- Để tiền sinh hoạt ở một tài khoản hoặc ví riêng
- Đầu tuần xem nhanh tuần trước đã tiêu bao nhiêu
- Có món lớn bất thường (sinh nhật, sửa xe) thì biết ngay phải bớt ở đâu

Đặt hạn mức cho từng nhóm trong Ngân sách của Ekko, app sẽ nhắc khi một nhóm sắp vượt.`,
    en: {
      title: 'Broke by the end of the month? Try splitting your pay by week',
      summary: 'Divide your living money into four equal parts so the last week is not a struggle.',
      body: `The first week after payday is comfortable, the last week you count every đồng — a familiar cycle for many people. The cause is usually not low pay, but uneven spending.

**How to split your pay by week:**

- First take out the fixed costs: rent, utilities, money for family, savings
- Divide what is left for daily living (food, travel, bits and pieces) **into four**
- Each week, spend only that week's share; anything left rolls into next week or into savings

**Tips to stick with it:**

- Keep the living money in a separate account or wallet
- At the start of each week, glance at what you spent last week
- When a big one-off comes up (a birthday, a bike repair), you know at once where to cut back

Set limits for each category in Ekko's Budget, and the app will warn you when one is about to run over.`,
    },
  },
  {
    title: 'Mùa sale online: 5 câu hỏi trước khi bấm "Mua ngay"',
    summary: 'Giảm 50% chỉ là tiết kiệm khi món đó vốn đã nằm trong danh sách cần mua.',
    category: 'Mẹo',
    image: img('mua-sale-online'),
    read_minutes: 3,
    body: `Ngày đôi, sale giữa tháng, flash sale nửa đêm — các sàn thương mại điện tử luôn có lý do để bạn mua ngay bây giờ. Giảm giá chỉ là tiết kiệm khi bạn vốn đã định mua món đó.

**Năm câu hỏi trước khi bấm mua:**

- Món này có trong danh sách cần mua **trước** đợt sale không?
- Nếu không giảm giá, mình có mua không?
- Giá "trước giảm" có thật không, hay vừa được nâng lên?
- Tiền này lấy từ phần nào trong ngân sách tháng?
- Để trong giỏ hàng 24 giờ, mình còn muốn mua không?

**Mẹo nhỏ:** ghi sẵn danh sách món cần mua từ trước đợt sale, đặt một con số tối đa cho cả đợt, và tắt bớt thông báo của các app mua sắm.

Ghi mỗi đơn hàng vào nhóm Mua sắm trong Ekko — cuối tháng nhìn lại tổng sẽ thấy đợt sale "tiết kiệm" được thật hay không.`,
    en: {
      title: 'Online sales: 5 questions before you tap "Buy now"',
      summary: '50% off is only a saving if the item was already on your list.',
      body: `Double-date sales, mid-month sales, midnight flash sales — online marketplaces always have a reason for you to buy right now. A discount is only a saving if you were already going to buy the thing.

**Five questions before you tap buy:**

- Was this on your shopping list **before** the sale?
- Would you buy it at full price?
- Is the "original" price real, or was it just raised?
- Which part of this month's budget is paying for it?
- Leave it in the cart for 24 hours — do you still want it?

**Small tips:** write your shopping list before the sale, set a maximum for the whole event, and turn off some shopping app notifications.

Log each order under Shopping in Ekko — at the end of the month the total shows whether the sale really saved you anything.`,
    },
  },
];

/** Bảng đối chiếu Việt → Anh cho đợt tin này (ghép vào server/i18n/en.js). */
export const NEWS_EN = Object.fromEntries([
  ...Object.entries(NEWS_CATEGORY_EN),
  ...MORE_NEWS.flatMap((n) => [[n.title, n.en.title], [n.summary, n.en.summary], [n.body, n.en.body]]),
]);
