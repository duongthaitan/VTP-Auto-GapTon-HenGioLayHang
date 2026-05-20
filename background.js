// ============================================================
//  VTP Tool – Background Service Worker v3.2
//  ✦ Mở Side Panel khi nhấn icon extension
// ============================================================

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[VTP Background]', error));

chrome.runtime.onInstalled.addListener(() => {
  console.log('[VTP Tool] Installed v3.2');
});
