window.VTPSmartDelay = {
    waitUntilCodeProcessed: function(targetCode, targetElement, maxWaitTime = 15000) {
        return new Promise((resolve) => {
            const checkStatus = () => {
                // Kiểm tra trực tiếp thẻ element, cực nhẹ cho CPU
                if (!document.body.contains(targetElement) || !targetElement.innerText.includes(targetCode)) {
                    return 'success';
                }
                const errorBox = document.querySelector('.z-messagebox-window, .z-errorbox, .z-notification-error');
                if (errorBox && errorBox.style.display !== 'none') {
                    const okBtn = errorBox.querySelector('.z-button');
                    if (okBtn) okBtn.click();
                    return 'error';
                }
                return 'pending';
            };

            const initialCheck = checkStatus();
            if (initialCheck === 'success') return resolve(true);
            if (initialCheck === 'error') return resolve(false);

            const observer = new MutationObserver((mutations, obs) => {
                const status = checkStatus();
                if (status === 'success') {
                    obs.disconnect(); clearTimeout(timeoutId); resolve(true);
                } else if (status === 'error') {
                    obs.disconnect(); clearTimeout(timeoutId); resolve(false);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true, characterData: true });

            const timeoutId = setTimeout(() => {
                observer.disconnect();
                resolve(false);
            }, maxWaitTime);
        });
    },

    waitForPageLoad: function(oldFirstCode, maxWait = 10000) {
        return new Promise((resolve) => {
            const checkChanged = () => {
                const firstCell = document.querySelector('.z-listcell-content');
                return firstCell && firstCell.innerText.trim().replace(/\s+/g, '') !== oldFirstCode;
            };

            if (checkChanged()) return resolve(true);

            const observer = new MutationObserver((mutations, obs) => {
                if (checkChanged()) {
                    obs.disconnect(); clearTimeout(timeoutId); resolve(true);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true, characterData: true });

            const timeoutId = setTimeout(() => {
                observer.disconnect(); resolve(false);
            }, maxWait);
        });
    },

    sleep: function(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};