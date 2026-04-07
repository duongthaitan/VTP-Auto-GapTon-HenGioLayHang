document.addEventListener('DOMContentLoaded', async () => {

    // ════════════════════════════════════════
    //  TAB SWITCHING
    // ════════════════════════════════════════
    const tabBtns     = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-target')).classList.add('active');
        });
    });

    // ════════════════════════════════════════
    //  TEXTAREA — Live bill count
    // ════════════════════════════════════════
    const billListEl  = document.getElementById('billList');
    const billCountEl = document.getElementById('billCount');

    function updateBillCount() {
        const bills = billListEl.value.split('\n').map(b => b.trim()).filter(b => b !== '');
        if (bills.length > 0) {
            billCountEl.textContent   = `${bills.length} mã`;
            billCountEl.style.color   = 'var(--red)';
        } else {
            billCountEl.textContent   = 'Chưa có mã nào';
            billCountEl.style.color   = 'var(--text-3)';
        }
    }

    billListEl.addEventListener('input', updateBillCount);

    // ════════════════════════════════════════
    //  DELAY STEPPER (+/−)
    // ════════════════════════════════════════
    const delayInput = document.getElementById('delay');

    document.getElementById('delayPlus').addEventListener('click', () => {
        delayInput.value = Math.min(parseInt(delayInput.value || 1) + 1, 30);
    });
    document.getElementById('delayMinus').addEventListener('click', () => {
        delayInput.value = Math.max(parseInt(delayInput.value || 2) - 1, 1);
    });

    // ════════════════════════════════════════
    //  PROGRESS BAR — helper
    // ════════════════════════════════════════
    const progressCard = document.getElementById('progressContainer');
    const progressBar  = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const statusDot    = document.querySelector('#statusChinhGio .status-dot');
    const statusMsg    = document.querySelector('#statusChinhGio .status-msg');

    function updateProgressUI(current, total) {
        if (total > 0) {
            progressCard.style.display = 'block';
            const pct = Math.floor((current / total) * 100);
            progressBar.style.width    = pct + '%';
            progressText.textContent   = `${current} / ${total} (${pct}%)`;

            if (current >= total) {
                statusMsg.textContent       = '✅ Đã hoàn thành!';
                statusDot.style.background  = '#22c55e';
            } else {
                statusMsg.textContent       = `Đang xử lý đơn ${current + 1} / ${total}…`;
                statusDot.style.background  = '#f59e0b';
            }
        } else {
            progressCard.style.display = 'none';
        }
    }

    // ════════════════════════════════════════
    //  RESTORE STATE — khi mở lại popup
    // ════════════════════════════════════════
    chrome.storage.local.get(['isRunning', 'currentIndex', 'billList'], (data) => {
        if (data.isRunning && data.billList) {
            billListEl.value = data.billList.join('\n');
            updateBillCount();
            updateProgressUI(data.currentIndex, data.billList.length);
        }
    });

    // Realtime listener — content script cập nhật storage
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;
        chrome.storage.local.get(['isRunning', 'currentIndex', 'billList'], (data) => {
            if (data.isRunning && data.billList) {
                updateProgressUI(data.currentIndex, data.billList.length);
            }
            if (changes.isRunning && changes.isRunning.newValue === false) {
                if (statusMsg) statusMsg.textContent      = 'Đã dừng.';
                if (statusDot) statusDot.style.background = '#6b7280';
            }
        });
    });

    // ════════════════════════════════════════
    //  TAB 1 — SỬA GIỜ
    // ════════════════════════════════════════
    document.getElementById('startChinhGioBtn').addEventListener('click', async () => {
        const bills = billListEl.value.split('\n').map(b => b.trim()).filter(b => b !== '');
        const delay = parseInt(delayInput.value) || 2;

        if (bills.length === 0) {
            alert('Vui lòng dán ít nhất 1 mã vận đơn!');
            return;
        }

        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url) {
            alert('Không thể xác định trang hiện tại. Hãy mở trình duyệt và thử lại!');
            return;
        }

        await chrome.storage.local.set({ billList: bills, delay, isRunning: true, currentIndex: 0 });
        updateProgressUI(0, bills.length);

        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['notification.js', 'chinhgio_content.js']
            });
        } catch (e) {
            console.error('[VTP] Lỗi inject script:', e);
            await chrome.storage.local.set({ isRunning: false });
            alert('Không thể chạy script. Hãy đảm bảo bạn đang mở đúng trang ViettelPost!');
        }
    });

    document.getElementById('stopChinhGioBtn').addEventListener('click', async () => {
        await chrome.storage.local.set({ isRunning: false });
        if (statusMsg) statusMsg.textContent      = 'Đã dừng.';
        if (statusDot) statusDot.style.background = '#6b7280';
    });

    // ════════════════════════════════════════
    //  TAB 2 — KIỂM TỒN
    // ════════════════════════════════════════
    const statusBoxGapTon = document.getElementById('statusBoxGapTon');
    const startGapTonBtn  = document.getElementById('startGapTonBtn');

    function setGapTonStatus(isReady, title, desc) {
        statusBoxGapTon.className                                      = `page-check ${isReady ? 'ready' : 'not-ready'}`;
        statusBoxGapTon.querySelector('.page-check-icon').textContent  = isReady ? '✅' : '⚠️';
        statusBoxGapTon.querySelector('.page-check-title').textContent = title;
        statusBoxGapTon.querySelector('.page-check-desc').textContent  = desc;
        startGapTonBtn.disabled = !isReady;
    }

    try {
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url?.includes('viettelpost')) {
            setGapTonStatus(true, 'Sẵn sàng hoạt động', 'Trang ViettelPost đã được phát hiện');
        } else {
            setGapTonStatus(false, 'Chưa sẵn sàng', 'Vui lòng mở trang ViettelPost!');
        }
    } catch (err) {
        setGapTonStatus(false, 'Lỗi xác định trang', err.message);
    }

    startGapTonBtn.addEventListener('click', async () => {
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url?.includes('viettelpost')) return;

        startGapTonBtn.disabled     = true;
        startGapTonBtn.textContent  = '⏳ Đang nạp hệ thống…';

        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world: 'MAIN',
                files: ['notification.js', 'gapton_settings.js', 'gapton_smart_delay.js', 'gapton_core_scan.js']
            });
        } catch (e) {
            console.error('[VTP] Lỗi inject script Kiểm Tồn:', e);
            alert('Không thể chạy script. Hãy kiểm tra lại trang ViettelPost!');
            startGapTonBtn.disabled    = false;
            startGapTonBtn.textContent = '🚀 CHẠY KIỂM TỒN';
            return;
        }

        window.close();
    });

});