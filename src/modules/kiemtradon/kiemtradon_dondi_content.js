// ============================================================
//  VTP Tool – Kiểm Tra Đơn Đi (Hành Trình) Content Script
//  v1.2 — Tra cứu hành trình phiếu gửi trên evtp2.viettelpost.vn
// ============================================================

if (window.__VTP_KTD_DONDI_RUNNING__) {
    console.warn('[VTP KTĐ-ĐĐ] Script đã đang chạy. Bỏ qua inject mới.');
    chrome.storage.local.set({ __VTP_KTD_STEP_DONE__: { status: 'busy' } });
} else {
    window.__VTP_KTD_DONDI_RUNNING__ = true;

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const waitForElement = (selector, timeout = 10000) => {
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

    const waitForCondition = (conditionFn, timeout = 15000, pollMs = 300) => {
        return new Promise((resolve) => {
            if (conditionFn()) return resolve(true);

            const start = Date.now();
            const poller = setInterval(() => {
                if (conditionFn()) {
                    clearInterval(poller);
                    resolve(true);
                } else if (Date.now() - start >= timeout) {
                    clearInterval(poller);
                    resolve(false);
                }
            }, pollMs);
        });
    };

    function extractRecipientInfo() {
        let tenNhan = '';
        let diaChiNhan = '';

        const listboxes = document.querySelectorAll('.z-listbox');
        for (const box of listboxes) {
            const headerEls = box.querySelectorAll('.z-listheader-content');
            const headers = Array.from(headerEls).map(
                el => (el.textContent || '').replace(/ /g, ' ').trim().toUpperCase()
            );
            const idxNhan = headers.findIndex(
                h => h.includes('ĐỊA CHỈ NHẬN') || h.includes('ĐỊA CHỈ NGƯỜI NHẬN')
            );
            if (idxNhan === -1) continue;

            const firstRow = box.querySelector('.z-listitem');
            if (!firstRow) continue;
            const cell = firstRow.querySelectorAll('.z-listcell')[idxNhan];
            if (!cell) continue;

            for (const sp of cell.querySelectorAll('span.z-label')) {
                const t = (sp.textContent || '').replace(/ /g, ' ').trim();
                if (t.startsWith('Họ tên:'))       tenNhan    = t.replace('Họ tên:', '').trim();
                else if (t.startsWith('Địa chỉ:'))  diaChiNhan = t.replace('Địa chỉ:', '').trim();
            }
            break;
        }

        return { tenNhan, diaChiNhan };
    }

    async function processOneBill() {
        const data = await chrome.storage.local.get(['__VTP_KTD_CURRENT_BILL__']);
        const currentBill = data.__VTP_KTD_CURRENT_BILL__;

        if (!currentBill) {
            return { status: 'error', reason: 'Không có mã phiếu gửi để tra cứu' };
        }

        console.log(`[VTP KTĐ-ĐĐ] Đang tra cứu: ${currentBill}`);

        try {
            const searchInput = await waitForElement('.tbx-phieugui .z-bandbox-input, .z-bandbox-input[placeholder*="phiếu gửi"]', 8000);

            if (!searchInput) {
                throw new Error('Không tìm thấy ô nhập mã phiếu gửi');
            }

            searchInput.focus();
            searchInput.select();
            await sleep(50);

            const nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            ).set;
            nativeSetter.call(searchInput, currentBill);
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true }));
            await sleep(100);

            ['keydown', 'keypress', 'keyup'].forEach(evt => {
                searchInput.dispatchEvent(new KeyboardEvent(evt, {
                    key: 'Enter', code: 'Enter', keyCode: 13,
                    which: 13, bubbles: true
                }));
            });
            await sleep(100);

            const searchBtn = document.querySelector('.tbx-phieugui .z-bandbox-button, .z-bandbox-button');
            if (searchBtn) {
                searchBtn.click();
            }

            await sleep(100);
            await waitForCondition(() => {
                const loading = document.querySelector('.z-loading-indicator, .z-apply-loading-indicator');
                return !loading || loading.style.display === 'none' || loading.offsetParent === null;
            }, 10000, 100);

            let thoiGian = '';
            let noiDung = '';
            let ghiChu = '';
            let journeyBox = null;
            let idxThoiGian = -1;
            let idxNoiDung  = -1;
            let idxGhiChu   = -1;

            await waitForCondition(() => {
                const tabTexts = document.querySelectorAll('.z-tab-text');
                for (const tab of tabTexts) {
                    const t = (tab.textContent || tab.getAttribute('title') || '').trim();
                    if (t.includes('Hành trình')) {
                        const tabLi = tab.closest('li.z-tab');
                        if (tabLi && !tabLi.classList.contains('z-tab-selected')) {
                            const tabLink = tab.closest('a.z-tab-content') || tabLi;
                            if (tabLink) tabLink.click();
                        }
                        break;
                    }
                }

                journeyBox = null;
                const listboxes = document.querySelectorAll('.z-listbox');
                for (const box of listboxes) {
                    const headerElements = box.querySelectorAll('.z-listheader-content');
                    const headers = Array.from(headerElements).map(el => (el.textContent || '').trim().toUpperCase());
                    if (headers.includes('THỜI GIAN') && headers.includes('NỘI DUNG') && headers.includes('GHI CHÚ')) {
                        journeyBox = box;
                        idxThoiGian = headers.indexOf('THỜI GIAN');
                        idxNoiDung  = headers.indexOf('NỘI DUNG');
                        idxGhiChu   = headers.indexOf('GHI CHÚ');
                        break;
                    }
                }

                if (!journeyBox) return false;

                const rows = journeyBox.querySelectorAll('.z-listitem');
                if (rows.length === 0) return false;

                const firstRow = rows[0];
                const cells = firstRow.querySelectorAll('.z-listcell');
                if (cells.length === 0) return false;

                const billCodeInCell = (cells[0].textContent || '').trim();
                return billCodeInCell.toUpperCase() === currentBill.toUpperCase();
            }, 8000, 150);

            if (journeyBox) {
                const rows = journeyBox.querySelectorAll('.z-listitem');
                if (rows.length > 0) {
                    const firstRow = rows[0];
                    const cells = firstRow.querySelectorAll('.z-listcell');
                    if (cells.length > 0) {
                        if (idxThoiGian !== -1 && cells[idxThoiGian]) {
                            const td = cells[idxThoiGian];
                            const contentDiv = td.querySelector('.z-listcell-content');
                            thoiGian = (contentDiv?.textContent || td.getAttribute('title') || td.textContent || '').trim();
                        }
                        if (idxNoiDung !== -1 && cells[idxNoiDung]) {
                            const td = cells[idxNoiDung];
                            const contentDiv = td.querySelector('.z-listcell-content');
                            noiDung = (contentDiv?.textContent || td.getAttribute('title') || td.textContent || '').replace(/\u00A0/g, ' ').trim();
                        }
                        if (idxGhiChu !== -1 && cells[idxGhiChu]) {
                            const td = cells[idxGhiChu];
                            const contentDiv = td.querySelector('.z-listcell-content');
                            ghiChu = (contentDiv?.textContent || td.getAttribute('title') || td.textContent || '').replace(/\u00A0/g, ' ').trim();
                        }
                    }
                }
            }

            let trangThai = '';
            const allLabels = document.querySelectorAll('span.z-label');
            for (const label of allLabels) {
                const text = (label.textContent || '').trim();
                if (text.startsWith('Trạng thái:')) {
                    trangThai = text.replace('Trạng thái:', '').trim();
                    break;
                }
            }

            if (!trangThai) {
                const divs = document.querySelectorAll('.z-div span.z-label, .col-md-12 span.z-label');
                for (const el of divs) {
                    const t = (el.textContent || '').trim();
                    if (t.includes('Trạng thái:') || t.includes('Trạng thái :')) {
                        trangThai = t.replace(/Trạng thái\s*:\s*/, '').trim();
                        break;
                    }
                }
            }

            if (!trangThai) {
                trangThai = ghiChu || 'Không xác định';
            }

            if (!trangThai && !thoiGian) {
                throw new Error('Không tải được kết quả tra cứu (mã có thể không hợp lệ hoặc trang lỗi)');
            }

            const { tenNhan, diaChiNhan } = extractRecipientInfo();

            console.log(`[VTP KTĐ-ĐĐ] ✅ ${currentBill}: ${trangThai} | ${thoiGian} | ${tenNhan} | ${diaChiNhan}`);

            return {
                status:     'success',
                bill:       currentBill,
                trangThai:  trangThai || 'Không xác định',
                thoiGian:   thoiGian || '',
                noiDung:    noiDung || '',
                ghiChu:     ghiChu || '',
                tenNhan:    tenNhan || '',
                diaChiNhan: diaChiNhan || ''
            };

        } catch (error) {
            console.error('[VTP KTĐ-ĐĐ] Lỗi:', error.message);
            return {
                status: 'error',
                bill:   currentBill,
                reason: error.message
            };
        }
    }

    processOneBill()
        .then(result => {
            window.__VTP_KTD_DONDI_RUNNING__ = false;
            chrome.storage.local.set({ __VTP_KTD_STEP_DONE__: result });
        })
        .catch(err => {
            window.__VTP_KTD_DONDI_RUNNING__ = false;
            chrome.storage.local.set({
                __VTP_KTD_STEP_DONE__: { status: 'error', reason: err.message }
            });
        });
}
