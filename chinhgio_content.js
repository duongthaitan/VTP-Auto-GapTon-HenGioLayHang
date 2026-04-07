// ============================================================
//  VTP Tool – Sửa Giờ Content Script
//  Fix #1: Guard chống inject nhiều lần gây chạy chồng
// ============================================================
if (window.__VTP_CHINHGIO_RUNNING__) {
    console.warn("[VTP Sửa Giờ] Script đã đang chạy. Bỏ qua lần inject mới.");
} else {
    window.__VTP_CHINHGIO_RUNNING__ = true;

    // Hàm tạo độ trễ tĩnh
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Hàm chờ phần tử xuất hiện (DOM Polling) - Tối ưu mạng
    const waitForElement = (selector, timeout = 8000) => {
        return new Promise((resolve) => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }

            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    resolve(el);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    };

    // Hàm mô phỏng thao tác gõ phím cho Angular
    const setInputValue = (inputElement, value) => {
        inputElement.value = value;
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
    };

    // Fix #4: Chuyển từ đệ quy → vòng lặp while để tránh stack leak với danh sách dài
    async function runAutomation() {
        while (true) {
            let data = await chrome.storage.local.get(['billList', 'delay', 'isRunning', 'currentIndex']);

            // Kiểm tra điều kiện dừng
            if (!data.isRunning) {
                console.log("[VTP] Đã dừng tự động hóa.");
                break;
            }
            if (data.currentIndex >= data.billList.length) {
                window.VTPNotification.show("✅ Đã chạy xong toàn bộ danh sách!", 'success');
                await chrome.storage.local.set({ isRunning: false });
                break;
            }

            let currentBill = data.billList[data.currentIndex];
            let delayMs = data.delay * 1000;

            console.log(`>>> Đang xử lý (${data.currentIndex + 1}/${data.billList.length}): ${currentBill}`);

            try {
                // --- BƯỚC 1: Xử lý kẹt trang ---
                let searchInput = document.querySelector('input#frm_keyword');
                if (!searchInput) {
                    console.log("Không ở trang tìm kiếm, đang thử đóng form...");
                    let closeBtn = document.querySelector('button.btn-close, .fa-times')?.parentElement;
                    if (closeBtn) closeBtn.click();
                    await sleep(2000);
                    searchInput = await waitForElement('input#frm_keyword', 5000);
                }

                if (!searchInput) throw new Error("Không tìm thấy ô tìm kiếm mã vận đơn.");

                // --- BƯỚC 2: Nhập mã và tìm ---
                setInputValue(searchInput, currentBill);
                await sleep(500);
                let searchBtn = document.querySelector('button.btn-viettel i.fa-search')?.parentElement;
                if (searchBtn) searchBtn.click();

                // --- BƯỚC 3: Mở menu Sửa ---
                let menuIcon = await waitForElement('i.fa.fa-bars', 10000);
                if (!menuIcon) throw new Error("Không load được bảng kết quả hoặc mạng quá chậm.");

                menuIcon.click();
                await sleep(800);

                let editBtn = Array.from(document.querySelectorAll('button.vtp-bill-btn-action span'))
                                   .find(span => span.innerText.includes('Sửa đơn'));
                if (!editBtn) throw new Error("Không tìm thấy nút Sửa đơn.");
                editBtn.parentElement.click();

                // --- BƯỚC 4: Thao tác trong form Sửa đơn ---
                await waitForElement('button.select-down', 10000);
                await sleep(delayMs);

                let timeSelectBtn = document.querySelector('button.select-down');
                if (timeSelectBtn) timeSelectBtn.click();
                await sleep(800);

                // Chọn ngày (Ưu tiên ngày kia, rồi đến ngày mai)
                let labelNgayKia = document.querySelector('label[for="2_apt"]');
                let labelNgayMai = document.querySelector('label[for="1_apt"]');
                if (labelNgayKia) {
                    labelNgayKia.click();
                } else if (labelNgayMai) {
                    labelNgayMai.click();
                }
                await sleep(500);

                // Chọn Cả ngày
                let labelCaNgay = Array.from(document.querySelectorAll('label.lb-time'))
                                       .find(lbl => lbl.getAttribute('for') === '1_op' && lbl.innerText.includes('Cả ngày'));
                if (labelCaNgay) labelCaNgay.click();
                await sleep(500);

                // --- BƯỚC 5: Cập nhật ---
                let updateBtn = Array.from(document.querySelectorAll('button.btn-viettel.btn-block'))
                                     .find(btn => btn.innerText.trim() === 'Cập nhật');
                if (updateBtn) updateBtn.click();

                // Fix #5: Chờ thông minh – đợi form đóng (button.select-down biến mất) thay vì sleep mù 3 giây
                let formClosed = false;
                let waited = 0;
                while (waited < 6000) {
                    await sleep(300);
                    waited += 300;
                    if (!document.querySelector('button.select-down')) {
                        formClosed = true;
                        break;
                    }
                }
                if (!formClosed) console.warn("[VTP] Form có thể chưa đóng, tiếp tục sang đơn tiếp theo.");

            } catch (error) {
                console.error("[VTP] Lỗi tại đơn này:", error.message);
            }

            // --- LUÔN CHẠY TIẾP – sang đơn kế tiếp ---
            let currentData = await chrome.storage.local.get(['isRunning', 'currentIndex']);
            if (!currentData.isRunning) break;
            await chrome.storage.local.set({ currentIndex: currentData.currentIndex + 1 });
            await sleep(1000); // Ổn định DOM trước khi bước tiếp
        }

        // Reset flag khi kết thúc để cho phép chạy lại mà không cần reload trang
        window.__VTP_CHINHGIO_RUNNING__ = false;
    }

    runAutomation();
}