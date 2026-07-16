/* =============================================
   BYBIT TRACKER — JavaScript Core Logic (FULL)
   =============================================
   - Parses UTC format: "2026-05-26 11:36:42 (UTC+0)"
   - Parses Gmail format: "May 26, 2026, 2:36 PM"
   - Manual datetime picker (assumes Egypt local)
   - Converts all times to Egypt timezone (Africa/Cairo)
   - Calculates elapsed / remaining time vs +4 / +8 days
   - Live countdown + progress ring
   - Account Manager with IndexedDB + localStorage dual storage
   - IP Conflict Alert (duplicate IP detection)
   - Data Integrity Check (localStorage vs IndexedDB comparison)
   - Bulk selection, CSV export, timeline visualization
   - PWA support + browser notifications
   - Full bilingual: Arabic / English
============================================= */

'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────
const EGYPT_TZ      = 'Africa/Cairo';
const STORAGE_KEY   = 'bybit_tracker_history';
const ACCOUNTS_KEY  = 'bybit_tracker_accounts';

// ─── State ───────────────────────────────────────────────────────────────────
let currentTab          = 'utc';
let countdownInterval   = null;
let depositUTC          = null;
let target1UTC          = null;
let target2UTC          = null;
let currentLang         = localStorage.getItem('waqtak_lang') || 'ar';
let currentMode         = 'calculator';
let accounts            = [];
let accountsInterval    = null;
let filterStatus        = 'all';
let sortBy              = 'newest';
let notifPermission     = false;
let idb                 = null;
let editingId           = null;
const IDB_NAME          = 'waqtak_db';
const IDB_STORE         = 'accounts';
const IDB_VERSION       = 1;

// ─── i18n Translations ───────────────────────────────────────────────────────
const TRANSLATIONS = {
  ar: {
    themeLight: 'الوضع الفاتح', themeDark: 'الوضع الداكن', themeToggle: 'تبديل المظهر',
    timelineTitle: 'الجدول الزمني للحسابات', timelineHide: 'إخفاء', timelineShow: 'عرض',
    legendStage1: 'المرحلة 1 (4 أيام)', legendStage2: 'المرحلة 2 (4 أيام)', legendDone: 'مكتمل',
    timelineToday: 'اليوم', timelineNoAccounts: 'لا توجد حسابات بعد',
    bulkSelected: 'محدد', bulkDelete: '🗑️ حذف المحدد', bulkExport: '📤 تصدير المحدد',
    bulkExportCSV: '📊 تصدير CSV', bulkSelectAll: '☑️ تحديد الكل', bulkDeselect: '☐ إلغاء التحديد',
    bulkModeBtn: 'وضع التحديد المتعدد', bulkExitMode: 'الخروج من التحديد',
    bulkDeleteConfirm: 'هل تريد حذف {n} حساب(ات) محدد(ة)؟',
    bulkExportOk: '✅ تم تصدير {n} حساب بنجاح',
    csvFilename: 'waqtak_export_{date}.csv',
    csvHeaders: 'UID,البريد,IP,الإيداع ($),الحالة,المرحلة 1,المرحلة 2,ملاحظات',
    csvStage1: 'المرحلة 1', csvStage2: 'المرحلة 2', csvDone: 'مكتمل',
    toastThemeLight: '☀️ تحول إلى الوضع الفاتح', toastThemeDark: '🌙 تحول إلى الوضع الداكن',
    pwaInstallTitle: '📱 ثبّت تطبيق وقتك!',
    logoMain: 'وقتك', logoSub: 'متابعة حسابات Bybit',
    clockLabel: 'التوقيت العالمي الآن (UTC)', langToggleText: 'English',
    heroBadge: 'متابعة الإيداعات والنشاط',
    heroTitle: 'تتبع مواعيد<br/>حساباتك خطوة بخطوة',
    heroDesc: 'أدخل تاريخ الإيداع من رسالة Gmail وستحسب الأداة تلقائياً مواعيد المراجعة بعد <strong>4 أيام</strong> والجاهزية بعد <strong>8 أيام</strong>',
    inputCardTitle: 'إدخال تاريخ الإيداع', inputCardSubtitle: 'الصق التاريخ من رسالة Gmail أو أدخله يدوياً',
    tabUTC: 'UTC Format', tabGmail: 'Gmail Format', tabManual: 'يدوي',
    labelUTC: 'تنسيق UTC — مثال: <code>2026-05-26 11:36:42 (UTC+0)</code>',
    labelGmail: 'تنسيق Gmail — مثال: <code>May 26, 2026, 2:36 PM</code>',
    labelManual: 'اختر تاريخ ووقت الإيداع (بالتوقيت المصري)',
    gmailNote: 'Gmail يعرض التوقيت المحلي لإعدادات حسابك — يُعالج تلقائياً حسب UTC',
    btnCalculate: 'احسب الآن', exampleLabel: 'أمثلة سريعة:', exampleUTC: 'مثال UTC', exampleGmail: 'مثال Gmail',
    progressLabel: 'مكتمل', depositLabel: 'تاريخ الإيداع (بالتوقيت المصري)',
    milestone1Label: 'المراجعة الأولى — بعد 4 أيام (بالتوقيت المصري)',
    milestone2Label: 'المراجعة الثانية والجاهزية — بعد 8 أيام (بالتوقيت المصري)',
    statElapsedLabel: 'مر على الإيداع', statActiveLabel: 'الهدف النشط حالياً',
    statStage1Label: 'المرحلة الأولى (4 أيام)', statStage2Label: 'المرحلة الثانية (8 أيام)',
    countdownTitle: 'العد التنازلي الدقيق',
    cdDays: 'أيام', cdHours: 'ساعات', cdMins: 'دقائق', cdSecs: 'ثواني',
    btnReset: 'إدخال تاريخ جديد',
    historySectionTitle: 'الحسابات المحفوظة', btnClearHistory: 'مسح الكل',
    historyEmpty: 'لا توجد حسابات محفوظة بعد',
    footerText: 'وقتك — أداة متابعة حسابات Bybit • جميع البيانات محلية على جهازك',
    dynReady: 'جاهز بالكامل ✓', dynStage2Rem: 'مرحلة 2: متبقي ', dynStage1Rem: 'مرحلة 1: متبقي ',
    dynDone: 'مكتملة ✓', dynRemaining: 'متبقي ', dynWaiting: 'في الانتظار..',
    dynBanner2Title: 'الحساب جاهز بالكامل!', dynBanner2Sub: 'اكتملت فترة الـ 8 أيام منذ ',
    dynBanner2Badge: 'جاهز', dynBanner1Title: 'المرحلة الثانية نشطة',
    dynBanner1Sub1: 'اكتملت المراجعة الأولى. متبقي ', dynBanner1Sub2: ' على الجاهزية التامة',
    dynBanner1Badge: 'مرحلة 2', dynBanner0Title: 'المرحلة الأولى نشطة',
    dynBanner0Sub: 'المراجعة الأولى بعد ', dynBanner0Badge: 'مرحلة 1',
    histTagDone: 'جاهز بالكامل ✓', histTagStage2: 'مرحلة 2 ⚡', histTagStage1: 'مرحلة 1',
    histDepositPfx: 'إيداع: ', histRev1Pfx: 'مراجعة 1: ', histRev2Pfx: 'مراجعة 2: ',
    histRemReady: '⏱ متبقي للجاهزية: ', histFullReady: '✓ جاهز بالكامل',
    durDay: 'يوم', durHour: 'ساعة', durMin: 'دقيقة', durSec: 'ثانية', durAnd: ' و ',
    toastEnterDate: '⚠️ الرجاء إدخال التاريخ أولاً',
    toastBadUTC: '❌ تنسيق غير صحيح — مثال: 2026-05-26 11:36:42 (UTC+0)',
    toastBadGmail: '❌ تنسيق غير صحيح — مثال: May 26, 2026, 2:36 PM',
    toastPickDate: '⚠️ الرجاء اختيار التاريخ والوقت',
    toastFuture: '⚠️ التاريخ يبدو بعيداً جداً في المستقبل، تحقق من الإدخال',
    toastClearConfirm: 'هل تريد مسح جميع السجلات؟',
    modeCalc: 'الحاسبة السريعة', modeMgr: 'مدير الحسابات',
    btnAddAccount: 'إضافة حساب جديد', formTitleAdd: 'حساب جديد', formTitleEdit: 'تعديل الحساب',
    formSubtitle: 'أدخل تفاصيل حساب Bybit لحفظه وتتبعه',
    fieldUID: 'Bybit UID', fieldEmail: 'البريد الإلكتروني', fieldIP: 'عنوان IP',
    fieldAmount: 'كمية الإيداع ($)', fieldTime: 'وقت الإيداع', btnNow: 'الآن',
    fieldNotes: 'ملاحظات (اختياري)', btnSave: 'حفظ الحساب', btnCancel: 'إلغاء',
    toastFillRequired: '⚠️ يُرجى تحديد تاريخ ووقت الإيداع على الأقل!',
    toastClearAcctConfirm: 'هل تريد حذف هذا الحساب نهائياً؟',
    toastSaved: '✅ تم حفظ الحساب بنجاح', toastUpdated: '✅ تم تعديل الحساب',
    cardStage1: 'مرحلة 1: مراجعة (4 أيام)', cardStage1Done: 'مرحلة 1: جاهز للمهمات ✓',
    cardStage2: 'مرحلة 2: انتظار (4 أيام)', cardStage2Done: 'مكتمل وجاهز بالكامل ✓',
    cardEmail: 'البريد:', cardIP: 'الـ IP:', cardAmount: 'الإيداع:', cardNotes: 'ملاحظات:',
    cardBtnStage2: 'إتمام المهمة وبدء المرحلة 2 ⚡',
    cardTimeRemaining: 'متبقي: ', cardTimeOverdue: 'تجاوز منذ: ',
    cardCreated: 'تاريخ البدء: ', cardStage2Started: 'تحديث المرحلة 2: ',
    searchPlaceholder: 'بحث بالـ UID أو البريد الإلكتروني...',
    btnExport: 'تصدير النسخة الاحتياطية', btnImport: 'استعادة النسخة الاحتياطية',
    toastExportOk: '✅ تم تصدير البيانات بنجاح', toastImportOk: '✅ تم استيراد البيانات بنجاح',
    toastImportErr: '❌ خطأ في الملف — تأكد من صحة ملف JSON',
    toastImportEmpty: '⚠️ الملف لا يحتوي على بيانات صالحة', toastCopied: '📋 تم النسخ',
    toastNoDataExport: '⚠️ لا توجد بيانات للتصدير',
    btnNotif: '🔔 تفعيل الإشعارات', btnNotifOn: '🔔 الإشعارات مفعلة', btnNotifDenied: '🔕 الإشعارات محجوبة',
    notifStage1Title: 'انتهت المرحلة 1 ✓', notifStage1Body: 'الحساب جاهز للمهمات — UID: ',
    notifStage2Title: 'الحساب مكتمل بالكامل 🎉', notifStage2Body: 'تمت المرحلة 2 بنجاح — UID: ',
    toastNotifSupport: '⚠️ المتصفح لا يدعم الإشعارات',
    filterAll: 'الكل', filterStage1: 'المرحلة 1', filterStage2: 'المرحلة 2', filterDone: 'مكتمل',
    sortNewest: 'الأحدث أولاً', sortOldest: 'الأقدم أولاً', sortSoonest: 'الأقرب للانتهاء',
    dashTotal: 'إجمالي الحسابات', dashStage1: 'في المرحلة 1', dashStage2: 'في المرحلة 2',
    dashDone: 'مكتملة', dashDeposits: 'إجمالي الإيداعات', dashExpiringSoon: 'تنتهي اليوم',
    auditLog: 'سجل التغييرات', auditCreated: '🆕 تم إنشاء الحساب',
    auditEdited: '✏️ تم تعديل الحساب', auditStage2: '⚡ بدأت المرحلة 2',
    auditHide: 'إخفاء السجل', auditShow: 'عرض السجل',
    idbRestored: '💾 تم استعادة البيانات من النسخة الاحتياطية',
    ipConflictBadge: '⚠️ IP مكرر', ipConflictTip: 'هذا الـ IP مستخدم في حسابات أخرى — خطر ربط الحسابات!',
    btnIntegrity: '🔍 فحص سلامة البيانات',
    integrityOk: '✅ البيانات سليمة — localStorage وIndexedDB متطابقان',
    integrityMismatch: '⚠️ تحذير: يوجد اختلاف بين localStorage وIndexedDB!',
    integrityNoIDB: '⚠️ IndexedDB غير متاح', integrityChecking: '🔄 جاري الفحص...',
    integrityPanelTitle: '📊 تقرير سلامة البيانات',
    integrityLS: 'localStorage', integrityIDB: 'IndexedDB',
    integrityTotalAccounts: 'إجمالي الحسابات',
    integritySyncToIDB: '🔄 مزامنة إلى IndexedDB', integrityRestoreFromIDB: '💾 استعادة من IndexedDB',
    integritySyncOk: '✅ تمت المزامنة بنجاح — {n} حساب',
    integrityRestored: '✅ تمت الاستعادة بنجاح — {n} حساب',
    integrityClose: 'إغلاق', integritySyncing: 'جاري المزامنة...', integrityRestoring: 'جاري الاستعادة...',
    integrityAutoFixed: '🔧 تم الإصلاح التلقائي',
  },
  en: {
    themeLight: 'Light Mode', themeDark: 'Dark Mode', themeToggle: 'Toggle Appearance',
    timelineTitle: 'Accounts Timeline', timelineHide: 'Hide', timelineShow: 'Show',
    legendStage1: 'Stage 1 (4 days)', legendStage2: 'Stage 2 (4 days)', legendDone: 'Completed',
    timelineToday: 'Today', timelineNoAccounts: 'No accounts yet',
    bulkSelected: 'selected', bulkDelete: '🗑️ Delete Selected', bulkExport: '📤 Export Selected',
    bulkExportCSV: '📊 Export CSV', bulkSelectAll: '☑️ Select All', bulkDeselect: '☐ Deselect All',
    bulkModeBtn: 'Multi-Select Mode', bulkExitMode: 'Exit Selection',
    bulkDeleteConfirm: 'Delete {n} selected account(s)?', bulkExportOk: '✅ Exported {n} accounts successfully',
    csvFilename: 'waqtak_export_{date}.csv',
    csvHeaders: 'UID,Email,IP,Deposit ($),Status,Stage 1,Stage 2,Notes',
    csvStage1: 'Stage 1', csvStage2: 'Stage 2', csvDone: 'Completed',
    toastThemeLight: '☀️ Switched to Light Mode', toastThemeDark: '🌙 Switched to Dark Mode',
    pwaInstallTitle: '📱 Install Waqtak!',
    logoMain: 'Waqtak', logoSub: 'Bybit Account Tracker',
    clockLabel: 'Universal Time (UTC)', langToggleText: 'عربي',
    heroBadge: 'Deposit & Activity Tracking',
    heroTitle: 'Track Your Account<br/>Milestones Step by Step',
    heroDesc: 'Enter the deposit date from your Gmail message and the tool will automatically calculate the review after <strong>4 days</strong> and readiness after <strong>8 days</strong>',
    inputCardTitle: 'Enter Deposit Date', inputCardSubtitle: 'Paste the date from your Gmail message or enter it manually',
    tabUTC: 'UTC Format', tabGmail: 'Gmail Format', tabManual: 'Manual',
    labelUTC: 'UTC format — Example: <code>2026-05-26 11:36:42 (UTC+0)</code>',
    labelGmail: 'Gmail format — Example: <code>May 26, 2026, 2:36 PM</code>',
    labelManual: 'Choose deposit date & time (Egypt Time)',
    gmailNote: "Gmail shows your account's local timezone — automatically adjusted to UTC",
    btnCalculate: 'Calculate Now', exampleLabel: 'Quick examples:', exampleUTC: 'UTC Example', exampleGmail: 'Gmail Example',
    progressLabel: 'Complete', depositLabel: 'Deposit Date (Egypt Time)',
    milestone1Label: 'First Review — After 4 Days (Egypt Time)',
    milestone2Label: 'Second Review & Readiness — After 8 Days (Egypt Time)',
    statElapsedLabel: 'Time Since Deposit', statActiveLabel: 'Active Target',
    statStage1Label: 'Stage 1 (4 Days)', statStage2Label: 'Stage 2 (8 Days)',
    countdownTitle: 'Precise Countdown',
    cdDays: 'Days', cdHours: 'Hours', cdMins: 'Minutes', cdSecs: 'Seconds',
    btnReset: 'Enter New Date',
    historySectionTitle: 'Saved Accounts', btnClearHistory: 'Clear All',
    historyEmpty: 'No saved accounts yet',
    footerText: 'Waqtak — Bybit Account Tracker • All data stored locally on your device',
    dynReady: 'Fully Ready ✓', dynStage2Rem: 'Stage 2: ', dynStage1Rem: 'Stage 1: ',
    dynDone: 'Done ✓', dynRemaining: '', dynWaiting: 'Waiting...',
    dynBanner2Title: 'Account Fully Ready!', dynBanner2Sub: 'The 8-day period completed ',
    dynBanner2Badge: 'Ready', dynBanner1Title: 'Stage 2 Active',
    dynBanner1Sub1: 'First review done. ', dynBanner1Sub2: ' remaining until full readiness',
    dynBanner1Badge: 'Stage 2', dynBanner0Title: 'Stage 1 Active',
    dynBanner0Sub: 'First review in ', dynBanner0Badge: 'Stage 1',
    histTagDone: 'Fully Ready ✓', histTagStage2: 'Stage 2 ⚡', histTagStage1: 'Stage 1',
    histDepositPfx: 'Deposit: ', histRev1Pfx: 'Review 1: ', histRev2Pfx: 'Review 2: ',
    histRemReady: '⏱ Ready in: ', histFullReady: '✓ Fully Ready',
    durDay: 'day', durHour: 'hr', durMin: 'min', durSec: 'sec', durAnd: ' ',
    toastEnterDate: '⚠️ Please enter a date first',
    toastBadUTC: '❌ Invalid format — Example: 2026-05-26 11:36:42 (UTC+0)',
    toastBadGmail: '❌ Invalid format — Example: May 26, 2026, 2:36 PM',
    toastPickDate: '⚠️ Please pick a date and time',
    toastFuture: '⚠️ Date seems too far in the future, please check your input',
    toastClearConfirm: 'Delete all saved records?',
    modeCalc: 'Quick Calculator', modeMgr: 'Account Manager',
    btnAddAccount: 'Add New Account', formTitleAdd: 'New Account', formTitleEdit: 'Edit Account',
    formSubtitle: 'Enter Bybit account details to save and track',
    fieldUID: 'Bybit UID', fieldEmail: 'Email Address', fieldIP: 'IP Address',
    fieldAmount: 'Deposit Amount ($)', fieldTime: 'Deposit Time', btnNow: 'Now',
    fieldNotes: 'Notes (Optional)', btnSave: 'Save Account', btnCancel: 'Cancel',
    toastFillRequired: '⚠️ Please specify at least the deposit date and time!',
    toastClearAcctConfirm: 'Are you sure you want to delete this account permanently?',
    toastSaved: '✅ Account saved successfully', toastUpdated: '✅ Account updated',
    cardStage1: 'Stage 1: Review (4 days)', cardStage1Done: 'Stage 1: Ready for tasks ✓',
    cardStage2: 'Stage 2: Pending (4 days)', cardStage2Done: 'Fully Completed & Ready ✓',
    cardEmail: 'Email:', cardIP: 'IP:', cardAmount: 'Deposit:', cardNotes: 'Notes:',
    cardBtnStage2: 'Complete tasks & start Stage 2 ⚡',
    cardTimeRemaining: 'Remaining: ', cardTimeOverdue: 'Overdue by: ',
    cardCreated: 'Start Date: ', cardStage2Started: 'Stage 2 Update: ',
    searchPlaceholder: 'Search by UID or Email...',
    btnExport: 'Export Backup', btnImport: 'Restore Backup',
    toastExportOk: '✅ Data exported successfully', toastImportOk: '✅ Data imported successfully',
    toastImportErr: '❌ File error — make sure it is a valid JSON file',
    toastImportEmpty: '⚠️ File contains no valid data', toastCopied: '📋 Copied!',
    toastNoDataExport: '⚠️ No data to export',
    btnNotif: '🔔 Enable Notifications', btnNotifOn: '🔔 Notifications On', btnNotifDenied: '🔕 Notifications Blocked',
    notifStage1Title: 'Stage 1 Complete ✓', notifStage1Body: 'Account ready for tasks — UID: ',
    notifStage2Title: 'Account Fully Complete 🎉', notifStage2Body: 'Stage 2 finished successfully — UID: ',
    toastNotifSupport: '⚠️ Browser does not support notifications',
    filterAll: 'All', filterStage1: 'Stage 1', filterStage2: 'Stage 2', filterDone: 'Completed',
    sortNewest: 'Newest First', sortOldest: 'Oldest First', sortSoonest: 'Expiring Soon',
    dashTotal: 'Total Accounts', dashStage1: 'In Stage 1', dashStage2: 'In Stage 2',
    dashDone: 'Completed', dashDeposits: 'Total Deposits', dashExpiringSoon: 'Expiring Today',
    auditLog: 'Change Log', auditCreated: '🆕 Account Created',
    auditEdited: '✏️ Account Edited', auditStage2: '⚡ Stage 2 Started',
    auditHide: 'Hide Log', auditShow: 'View Log',
    idbRestored: '💾 Data restored from backup storage',
    ipConflictBadge: '⚠️ Duplicate IP', ipConflictTip: 'This IP is used by other accounts — risk of account linking!',
    btnIntegrity: '🔍 Data Integrity Check',
    integrityOk: '✅ Data intact — localStorage and IndexedDB match',
    integrityMismatch: '⚠️ Warning: Mismatch between localStorage and IndexedDB!',
    integrityNoIDB: '⚠️ IndexedDB not available', integrityChecking: '🔄 Checking...',
    integrityPanelTitle: '📊 Data Integrity Report',
    integrityLS: 'localStorage', integrityIDB: 'IndexedDB',
    integrityTotalAccounts: 'Total Accounts',
    integritySyncToIDB: '🔄 Sync to IndexedDB', integrityRestoreFromIDB: '💾 Restore from IndexedDB',
    integritySyncOk: '✅ Synced — {n} accounts', integrityRestored: '✅ Restored — {n} accounts',
    integrityClose: 'Close', integritySyncing: 'Syncing...', integrityRestoring: 'Restoring...',
    integrityAutoFixed: '🔧 Auto-fixed',
  }
};

// ─── Translation Helper ───────────────────────────────────────────────────────
function t(key) {
  return (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key]) || key;
}

// ─── Toast Notifications ──────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, duration = 3000) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ─── Theme ───────────────────────────────────────────────────────────────────
let currentTheme = localStorage.getItem('waqtak_theme') || 'dark';

function applyTheme(theme) {
  currentTheme = theme;
  localStorage.setItem('waqtak_theme', theme);
  const isDark = theme === 'dark';
  document.documentElement.classList.toggle('dark-theme', isDark);
  document.documentElement.classList.toggle('light-theme', !isDark);
  const moonIcon = document.getElementById('theme-icon-moon');
  const sunIcon  = document.getElementById('theme-icon-sun');
  if (moonIcon) moonIcon.style.display = isDark ? 'block' : 'none';
  if (sunIcon)  sunIcon.style.display  = isDark ? 'none' : 'block';
}

function toggleTheme() {
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  showToast(currentTheme === 'dark' ? t('toastThemeDark') : t('toastThemeLight'));
}

// Apply saved theme on load
(function initTheme() {
  applyTheme(localStorage.getItem('waqtak_theme') || 'dark');
})();

// ─── Language ─────────────────────────────────────────────────────────────────
function applyLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('waqtak_lang', lang);
  const isAr = lang === 'ar';
  document.documentElement.lang = lang;
  document.documentElement.dir  = isAr ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (TRANSLATIONS[lang] && TRANSLATIONS[lang][key] !== undefined) {
      el.innerHTML = TRANSLATIONS[lang][key];
    }
  });
  // Update search placeholder
  const search = document.getElementById('mgr-search');
  if (search) search.placeholder = t('searchPlaceholder');
}

function toggleLanguage() {
  applyLanguage(currentLang === 'ar' ? 'en' : 'ar');
  if (currentMode === 'manager') { renderAccounts(); renderDashboard(); }
  renderHistory();
}

// Apply saved language on load (called after DOM ready)
function initLanguage() {
  applyLanguage(localStorage.getItem('waqtak_lang') || 'ar');
}

// ─── Live Clock ───────────────────────────────────────────────────────────────
function startClock() {
  function tick() {
    const el = document.getElementById('live-clock');
    if (!el) return;
    const now = new Date();
    const hh = String(now.getUTCHours()).padStart(2, '0');
    const mm = String(now.getUTCMinutes()).padStart(2, '0');
    const ss = String(now.getUTCSeconds()).padStart(2, '0');
    el.textContent = `${hh}:${mm}:${ss}`;
  }
  tick();
  setInterval(tick, 1000);
}

// ─── Particles ───────────────────────────────────────────────────────────────
function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return; // Safe guard — don't crash if element is missing
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let W, H, particles = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < 60; i++) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.5 + 0.3,
      dx: (Math.random() - 0.5) * 0.3,
      dy: (Math.random() - 0.5) * 0.3,
      o: Math.random() * 0.4 + 0.1
    });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(247,166,0,${p.o})`;
      ctx.fill();
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0 || p.x > W) p.dx *= -1;
      if (p.y < 0 || p.y > H) p.dy *= -1;
    });
    requestAnimationFrame(draw);
  }
  draw();
}

// ─── Mode Switcher ────────────────────────────────────────────────────────────
function switchMode(mode) {
  currentMode = mode;
  const calcContainer = document.getElementById('mode-calculator-container');
  const mgrContainer  = document.getElementById('mode-manager-container');
  const calcBtn = document.getElementById('mode-calc-btn');
  const mgrBtn  = document.getElementById('mode-mgr-btn');

  if (mode === 'calculator') {
    if (calcContainer) calcContainer.style.display = '';
    if (mgrContainer)  mgrContainer.style.display  = 'none';
    if (calcBtn) calcBtn.classList.add('active');
    if (mgrBtn)  mgrBtn.classList.remove('active');
    if (accountsInterval) { clearInterval(accountsInterval); accountsInterval = null; }
  } else {
    if (calcContainer) calcContainer.style.display = 'none';
    if (mgrContainer)  mgrContainer.style.display  = '';
    if (calcBtn) calcBtn.classList.remove('active');
    if (mgrBtn)  mgrBtn.classList.add('active');
    renderAccounts();
    renderDashboard();
    accountsInterval = setInterval(() => { renderAccounts(); renderDashboard(); }, 60000);
  }
}

// ─── Tab Switcher ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  ['utc', 'gmail', 'manual'].forEach(id => {
    const btn = document.getElementById(`tab-${id}`);
    const content = document.getElementById(`content-${id}`);
    const isActive = id === tab;
    if (btn) btn.classList.toggle('active', isActive);
    if (content) content.classList.toggle('active', isActive);
  });
}

// ─── Date Parsing Utilities ───────────────────────────────────────────────────

// ── Egypt timezone helpers (Intl-based, handles DST correctly) ──
function getEgyptDateTimeParts(date) {
  // Returns {datePart: 'YYYY-MM-DD', timePart: 'HH:MM'} in Egypt local time
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: EGYPT_TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
    const parts = {};
    fmt.formatToParts(date).forEach(p => { if (p.type !== 'literal') parts[p.type] = p.value; });
    const hh = parts.hour === '24' ? '00' : parts.hour;
    return { datePart: `${parts.year}-${parts.month}-${parts.day}`, timePart: `${hh}:${parts.minute}` };
  } catch {
    // Fallback: assume UTC+3 offset
    const local = new Date(date.getTime() + 3 * 3600000);
    const pad = n => String(n).padStart(2, '0');
    return {
      datePart: `${local.getUTCFullYear()}-${pad(local.getUTCMonth()+1)}-${pad(local.getUTCDate())}`,
      timePart: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`
    };
  }
}

function parseEgyptLocalToUTC(yr, mo, dy, hh, mi) {
  // Convert Egypt local datetime to UTC using Intl (handles DST)
  // Strategy: binary-search the actual Egypt offset for this instant
  const approxMs = Date.UTC(yr, mo - 1, dy, hh, mi);
  function egOffset(ms) {
    const d = new Date(ms);
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: EGYPT_TZ, year:'numeric', month:'numeric', day:'numeric',
      hour:'numeric', minute:'numeric', second:'numeric', hour12: false
    });
    const p = {};
    fmt.formatToParts(d).forEach(x => { if (x.type !== 'literal') p[x.type] = Number(x.value); });
    const localMs = Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second);
    return localMs - ms;
  }
  const offset = egOffset(approxMs);
  return new Date(approxMs - offset);
}

function parseUTCFormat(str) {

  // "2026-05-26 11:36:42 (UTC+0)"
  const m = str.trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s*\(UTC([+-]\d+)\)$/i);
  if (!m) return null;
  const offset = parseInt(m[7], 10) * 3600000;
  return new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6]) - offset);
}

function parseGmailFormat(str) {
  // "May 26, 2026, 2:36 PM" — treated as Egypt local (UTC+3 in summer)
  const months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
  const m = str.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2}):(\d{2})\s+(AM|PM)$/i);
  if (!m) return null;
  const mon = months[m[1].toLowerCase().slice(0,3)];
  if (mon === undefined) return null;
  let h = parseInt(m[4],10);
  if (m[6].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (m[6].toUpperCase() === 'AM' && h === 12) h = 0;
  // Egypt is UTC+3 in summer (DST). Treat Gmail as Egypt local → subtract 3h
  return new Date(Date.UTC(+m[3], mon, +m[2], h, +m[5]) - 3*3600000);
}

function formatEgypt(date) {
  if (!date) return '—';
  return date.toLocaleString('ar-EG', { timeZone: EGYPT_TZ, year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

function formatEgyptShort(date) {
  if (!date) return '—';
  return date.toLocaleString('en-GB', { timeZone: EGYPT_TZ, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function formatDuration(ms) {
  if (isNaN(ms) || ms < 0) ms = 0;
  const d = Math.floor(ms / 86400000); ms %= 86400000;
  const h = Math.floor(ms / 3600000);  ms %= 3600000;
  const m = Math.floor(ms / 60000);    ms %= 60000;
  const s = Math.floor(ms / 1000);
  const parts = [];
  if (d > 0) parts.push(`${d} ${t('durDay')}`);
  if (h > 0) parts.push(`${h} ${t('durHour')}`);
  if (m > 0) parts.push(`${m} ${t('durMin')}`);
  if (parts.length === 0) parts.push(`${s} ${t('durSec')}`);
  return parts.slice(0, 2).join(t('durAnd'));
}

// ─── Calculator Core ──────────────────────────────────────────────────────────
function calculate() {
  const tab = currentTab;
  let dep = null;

  if (tab === 'utc') {
    const raw = (document.getElementById('utc-input')?.value || '').trim();
    if (!raw) { showToast(t('toastEnterDate')); return; }
    dep = parseUTCFormat(raw);
    if (!dep) { showToast(t('toastBadUTC')); return; }
  } else if (tab === 'gmail') {
    const raw = (document.getElementById('gmail-input')?.value || '').trim();
    if (!raw) { showToast(t('toastEnterDate')); return; }
    dep = parseGmailFormat(raw);
    if (!dep) { showToast(t('toastBadGmail')); return; }
  } else {
    const dateVal = document.getElementById('manual-date')?.value;
    const timeVal = document.getElementById('manual-time')?.value || '00:00';
    if (!dateVal) { showToast(t('toastPickDate')); return; }
    const [yr, mo, dy] = dateVal.split('-').map(Number);
    const [hh, mi] = timeVal.split(':').map(Number);
    dep = parseEgyptLocalToUTC(yr, mo, dy, hh, mi);
  }

  if (!dep || isNaN(dep.getTime())) { showToast(t('toastBadUTC')); return; }
  if (dep.getTime() > Date.now() + 7 * 86400000) { showToast(t('toastFuture')); return; }

  depositUTC = dep;
  target1UTC = new Date(dep.getTime() + 4 * 86400000);
  target2UTC = new Date(dep.getTime() + 8 * 86400000);

  showResults();
  saveToHistory(dep, target1UTC, target2UTC);
}

function showResults() {
  const resultsSection = document.getElementById('results-section');
  const inputSection   = document.getElementById('input-section');
  if (resultsSection) resultsSection.style.display = '';
  if (inputSection)   inputSection.style.display   = 'none';

  document.getElementById('deposit-display').textContent  = formatEgypt(depositUTC);
  document.getElementById('target1-display').textContent  = formatEgypt(target1UTC);
  document.getElementById('target2-display').textContent  = formatEgypt(target2UTC);

  updateProgress();
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(updateProgress, 1000);
}

function updateProgress() {
  if (!depositUTC) return;
  const now  = Date.now();
  const dep  = depositUTC.getTime();
  const t1   = target1UTC.getTime();
  const t2   = target2UTC.getTime();
  const total = t2 - dep;
  const elapsed = now - dep;
  const pct = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));

  // Progress ring
  const ring = document.getElementById('ring-fill');
  if (ring) {
    const circ = 2 * Math.PI * 85;
    ring.style.strokeDashoffset = circ - (circ * pct / 100);
  }
  const pctEl = document.getElementById('progress-percent');
  if (pctEl) pctEl.textContent = `${pct}%`;

  // Stats
  const elapsedEl = document.getElementById('elapsed-display');
  if (elapsedEl) elapsedEl.textContent = formatDuration(elapsed > 0 ? elapsed : 0);

  let statusTitle, statusSub, statusBadge;
  if (now >= t2) {
    statusTitle = t('dynBanner2Title');
    statusSub   = t('dynBanner2Sub') + formatDuration(now - t2);
    statusBadge = t('dynBanner2Badge');
    const rem = document.getElementById('remaining-display');
    if (rem) rem.textContent = t('dynReady');
  } else if (now >= t1) {
    const rem2 = formatDuration(t2 - now);
    statusTitle = t('dynBanner1Title');
    statusSub   = t('dynBanner1Sub1') + rem2 + t('dynBanner1Sub2');
    statusBadge = t('dynBanner1Badge');
    const rem = document.getElementById('remaining-display');
    if (rem) rem.textContent = t('dynStage2Rem') + rem2;
  } else {
    const rem1 = formatDuration(t1 - now);
    statusTitle = t('dynBanner0Title');
    statusSub   = t('dynBanner0Sub') + rem1;
    statusBadge = t('dynBanner0Badge');
    const rem = document.getElementById('remaining-display');
    if (rem) rem.textContent = t('dynStage1Rem') + rem1;
  }

  document.getElementById('status-title')?.setAttribute('textContent', statusTitle);
  const stEl = document.getElementById('status-title');
  if (stEl) stEl.textContent = statusTitle;
  const ssEl = document.getElementById('status-subtitle');
  if (ssEl) ssEl.textContent = statusSub;
  const sbEl = document.getElementById('status-badge');
  if (sbEl) sbEl.textContent = statusBadge;

  // Countdown to active target
  const target = now < t1 ? t1 : t2;
  const diff   = Math.max(0, target - now);
  const ds = Math.floor(diff / 86400000);
  const hs = Math.floor((diff % 86400000) / 3600000);
  const ms = Math.floor((diff % 3600000) / 60000);
  const ss = Math.floor((diff % 60000) / 1000);

  const pad = n => String(n).padStart(2, '0');
  ['cd-days','cd-hours','cd-mins','cd-secs'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.textContent = pad([ds,hs,ms,ss][i]);
  });

  const d1El = document.getElementById('days-elapsed-display');
  const d2El = document.getElementById('days-remaining-display');
  if (d1El) d1El.textContent = formatDuration(Math.min(elapsed, t1 - dep));
  if (d2El) d2El.textContent = formatDuration(Math.max(0, t2 - now));
}

function resetAll() {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  depositUTC = target1UTC = target2UTC = null;
  const resultsSection = document.getElementById('results-section');
  const inputSection   = document.getElementById('input-section');
  if (resultsSection) resultsSection.style.display = 'none';
  if (inputSection)   inputSection.style.display   = '';
  ['utc-input','gmail-input'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

// ─── Quick Examples ───────────────────────────────────────────────────────────
function fillExample(tab, val) {
  switchTab(tab);
  const elId = tab === 'utc' ? 'utc-input' : 'gmail-input';
  const el = document.getElementById(elId);
  if (el) el.value = val;
}

// ─── Clipboard ───────────────────────────────────────────────────────────────
function pasteFromClipboard(inputId) {
  navigator.clipboard.readText().then(text => {
    const el = document.getElementById(inputId);
    if (el) el.value = text.trim();
  }).catch(() => {});
}

// ─── History (Calculator) ────────────────────────────────────────────────────
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveToHistory(dep, t1, t2) {
  const history = loadHistory();
  const entry = {
    id: Date.now(),
    depositISO: dep.toISOString(),
    t1ISO: t1.toISOString(),
    t2ISO: t2.toISOString(),
  };
  history.unshift(entry);
  if (history.length > 50) history.length = 50;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById('history-list');
  const emptyEl = document.getElementById('history-empty');
  const clearBtn = document.getElementById('clear-history-btn');
  if (!list) return;

  const history = loadHistory();
  if (history.length === 0) {
    if (emptyEl) emptyEl.style.display = '';
    if (clearBtn) clearBtn.style.display = 'none';
    list.querySelectorAll('.history-item').forEach(el => el.remove());
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  if (clearBtn) clearBtn.style.display = '';

  const now = Date.now();
  list.querySelectorAll('.history-item').forEach(el => el.remove());

  history.forEach(entry => {
    const dep = new Date(entry.depositISO);
    const t1  = new Date(entry.t1ISO);
    const t2  = new Date(entry.t2ISO);
    const done = now >= t2.getTime();
    const stage2 = !done && now >= t1.getTime();
    const tag = done ? t('histTagDone') : stage2 ? t('histTagStage2') : t('histTagStage1');
    const tagClass = done ? 'done' : stage2 ? 'stage2' : 'stage1';
    const remText = done
      ? `<span class="hist-ready">${t('histFullReady')}</span>`
      : `<span>${t('histRemReady')}${formatDuration(t2.getTime() - now)}</span>`;

    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <div class="hist-tag ${tagClass}">${tag}</div>
      <div class="hist-dates">
        <div>${t('histDepositPfx')}${formatEgypt(dep)}</div>
        <div>${t('histRev1Pfx')}${formatEgypt(t1)}</div>
        <div>${t('histRev2Pfx')}${formatEgypt(t2)}</div>
      </div>
      <div class="hist-rem">${remText}</div>
      <button class="hist-delete-btn" onclick="deleteHistoryEntry(${entry.id})" title="حذف">×</button>
    `;
    list.appendChild(item);
  });
}

function deleteHistoryEntry(id) {
  const history = loadHistory().filter(e => e.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  renderHistory();
}

function clearHistory() {
  if (!confirm(t('toastClearConfirm'))) return;
  localStorage.removeItem(STORAGE_KEY);
  renderHistory();
}

// ─── IndexedDB ────────────────────────────────────────────────────────────────
function initIndexedDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { resolve(null); return; }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => { idb = e.target.result; resolve(idb); };
    req.onerror   = (e) => { console.warn('IDB error:', e.target.error); resolve(null); };
  });
}

function idbSave(data) {
  if (!idb) return;
  try {
    const tx  = idb.transaction(IDB_STORE, 'readwrite');
    const str = tx.objectStore(IDB_STORE);
    str.clear();
    data.forEach(item => str.put({ key: item.id, data: JSON.stringify(item) }));
  } catch (e) { console.warn('IDB save error:', e); }
}

function idbLoad() {
  return new Promise((resolve) => {
    if (!idb) { resolve([]); return; }
    try {
      const tx  = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = () => {
        const raw = (req.result || []).map(r => {
          if (!r.data) return null;
          if (typeof r.data === 'string') {
            try { return JSON.parse(r.data); } catch { return null; }
          }
          return r.data; // Already an object
        }).filter(Boolean);
        // Apply migration (same as localStorage) to fix any bad data
        resolve(raw.map(migrateAccount).filter(Boolean));
      };
      req.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
}


// ─── Account Storage ──────────────────────────────────────────────────────────
function saveAccounts() {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  idbSave(accounts);
}

function migrateAccount(a) {
  // Ensure every account has a valid depositTime ISO string
  if (!a || typeof a !== 'object') return null;
  if (!a.depositTime || isNaN(new Date(a.depositTime).getTime())) {
    // Try legacy field names that may have been stored
    const candidates = [a.created, a.date, a.timestamp, a.time];
    let found = null;
    for (const c of candidates) {
      if (c) {
        const d = new Date(c);
        if (!isNaN(d.getTime())) { found = d.toISOString(); break; }
        // Could be numeric ms
        const ms = Number(c);
        if (!isNaN(ms) && ms > 1e12) { found = new Date(ms).toISOString(); break; }
      }
    }
    a.depositTime = found || new Date().toISOString();
  }
  if (!a.id) a.id = Date.now() + Math.random();
  if (!a.stage) a.stage = 1;
  if (a.stage2StartTime && isNaN(new Date(a.stage2StartTime).getTime())) {
    a.stage2StartTime = null;
  }
  return a;
}

function loadAccountsFromStorage() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(migrateAccount).filter(Boolean) : [];
  } catch { return []; }
}


// ─── IP Conflict Detection ────────────────────────────────────────────────────
function findIPConflicts() {
  const ipMap = {};
  accounts.forEach(a => {
    if (!a.ip) return;
    const key = a.ip.trim();
    if (!ipMap[key]) ipMap[key] = [];
    ipMap[key].push(a.id);
  });
  const conflictIds = new Set();
  Object.values(ipMap).forEach(ids => {
    if (ids.length > 1) ids.forEach(id => conflictIds.add(id));
  });
  return conflictIds;
}

// ─── Account Status Helper ────────────────────────────────────────────────────
function getAccountStatus(acc) {
  const now = Date.now();
  const dep = new Date(acc.depositTime).getTime();
  if (isNaN(dep)) return 'stage1'; // Fallback for invalid dates
  const s1End = dep + 4 * 86400000;
  const s2Start = acc.stage2StartTime ? new Date(acc.stage2StartTime).getTime() : s1End;
  const s2End   = s2Start + 4 * 86400000;

  if (acc.stage === 2 && now >= s2End) return 'done';
  if (acc.stage === 2) return 'stage2';
  if (now >= s1End) return 'stage1_done'; // passed stage1 but not moved to stage2
  return 'stage1';
}

function getTimeInfo(acc) {
  const now = Date.now();
  const dep = new Date(acc.depositTime).getTime();
  if (isNaN(dep)) {
    return { label: t('cardTimeRemaining'), time: '—', class: 'stage1' };
  }
  const s1End = dep + 4 * 86400000;
  const s2Start = acc.stage2StartTime ? new Date(acc.stage2StartTime).getTime() : s1End;
  const s2End   = s2Start + 4 * 86400000;
  const status  = getAccountStatus(acc);

  if (status === 'done') {
    return { label: t('cardTimeOverdue'), time: formatDuration(now - s2End), class: 'done' };
  } else if (status === 'stage2') {
    const rem = s2End - now;
    return rem > 0
      ? { label: t('cardTimeRemaining'), time: formatDuration(rem), class: 'stage2' }
      : { label: t('cardTimeOverdue'),   time: formatDuration(now - s2End), class: 'overdue' };
  } else if (status === 'stage1_done') {
    return { label: t('cardTimeOverdue'), time: formatDuration(now - s1End), class: 'overdue' };
  } else {
    const rem = s1End - now;
    return rem > 0
      ? { label: t('cardTimeRemaining'), time: formatDuration(rem), class: 'stage1' }
      : { label: t('cardTimeOverdue'),   time: formatDuration(now - s1End), class: 'overdue' };
  }
}

// ─── Render Accounts ──────────────────────────────────────────────────────────
function renderAccounts() {
  const grid = document.getElementById('accounts-grid');
  if (!grid) return;

  const searchVal = (document.getElementById('mgr-search')?.value || '').toLowerCase();
  const ipConflicts = findIPConflicts();

  let filtered = accounts.filter(a => {
    const status = getAccountStatus(a);
    if (filterStatus === 'stage1' && status !== 'stage1' && status !== 'stage1_done') return false;
    if (filterStatus === 'stage2' && status !== 'stage2') return false;
    if (filterStatus === 'done'   && status !== 'done')   return false;
    if (searchVal) {
      const uid   = (a.uid   || '').toLowerCase();
      const email = (a.email || '').toLowerCase();
      if (!uid.includes(searchVal) && !email.includes(searchVal)) return false;
    }
    return true;
  });

  // Sort
  filtered.sort((a, b) => {
    if (sortBy === 'oldest') return new Date(a.depositTime) - new Date(b.depositTime);
    if (sortBy === 'soonest') {
      const ta = getTimeInfo(a), tb = getTimeInfo(b);
      return ta.time.localeCompare(tb.time);
    }
    return new Date(b.depositTime) - new Date(a.depositTime);
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="accounts-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg><p>${searchVal ? (currentLang === 'ar' ? 'لا توجد حسابات مطابقة' : 'No matching accounts found') : t('historyEmpty')}</p></div>`;
    return;
  }

  grid.innerHTML = filtered.map(acc => {
    const status = getAccountStatus(acc);
    const timeInfo = getTimeInfo(acc);
    const isConflict = ipConflicts.has(acc.id);
    const isSelected = selectedIds.has(acc.id);

    const dep = new Date(acc.depositTime);
    const s1End = new Date(dep.getTime() + 4 * 86400000);

    let stageLabel, stageBadgeClass;
    if (status === 'done') {
      stageLabel = t('cardStage2Done'); stageBadgeClass = 'badge-done';
    } else if (status === 'stage2') {
      stageLabel = t('cardStage2'); stageBadgeClass = 'badge-stage2';
    } else if (status === 'stage1_done') {
      stageLabel = t('cardStage1Done'); stageBadgeClass = 'badge-stage1-done';
    } else {
      stageLabel = t('cardStage1'); stageBadgeClass = 'badge-stage1';
    }

    const conflictBadge = isConflict
      ? `<span class="ip-conflict-badge" title="${t('ipConflictTip')}">${t('ipConflictBadge')}</span>`
      : '';

    const stage2Btn = (status === 'stage1' || status === 'stage1_done')
      ? `<button class="card-stage2-btn" onclick="markStage2(${acc.id})">${t('cardBtnStage2')}</button>`
      : '';

    const checkboxHtml = bulkMode
      ? `<input type="checkbox" class="account-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleAccountSelect(${acc.id})" />`
      : '';

    return `
      <div class="account-card ${isConflict ? 'ip-conflict-card' : ''} ${isSelected ? 'bulk-selected' : ''}"
           id="account-card-${acc.id}"
           onclick="${bulkMode ? `toggleAccountSelect(${acc.id})` : ''}">
        <div class="account-card-header">
          ${checkboxHtml}
          <div class="card-uid-wrapper">
            <span class="card-uid">${acc.uid ? '#' + acc.uid : '—'}</span>
            ${conflictBadge}
            <span class="card-badge ${stageBadgeClass}">${stageLabel}</span>
          </div>
          <div class="card-actions">
            <button class="card-edit-btn" onclick="event.stopPropagation(); openEditForm(${acc.id})" title="تعديل">✏️</button>
            <button class="card-delete-btn" onclick="event.stopPropagation(); deleteAccount(${acc.id})" title="حذف">🗑️</button>
          </div>
        </div>
        <div class="card-body">
          ${acc.email ? `<div class="card-field"><span class="card-field-label">${t('cardEmail')}</span> <span class="card-field-val">${acc.email}</span></div>` : ''}
          ${acc.ip    ? `<div class="card-field"><span class="card-field-label">${t('cardIP')}</span> <span class="card-field-val">${acc.ip}</span></div>` : ''}
          ${acc.amount? `<div class="card-field"><span class="card-field-label">${t('cardAmount')}</span> <span class="card-field-val">$${acc.amount}</span></div>` : ''}
          <div class="card-field"><span class="card-field-label">${t('cardCreated')}</span> <span class="card-field-val">${formatEgyptShort(dep)}</span></div>
          ${acc.stage2StartTime ? `<div class="card-field"><span class="card-field-label">${t('cardStage2Started')}</span> <span class="card-field-val">${formatEgyptShort(new Date(acc.stage2StartTime))}</span></div>` : ''}
          ${acc.notes ? `<div class="card-field"><span class="card-field-label">${t('cardNotes')}</span> <span class="card-field-val">${acc.notes}</span></div>` : ''}
        </div>
        <div class="card-footer">
          <div class="card-time-info ${timeInfo.class}">
            <span class="card-time-label">${timeInfo.label}</span>
            <span class="card-time-val">${timeInfo.time}</span>
          </div>
          ${stage2Btn}
        </div>
      </div>
    `;
  }).join('');
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────
function renderDashboard() {
  const now = Date.now();
  let stage1 = 0, stage2 = 0, done = 0, deposits = 0, expiring = 0;

  accounts.forEach(a => {
    const status = getAccountStatus(a);
    if (status === 'done') done++;
    else if (status === 'stage2') stage2++;
    else stage1++;
    deposits += parseFloat(a.amount || 0);

    // Expiring today: stage ends within 24h
    const dep = new Date(a.depositTime).getTime();
    const s1End = dep + 4 * 86400000;
    const s2Start = a.stage2StartTime ? new Date(a.stage2StartTime).getTime() : s1End;
    const s2End = s2Start + 4 * 86400000;
    const target = a.stage === 2 ? s2End : s1End;
    if (target > now && target < now + 86400000) expiring++;
  });

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('dash-total',    accounts.length);
  set('dash-stage1',   stage1);
  set('dash-stage2',   stage2);
  set('dash-done',     done);
  set('dash-deposits', '$' + deposits.toFixed(0));
  set('dash-soon',     expiring);

  renderTimeline();
}

// ─── Timeline ─────────────────────────────────────────────────────────────────
let timelineVisible = true;

function toggleTimeline() {
  timelineVisible = !timelineVisible;
  const container = document.getElementById('timeline-container');
  const btn = document.getElementById('timeline-toggle-btn');
  const btnSpan = btn?.querySelector('span');
  if (container) container.style.display = timelineVisible ? 'block' : 'none';
  if (btnSpan) btnSpan.textContent = timelineVisible ? t('timelineHide') : t('timelineShow');
}

function renderTimeline() {
  const container = document.getElementById('timeline-rows');
  if (!container) return;

  if (accounts.length === 0) {
    container.innerHTML = `<div class="timeline-empty">${t('timelineNoAccounts')}</div>`;
    return;
  }

  const now = Date.now();
  const oneDay = 86400000;
  let minTime = now, maxTime = now;

  const validAccounts = accounts.filter(a => {
    const dep = new Date(a.depositTime).getTime();
    return !isNaN(dep);
  });

  if (validAccounts.length === 0) {
    container.innerHTML = `<div class="timeline-empty">${t('timelineNoAccounts')}</div>`;
    return;
  }

  validAccounts.forEach(a => {
    const dep = new Date(a.depositTime).getTime();
    const end = a.stage2StartTime
      ? new Date(a.stage2StartTime).getTime() + 4 * oneDay
      : dep + 8 * oneDay;
    if (dep < minTime) minTime = dep;
    if (end > maxTime) maxTime = end;
  });

  minTime -= oneDay;
  maxTime += oneDay;
  const totalRange = maxTime - minTime || 1;

  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayPct = ((todayStart.getTime() - minTime) / totalRange) * 100;

  let html = `<div class="timeline-scale-wrapper"><div class="timeline-today-marker" style="left:${todayPct}%;"><span class="today-label">${t('timelineToday')}</span></div></div>`;

  validAccounts.slice(0, 20).forEach(a => {
    const depMs    = new Date(a.depositTime).getTime();
    const s1EndMs  = depMs + 4 * oneDay;
    const s2EndMs  = a.stage2StartTime
      ? new Date(a.stage2StartTime).getTime() + 4 * oneDay
      : s1EndMs + 4 * oneDay;

    const left1  = Math.max(0, ((depMs - minTime)   / totalRange) * 100);
    const left2  = Math.max(0, ((s1EndMs - minTime) / totalRange) * 100);
    const left3  = Math.max(0, ((s2EndMs - minTime) / totalRange) * 100);
    const width1 = Math.max(0, left2 - left1);
    const width2 = Math.max(0, left3 - left2);
    const isDone = a.stage === 2 && s2EndMs <= now;

    html += `
      <div class="timeline-row" onclick="focusAccount(${a.id})">
        <div class="timeline-row-label" title="${a.email || ''}">${a.uid ? '#' + a.uid : '#?'}</div>
        <div class="timeline-bar-track">
          <div class="timeline-bar-stage1" style="left:${left1}%;width:${width1}%;" title="Stage 1"></div>
          ${width2 > 0 ? `<div class="timeline-bar-stage2 ${isDone ? 'done' : ''}" style="left:${left2}%;width:${width2}%;" title="Stage 2"></div>` : ''}
        </div>
      </div>`;
  });

  container.innerHTML = html;
}

function focusAccount(id) {
  const card = document.getElementById(`account-card-${id}`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('focused');
    setTimeout(() => card.classList.remove('focused'), 2000);
  }
}

// ─── Account Form ─────────────────────────────────────────────────────────────
function openAddForm() {
  editingId = null;
  const titleEl = document.getElementById('form-card-title');
  if (titleEl) titleEl.textContent = t('formTitleAdd');
  ['field-uid','field-email','field-ip','field-amount','field-date','field-time','field-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const formCard = document.getElementById('account-form-card');
  if (formCard) {
    formCard.style.display = '';
    formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function openEditForm(id) {
  const acc = accounts.find(a => a.id === id);
  if (!acc) return;
  editingId = id;

  const titleEl = document.getElementById('form-card-title');
  if (titleEl) titleEl.textContent = t('formTitleEdit');

  document.getElementById('field-uid').value    = acc.uid    || '';
  document.getElementById('field-email').value  = acc.email  || '';
  document.getElementById('field-ip').value     = acc.ip     || '';
  document.getElementById('field-amount').value = acc.amount || '';
  document.getElementById('field-notes').value  = acc.notes  || '';

  if (acc.depositTime) {
    const d = new Date(acc.depositTime);
    if (!isNaN(d.getTime())) {
      const { datePart, timePart } = getEgyptDateTimeParts(d);
      document.getElementById('field-date').value = datePart;
      document.getElementById('field-time').value = timePart;
    } else {
      document.getElementById('field-date').value = '';
      document.getElementById('field-time').value = '';
    }
  }

  const formCard = document.getElementById('account-form-card');
  if (formCard) {
    formCard.style.display = '';
    formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function closeForm() {
  editingId = null;
  const formCard = document.getElementById('account-form-card');
  if (formCard) formCard.style.display = 'none';
}

function setFormTimeToNow() {
  const { datePart, timePart } = getEgyptDateTimeParts(new Date());
  const dateEl = document.getElementById('field-date');
  const timeEl = document.getElementById('field-time');
  if (dateEl) dateEl.value = datePart;
  if (timeEl) timeEl.value = timePart;
}

function saveAccount() {
  const dateVal = document.getElementById('field-date')?.value;
  const timeVal = document.getElementById('field-time')?.value || '00:00';
  if (!dateVal) { showToast(t('toastFillRequired')); return; }

  // Parse Egypt local time to UTC (Intl-based, handles DST correctly)
  const [yr, mo, dy] = dateVal.split('-').map(Number);
  const [hh, mi] = timeVal.split(':').map(Number);
  const depDate = parseEgyptLocalToUTC(yr, mo, dy, hh, mi);

  const uid    = document.getElementById('field-uid')?.value.trim()    || '';
  const email  = document.getElementById('field-email')?.value.trim()  || '';
  const ip     = document.getElementById('field-ip')?.value.trim()     || '';
  const amount = document.getElementById('field-amount')?.value.trim() || '';
  const notes  = document.getElementById('field-notes')?.value.trim()  || '';

  if (editingId) {
    const idx = accounts.findIndex(a => a.id === editingId);
    if (idx > -1) {
      accounts[idx] = { ...accounts[idx], uid, email, ip, amount, notes, depositTime: depDate.toISOString() };
    }
    showToast(t('toastUpdated'));
  } else {
    const newAcc = {
      id: Date.now(),
      uid, email, ip, amount, notes,
      depositTime: depDate.toISOString(),
      stage: 1,
      stage2StartTime: null,
      auditLog: [{ action: 'created', time: new Date().toISOString() }]
    };
    accounts.unshift(newAcc);
    showToast(t('toastSaved'));

    // Send notification if enabled
    if (notifPermission && uid) sendNotification(t('notifStage1Title'), t('notifStage1Body') + uid);
  }

  saveAccounts();
  closeForm();
  renderAccounts();
  renderDashboard();
}


function deleteAccount(id) {
  if (!confirm(t('toastClearAcctConfirm'))) return;
  accounts = accounts.filter(a => a.id !== id);
  saveAccounts();
  renderAccounts();
  renderDashboard();
}

function markStage2(id) {
  const acc = accounts.find(a => a.id === id);
  if (!acc) return;
  acc.stage = 2;
  acc.stage2StartTime = new Date().toISOString();
  if (acc.auditLog) acc.auditLog.push({ action: 'stage2', time: new Date().toISOString() });
  saveAccounts();
  renderAccounts();
  renderDashboard();
  showToast(t('auditStage2'));
  if (notifPermission && acc.uid) sendNotification(t('notifStage2Title'), t('notifStage2Body') + acc.uid);
}

// ─── Filter / Sort ────────────────────────────────────────────────────────────
function filterAccounts(status) {
  if (typeof status === 'string') {
    filterStatus = status;
    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === status);
    });
  }
  renderAccounts();
}

function changeSortBy(val) {
  sortBy = val;
  renderAccounts();
}

// ─── Export / Import ──────────────────────────────────────────────────────────
function exportAccounts() {
  if (!accounts.length) { showToast(t('toastNoDataExport')); return; }
  const blob = new Blob([JSON.stringify(accounts, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const pad  = n => String(n).padStart(2, '0');
  const now  = new Date();
  a.href     = url;
  a.download = `waqtak_backup_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(t('toastExportOk'));
}

function triggerImport() {
  document.getElementById('import-file-input')?.click();
}

function importAccounts(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data) || data.length === 0) { showToast(t('toastImportEmpty')); return; }
      accounts = data;
      saveAccounts();
      renderAccounts();
      renderDashboard();
      showToast(t('toastImportOk'));
    } catch { showToast(t('toastImportErr')); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ─── Notifications ────────────────────────────────────────────────────────────
function requestNotifPermission() {
  if (!('Notification' in window)) { showToast(t('toastNotifSupport')); return; }
  const btn = document.getElementById('notif-toggle-btn');
  Notification.requestPermission().then(perm => {
    notifPermission = perm === 'granted';
    if (btn) {
      btn.textContent = perm === 'granted' ? t('btnNotifOn') : perm === 'denied' ? t('btnNotifDenied') : t('btnNotif');
    }
  });
}

function sendNotification(title, body) {
  if (!notifPermission || Notification.permission !== 'granted') return;
  try { new Notification(title, { body, icon: '/favicon.ico' }); } catch {}
}

// ─── Bulk Selection ───────────────────────────────────────────────────────────
let bulkMode = false;
let selectedIds = new Set();

function toggleBulkMode() {
  bulkMode = !bulkMode;
  selectedIds.clear();
  const btn = document.getElementById('bulk-toggle-btn');
  const bar = document.getElementById('bulk-actions-bar');
  const btnSpan = btn?.querySelector('span');

  if (bulkMode) {
    if (bar) bar.style.display = 'flex';
    if (btnSpan) btnSpan.textContent = t('bulkExitMode');
    if (btn) btn.classList.add('bulk-active');
  } else {
    if (bar) bar.style.display = 'none';
    if (btnSpan) btnSpan.textContent = t('bulkModeBtn');
    if (btn) btn.classList.remove('bulk-active');
  }
  updateBulkCount();
  renderAccounts();
}

function toggleAccountSelect(id) {
  if (!bulkMode) return;
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  updateBulkCount();
  renderAccounts();
}

function updateBulkCount() {
  const el = document.getElementById('bulk-count');
  if (el) el.textContent = selectedIds.size;
  const bar = document.getElementById('bulk-actions-bar');
  if (bar) bar.style.display = bulkMode ? 'flex' : 'none';
}

function bulkSelectAll() {
  accounts.forEach(a => selectedIds.add(a.id));
  updateBulkCount();
  renderAccounts();
}

function bulkDeselectAll() {
  selectedIds.clear();
  updateBulkCount();
  renderAccounts();
}

function bulkDelete() {
  if (selectedIds.size === 0) return;
  const msg = t('bulkDeleteConfirm').replace('{n}', selectedIds.size);
  if (!confirm(msg)) return;
  accounts = accounts.filter(a => !selectedIds.has(a.id));
  selectedIds.clear();
  saveAccounts();
  renderAccounts();
  renderDashboard();
  updateBulkCount();
  showToast(`✅ ${currentLang === 'ar' ? 'تم الحذف' : 'Deleted'}`);
}

function bulkExport() {
  if (selectedIds.size === 0) return;
  const data = accounts.filter(a => selectedIds.has(a.id));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `waqtak_bulk_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(t('bulkExportOk').replace('{n}', selectedIds.size));
}

function bulkExportCSV() {
  if (selectedIds.size === 0) return;
  const rows = [t('csvHeaders').split(',')];
  accounts.filter(a => selectedIds.has(a.id)).forEach(a => {
    const dep  = new Date(a.depositTime);
    const s1End = new Date(dep.getTime() + 4 * 86400000);
    const s2End = a.stage2StartTime ? new Date(new Date(a.stage2StartTime).getTime() + 4 * 86400000) : '—';
    const status = a.stage === 1 ? t('csvStage1') : a.stage === 2 ? t('csvStage2') : t('csvDone');
    rows.push([
      a.uid || '', a.email || '', a.ip || '', a.amount || '', status,
      formatEgyptShort(s1End),
      typeof s2End === 'string' ? s2End : formatEgyptShort(s2End),
      (a.notes || '').replace(/,/g, ';')
    ]);
  });
  const csv  = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const now  = new Date();
  const pad  = n => String(n).padStart(2, '0');
  a.href     = url;
  a.download = `waqtak_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(t('bulkExportOk').replace('{n}', selectedIds.size));
}

// ─── Data Integrity Check ─────────────────────────────────────────────────────
let integrityPanelVisible = false;

function showIntegrityPanel(result) {
  let panel = document.getElementById('integrity-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'integrity-panel';
    panel.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;';
    document.body.appendChild(panel);
  }
  panel.style.display = 'flex';
  integrityPanelVisible = true;

  const lsData   = result.lsData;
  const idbData  = result.idbData;
  const lsCount  = lsData.length;
  const idbCount = idbData.length;
  const lsIDs    = new Set(lsData.map(a => a.id));
  const idbIDs   = new Set(idbData.map(a => a.id));
  const onlyInLS  = lsData.filter(a => !idbIDs.has(a.id));
  const onlyInIDB = idbData.filter(a => !lsIDs.has(a.id));
  const match = lsCount === idbCount && onlyInLS.length === 0 && onlyInIDB.length === 0;
  const statusColor = match ? '#22C55E' : '#F59E0B';
  const statusText  = match
    ? (currentLang === 'ar' ? '✅ متطابقة' : '✅ Synchronized')
    : (currentLang === 'ar' ? '⚠️ يوجد اختلاف' : '⚠️ Mismatch');

  panel.innerHTML = `
    <div onclick="hideIntegrityPanel()" style="position:absolute;inset:0;background:rgba(0,0,0,0.7);"></div>
    <div style="position:relative;background:var(--card-bg,#1a1a2e);border:1px solid var(--border,#333);border-radius:16px;padding:24px;max-width:480px;width:90%;z-index:1;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="margin:0;font-size:1rem;">${t('integrityPanelTitle')}</h3>
        <button onclick="hideIntegrityPanel()" style="background:none;border:none;color:inherit;cursor:pointer;font-size:1.2rem;">×</button>
      </div>
      <div style="padding:12px;border-radius:8px;border:1px solid ${statusColor};background:${statusColor}22;margin-bottom:16px;text-align:center;color:${statusColor};font-weight:600;">
        ${statusText}
      </div>
      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;margin-bottom:16px;">
        <div style="text-align:center;padding:12px;background:rgba(59,130,246,0.1);border-radius:8px;">
          <div style="font-size:1.6rem;font-weight:700;color:#60A5FA;">${lsCount}</div>
          <div style="font-size:0.75rem;color:var(--text-muted,#888);">${t('integrityLS')}</div>
        </div>
        <div style="color:var(--text-muted,#888);font-weight:700;">VS</div>
        <div style="text-align:center;padding:12px;background:rgba(139,92,246,0.1);border-radius:8px;">
          <div style="font-size:1.6rem;font-weight:700;color:#A78BFA;">${idbCount}</div>
          <div style="font-size:0.75rem;color:var(--text-muted,#888);">${t('integrityIDB')}</div>
        </div>
      </div>
      ${onlyInLS.length > 0 ? `<div style="margin-bottom:8px;padding:8px;background:rgba(245,158,11,0.1);border-radius:6px;font-size:0.8rem;color:#F59E0B;">⚠️ ${onlyInLS.length} account(s) only in localStorage</div>` : ''}
      ${onlyInIDB.length > 0 ? `<div style="margin-bottom:8px;padding:8px;background:rgba(139,92,246,0.1);border-radius:6px;font-size:0.8rem;color:#A78BFA;">💾 ${onlyInIDB.length} account(s) only in IndexedDB</div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
        <button id="sync-idb-btn" onclick="syncToIDB()" style="flex:1;padding:10px;background:#3B82F6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:0.85rem;">${t('integritySyncToIDB')}</button>
        <button id="restore-idb-btn" onclick="restoreFromIDB()" style="flex:1;padding:10px;background:#8B5CF6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:0.85rem;">${t('integrityRestoreFromIDB')}</button>
      </div>
      <button onclick="hideIntegrityPanel()" style="width:100%;margin-top:8px;padding:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:inherit;cursor:pointer;">${t('integrityClose')}</button>
    </div>
  `;
}

function hideIntegrityPanel() {
  const panel = document.getElementById('integrity-panel');
  if (panel) panel.style.display = 'none';
  integrityPanelVisible = false;
}

async function checkDataIntegrity() {
  const btn = document.getElementById('integrity-check-btn');
  if (btn) { btn.disabled = true; btn.textContent = t('integrityChecking'); }
  try {
    if (!idb) { showToast(t('integrityNoIDB'), 4000); return; }
    const lsRaw  = localStorage.getItem(ACCOUNTS_KEY);
    const lsData = lsRaw ? JSON.parse(lsRaw) : [];
    const idbData = await idbLoad();
    showIntegrityPanel({ lsData: Array.isArray(lsData) ? lsData : [], idbData });

    // Auto-fix: if IDB is empty but LS has data, sync
    if (idbData.length === 0 && lsData.length > 0) {
      idbSave(lsData);
      showToast(t('integrityAutoFixed'));
    }
  } catch (err) {
    showToast('ERR: ' + err.message, 4000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = t('btnIntegrity'); }
  }
}

async function syncToIDB() {
  const btn = document.getElementById('sync-idb-btn');
  if (btn) { btn.disabled = true; btn.textContent = t('integritySyncing'); }
  try {
    idbSave(accounts);
    showToast(t('integritySyncOk').replace('{n}', accounts.length));
    hideIntegrityPanel();
    checkDataIntegrity();
  } catch (err) {
    showToast('ERR: ' + err.message, 4000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = t('integritySyncToIDB'); }
  }
}

async function restoreFromIDB() {
  const btn = document.getElementById('restore-idb-btn');
  if (btn) { btn.disabled = true; btn.textContent = t('integrityRestoring'); }
  try {
    const idbData = await idbLoad();
    if (!idbData.length) {
      showToast(currentLang === 'ar' ? '⚠️ لا توجد بيانات في IndexedDB' : '⚠️ No data in IndexedDB');
      return;
    }
    accounts = idbData;
    saveAccounts();
    renderAccounts();
    renderDashboard();
    hideIntegrityPanel();
    showToast(t('integrityRestored').replace('{n}', idbData.length));
  } catch (err) {
    showToast('ERR: ' + err.message, 4000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = t('integrityRestoreFromIDB'); }
  }
}

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement.tagName.toLowerCase();
  const isInput = tag === 'input' || tag === 'textarea' || tag === 'select';

  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    if (currentMode === 'calculator') calculate();
    else saveAccount();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !isInput) {
    if (currentMode === 'manager') { e.preventDefault(); openAddForm(); }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'e' && !isInput) {
    e.preventDefault(); exportAccounts(); return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'b' && !isInput) {
    e.preventDefault(); toggleTheme(); return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    if (typeof toggleShortcutsModal === 'function') toggleShortcutsModal();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
    e.preventDefault();
    const search = document.getElementById('mgr-search');
    if (search) { search.focus(); search.select(); }
    return;
  }
});

// ─── App Bootstrap ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Apply saved language
  initLanguage();

  // 2. Start clock
  startClock();

  // 3. Start particles
  initParticles();

  // 4. Init IndexedDB
  await initIndexedDB();

  // 5. Load accounts: prefer IDB, fallback to localStorage
  let loaded = await idbLoad();
  if (!loaded.length) {
    loaded = loadAccountsFromStorage();
    if (loaded.length && idb) {
      // Sync localStorage to IDB
      idbSave(loaded);
    }
  } else {
    // IDB has data — also make sure localStorage is in sync
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(loaded));
  }
  accounts = loaded;

  // 6. Render history
  renderHistory();

  // 7. Initial mode
  switchMode('calculator');
});
