// ============================================================
//  VTP Tool – Background Service Worker v2.1
//  Mở Side Panel khi nhấn icon extension
// ============================================================
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[VTP Background]', error));
