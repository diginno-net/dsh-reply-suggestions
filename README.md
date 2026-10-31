# Reply Suggestions — Diginno

**Tiếng Việt** · [English](./README_EN.md) · [简体中文](./README_ZH.md)

Plugin gợi ý câu hỏi tiếp theo cho [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Sau khi trợ lý trả lời, một gợi ý màu xám xuất hiện trong ô nhập trống. Nhấn **Enter** để đưa vào bản nháp, sửa rồi gửi — **không tự gửi tin nhắn**.

Diginno tự maintain bản này dựa trên [jabingu/dsh-reply-suggestions](https://github.com/jabingu/dsh-reply-suggestions), giữ lịch sử Git và giấy phép MIT của upstream. Đây không phải plugin chính thức của DeepSeek.

| Hạng mục | Phiên bản / trạng thái |
| --- | --- |
| Plugin | `0.1.17-diginno.1` |
| DSH được hỗ trợ | **`0.2.1-rc.5`** |
| Nền tảng kiểm chứng runtime | DSH Desktop trên macOS |
| Node.js để build/test | 22 trở lên; CI kiểm tra Node 22/24 trên Windows/Linux |
| Giấy phép | [MIT](./LICENSE) |

> Chỉ hỗ trợ đúng phiên bản DSH ở trên. Bản upstream `0.1.17` dành cho rc.2 không phải bản maintain này. Không bỏ qua kiểm tra tương thích để ép cài trên DSH khác.

## Tính năng

- Gợi ý một câu hỏi tiếp nối từ câu hỏi và câu trả lời gần nhất.
- **Enter** lần đầu chỉ điền bản nháp; **Escape** ẩn gợi ý. Giữ cách xử lý IME và tổ hợp Shift/Ctrl/Command/Alt+Enter của DSH.
- Hoãn tạo khi ô nhập có bản nháp, tệp đính kèm, trích dẫn hoặc hàng đợi; ẩn gợi ý khi tác vụ đang chạy.
- Dùng provider/model đã cấu hình trong DSH, không cần nhập thêm API key.
- Thống kê token, số yêu cầu, lỗi/hủy và chi phí ước tính tại trang chi tiết plugin.
- Bản Diginno xử lý kết thúc model `error`/`aborted`: không cache nội dung dở dang và vẫn ghi nhận usage đã trả về.

## Minh họa

![Gợi ý màu xám và điền vào bản nháp bằng Enter](./assets/reply-suggestions-demo-0.1.16.png)

Ảnh minh họa từ fixture của client upstream `0.1.16`, đặt trong trang hội thoại mô phỏng; **không phải ảnh nghiệm thu bản rc.5**, không dùng hội thoại thật hay gọi model.

## Cài đặt

### 1. Đóng gói từ repo Diginno

Cần Git và Node.js 22 trở lên. Build/test dùng thư viện có sẵn của Node, không cần `npm install`.

```sh
git clone https://github.com/diginno-net/dsh-reply-suggestions.git
cd dsh-reply-suggestions
npm run build
npm test
npm pack --ignore-scripts
```

Kết quả là `dsh-reply-suggestions-0.1.17-diginno.1.tgz`. Repo có sẵn bản build; quy trình trên giúp kiểm tra trước khi đóng gói. Mã trên `main` có thể thay đổi, nên giữ nguyên file `.tgz` đã kiểm chứng cho mỗi lần triển khai.

### 2. Cài vào DSH

1. Xác nhận DSH là **`0.2.1-rc.5`** và đã cấu hình model dùng được.
2. Mở **Plugins**, kiểm tra có `dsh-reply-suggestions` hay chưa. Nếu thay bản cũ, sao lưu trước và làm theo [hướng dẫn thay thế/rollback](./MAINTENANCE.md); không cài trùng tên.
3. Chọn **Add plugin**, nhập đường dẫn tuyệt đối tới file `.tgz` vừa tạo và bật plugin.
4. Làm theo kết quả plugin manager. Chỉ restart khi được yêu cầu, sau khi tác vụ đang chạy đã kết thúc.
5. Hoàn thành một lượt hội thoại, để ô nhập trống và chờ gợi ý. Nhấn Enter một lần để điền, sửa rồi gửi như bình thường.

Bản cài được kiểm chứng dùng tarball cố định. Sửa source hoặc `git pull` **không tự cập nhật plugin đang chạy**. Chưa kiểm chứng cài trực tiếp bằng URL GitHub cho bản maintain này.

## Model, token và quyền riêng tư

**Mỗi lần tạo gợi ý là một yêu cầu model bổ sung**, có thể tiêu tốn token/quota kể cả khi không dùng gợi ý. Mở lại hội thoại đang rảnh cũng có thể kích hoạt yêu cầu. Provider/model mặc định theo câu trả lời, dùng model hiện tại của session khi thiếu metadata; có thể ghi đè bằng cấu hình.

- Chỉ dùng nội dung lượt gần nhất: câu hỏi tối đa **400 ký tự**, câu trả lời tối đa **1.200 ký tự**; không gửi toàn bộ lịch sử, reasoning hay nội dung tệp đính kèm.
- Rút gọn văn bản dài ở giữa và bỏ fenced code tại local; có thể mất chi tiết quan trọng.
- Đầu ra tối đa **96 token** (không bao gồm token đầu vào); yêu cầu gợi ý DeepSeek tắt reasoning, không đổi thiết lập hội thoại chính.
- Chờ ô nhập khả dụng và rảnh **800 ms**; cache tối đa 64 kết quả hoàn tất, tối đa hai lượt tạo khác nhau chạy đồng thời.
- Nội dung đã chọn vẫn được gửi tới provider đã cấu hình. Thống kê lưu local không chứa nội dung hội thoại, tệp đính kèm hay credentials.

## Usage và chi phí

Mở **Plugins → Reply Suggestions**: thẻ bên trái chọn hôm nay, hôm qua, 7 ngày hoặc 30 ngày; thẻ bên phải là tổng từ khi bắt đầu ghi nhận. Mốc ngày theo múi giờ của DSH Host. Cache của plugin không tính thành yêu cầu mới. Usage thiếu được đánh dấu chưa biết, không coi là 0; lỗi/hủy vẫn giữ token provider đã báo. Xem hoặc làm mới thống kê không gọi model.

Chi phí là **ước tính CNY theo giá API DeepSeek công khai**, không phải hóa đơn hoặc mức trừ quota thực tế. Provider/model không có giá phù hợp được đánh dấu chưa biết hoặc chỉ tính một phần. Giá được lưu theo từng yêu cầu, cập nhật giá không tính lại lịch sử.

Nút **更新价格** (cập nhật giá) đọc [trang giá chính thức](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/), không gửi API key hay hội thoại. Mặc định kiểm tra mỗi 7 ngày; menu hỗ trợ hằng ngày, 3/7/30 ngày hoặc chỉ thủ công. Lỗi tự động thử lại sau 24 giờ; lỗi mạng/phân tích giữ giá cũ và báo lỗi. Lựa chọn đã lưu trong UI ưu tiên hơn cấu hình ban đầu.

Dữ liệu nằm trong `storages/dsh-reply-suggestions/` dưới `DSH_HOME` (mặc định `~/.dsh`): `usage.jsonl` lưu usage, `prices.jsonl` lưu giá và chu kỳ. Các profile chung `DSH_HOME` dùng chung dữ liệu plugin. Không commit các file này hoặc backup profile lên GitHub.

## Cấu hình tùy chọn

Trong `cordis.patch.yml` của profile đang dùng, ghi đè entry:

```yaml
- id: reply-suggestions
  config:
    enabled: true
    timeoutMs: 20000
    autoUpdatePrices: true
    priceUpdateDays: 7
    # provider: your-configured-provider
    # model: your-configured-model
```

| Tùy chọn | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `enabled` | `true` | Bật tạo gợi ý |
| `timeoutMs` | `20000` | Timeout, từ 1.000 đến 60.000 ms |
| `provider` / `model` | Theo hội thoại | Provider/model đã cấu hình trong DSH |
| `autoUpdatePrices` | `true` | Tự kiểm tra giá; `false` vẫn cho cập nhật thủ công |
| `priceUpdateDays` | `7` | Chu kỳ 1–30 ngày trước khi có lựa chọn lưu từ UI |

## Kiểm thử và xử lý sự cố

```sh
npm run build
npm test
# Tùy chọn trên macOS có cài đúng DSH rc.5:
DSH_TEST_ELECTRON='/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' npm test
```

Test installed-app dùng profile, HOME và DSH_HOME tạm riêng cùng model giả; không đọc credentials/lịch sử thật. Lần kiểm chứng ngày 2026-10-31 đạt **69/69 tests** khi bật test này. CI portable không chạy test cần ứng dụng đã cài. Xem [workflow CI](https://github.com/diginno-net/dsh-reply-suggestions/actions/workflows/test.yml), [kết quả và giới hạn kiểm chứng](./VERIFICATION.md), cùng [runbook maintain/rollback](./MAINTENANCE.md) (tiếng Anh).

Nếu không có gợi ý: kiểm tra phiên bản DSH và trạng thái plugin, đảm bảo tác vụ đã xong và ô nhập trống, rồi xem lỗi provider hoặc log `[reply-suggestions]`. Lỗi, timeout hay đầu ra không hợp lệ không ngăn nhập liệu thông thường. Kiểm thử tự động không bảo đảm chất lượng gợi ý của mọi model, bàn phím mobile hay IME thực tế.

Báo lỗi tại [Issues của Diginno](https://github.com/diginno-net/dsh-reply-suggestions/issues), kèm phiên bản DSH/plugin, hệ điều hành và bước tái hiện. Loại bỏ token, credentials và hội thoại riêng tư trước khi gửi. README ba ngôn ngữ không đồng nghĩa UI plugin đã được Việt hóa.

## Ghi nhận và giấy phép

Tác giả upstream: [jabingu](https://github.com/jabingu/dsh-reply-suggestions). Diginno maintain bản tương thích riêng, dựa trên upstream `0.1.17` tại commit `1b6494b0d3de9d81f364a3a70642e352ec60387a`. Giữ giấy phép [MIT](./LICENSE); không cam kết tự động hỗ trợ các bản DSH tương lai.
