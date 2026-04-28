// ============================================================
//  VTP Tool – Kiểm Kê Tuyến Auto  v1.4
//  Thực hiện 5 bước chọn tuyến → vào trang scan
//  popup.js dùng tab.onUpdated để phát hiện khi trang scan mở.
//
//  Thay đổi v1.4:
//    [+] Guard chống inject lại (__VTP_KIEMKE_RUNNING__)
//    [+] Chờ loading indicator biến mất sau mỗi bước (tránh race condition)
//    [+] Bước 2 tìm tuyến: thêm normalize NBSP + trim mạnh hơn
//    [+] Timeout rõ ràng hơn cho từng bước
// ============================================================
if (window.__VTP_KIEMKE_RUNNING__) {
    console.warn('[VTP KiểmKê] Script đã đang chạy. Bỏ qua inject mới.');
} else {
window.__VTP_KIEMKE_RUNNING__ = true;

(async () => {
    'use strict';

    const STEP_TIMEOUT = 15000; // Timeout chờ 1 element xuất hiện
    const STEP_DELAY   = 500;   // Delay giữa các bước (tối ưu từ 1500)
    const POPUP_WAIT   = 800;   // Chờ dropdown mở (tối ưu từ 2000)
    const DIALOG_WAIT  = 1000;  // Chờ dialog xuất hiện (tối ưu từ 3000)

    const routeName = window.__VTP_SELECTED_ROUTE__;
    if (!routeName) {
        console.error('[VTP KiểmKê] Không có tuyến nào được chọn!');
        window.__VTP_KIEMKE_RUNNING__ = false;
        return;
    }
    console.log(`[VTP KiểmKê] Bắt đầu kiểm kê tuyến: "${routeName}"`);

    // ── Utilities ──────────────────────────────────────────────
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    /** Normalize: bỏ NBSP, loại bỏ whitespace thừa */
    function normalizeText(str) {
        return (str || '').replace(/\u00A0/g, ' ').trim();
    }

    /** Tìm button.z-button theo text chính xác */
    function findButtonByText(text) {
        for (const btn of document.querySelectorAll('button.z-button')) {
            if (normalizeText(btn.textContent) === text) return btn;
        }
        return null;
    }

    /** Chờ loading indicator biến mất (tối đa timeoutMs) */
    async function waitForLoadingDone(timeoutMs = 8000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const loading = document.querySelector('.z-loading-indicator, .z-apply-loading-indicator');
            if (!loading || loading.style.display === 'none' || loading.offsetParent === null) return true;
            await sleep(300);
        }
        return false; // Vẫn còn loading sau timeout
    }

    function notify(msg, type = 'info') {
        if (window.VTPNotification?.show) window.VTPNotification.show(msg, type);
        console.log(`[VTP KiểmKê] [${type}] ${msg}`);
    }

    try {
        // ════ BƯỚC 1: Mở dropdown chọn hình thức kiểm kê ════
        notify('Bước 1/5: Mở dropdown hình thức kiểm kê...', 'info');
        const comboboxes = document.querySelectorAll('.z-combobox');
        let targetCombobox = null;

        // Tìm combobox "Hình thức kiểm kê"
        for (const cb of comboboxes) {
            const input = cb.querySelector('.z-combobox-input');
            if (!input) continue;
            const ph  = normalizeText(input.getAttribute('placeholder') || '');
            const val = normalizeText(input.value || '');
            if (ph.includes('Hình thức kiểm kê') || val.includes('Kiểm kê') || val.includes('kiểm kê')) {
                targetCombobox = cb; break;
            }
        }
        // Fallback: lấy combobox đầu tiên có input
        if (!targetCombobox) {
            for (const cb of comboboxes) {
                if (cb.querySelector('.z-combobox-input')) { targetCombobox = cb; break; }
            }
        }
        if (!targetCombobox) throw new Error('Không tìm thấy ô chọn hình thức kiểm kê!');

        const dropdownBtn = targetCombobox.querySelector('.z-combobox-button');
        if (!dropdownBtn) throw new Error('Không tìm thấy nút mở dropdown!');
        dropdownBtn.click();
        await sleep(POPUP_WAIT);

        // ════ BƯỚC 2: Chọn tuyến trong dropdown ════
        notify(`Bước 2/5: Chọn tuyến "${routeName}"...`, 'info');
        let dropdownPopup = null;
        const t0 = Date.now();
        while (!dropdownPopup && Date.now() - t0 < STEP_TIMEOUT) {
            for (const p of document.querySelectorAll('.z-combobox-popup')) {
                if (p.style.display !== 'none' && p.offsetHeight > 0) { dropdownPopup = p; break; }
            }
            if (!dropdownPopup) await sleep(300);
        }
        if (!dropdownPopup) throw new Error('Dropdown không mở được sau ' + STEP_TIMEOUT + 'ms!');

        // Tìm item khớp chính xác trước, fallback khớp partial
        let matched = null;
        const items = dropdownPopup.querySelectorAll('.z-comboitem');

        for (const item of items) {
            const textEl = item.querySelector('.z-comboitem-text');
            if (!textEl) continue;
            if (normalizeText(textEl.textContent) === routeName) { matched = item; break; }
        }
        if (!matched) {
            for (const item of items) {
                const textEl = item.querySelector('.z-comboitem-text');
                if (!textEl) continue;
                const txt = normalizeText(textEl.textContent);
                if (txt.includes(routeName) || routeName.includes(txt)) { matched = item; break; }
            }
        }
        if (!matched) throw new Error(`Không tìm thấy tuyến "${routeName}" trong dropdown!`);
        matched.click();
        await sleep(STEP_DELAY);

        // ════ BƯỚC 3: Click "Tìm kiếm" ════
        notify('Bước 3/5: Click "Tìm kiếm"...', 'info');
        const searchBtn = findButtonByText('Tìm kiếm');
        if (!searchBtn) throw new Error('Không tìm thấy nút "Tìm kiếm"!');
        searchBtn.click();

        // Chờ loading indicator biến mất sau khi tìm kiếm
        await waitForLoadingDone(STEP_TIMEOUT);
        await sleep(300); // Tối ưu từ 800ms

        // ════ BƯỚC 4: Click "Kiểm kê" ════
        notify('Bước 4/5: Click "Kiểm kê"...', 'info');
        const kiemKeBtn = findButtonByText('Kiểm kê');
        if (!kiemKeBtn) throw new Error('Không tìm thấy nút "Kiểm kê"!');
        kiemKeBtn.click();
        await sleep(DIALOG_WAIT);

        // ════ BƯỚC 5: Click "Chấp nhận" trong dialog ════
        notify('Bước 5/5: Click "Chấp nhận"...', 'info');
        let acceptBtn = null;
        const t1 = Date.now();
        while (!acceptBtn && Date.now() - t1 < STEP_TIMEOUT) {
            for (const btn of document.querySelectorAll('.z-messagebox-button')) {
                if (normalizeText(btn.textContent) === 'Chấp nhận') { acceptBtn = btn; break; }
            }
            if (!acceptBtn) await sleep(300);
        }
        if (!acceptBtn) throw new Error('Không tìm thấy nút "Chấp nhận" sau ' + STEP_TIMEOUT + 'ms!');

        acceptBtn.click();

        // ════ HOÀN TẤT 5 BƯỚC ════
        // Set flag TRƯỚC khi navigation → popup.js có thể nhận tín hiệu
        await sleep(200);
        window.__VTP_5STEPS_DONE__ = true;
        notify(`✅ Đã hoàn tất 5 bước cho tuyến "${routeName}"`, 'success');
        console.log('[VTP KiểmKê] ✅ __VTP_5STEPS_DONE__ = true');

    } catch (err) {
        notify(`❌ Lỗi: ${err.message}`, 'error');
        window.__VTP_5STEPS_DONE__  = false;
        window.__VTP_5STEPS_ERROR__ = err.message;
        console.error('[VTP KiểmKê] ❌', err.message);
    } finally {
        delete window.__VTP_SELECTED_ROUTE__;
        window.__VTP_KIEMKE_RUNNING__ = false;
    }
})();
}
