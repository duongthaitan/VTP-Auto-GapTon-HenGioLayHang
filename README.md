<div align="center">

<picture>
  <img src="https://capsule-render.vercel.app/api?type=waving&color=EE0033&height=200&section=header&text=VTP%20Tool%20All-in-One&fontSize=50&fontColor=ffffff&fontAlignY=38&desc=Tự%20động%20hóa%20toàn%20trình%20ViettelPost&descAlignY=60&descSize=18&animation=fadeIn" width="100%" alt="VTP Tool Banner"/>
</picture>

<br/>

<!-- BADGES -->
<a href="#"><img src="https://img.shields.io/badge/Phiên_bản-3.0.0-EE0033?style=for-the-badge&logo=semanticweb&logoColor=white" alt="Version"/></a>
&nbsp;
<a href="https://google.com/chrome"><img src="https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Chrome MV3"/></a>
&nbsp;
<a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-00A859?style=for-the-badge&logo=opensourceinitiative&logoColor=white" alt="MIT License"/></a>
&nbsp;
<a href="mailto:duongthaitan13@gmail.com"><img src="https://img.shields.io/badge/Hỗ_trợ-Email-f97316?style=for-the-badge&logo=gmail&logoColor=white" alt="Support"/></a>

<br/><br/>

<img src="https://img.shields.io/badge/Nền_tảng-Chrome%20%7C%20Edge-0078d7?style=flat-square&logo=microsoftedge&logoColor=white"/>
&nbsp;
<img src="https://img.shields.io/badge/Giao_diện-Side_Panel-EE0033?style=flat-square"/>
&nbsp;
<img src="https://img.shields.io/badge/Tự_động_hóa-3_Module-00A859?style=flat-square"/>
&nbsp;
<img src="https://img.shields.io/badge/Smart_Skip-v2.0-6366f1?style=flat-square"/>

<br/><br/>

> **🚀 Sửa giờ lấy hàng hàng loạt · 🚛 Kiểm kê tồn theo tuyến tự động · ⚡ Quét mã kiểm tồn siêu tốc**
>
> *Tiết kiệm hàng giờ thao tác thủ công — không cần biết lập trình.*

<br/>

[📥 Cài đặt ngay](#-hướng-dẫn-cài-đặt) &ensp;·&ensp; [📖 Hướng dẫn](#-cẩm-nang-sử-dụng) &ensp;·&ensp; [❓ FAQ](#-câu-hỏi-thường-gặp) &ensp;·&ensp; [🐛 Báo lỗi](mailto:duongthaitan13@gmail.com)

</div>

---

## 📑 Mục lục

| # | Mục | Mô tả |
|:-:|-----|-------|
| 1 | [🌟 Tính năng](#-tính-năng) | 3 module tự động hóa tích hợp trong một Side Panel |
| 2 | [🚀 Cài đặt](#-hướng-dẫn-cài-đặt) | 4 bước đơn giản, không cần lập trình |
| 3 | [💡 Sử dụng](#-cẩm-nang-sử-dụng) | Hướng dẫn chi tiết từng module |
| 4 | [📂 Kiến trúc](#-cấu-trúc-mã-nguồn) | Sơ đồ luồng và cấu trúc thư mục |
| 5 | [❓ FAQ](#-câu-hỏi-thường-gặp) | Giải đáp lỗi phổ biến |
| 6 | [👨‍💻 Tác giả](#-tác-giả--hỗ-trợ) | Thông tin liên hệ |

---

## 🌟 Tính năng

> Một Chrome Extension duy nhất — **3 module tự động hóa** dạng **Side Panel** (hiện ra 1/3 màn hình bên phải, không che khuất trang web).

<br/>

<table>
<tr>
<td width="33%" valign="top">

### 🕒 Module 1
### Auto Sửa Giờ

---

**✅ Xử lý hàng loạt**
Dán cùng lúc hàng trăm mã vận đơn — tool tự động tìm kiếm, click **Sửa**, chọn **Ngày**, bấm **Cập nhật** liên tục.

**🛡️ Smart Skip v2.0** *(Mới)*
Tự động phát hiện đơn không hỗ trợ sửa giờ, **bỏ qua ngay trong ≤ 6 giây** thay vì treo 10 giây như trước. Báo cáo danh sách đơn bị skip cuối batch.

**⚙️ Tuỳ chỉnh độ trễ**
Cài delay (giây) ngay trên UI — tăng delay khi mạng chậm để tránh sót đơn.

**📊 Tiến trình thực**
Progress bar + counter hiển thị trực tiếp trên Side Panel theo thời gian thực.

</td>
<td width="33%" valign="top">

### 🚛 Module 2
### Kiểm Kê Tuyến

---

**🗂️ Chọn nhiều tuyến**
Tải danh sách tuyến trực tiếp từ dropdown VTP, chọn một hoặc nhiều tuyến cùng lúc.

**🤖 Tự động 6 bước**
Mỗi tuyến: Chọn tuyến → Tìm kiếm → Tạo phiếu → Xác nhận → **Chuyển tab chưa kiểm kê** → Quét toàn bộ mã.

**🔄 Vòng lặp liên tục**
Hoàn tất một tuyến → tự động F5 → sang tuyến kế tiếp — không cần can thiệp.

**📈 Progress đa tuyến**
Thanh tiến trình + trạng thái hiển thị route hiện tại đang xử lý.

</td>
<td width="33%" valign="top">

### 📦 Module 3
### Quét Mã Kiểm Tồn

---

**⚡ Quét siêu tốc**
Tự động nhập từng mã vào ô scan, xử lý xác nhận và chuyển sang mã tiếp theo.

**🔁 Phân trang tự động**
Khi hết trang hiện tại, tự động click "Trang sau" và tiếp tục quét.

**🏷️ Lọc mã thông minh**
Nhận diện các đầu mã hợp lệ: `SHOPEE`, `VTP`, `VGI`, `PKE`, `KMS`, `PSL`, `TPO` ...

**🖥️ HUD Overlay**
Bảng nổi real-time hiển thị tổng đã quét, lịch sử từng mã và cài đặt nâng cao.

</td>
</tr>
</table>

<br/>

> [!TIP]
> **Bảo mật tuyệt đối:** Toàn bộ xử lý diễn ra **100% trên trình duyệt của bạn**. Extension không có server backend, không thu thập hay gửi bất kỳ dữ liệu nào ra ngoài.

---

## 🚀 Hướng dẫn cài đặt

> [!NOTE]
> **Không cần biết lập trình.** Chỉ cần làm theo 4 bước — mất khoảng **30 giây**.

<br/>

```
Bước 1          Bước 2                  Bước 3               Bước 4
   │                │                      │                     │
Tải ZIP        chrome://             Developer Mode        Load Unpacked
GitHub     ──► extensions/   ──►    Bật công tắc   ──►   Chọn thư mục ✅
Download                              (góc phải)           đã giải nén
```

<br/>

**① Tải source code**

Nhấn nút **`<> Code`** (màu xanh lá) → chọn **`Download ZIP`** → giải nén ra một thư mục.

**② Mở trang quản lý tiện ích**

| Trình duyệt | Địa chỉ |
|:-----------:|:--------|
| Chrome | `chrome://extensions/` |
| Edge | `edge://extensions/` |

**③ Bật Developer Mode**

Gạt công tắc **`Chế độ dành cho nhà phát triển`** ở góc trên bên phải sang `ON`.

**④ Nạp tiện ích**

Bấm **`Tải tiện ích đã giải nén`** → chọn thư mục gốc vừa giải nén (thư mục chứa `manifest.json`).

<br/>

> [!TIP]
> ✅ **Xong!** Nhấn biểu tượng VTP trên thanh công cụ — **Side Panel** sẽ hiện ra bên phải màn hình.

> [!IMPORTANT]
> Extension chỉ hoạt động trên **mạng nội bộ ViettelPost**. Khi test, có thể dùng server giả lập trong thư mục `tools/test_server/`.

---

## 💡 Cẩm nang sử dụng

### 🕒 Tab Sửa Giờ Lấy Hàng

```
[1] Bấm icon VTP → Side Panel mở ra bên phải
[2] Chọn tab "Sửa Giờ Lấy Hàng"
[3] Dán mã vận đơn (mỗi mã 1 dòng)
[4] Cài Độ Trễ (mặc định 4s — tăng khi mạng chậm)
[5] Bấm ▶ BẮT ĐẦU CHẠY
         ↓
    Tool tự xử lý tuần tự từng mã trên tab hiện tại 🤖
         ↓
    Đơn không hỗ trợ sửa giờ → tự động bỏ qua ⏭ (Smart Skip v2.0)
         ↓
    ✅ Hoàn thành — báo cáo số đơn thành công / bỏ qua
```

> [!WARNING]
> Trong khi tool đang chạy, **không chuyển tab** hoặc **click vào trang web**. Nếu mạng yếu, tăng Delay lên **8–10 giây**.

---

### 🚛 Tab Kiểm Kê Tồn Tuyến

```
[1] Mở trang kiểm kê bưu phẩm ViettelPost
         ↓
[2] Bấm icon VTP → Chọn tab "Kiểm Kê Tồn Tuyến"
         ↓
[3] Bấm "Tải danh sách tuyến từ VTP"
         ↓
[4] Tick chọn các tuyến cần kiểm kê (hoặc "Chọn tất cả")
         ↓
[5] Bấm ▶ CHẠY KIỂM KÊ TỰ ĐỘNG
         ↓
    Với mỗi tuyến, tool thực hiện 6 bước tự động:
    ┌──────────────────────────────────────────────────┐
    │  Bước 1: Chọn tuyến trong dropdown               │
    │  Bước 2: Click Tìm kiếm                          │
    │  Bước 3: Click Kiểm kê (tạo phiếu)               │
    │  Bước 4: Xác nhận trong hộp thoại                │
    │  Bước 5: Chuyển sang tab "Bưu phẩm chưa kiểm kê" │
    │  Bước 6: Quét toàn bộ mã tự động                 │
    └──────────────────────────────────────────────────┘
         ↓
    Xong tuyến → F5 trang → chuyển tuyến kế tiếp → lặp lại...
         ↓
    ✅ Hoàn tất tất cả tuyến đã chọn
```

> [!WARNING]
> **Không thao tác chuột / bàn phím** khi tool đang chạy tự động.

---

### 📦 Quét Mã Kiểm Tồn (Thủ công)

Dùng khi bạn đã vào trang kiểm kê và muốn quét nhanh mà không chạy toàn bộ quy trình tuyến:

```
[1] Mở trang kiểm kê bưu phẩm (tab "Bưu phẩm chưa kiểm kê")
         ↓
[2] Bấm icon VTP → Tab "Kiểm Kê Tồn Tuyến"
         ↓
[3] Bấm 📦 QUÉT MÃ KIỂM TỒN
         ↓
    Bảng HUD nổi xuất hiện ở góc dưới phải màn hình
    ┌──────────────────────────────────────┐
    │  🔴 Kiểm Kê Tự Động                  │
    │  Đã quét tổng cộng: [ 47 ]           │
    │  [████████░░░░░░░░░]  39%            │
    │  ┌─ Đang Xử Lý ─ Lịch Sử ─ Cài Đặt ┐ │
    │  │ VTP1234567890 ✅                  │ │
    │  │ SHOPEE9876543 ✅                  │ │
    └──────────────────────────────────────┘
         ↓
    Tự chuyển trang khi hết danh sách
```

---

## 📂 Cấu trúc mã nguồn

```
📁 VTP-Auto-GapTon-HenGioLayHang/
│
├── 📄 manifest.json             ← [CORE]   Cấu hình Extension MV3 + khai báo Side Panel
├── 📄 background.js             ← [CORE]   Service worker: mở Side Panel khi click icon
├── 📄 README.md
│
├── 📁 src/
│   ├── 📁 ui/
│   │   ├── 📄 sidepanel.html    ← [UI]     Giao diện Side Panel 2 tab (VTP Red/White)
│   │   ├── 📄 sidepanel.css     ← [UI]     ViettelPost brand system, 8px grid
│   │   └── 📄 sidepanel.js      ← [LOGIC]  Điều phối tab, inject script, vòng lặp tuyến
│   │
│   ├── 📁 modules/
│   │   ├── 📁 chinhgio/
│   │   │   └── 📄 chinhgio_content.js  ← [MODULE 1] Engine sửa giờ + Smart Skip v2.0
│   │   │
│   │   └── 📁 kiemke/
│   │       ├── 📄 kiemke_tuyen_auto.js ← [MODULE 2] 5 bước chọn tuyến → vào trang scan
│   │       ├── 📄 gapton_settings.js   ← [MODULE 3] Cấu hình prefix mã hợp lệ
│   │       ├── 📄 gapton_smart_delay.js← [MODULE 3] Chờ DOM thay đổi (MutationObserver)
│   │       └── 📄 gapton_core_scan.js  ← [MODULE 3] Engine quét mã + HUD + phân trang
│   │
│   └── 📁 shared/
│       └── 📄 notification.js          ← [SHARED]  Toast Notification (thay thế alert)
│
├── 📁 assets/icons/             ← icon16/48/128.png
├── 📁 docs/screenshots/         ← Ảnh chụp UI tham khảo
└── 📁 tools/test_server/        ← Server giả lập VTP (dev only, gitignored)
```

<br/>

```mermaid
graph TD
    User["🖱️ Bấm icon VTP"] --> SP["Side Panel mở ra"]
    SP --> Tab{Chọn Tab}

    Tab -->|"🕒 Sửa Giờ"| CG["sidepanel.js\nInject chinhgio_content"]
    Tab -->|"🚛 Kiểm Kê"| KK["sidepanel.js\nVòng lặp tuyến"]

    CG --> CGE["chinhgio_content.js\n🔄 Xử lý hàng loạt"]
    CGE --> CGS{Tìm thấy\nkhu vực giờ?}
    CGS -->|"✅ Có"| CGU["Cập nhật giờ lấy hàng"]
    CGS -->|"❌ Không"| CGK["⏭ Smart Skip\nbáo cáo lý do"]
    CGK --> CGE

    KK --> KKA["kiemke_tuyen_auto.js\n🚛 6 bước chọn tuyến"]
    KKA --> KKB["gapton_core_scan.js\n⚡ Quét mã tự động"]
    KKB --> KKC["gapton_smart_delay.js\n⏱️ Chờ xác nhận mã"]
    KKC --> KKD{Còn tuyến?}
    KKD -->|"Có"| KKA
    KKD -->|"Xong"| Done["✅ Hoàn tất"]

    style User fill:#EE0033,color:#fff,stroke:none
    style CGU fill:#00A859,color:#fff,stroke:none
    style CGK fill:#F59E0B,color:#fff,stroke:none
    style Done fill:#00A859,color:#fff,stroke:none
    style KKD fill:#F59E0B,color:#fff,stroke:none
```

---

## ❓ Câu hỏi thường gặp

<details>
<summary><b>🔴 Tool báo "Chưa sẵn sàng" dù đang ở trang ViettelPost?</b></summary>

<br/>

Tool kiểm tra URL của tab hiện tại. Hãy đảm bảo domain là:
- `viettelpost.vn`
- `evtp2.viettelpost.vn`
- `localhost` (khi test với server giả lập)

**Giải pháp:** Nhấn `F5` tải lại trang, sau đó bấm lại icon VTP để mở Side Panel.

<br/>
</details>

<details>
<summary><b>🟡 Tab Sửa Giờ bị sót đơn / chạy sai?</b></summary>

<br/>

**Nguyên nhân:** Server VTP phản hồi chậm hơn tốc độ thao tác của tool.

**Giải pháp:** Tăng **Độ trễ** theo tình trạng mạng:

| Tình trạng | Delay đề nghị |
|:----------:|:-------------:|
| Mạng tốt | `4s` (mặc định) |
| Mạng trung bình | `7–8s` |
| Mạng VPN / chậm | `10s+` |

<br/>
</details>

<details>
<summary><b>🟡 Một số đơn bị thông báo "Bỏ qua" khi sửa giờ?</b></summary>

<br/>

Đây là tính năng **Smart Skip v2.0** — hoàn toàn bình thường.

**Nguyên nhân bỏ qua phổ biến:**
- Đơn đã được giao / hoàn thành → không còn cho phép sửa giờ
- Đơn đang ở trạng thái đặc biệt (hoàn, trả, chuyển kho...)
- Form sửa đơn mở nhưng không có khu vực chọn giờ lấy hàng

**Sau khi chạy xong,** Side Panel sẽ hiển thị danh sách đầy đủ các mã bị bỏ qua kèm lý do để bạn xử lý thủ công nếu cần.

<br/>
</details>

<details>
<summary><b>🟡 Kiểm kê tuyến bị kẹt / không chuyển sang tuyến tiếp theo?</b></summary>

<br/>

**Kiểm tra:**
1. Mở **DevTools** (F12) → tab **Console** để xem log `[VTP]`
2. Nếu log hiện "Timeout kiểm kê tuyến" → tuyến đó có thể bị lỗi trên server VTP
3. Nếu không có log gì → selector ZK Framework có thể đã thay đổi

**Giải pháp:** Thử chạy lại từ đầu sau khi F5 trang. Nếu vẫn lỗi, liên hệ tác giả kèm ảnh chụp màn hình Console.

<br/>
</details>

<details>
<summary><b>🟡 Không tìm thấy tuyến nào khi bấm "Tải danh sách"?</b></summary>

<br/>

**Nguyên nhân:** Bạn chưa ở đúng trang hoặc dropdown chưa load.

**Giải pháp:**
1. Đảm bảo đang ở trang **Kiểm kê bưu phẩm** (URL chứa `kiem-ke-buu-pham`)
2. Chờ trang load hoàn toàn trước khi bấm tải
3. Thử F5 trang rồi bấm lại

<br/>
</details>

<details>
<summary><b>🔵 Dữ liệu của tôi có bị gửi lên server không?</b></summary>

<br/>

**Không.** Extension chạy hoàn toàn **phía client (trình duyệt)**. Không có backend server, không có tracking, không gửi dữ liệu ra ngoài. Bạn có thể tự kiểm tra qua tab **Network** trong DevTools — sẽ không thấy request nào tới server lạ.

<br/>
</details>

---

## 👨‍💻 Tác giả & Hỗ trợ

<div align="center">

<br/>

<img src="https://avatars.githubusercontent.com/duongthaitan" width="80" style="border-radius:50%; border: 3px solid #EE0033;" alt="Avatar"/>

### Thái Tân Dương

*Developer · ViettelPost Internal Tools*

<br/>

[![GitHub](https://img.shields.io/badge/@duongthaitan-181717?style=for-the-badge&logo=github)](https://github.com/duongthaitan)
&nbsp;&nbsp;
[![Email](https://img.shields.io/badge/duongthaitan13@gmail.com-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:duongthaitan13@gmail.com)

<br/>

---

### Dự án có hữu ích với bạn?

Để lại một ⭐ **Star** cho repository — chỉ mất 1 giây nhưng là động lực lớn để tiếp tục phát triển! 🙏

**Báo lỗi & góp ý:** Mở [Issue](../../issues/new) trên GitHub hoặc email trực tiếp cho tác giả.

<br/>

</div>

---

<div align="center">

<picture>
  <img src="https://capsule-render.vercel.app/api?type=waving&color=EE0033&height=100&section=footer&animation=fadeIn" width="100%" alt="Footer"/>
</picture>

<sub>

Made with ❤️ for ViettelPost by [Thái Tân Dương](https://github.com/duongthaitan) &nbsp;·&nbsp; Licensed under [MIT](LICENSE) &nbsp;·&nbsp; © 2026

</sub>

</div>