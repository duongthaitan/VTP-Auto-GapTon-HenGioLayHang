// ============================================================
//  VTP Tool – Sửa Giờ Content Script
//  v2.0 — Smart Skip & Auto-Recovery
//  Nâng cấp:
//    [1] Phát hiện 2 tầng: form mở (3s) → khu vực chọn giờ (3s)
//        → skip ngay, KHÔNG treo 10s như trước
//    [2] closeOpenForms() — tự đóng dialog/modal còn mở sau lỗi
//        → đơn kế tiếp không bị ảnh hưởng bởi form cũ
//    [3] skipList[] — theo dõi mã + lý do bị bỏ qua cụ thể
//    [4] Báo cáo tổng kết cuối batch qua VTPNotification
// ============================================================

if (window.__VTP_CHINHGIO_RUNNING__) {
    console.warn('[VTP Sửa Giờ] Script đã đang chạy. Bỏ qua lần inject mới.');
} else {
    window.__VTP_CHINHGIO_RUNNING__ = true;

    // ─── Utilities ───────────────────────────────────────────

    /** Độ trễ tĩnh */
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    /**
     * Chờ phần tử DOM xuất hiện (MutationObserver + timeout).
     * Trả về element hoặc null nếu timeout.
     */
    const waitForElement = (selector, timeout = 8000) => {
        return new Promise((resolve) => {
            const existing = document.querySelector(selector);
            if (existing) return resolve(existing);

            let timeoutId = null;

            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    clearTimeout(timeoutId);
                    resolve(el);
                }
            });

            observer.observe(document.body, {
                childList:     true,
                subtree:       true,
                characterData: false,
                attributes:    false
            });

            timeoutId = setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    };

    /**
     * Mô phỏng thao tác gõ phím cho Angular/ZK input.
     */
    const setInputValue = (inputElement, value) => {
        inputElement.value = value;
        inputElement.dispatchEvent(new Event('input',  { bubbles: true }));
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
    };

    /**
     * [Mới v2.0] Tự động đóng modal / dialog đang mở.
     * Thử nhiều selector phổ biến trên trang ViettelPost.
     */
    async function closeOpenForms() {
        const closeSelectors = [
            'button.btn-close',
            '.modal-footer button.btn-default',
            '.modal button[data-dismiss="modal"]',
            'button.cancel',
            'button[aria-label="Close"]',
            '.modal-header .close',
            'i.fa-times'
        ];

        for (const sel of closeSelectors) {
            const btn = document.querySelector(sel);
            if (btn) {
                console.log(`[VTP Sửa Giờ] Đóng form bằng selector: ${sel}`);
                btn.click();
                await sleep(800); // chờ animation đóng hoàn tất
                return;
            }
        }

        // Nếu không tìm thấy nút đóng, thử nhấn Escape
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key:     'Escape',
            keyCode: 27,
            bubbles: true
        }));
        await sleep(600);
    }

    // ─── Vòng lặp chính ──────────────────────────────────────

    async function runAutomation() {
        /** [Mới v2.0] Danh sách mã bị bỏ qua kèm lý do */
        const skipList = [];

        while (true) {
            // Đọc trạng thái mới nhất từ storage
            const data = await chrome.storage.local.get(
                ['billList', 'delay', 'isRunning', 'currentIndex']
            );

            // ── Guard: kiểm tra điều kiện dừng ──────────────
            if (!data.isRunning) {
                console.log('[VTP Sửa Giờ] Đã dừng tự động hóa.');
                break;
            }

            if (!data.billList || !Array.isArray(data.billList)) {
                console.warn('[VTP Sửa Giờ] billList không hợp lệ, dừng lại.');
                await chrome.storage.local.set({ isRunning: false });
                break;
            }

            if (data.currentIndex >= data.billList.length) {
                // ── [Mới v2.0] Báo cáo tổng kết ─────────────
                if (skipList.length === 0) {
                    window.VTPNotification?.show(
                        '✅ Hoàn thành! Tất cả đơn đã được xử lý thành công.',
                        'success',
                        6000
                    );
                } else {
                    const lines = skipList
                        .map(s => `• ${s.bill}: ${s.reason}`)
                        .join('\n');
                    window.VTPNotification?.show(
                        `⚠️ Hoàn thành — Bỏ qua ${skipList.length} đơn:\n${lines}`,
                        'warning',
                        10000
                    );
                    console.warn('[VTP Sửa Giờ] Chi tiết bỏ qua:', skipList);
                }
                await chrome.storage.local.set({ isRunning: false });
                break;
            }

            const currentBill = data.billList[data.currentIndex];
            const delayMs     = (data.delay || 4) * 1000;

            console.log(`>>> Đang xử lý (${data.currentIndex + 1}/${data.billList.length}): ${currentBill}`);

            // ── Biến để biết có cần skip không ──────────────
            let shouldSkip  = false;
            let skipReason  = '';

            try {
                // ═══════════════════════════════════════════
                // BƯỚC 1: Đảm bảo đang ở trang tìm kiếm
                // ═══════════════════════════════════════════
                let searchInput = document.querySelector('input#frm_keyword');
                if (!searchInput) {
                    console.log('[VTP Sửa Giờ] Không ở trang tìm kiếm, thử đóng form...');
                    await closeOpenForms();
                    searchInput = await waitForElement('input#frm_keyword', 5000);
                }

                if (!searchInput) {
                    throw new Error('Không tìm thấy ô tìm kiếm mã vận đơn');
                }

                // ═══════════════════════════════════════════
                // BƯỚC 2: Nhập mã và tìm kiếm
                // ═══════════════════════════════════════════
                setInputValue(searchInput, currentBill);
                await sleep(500);

                const searchBtn = document.querySelector('button.btn-viettel i.fa-search')?.parentElement;
                if (searchBtn) searchBtn.click();

                // ═══════════════════════════════════════════
                // BƯỚC 3: Mở menu Sửa đơn
                // ═══════════════════════════════════════════
                const menuIcon = await waitForElement('i.fa.fa-bars', 8000);
                if (!menuIcon) {
                    throw new Error('Không load được bảng kết quả (mạng chậm hoặc mã không hợp lệ)');
                }
                menuIcon.click();
                await sleep(800);

                const editBtn = Array.from(document.querySelectorAll('button.vtp-bill-btn-action span'))
                                     .find(span => span.innerText.includes('Sửa đơn'));
                if (!editBtn) {
                    throw new Error('Không tìm thấy nút "Sửa đơn" trong menu');
                }
                editBtn.parentElement.click();

                // ═══════════════════════════════════════════
                // BƯỚC 4: Phát hiện 2 tầng (v2.0)
                //
                //   Tầng 1: Form sửa đơn có mở không? (3s)
                //   Tầng 2: Khu vực chọn giờ có tồn tại? (3s)
                //
                //   → Nếu thiếu tầng nào: skip sạch, không treo
                // ═══════════════════════════════════════════

                // ── Tầng 1: Chờ form sửa đơn mở (bất kỳ modal nào) ──
                const formOpened = await waitForElement(
                    '.modal-dialog, .modal-content, .modal.in, [class*="modal"][style*="display: block"]',
                    3000  // giảm từ 10s xuống 3s
                );

                if (!formOpened) {
                    // Form không mở → bỏ qua, thử đóng UI thừa
                    await closeOpenForms();
                    shouldSkip = true;
                    skipReason = 'Form sửa đơn không mở được';
                }

                // ── Tầng 2: Chờ khu vực chọn giờ (button.select-down) ──
                if (!shouldSkip) {
                    await sleep(delayMs); // delay người dùng cài → form load đầy đủ

                    const timeSelectBtn = await waitForElement(
                        'button.select-down',
                        3000  // giảm từ 10s xuống 3s
                    );

                    if (!timeSelectBtn) {
                        // Form mở nhưng không có khu vực chọn giờ
                        // Lý do: đơn đã hoàn thành / không cho phép sửa giờ
                        await closeOpenForms();
                        shouldSkip = true;
                        skipReason = 'Đơn không hỗ trợ sửa giờ lấy hàng';
                    } else {
                        // ═════════════════════════════════════
                        // BƯỚC 5: Thao tác chọn giờ
                        // ═════════════════════════════════════
                        timeSelectBtn.click();
                        await sleep(800);

                        // Ưu tiên ngày kia → ngày mai
                        const labelNgayKia = document.querySelector('label[for="2_apt"]');
                        const labelNgayMai = document.querySelector('label[for="1_apt"]');
                        if      (labelNgayKia) labelNgayKia.click();
                        else if (labelNgayMai) labelNgayMai.click();
                        else {
                            console.warn('[VTP Sửa Giờ] Không tìm thấy label ngày, thử tiếp tục...');
                        }
                        await sleep(500);

                        // Chọn "Cả ngày"
                        const labelCaNgay = Array.from(document.querySelectorAll('label.lb-time'))
                                                 .find(lbl =>
                                                     lbl.getAttribute('for') === '1_op' &&
                                                     lbl.innerText.includes('Cả ngày')
                                                 );
                        if (labelCaNgay) labelCaNgay.click();
                        await sleep(500);

                        // ═════════════════════════════════════
                        // BƯỚC 6: Cập nhật và đợi form đóng
                        // ═════════════════════════════════════
                        const updateBtn = Array.from(document.querySelectorAll('button.btn-viettel.btn-block'))
                                               .find(btn => btn.innerText.trim() === 'Cập nhật');
                        if (updateBtn) {
                            updateBtn.click();
                        } else {
                            console.warn('[VTP Sửa Giờ] Không tìm thấy nút Cập nhật');
                            shouldSkip = true;
                            skipReason = 'Không tìm thấy nút Cập nhật';
                            await closeOpenForms();
                        }

                        if (!shouldSkip) {
                            // Chờ form đóng (button.select-down biến mất)
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
                                console.warn('[VTP Sửa Giờ] Form chưa đóng sau 6s, buộc đóng...');
                                await closeOpenForms();
                            }
                        }
                    }
                }

            } catch (error) {
                console.error('[VTP Sửa Giờ] Lỗi tại đơn này:', error.message);
                shouldSkip = true;
                skipReason  = error.message;

                // [v2.0] Auto-recovery: đóng form còn mở trước khi sang đơn tiếp
                await closeOpenForms();
            }

            // ── Ghi nhận skip (nếu có) ───────────────────
            if (shouldSkip) {
                skipList.push({ bill: currentBill, reason: skipReason });
                console.warn(`[VTP Sửa Giờ] Bỏ qua "${currentBill}": ${skipReason}`);
                window.VTPNotification?.show(
                    `⏭ Bỏ qua ${currentBill}\n${skipReason}`,
                    'warning',
                    3500
                );
            }

            // ── LUÔN TIẾN SANG ĐƠN KẾ TIẾP ─────────────────
            // Kiểm tra lại isRunning (user có thể bấm Dừng trong khi chờ)
            const latestData = await chrome.storage.local.get(['isRunning', 'currentIndex']);
            if (!latestData.isRunning) {
                console.log('[VTP Sửa Giờ] Phát hiện lệnh Dừng, thoát vòng lặp.');
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