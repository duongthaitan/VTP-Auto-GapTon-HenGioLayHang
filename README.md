
```markdown
# 📦 VTP Tool All-in-One (Chrome Extension)

> Tiện ích mở rộng mạnh mẽ giúp tự động hóa và tối ưu hóa các quy trình xử lý đơn hàng trên hệ thống Viettel Post, bao gồm việc sửa giờ lấy hàng hàng loạt và quét kiểm kê tồn kho siêu tốc.

---

## ✨ Tính năng nổi bật

Tiện ích được tích hợp giao diện gồm 2 chức năng chính (Tabs):

### 🕒 1. Auto Sửa Giờ (Tab 1)
* **Tự động hóa hoàn toàn:** Tự động tìm kiếm mã vận đơn và cập nhật thời gian hẹn lấy (ưu tiên "Ngày kia" hoặc "Ngày mai" / "Cả ngày").
* **Xử lý hàng loạt:** Nhận danh sách hàng chục mã vận đơn cùng lúc.
* **Tùy chỉnh linh hoạt:** Hỗ trợ điều chỉnh thời gian chờ mạng (delay) để tránh tình trạng web phản hồi chậm gây lỗi.

### 📦 2. Auto Kiểm Tồn (Tab 2)
* **Quét siêu tốc & Bypass Security:** Tự động nhận diện, điền mã và kiểm tra trạng thái đơn hàng trực tiếp trên trang Viettel Post.
* **Bảng điều khiển thông minh (UI nổi):** Hiển thị thanh tiến trình trực quan, số lượng mã đã quét, và nút tạm dừng/tiếp tục ngay trên màn hình.
* **Quản lý lịch sử:** Ghi nhận trực tiếp các mã thành công/thất bại và hỗ trợ **xuất file Excel (.csv)** để báo cáo.
* **Hỗ trợ đa nền tảng:** Tự động nhận diện các tiền tố mã tùy chỉnh (Shopee, Lazada, TikTok, v.v.).

### 🔔 3. Hệ thống Toast Notification
* Tích hợp hệ thống thông báo dạng pop-up góc màn hình (hiện/tắt tự động) thay thế cho `alert()` truyền thống, mang lại trải nghiệm mượt mà, không gián đoạn thao tác.

---

## 📂 Cấu trúc dự án

```text
VTP_All_In_One/
├── manifest.json            # Cấu hình tiện ích (Manifest V3)
├── popup.html               # Giao diện điều khiển (2 Tabs)
├── popup.js                 # Xử lý logic và tiêm script
├── notification.js          # Hệ thống UI hiển thị thông báo
├── chinhgio_content.js      # Script xử lý logic sửa giờ lấy hàng
├── gapton_settings.js       # Script cấu hình tiền tố mã kiểm tồn
├── gapton_smart_delay.js    # Tối ưu hóa vòng lặp & chống block
└── gapton_core_scan.js      # Script xử lý logic quét & kiểm kê mã
```

---

## 🚀 Hướng dẫn cài đặt

1. Tải toàn bộ mã nguồn về máy và đặt vào một thư mục (VD: `VTP_All_In_One`).
2. Mở trình duyệt Chrome/Cốc Cốc/Edge và truy cập vào trang quản lý tiện ích: `chrome://extensions/`.
3. Bật chế độ **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải màn hình.
4. Bấm vào nút **Load unpacked** (Tải tiện ích đã giải nén).
5. Chọn thư mục `VTP_All_In_One` mà bạn vừa lưu. Lúc này icon của tiện ích sẽ xuất hiện trên thanh công cụ của trình duyệt.

---

## 💡 Hướng dẫn sử dụng

### 🔹 Dùng tính năng Sửa Giờ
1. Bấm vào icon tiện ích trên góc phải trình duyệt.
2. Tại **Tab Sửa Giờ**, dán danh sách mã vận đơn (mỗi mã 1 dòng).
3. Thiết lập độ trễ mạng (mặc định 5s, nếu mạng yếu hãy tăng lên).
4. Bấm **BẮT ĐẦU CHẠY** và để công cụ tự động thao tác.

### 🔹 Dùng tính năng Kiểm Tồn
1. Mở trang chủ làm việc của **Viettel Post**.
2. Bấm vào icon tiện ích, chuyển sang **Tab Kiểm Tồn**.
3. Nút **CHẠY KIỂM TỒN** sẽ sáng lên. Bấm vào nút này.
4. Tiện ích sẽ ẩn đi và một bảng điều khiển Kiểm kê sẽ hiện lên ở góc dưới bên phải màn hình web. Theo dõi tiến trình tại đây.
5. *Lưu ý:* Tuyệt đối không thao tác chuột hay bàn phím trong lúc tool đang chạy để tránh làm mất trỏ chuột (focus) của ô nhập mã.

---

## 👨‍💻 Tác giả

Phát triển bởi **[Thái Tân Dương](https://github.com/duongthaitan)**.
```