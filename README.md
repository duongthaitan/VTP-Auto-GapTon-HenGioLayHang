<div align="center">

<img src="https://via.placeholder.com/800x200/ee0033/ffffff?text=VTP+Tool+All-in-One+-+Supercharge+Your+Workflow" alt="VTP Tool Banner" width="100%" style="border-radius: 12px; margin-bottom: 20px;">

# 🚀 VTP Tool All-in-One

**Giải pháp tự động hóa tối thượng dành cho hệ thống Viettel Post**

[![Phiên bản](https://img.shields.io/badge/version-1.0.0-0056b3.svg?style=for-the-badge&logo=appveyor)](https://github.com/duongthaitan)
[![Nền tảng](https://img.shields.io/badge/Chrome-Extension-4db8ff.svg?style=for-the-badge&logo=google-chrome)](https://google.com/chrome)
[![Tác giả](https://img.shields.io/badge/Tác_giả-Thái_Tân_Dương-ee0033.svg?style=for-the-badge&logo=github)](https://github.com/duongthaitan)
[![Giấy phép](https://img.shields.io/badge/License-MIT-success.svg?style=for-the-badge)](LICENSE)

*Tiết kiệm hàng giờ thao tác thủ công, giảm thiểu sai sót và tăng tốc hiệu suất làm việc lên đến 300%.*

[📥 Tải về ngay](#-hướng-dẫn-cài-đặt) • [📖 Xem hướng dẫn](#-cẩm-nang-sử-dụng) • [🐛 Báo lỗi](mailto:duongthaitan13@gmail.com)

</div>

---

## 📑 Mục lục
1. [🌟 Tính năng đột phá](#-tính-năng-đột-phá)
2. [🎥 Demo hoạt động](#-demo-hoạt-động)
3. [🚀 Hướng dẫn cài đặt](#-hướng-dẫn-cài-đặt)
4. [💡 Cẩm nang sử dụng](#-cẩm-nang-sử-dụng)
5. [❓ Câu hỏi thường gặp (FAQ)](#-câu-hỏi-thường-gặp-faq)
6. [📂 Cấu trúc mã nguồn](#-cấu-trúc-mã-nguồn)
7. [👨‍💻 Tác giả & Hỗ trợ](#-tác-giả--hỗ-trợ)

---

## 🌟 Tính năng đột phá

Dự án là sự kết hợp hoàn hảo giữa 2 công cụ độc lập, được tinh chỉnh lại trong một giao diện duy nhất:

### 🕒 Module 1: Auto Sửa Giờ (Smart Delay)
- **Tự động toàn trình:** Tìm kiếm mã đơn $\rightarrow$ Click Sửa $\rightarrow$ Chọn Ngày $\rightarrow$ Cập nhật.
- **Xử lý Batch:** Hỗ trợ dán hàng trăm mã vận đơn cùng lúc. Vòng lặp đệ quy tự động xử lý lần lượt.
- **Tuỳ biến linh hoạt:** Cho phép người dùng set `Delay` (thời gian chờ mạng) trực tiếp trên UI để chống lỗi khi web phản hồi chậm.

### 📦 Module 2: Auto Kiểm Tồn (Bypass UI)
- **Quét siêu tốc:** Nhập mã và kiểm tra trạng thái cực nhanh, bỏ qua các bước xác nhận rườm rà.
- **Bảng điều khiển HUD:** Bảng UI nổi (Overlay) hiển thị % tiến trình, số mã thành công/thất bại theo thời gian thực.
- **Trích xuất dữ liệu:** Hỗ trợ xuất trực tiếp kết quả ra file `Excel (.csv)` chỉ với 1 click.
- **Bộ lọc thông minh:** Nhận diện các đầu mã đặc biệt (SHOPEE, TPO, PSL...) có thể cấu hình thêm.

> **💡 Điểm nhấn:**
> Toàn bộ hệ thống sử dụng **Toast Notification Custom**, loại bỏ hoàn toàn các popup `alert()` mặc định của trình duyệt, giúp thao tác mượt mà không bị gián đoạn.

---

## 🎥 Demo hoạt động

<div align="center">
  <img src="https://via.placeholder.com/700x400/f8f9fa/ee0033?text=Chèn+Ảnh+GIF+Demo+Vào+Đây" alt="GIF Demo tính năng" style="border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
  <p><i>Giao diện Popup chia Tab và Bảng tiến trình Real-time.</i></p>
</div>

---

## 🚀 Hướng dẫn cài đặt

Bạn không cần biết code. Chỉ mất **30 giây** để đưa công cụ này vào hoạt động:

1. **Tải Source Code:** Nhấn nút `Code` (màu xanh) $\rightarrow$ `Download ZIP` và giải nén ra một thư mục.
2. **Truy cập Quản lý Tiện ích:** Mở trình duyệt Chrome/Edge, nhập địa chỉ:
   - *Chrome:* <kbd>chrome://extensions/</kbd>
   - *Edge:* <kbd>edge://extensions/</kbd>
3. **Bật Developer Mode:** Gạt công tắc `Chế độ dành cho nhà phát triển` (Developer mode) ở góc trên bên phải sang **ON**.
4. **Cài đặt:** Bấm nút `Tải tiện ích đã giải nén` (Load unpacked) và chọn thư mục bạn vừa giải nén ở bước 1.

✅ *Xong! Hãy ghim (pin) icon tiện ích lên thanh công cụ để dễ dàng sử dụng.*

---

## 💡 Cẩm nang sử dụng

### 🔹 Thao tác với Tab Sửa Giờ
1. Bấm icon tiện ích góc phải trình duyệt $\rightarrow$ Chọn Tab **Sửa Giờ**.
2. Dán các mã vận đơn cần xử lý vào khung văn bản (Lưu ý: mỗi mã 1 dòng).
3. Đặt thời gian chờ mạng (mặc định 5s).
4. Bấm **▶ BẮT ĐẦU CHẠY**. Công cụ sẽ ẩn đi và tự động làm việc trên tab hiện tại.

### 🔹 Thao tác với Tab Kiểm Tồn
1. Mở trang quản lý vận đơn của hệ thống Viettel Post.
2. Bấm icon tiện ích $\rightarrow$ Chọn Tab **Kiểm Tồn**.
3. Bấm nút **🚀 CHẠY KIỂM TỒN**. Bảng điều khiển HUD sẽ xuất hiện ở góc dưới màn hình.
4. *Lưu ý quan trọng:* Tuyệt đối không click chuột hoặc gõ phím vào trang web khi hệ thống đang chạy để tránh mất trỏ chuột (focus).

---

## ❓ Câu hỏi thường gặp (FAQ)

<details>
<summary><b>1. Tool báo lỗi "Vui lòng mở trang Viettel Post" dù tôi đang ở trang đó?</b></summary>
<br>
Hãy đảm bảo bạn đang ở đúng URL có chứa miền <code>viettelpost.vn</code> hoặc <code>viettelpost.com.vn</code>. Hãy thử F5 (tải lại) trang web và mở lại tiện ích.
</details>

<details>
<summary><b>2. Khi chạy Tab Sửa Giờ, tool bị sót đơn?</b></summary>
<br>
Nguyên nhân do mạng hoặc server của VTP phản hồi chậm hơn tốc độ thao tác của tool. Hãy tăng ô <b>Độ trễ mạng</b> từ 5s lên 8s hoặc 10s.
</details>

<details>
<summary><b>3. Tại sao xuất file Excel bị lỗi font tiếng Việt?</b></summary>
<br>
Hệ thống đã mã hóa chuẩn UTF-8 (BOM). Nếu mở bằng Excel bị lỗi chữ, bạn hãy thử mở bằng Google Sheets, hoặc dùng tính năng <code>Data > From Text/CSV</code> trong Excel để import.
</details>

---

## 📂 Cấu trúc mã nguồn

Kiến trúc thư mục được phân tách rõ ràng (Clean Code) hỗ trợ dễ dàng nâng cấp:

```text
VTP_All_In_One/
├── manifest.json            # [Core] Khai báo quyền & cấu hình Extension V3
├── popup.html               # [UI] Giao diện popup 2 tabs
├── popup.js                 # [Logic] Điều hướng tab & Inject script
├── notification.js          # [Module] Hệ thống Toast Alerts
├── chinhgio_content.js      # [Feature] Vòng lặp đệ quy xử lý sửa giờ
├── gapton_settings.js       # [Config] Quản lý Database Local (Prefix)
├── gapton_smart_delay.js    # [Utils] MutationObserver theo dõi DOM
└── gapton_core_scan.js      # [Feature] Engine quét mã và vẽ UI HUD
👨‍💻 Tác giả & Hỗ trợ
Dự án được xây dựng và tối ưu bởi Thái Tân Dương.

💬 Kết nối với tôi:

📧 Email: duongthaitan13@gmail.com

🐙 GitHub: @duongthaitan

Bạn thấy dự án này có ích? Hãy ủng hộ tác giả bằng cách để lại một ⭐️ cho kho lưu trữ (repository) này nhé. Sự ủng hộ của bạn là động lực lớn để tôi ra mắt thêm nhiều tool chất lượng! ❤️