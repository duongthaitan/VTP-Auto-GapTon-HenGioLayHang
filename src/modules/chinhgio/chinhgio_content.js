// ============================================================
//  VTP Tool – Sửa Giờ Content Script
//  v1.1 Fixes:
//    - waitForElement: fix race condition (clear timeout khi observer thắng sớm)
//    - MutationObserver options thu hẹp (bỏ characterData + attributes)
//    - Guard null cho billList trước khi truy cập .length
//    - Guard kiểm tra isRunning sau await trước khi tăng index
// ============================================================
if (window.__VTP_CHINHGIO_RUNNING__) {
    console.warn('[VTP Sửa Giờ] Script đã đang chạy. Bỏ qua lần inject mới.');
} else {
    window.__VTP_CHINHGIO_RUNNING__ = true;

    /** Độ trễ tĩnh */
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    /**
     * Chờ phần tử DOM xuất hiện.
     * Fix v1.1: clearTimeout khi observer resolve sớm → tránh timer leak.
     * MutationObserver chỉ dùng childList+subtree → giảm trigger.
     */
    const waitForElement = (selector, timeout = 8000) => {
        return new Promise((resolve) => {
            // Kiểm tra ngay trước khi tạo observer
            const existing = document.querySelector(selector);
            if (existing) return resolve(existing);

            let timeoutId = null;

            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    clearTimeout(timeoutId); // ← Fix: clear timer khi observer thắng
                    resolve(el);
                }
            });

            observer.observe(document.body, {
                childList:     true,
                subtree:       true,
                characterData: false, // ← Không cần theo dõi text change
                attributes:    false  // ← Không cần theo dõi attr change
            });

            timeoutId = setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    };

    /**
     * Mô phỏng thao tác gõ phím cho Angular/React input
     */
    const setInputValue = (inputElement, value) => {
        inputElement.value = value;
        inputElement.dispatchEvent(new Event('input',  { bubbles: true }));
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
    };

    /**
     * Vòng lặp while chính (không dùng đệ quy để tránh stack overflow)
     */
    async function runAutomation() {
        while (true) {
            const data = await chrome.storage.local.get(
                ['billList', 'delay', 'isRunning', 'currentIndex']
            );

            // Guard: kiểm tra tất cả điều kiện dừng
            if (!data.isRunning) {
                console.log('[VTP] Đã dừng tự động hóa.');
                break;
            }

            // Guard: billList có thể null nếu storage bị clear giữa chừng
            if (!data.billList || !Array.isArray(data.billList)) {
                console.warn('[VTP] billList không hợp lệ, dừng lại.');
                await chrome.storage.local.set({ isRunning: false });
                break;
            }

            if (data.currentIndex >= data.billList.length) {
                window.VTPNotification.show('✅ Đã chạy xong toàn bộ danh sách!', 'success');
                await chrome.storage.local.set({ isRunning: false });
                break;
            }

            const currentBill = data.billList[data.currentIndex];
            const delayMs     = (data.delay || 4) * 1000;

            console.log(`>>> Đang xử lý (${data.currentIndex + 1}/${data.billList.length}): ${currentBill}`);

            try {
                // --- BƯỚC 1: Xử lý kẹt trang ---
                let searchInput = document.querySelector('input#frm_keyword');
                if (!searchInput) {
                    console.log('[VTP] Không ở trang tìm kiếm, đang thử đóng form...');
                    const closeBtn = document.querySelector('button.btn-close, .fa-times')?.parentElement;
                    if (closeBtn) closeBtn.click();
                    await sleep(2000);
                    searchInput = await waitForElement('input#frm_keyword', 5000);
                }

                if (!searchInput) throw new Error('Không tìm thấy ô tìm kiếm mã vận đơn.');

                // --- BƯỚC 2: Nhập mã và tìm ---
                setInputValue(searchInput, currentBill);
                await sleep(500);
                const searchBtn = document.querySelector('button.btn-viettel i.fa-search')?.parentElement;
                if (searchBtn) searchBtn.click();

                // --- BƯỚC 3: Mở menu Sửa ---
                const menuIcon = await waitForElement('i.fa.fa-bars', 10000);
                if (!menuIcon) throw new Error('Không load được bảng kết quả hoặc mạng quá chậm.');
                menuIcon.click();
                await sleep(800);

                const editBtn = Array.from(document.querySelectorAll('button.vtp-bill-btn-action span'))
                                     .find(span => span.innerText.includes('Sửa đơn'));
                if (!editBtn) throw new Error('Không tìm thấy nút Sửa đơn.');
                editBtn.parentElement.click();

                // --- BƯỚC 4: Thao tác trong form Sửa đơn ---
                await waitForElement('button.select-down', 10000);
                await sleep(delayMs);

                const timeSelectBtn = document.querySelector('button.select-down');
                if (timeSelectBtn) timeSelectBtn.click();
                await sleep(800);

                // Ưu tiên ngày kia → ngày mai
                const labelNgayKia = document.querySelector('label[for="2_apt"]');
                const labelNgayMai = document.querySelector('label[for="1_apt"]');
                if (labelNgayKia)      labelNgayKia.click();
                else if (labelNgayMai) labelNgayMai.click();
                await sleep(500);

                // Chọn "Cả ngày"
                const labelCaNgay = Array.from(document.querySelectorAll('label.lb-time'))
                                         .find(lbl =>
                                             lbl.getAttribute('for') === '1_op' &&
                                             lbl.innerText.includes('Cả ngày')
                                         );
                if (labelCaNgay) labelCaNgay.click();
                await sleep(500);

                // --- BƯỚC 5: Cập nhật ---
                const updateBtn = Array.from(document.querySelectorAll('button.btn-viettel.btn-block'))
                                       .find(btn => btn.innerText.trim() === 'Cập nhật');
                if (updateBtn) updateBtn.click();

                // Chờ thông minh — đợi form đóng (button.select-down biến mất)
                let formClosed = false;
                let waited     = 0;
                while (waited < 6000) {
                    await sleep(300);
                    waited += 300;
                    if (!document.querySelector('button.select-down')) {
                        formClosed = true;
                        break;
                    }
                }
                if (!formClosed) {
                    console.warn('[VTP] Form có thể chưa đóng, tiếp tục sang đơn tiếp theo.');
                }

            } catch (error) {
                console.error('[VTP] Lỗi tại đơn này:', error.message);
            }

            // --- LUÔN CHẠY TIẾP — sang đơn kế tiếp ---
            // Kiểm tra lại isRunning sau await (user có thể bấm Dừng trong lúc chờ)
            const latestData = await chrome.storage.local.get(['isRunning', 'currentIndex']);
            if (!latestData.isRunning) {
                console.log('[VTP] Phát hiện lệnh Dừng, thoát vòng lặp.');
                break;
            }
            await chrome.storage.local.set({ currentIndex: latestData.currentIndex + 1 });
            await sleep(1000); // Ổn định DOM trước bước tiếp
        }

        // Reset flag → cho phép chạy lại mà không cần reload trang
        window.__VTP_CHINHGIO_RUNNING__ = false;
        console.log('[VTP Sửa Giờ] Kết thúc, flag đã reset.');
    }

    runAutomation();
}