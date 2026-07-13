// ============================================================
//  VTP Tool – Đánh Giá 5★ Content Script
//  v2.1 Speed Boost — Maximum Rating Velocity
//  Flow:
//    [1] Tìm ô tìm kiếm, nhập mã vận đơn, bấm tìm
//    [2] Click menu (fa-bars) → Click "Thông tin bưu tá"
//    [3] Modal mở → Click "Đánh giá"
//    [4] Chọn 5 sao → Chờ "Xuất sắc"
//    [5] Click "Gửi đánh giá" → Click close
//    [6] Báo kết quả qua chrome.storage (__VTP_CHINHGIO_STEP_DONE__)
//
//  Thay đổi v2.1 so với v1.0:
//    [⚡] SPEED: Thay toàn bộ sleep() cố định bằng MutationObserver
//        - Sau nhập mã:           500ms → 50ms
//        - Sau click menu:        800ms → waitForElementByText (react ngay)
//        - Sau "Thông tin bưu tá": delayMs (4s!) → waitForElementByText (react ngay)
//        - Sau "Đánh giá":       1000ms → waitForElement star5 (react ngay)
//        - Sau chọn sao:          800ms → waitForElement submit (react ngay)
//        - Sau gửi đánh giá:    1500ms → waitForCondition modal close
//        - Sau close:             500ms → 100ms (hoặc bỏ nếu modal đã đóng)
//    [+] waitForElementByText(): MutationObserver tìm theo text
//    [+] waitForCondition(): MutationObserver + poll + resolved guard
//    [+] closeOpenForms() delay giảm: 800→250ms, 600→200ms
//    [+] Gộp polling loop "Đánh giá" vào waitForElementByText
//    [v2.1] Fix race condition trong waitForCondition (double-resolve)
//    [v2.1] Smart close: skip nếu modal đã đóng sẵn
// ============================================================

if (window.__VTP_DANHGIA_RUNNING__) {
    console.warn('[VTP Đánh Giá] Script đã đang chạy. Bỏ qua lần inject mới.');
    chrome.storage.local.set({ __VTP_CHINHGIO_STEP_DONE__: { status: 'busy' } });
} else {
    window.__VTP_DANHGIA_RUNNING__ = true;

    // ─── Utilities ───────────────────────────────────────────

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    /**
     * Chờ phần tử DOM xuất hiện bằng CSS selector (MutationObserver + timeout).
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
                childList: true,
                subtree:   true
            });

            timeoutId = setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    };

    /**
     * [v2.0] Chờ phần tử DOM chứa text cụ thể xuất hiện.
     * Dùng MutationObserver — phản ứng ngay khi DOM thay đổi.
     * @param {string} selector   - CSS selector để tìm candidates
     * @param {string} text       - Text cần match
     * @param {number} timeout    - Timeout ms
     * @param {boolean} exact     - true = exact match, false = includes
     */
    const waitForElementByText = (selector, text, timeout = 8000, exact = false) => {
        return new Promise((resolve) => {
            const find = () => {
                for (const el of document.querySelectorAll(selector)) {
                    const t = (el.innerText || el.textContent || '').trim();
                    if (exact ? t === text : t.includes(text)) return el;
                }
                return null;
            };

            const existing = find();
            if (existing) return resolve(existing);

            let timeoutId = null;
            const observer = new MutationObserver(() => {
                const el = find();
                if (el) {
                    observer.disconnect();
                    clearTimeout(timeoutId);
                    resolve(el);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree:   true
            });

            timeoutId = setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    };

    /**
     * [v2.1] Chờ điều kiện trả về true (MutationObserver + poll fallback).
     * Phản ứng ngay khi DOM thay đổi, kèm poll interval phòng trường hợp
     * MutationObserver không bắt được thay đổi (CSS transition, v.v.)
     * [v2.1 FIX] Thêm `resolved` guard chống double-resolve race condition
     *            (MutationObserver + poll có thể fire đồng thời)
     */
    const waitForCondition = (conditionFn, timeout = 8000, pollMs = 150) => {
        return new Promise((resolve) => {
            if (conditionFn()) return resolve(true);

            let resolved = false;
            let timeoutId = null;
            let pollId = null;

            const cleanup = (result) => {
                if (resolved) return; // [v2.1] Guard chống double-resolve
                resolved = true;
                observer.disconnect();
                clearTimeout(timeoutId);
                clearInterval(pollId);
                resolve(result);
            };

            const observer = new MutationObserver(() => {
                if (!resolved && conditionFn()) cleanup(true);
            });

            observer.observe(document.body, {
                childList:  true,
                subtree:    true,
                attributes: true
            });

            // Poll fallback — bắt thay đổi CSS/style mà MutationObserver có thể miss
            pollId = setInterval(() => {
                if (!resolved && conditionFn()) cleanup(true);
            }, pollMs);

            timeoutId = setTimeout(() => cleanup(false), timeout);
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
     * Tự động đóng modal / dialog đang mở.
     * [v2.1] Delay giảm: 800→250ms, 600→200ms
     */
    async function closeOpenForms() {
        const closeSelectors = [
            'button.close-btn',
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
                console.log(`[VTP Đánh Giá] Đóng form bằng selector: ${sel}`);
                btn.click();
                await sleep(250); // [v2.1] Giảm từ 400ms
                return;
            }
        }

        document.dispatchEvent(new KeyboardEvent('keydown', {
            key:     'Escape',
            keyCode: 27,
            bubbles: true
        }));
        await sleep(200); // [v2.1] Giảm từ 300ms
    }

    // ─── Xử lý 1 đơn duy nhất ───────────────────────────────

    async function processOneBill() {
        const data = await chrome.storage.local.get(
            ['billList', 'delay', 'isRunning', 'currentIndex']
        );

        if (!data.isRunning) {
            return { status: 'stopped' };
        }

        if (!data.billList || !Array.isArray(data.billList)) {
            return { status: 'invalid' };
        }

        if (data.currentIndex >= data.billList.length) {
            return { status: 'completed' };
        }

        const currentBill = data.billList[data.currentIndex];
        const totalBills  = data.billList.length;
        const index       = data.currentIndex;

        console.log(`>>> [Đánh Giá v2.0] Đang xử lý (${index + 1}/${totalBills}): ${currentBill}`);

        let shouldSkip = false;
        let skipReason = '';

        try {
            // ═══════════════════════════════════════════
            // BƯỚC 1: Đảm bảo đang ở trang tìm kiếm
            // ═══════════════════════════════════════════
            let searchInput = document.querySelector('input#frm_keyword');
            if (!searchInput) {
                console.log('[VTP Đánh Giá] Không ở trang tìm kiếm, thử đóng form...');
                await closeOpenForms();
                searchInput = await waitForElement('input#frm_keyword', 5000);
            }

            if (!searchInput) {
                throw new Error('Không tìm thấy ô tìm kiếm mã vận đơn');
            }

            // ═══════════════════════════════════════════
            // BƯỚC 2: Nhập mã và tìm kiếm
            // [v2.1] sleep: 500ms → 50ms
            // ═══════════════════════════════════════════
            setInputValue(searchInput, currentBill);
            await sleep(50); // [v2.1] Giảm từ 150ms — chỉ cần 1 tick cho event dispatch

            const searchBtn = document.querySelector('button.btn-viettel i.fa-search')?.parentElement;
            if (searchBtn) searchBtn.click();

            // ═══════════════════════════════════════════
            // BƯỚC 3: Mở menu và click "Thông tin bưu tá"
            // [v2.0] Thay sleep(800ms) → waitForElementByText
            //        Phản ứng ngay khi dropdown render xong
            // ═══════════════════════════════════════════
            const menuIcon = await waitForElement(
                'i.fa.fa-bars, i.fas.fa-bars, i.fa-solid.fa-bars, [class*="fa-bars"]',
                8000
            );
            if (!menuIcon) {
                throw new Error('Không load được bảng kết quả (mạng chậm hoặc mã không hợp lệ)');
            }
            menuIcon.click();

            // [v2.0] Chờ dropdown menu render → tìm "Thông tin bưu tá"
            // MutationObserver react ngay khi DOM thay đổi (thay vì sleep 800ms cố định)
            const postmanSpan = await waitForElementByText(
                'button.vtp-bill-btn-action span',
                'Thông tin bưu tá',
                4000
            );

            if (!postmanSpan) {
                throw new Error('Không tìm thấy nút "Thông tin bưu tá" trong menu');
            }
            postmanSpan.parentElement.click();

            // ═══════════════════════════════════════════
            // BƯỚC 4: Chờ nút "Đánh giá" xuất hiện → Click
            // [v2.0] Thay sleep(delayMs) + polling loop
            //        → waitForElementByText (MutationObserver, max 12s)
            //        Đây là tối ưu LỚN NHẤT: 4000ms+ → react ngay!
            // ═══════════════════════════════════════════
            const danhGiaBtn = await waitForElementByText(
                'button', 'Đánh giá', 12000, true  // exact match "Đánh giá"
            );

            if (!danhGiaBtn) {
                throw new Error('Không tìm thấy nút "Đánh giá"');
            }
            danhGiaBtn.click();

            // ═══════════════════════════════════════════
            // BƯỚC 5: Chọn 5 sao
            // [v2.0] Bỏ sleep(1000ms) trước waitForElement
            //        MutationObserver sẽ react ngay khi star UI render
            // ═══════════════════════════════════════════
            const star5Label = await waitForElement('label[for="star5"]', 5000);
            if (!star5Label) {
                throw new Error('Không tìm thấy ngôi sao thứ 5');
            }
            star5Label.click();

            // [v2.0] Chờ nút "Gửi đánh giá" xuất hiện thay vì sleep(800ms)
            // Đồng thời kiểm tra text "Xuất sắc" đã hiển thị
            const submitBtn = await waitForElement('button.btn-submit', 4000);

            const evaluateText = document.querySelector('.txt-evaluate');
            if (evaluateText) {
                console.log('[VTP Đánh Giá] Đánh giá:', evaluateText.textContent.trim());
            }

            // ═══════════════════════════════════════════
            // BƯỚC 6: Click "Gửi đánh giá"
            // [v2.0] Thay sleep(1500ms) → waitForCondition
            //        Chờ modal đóng hoặc btn-submit biến mất
            // ═══════════════════════════════════════════
            if (!submitBtn) {
                throw new Error('Không tìm thấy nút "Gửi đánh giá"');
            }
            submitBtn.click();

            // [v2.0] Chờ kết quả submit: modal đóng hoặc nội dung thay đổi
            // MutationObserver + poll fallback (150ms) — max 6s
            const submitDone = await waitForCondition(() => {
                // Điều kiện 1: Nút submit đã biến mất
                const stillHasSubmit = document.querySelector('button.btn-submit');
                if (!stillHasSubmit) return true;
                // Điều kiện 2: Star UI đã biến mất (modal đã đóng/chuyển)
                const stillHasStar = document.querySelector('label[for="star5"]');
                if (!stillHasStar) return true;
                return false;
            }, 6000, 150);

            if (!submitDone) {
                console.warn('[VTP Đánh Giá] Submit chưa xác nhận sau 6s, tiếp tục...');
            }

            // ═══════════════════════════════════════════
            // BƯỚC 7: Đóng modal
            // [v2.1] Smart close: kiểm tra modal còn mở không trước khi đóng
            //        Nếu submit đã tự đóng modal → skip luôn, tiết kiệm ~250ms
            // ═══════════════════════════════════════════
            const modalStillOpen = document.querySelector(
                '.modal.in, .modal[style*="display: block"], button.close-btn, .modal-dialog'
            );
            if (modalStillOpen) {
                const closeBtn = document.querySelector('button.close-btn');
                if (closeBtn) {
                    closeBtn.click();
                    await sleep(100); // [v2.1] Giảm từ 200ms
                } else {
                    await closeOpenForms();
                }
            }

            console.log(`[VTP Đánh Giá] ✅ Đã đánh giá 5★ đơn: ${currentBill}`);

        } catch (error) {
            console.error('[VTP Đánh Giá] Lỗi tại đơn này:', error.message);
            shouldSkip = true;
            skipReason = error.message;
            await closeOpenForms();
        }

        // Ghi nhận skip (nếu có)
        if (shouldSkip) {
            console.warn(`[VTP Đánh Giá] Bỏ qua "${currentBill}": ${skipReason}`);
            window.VTPNotification?.show(
                `⏭ Bỏ qua ${currentBill}\n${skipReason}`,
                'warning',
                3500
            );
        }

        // Tiến sang đơn kế tiếp
        const latestData = await chrome.storage.local.get(['isRunning', 'currentIndex']);
        if (latestData.isRunning) {
            await chrome.storage.local.set({ currentIndex: latestData.currentIndex + 1 });
        }

        return {
            status: shouldSkip ? 'skipped' : 'success',
            bill: currentBill,
            reason: skipReason
        };
    }

    // ─── Chạy và trả kết quả cho sidepanel ──────────────────

    processOneBill()
        .then(result => {
            window.__VTP_DANHGIA_RUNNING__ = false;
            chrome.storage.local.set({ __VTP_CHINHGIO_STEP_DONE__: result });
            console.log('[VTP Đánh Giá] Xong 1 đơn, kết quả:', result.status, result.bill || '');
        })
        .catch(err => {
            window.__VTP_DANHGIA_RUNNING__ = false;
            chrome.storage.local.set({
                __VTP_CHINHGIO_STEP_DONE__: { status: 'error', reason: err.message }
            });
            console.error('[VTP Đánh Giá] Lỗi không xử lý được:', err);
        });
}
