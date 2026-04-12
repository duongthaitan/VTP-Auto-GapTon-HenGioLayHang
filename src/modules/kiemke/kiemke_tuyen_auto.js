// ============================================================
//  VTP Tool – Kiểm Kê Tuyến Auto  v1.3
//  Chỉ thực hiện 5 bước, KHÔNG chờ navigation.
//  popup.js sẽ dùng tab.onUpdated để phát hiện khi trang scan mở.
// ============================================================
(async () => {
    'use strict';

    const STEP_TIMEOUT = 15000;
    const STEP_DELAY   = 1500;
    const POPUP_WAIT   = 2000;
    const DIALOG_WAIT  = 3000;

    const routeName = window.__VTP_SELECTED_ROUTE__;
    if (!routeName) {
        console.error('[VTP KiểmKê] Không có tuyến nào được chọn!');
        return;
    }
    console.log(`[VTP KiểmKê] Bắt đầu kiểm kê tuyến: "${routeName}"`);

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function findButtonByText(text) {
        for (const btn of document.querySelectorAll('button.z-button')) {
            if (btn.textContent.trim() === text) return btn;
        }
        return null;
    }

    function notify(msg, type = 'info') {
        if (window.VTPNotification?.show) window.VTPNotification.show(msg, type);
        console.log(`[VTP KiểmKê] [${type}] ${msg}`);
    }

    try {
        // ════ BƯỚC 1: Mở dropdown ════
        notify('Bước 1/5: Mở dropdown...', 'info');
        const comboboxes = document.querySelectorAll('.z-combobox');
        let targetCombobox = null;

        for (const cb of comboboxes) {
            const input = cb.querySelector('.z-combobox-input');
            if (!input) continue;
            const ph  = input.getAttribute('placeholder') || '';
            const val = input.value || '';
            if (ph.includes('Hình thức kiểm kê') || val.includes('Kiểm kê') || val.includes('kiểm kê')) {
                targetCombobox = cb; break;
            }
        }
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

        // ════ BƯỚC 2: Chọn tuyến ════
        notify(`Bước 2/5: Chọn "${routeName}"...`, 'info');
        let dropdownPopup = null;
        const t0 = Date.now();
        while (!dropdownPopup && Date.now() - t0 < STEP_TIMEOUT) {
            for (const p of document.querySelectorAll('.z-combobox-popup')) {
                if (p.style.display !== 'none' && p.offsetHeight > 0) { dropdownPopup = p; break; }
            }
            if (!dropdownPopup) await sleep(300);
        }
        if (!dropdownPopup) throw new Error('Dropdown không mở được!');

        let matched = null;
        for (const item of dropdownPopup.querySelectorAll('.z-comboitem')) {
            const textEl = item.querySelector('.z-comboitem-text');
            if (!textEl) continue;
            const txt = textEl.textContent.replace(/\u00A0/g, ' ').trim();
            if (txt === routeName) { matched = item; break; }
        }
        if (!matched) {
            for (const item of dropdownPopup.querySelectorAll('.z-comboitem')) {
                const textEl = item.querySelector('.z-comboitem-text');
                if (!textEl) continue;
                const txt = textEl.textContent.replace(/\u00A0/g, ' ').trim();
                if (txt.includes(routeName) || routeName.includes(txt)) { matched = item; break; }
            }
        }
        if (!matched) throw new Error(`Không tìm thấy tuyến "${routeName}" trong dropdown!`);
        matched.click();
        await sleep(STEP_DELAY);

        // ════ BƯỚC 3: Tìm kiếm ════
        notify('Bước 3/5: Click "Tìm kiếm"...', 'info');
        const searchBtn = findButtonByText('Tìm kiếm');
        if (!searchBtn) throw new Error('Không tìm thấy nút "Tìm kiếm"!');
        searchBtn.click();
        await sleep(STEP_DELAY);

        // Chờ loading xong
        let w = 0;
        while (w < STEP_TIMEOUT) {
            const loading = document.querySelector('.z-loading-indicator, .z-apply-loading-indicator');
            if (!loading || loading.style.display === 'none') break;
            await sleep(500); w += 500;
        }
        await sleep(800);

        // ════ BƯỚC 4: Kiểm kê ════
        notify('Bước 4/5: Click "Kiểm kê"...', 'info');
        const kiemKeBtn = findButtonByText('Kiểm kê');
        if (!kiemKeBtn) throw new Error('Không tìm thấy nút "Kiểm kê"!');
        kiemKeBtn.click();
        await sleep(DIALOG_WAIT);

        // ════ BƯỚC 5: Chấp nhận ════
        notify('Bước 5/5: Click "Chấp nhận"...', 'info');
        let acceptBtn = null;
        const t1 = Date.now();
        while (!acceptBtn && Date.now() - t1 < STEP_TIMEOUT) {
            for (const btn of document.querySelectorAll('.z-messagebox-button')) {
                if (btn.textContent.trim() === 'Chấp nhận') { acceptBtn = btn; break; }
            }
            if (!acceptBtn) await sleep(300);
        }
        if (!acceptBtn) throw new Error('Không tìm thấy nút "Chấp nhận"!');

        acceptBtn.click();

        // ════ HOÀN TẤT 5 BƯỚC ════
        // Đặt flag ngay sau khi click để popup.js có thể nhận tín hiệu
        // (Trước khi navigation xảy ra)
        await sleep(200);
        window.__VTP_5STEPS_DONE__ = true;
        notify(`✅ Đã hoàn tất 5 bước cho tuyến "${routeName}"`, 'success');
        console.log('[VTP KiểmKê] ✅ __VTP_5STEPS_DONE__ = true');

    } catch (err) {
        notify(`❌ Lỗi: ${err.message}`, 'error');
        window.__VTP_5STEPS_DONE__  = false;
        window.__VTP_5STEPS_ERROR__ = err.message;
        console.error('[VTP KiểmKê] ❌', err.message);
    }

    delete window.__VTP_SELECTED_ROUTE__;
})();
