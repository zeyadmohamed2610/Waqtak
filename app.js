/* =============================================
   BYBIT TRACKER — JavaScript Core Logic
   =============================================
   - Parses UTC format: "2026-05-26 11:36:42 (UTC+0)"
   - Parses Gmail format: "May 26, 2026, 2:36 PM"  (treated as UTC+3, Egypt local)
   - Manual datetime picker (assumes UTC)
   - Converts all times to Egypt timezone (Africa/Cairo = UTC+2/UTC+3 DST)
   - Calculates elapsed / remaining time vs +4 days
   - Live countdown + progress ring
   - Saves history to localStorage
============================================= */

'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────
const EGYPT_TZ      = 'Africa/Cairo';
const STORAGE_KEY   = 'bybit_tracker_history';

// ─── State ───────────────────────────────────────────────────────────────────
let currentTab          = 'utc';
let countdownInterval   = null;
let depositUTC          = null;   // Date object (UTC epoch)
let target1UTC          = null;   // depositUTC + 4 days
let target2UTC          = null;   // depositUTC + 8 days
let currentLang         = 'ar';   // 'ar' or 'en'
let currentMode         = 'calculator'; // 'calculator' or 'manager'
let accounts            = [];           // Array of manager accounts
let accountsInterval    = null;         // Live update ticker for manager mode
let filterStatus        = 'all';        // 'all' | 'stage1' | 'stage2' | 'done'
let sortBy              = 'newest';     // 'newest' | 'oldest' | 'soonest'
let notifPermission     = false;        // Browser notification permission granted
let idb                 = null;         // IndexedDB instance
const IDB_NAME          = 'waqtak_db';
const IDB_STORE         = 'accounts';
const IDB_VERSION       = 1;

// ─── i18n Translations ───────────────────────────────────────────────────────
const TRANSLATIONS = {
  ar: {
    // Theme
    themeLight: 'الوضع الفاتح',
    themeDark: 'الوضع الداكن',
    themeToggle: 'تبديل المظهر',
    // Timeline
    timelineTitle: 'الجدول الزمني للحسابات',
    timelineHide: 'إخفاء',
    timelineShow: 'عرض',
    legendStage1: 'المرحلة 1 (4 أيام)',
    legendStage2: 'المرحلة 2 (4 أيام)',
    legendDone: 'مكتمل',
    timelineToday: 'اليوم',
    timelineNoAccounts: 'لا توجد حسابات بعد',
    // Bulk Actions
    bulkSelected: 'محدد',
    bulkDelete: '🗑️ حذف المحدد',
    bulkExport: '📤 تصدير المحدد',
    bulkExportCSV: '📊 تصدير CSV',
    bulkSelectAll: '☑️ تحديد الكل',
    bulkDeselect: '☐ إلغاء التحديد',
    bulkModeBtn: 'وضع التحديد المتعدد',
    bulkExitMode: 'الخروج من التحديد',
    bulkDeleteConfirm: 'هل تريد حذف {n} حساب(ات) محدد(ة)؟',
    bulkExportOk: '✅ تم تصدير {n} حساب بنجاح',
    // CSV
    csvFilename: 'waqtak_export_{date}.csv',
    csvHeaders: 'UID,البريد,IP,الإيداع ($),الحالة,المرحلة 1,المرحلة 2,ملاحظات',
    csvStage1: 'المرحلة 1',
    csvStage2: 'المرحلة 2',
    csvDone: 'مكتمل',
    // Theme
    toastThemeLight: '☀️ تحول إلى الوضع الفاتح',
    toastThemeDark: '🌙 تحول إلى الوضع الداكن',
    // PWA
    pwaInstallTitle: '📱 ثبّت تطبيق وقتك!',
    // Header
    logoMain:         'وقتك',
    logoSub:          'متابعة حسابات Bybit',
    clockLabel:       'التوقيت العالمي الآن (UTC)',
    langToggleText:   'English',
    // Hero
    heroBadge:        'متابعة الإيداعات والنشاط',
    heroTitle:        'تتبع مواعيد<br/>حساباتك خطوة بخطوة',
    heroDesc:         'أدخل تاريخ الإيداع من رسالة Gmail وستحسب الأداة تلقائياً مواعيد المراجعة بعد <strong>4 أيام</strong> والجاهزية بعد <strong>8 أيام</strong>',
    // Input Card
    inputCardTitle:   'إدخال تاريخ الإيداع',
    inputCardSubtitle:'الصق التاريخ من رسالة Gmail أو أدخله يدوياً',
    tabUTC:           'UTC Format',
    tabGmail:         'Gmail Format',
    tabManual:        'يدوي',
    labelUTC:         'تنسيق UTC — مثال: <code>2026-05-26 11:36:42 (UTC+0)</code>',
    labelGmail:       'تنسيق Gmail — مثال: <code>May 26, 2026, 2:36 PM</code>',
    labelManual:      'اختر تاريخ ووقت الإيداع (بالتوقيت المصري)',
    gmailNote:        'Gmail يعرض التوقيت المحلي لإعدادات حسابك — يُعالج تلقائياً حسب UTC',
    btnCalculate:     'احسب الآن',
    exampleLabel:     'أمثلة سريعة:',
    exampleUTC:       'مثال UTC',
    exampleGmail:     'مثال Gmail',
    // Progress
    progressLabel:    'مكتمل',
    depositLabel:     'تاريخ الإيداع (بالتوقيت المصري)',
    milestone1Label:  'المراجعة الأولى — بعد 4 أيام (بالتوقيت المصري)',
    milestone2Label:  'المراجعة الثانية والجاهزية — بعد 8 أيام (بالتوقيت المصري)',
    // Stats
    statElapsedLabel: 'مر على الإيداع',
    statActiveLabel:  'الهدف النشط حالياً',
    statStage1Label:  'المرحلة الأولى (4 أيام)',
    statStage2Label:  'المرحلة الثانية (8 أيام)',
    // Countdown
    countdownTitle:   'العد التنازلي الدقيق',
    cdDays:           'أيام',
    cdHours:          'ساعات',
    cdMins:           'دقائق',
    cdSecs:           'ثواني',
    // Buttons
    btnReset:         'إدخال تاريخ جديد',
    // History
    historySectionTitle: 'الحسابات المحفوظة',
    btnClearHistory:  'مسح الكل',
    historyEmpty:     'لا توجد حسابات محفوظة بعد',
    // Footer
    footerText:       'وقتك — أداة متابعة حسابات Bybit • جميع البيانات محلية على جهازك',
    // Dynamic strings
    dynReady:         'جاهز بالكامل ✓',
    dynStage2Rem:     'مرحلة 2: متبقي ',
    dynStage1Rem:     'مرحلة 1: متبقي ',
    dynDone:          'مكتملة ✓',
    dynRemaining:     'متبقي ',
    dynWaiting:       'في الانتظار..',
    dynBanner2Title:  'الحساب جاهز بالكامل!',
    dynBanner2Sub:    'اكتملت فترة الـ 8 أيام منذ ',
    dynBanner2Badge:  'جاهز',
    dynBanner1Title:  'المرحلة الثانية نشطة',
    dynBanner1Sub1:   'اكتملت المراجعة الأولى. متبقي ',
    dynBanner1Sub2:   ' على الجاهزية التامة',
    dynBanner1Badge:  'مرحلة 2',
    dynBanner0Title:  'المرحلة الأولى نشطة',
    dynBanner0Sub:    'المراجعة الأولى بعد ',
    dynBanner0Badge:  'مرحلة 1',
    // History tags
    histTagDone:      'جاهز بالكامل ✓',
    histTagStage2:    'مرحلة 2 ⚡',
    histTagStage1:    'مرحلة 1',
    histDepositPfx:   'إيداع: ',
    histRev1Pfx:      'مراجعة 1: ',
    histRev2Pfx:      'مراجعة 2: ',
    histRemReady:     '⏱ متبقي للجاهزية: ',
    histFullReady:    '✓ جاهز بالكامل',
    // Duration
    durDay:    'يوم',
    durHour:   'ساعة',
    durMin:    'دقيقة',
    durSec:    'ثانية',
    durAnd:    ' و ',
    // Toast
    toastEnterDate:  '⚠️ الرجاء إدخال التاريخ أولاً',
    toastBadUTC:     '❌ تنسيق غير صحيح — مثال: 2026-05-26 11:36:42 (UTC+0)',
    toastBadGmail:   '❌ تنسيق غير صحيح — مثال: May 26, 2026, 2:36 PM',
    toastPickDate:   '⚠️ الرجاء اختيار التاريخ والوقت',
    toastFuture:     '⚠️ التاريخ يبدو بعيداً جداً في المستقبل، تحقق من الإدخال',
    toastClearConfirm: 'هل تريد مسح جميع السجلات؟',
    // Mode Switcher
    modeCalc:         'الحاسبة السريعة',
    modeMgr:          'مدير الحسابات',
    // Account Manager Form & Cards
    btnAddAccount:    'إضافة حساب جديد',
    formTitleAdd:     'حساب جديد',
    formTitleEdit:    'تعديل الحساب',
    formSubtitle:     'أدخل تفاصيل حساب Bybit لحفظه وتتبعه',
    fieldUID:         'Bybit UID',
    fieldEmail:       'البريد الإلكتروني',
    fieldIP:          'عنوان IP',
    fieldAmount:      'كمية الإيداع ($)',
    fieldTime:        'وقت الإيداع',
    btnNow:           'الآن',
    fieldNotes:       'ملاحظات (اختياري)',
    btnSave:          'حفظ الحساب',
    btnCancel:        'إلغاء',
    toastFillRequired:'⚠️ يُرجى تحديد تاريخ ووقت الإيداع على الأقل!',
    toastClearAcctConfirm: 'هل تريد حذف هذا الحساب نهائياً؟',
    cardStage1:       'مرحلة 1: مراجعة (4 أيام)',
    cardStage1Done:   'مرحلة 1: جاهز للمهمات ✓',
    cardStage2:       'مرحلة 2: انتظار (4 أيام)',
    cardStage2Done:   'مكتمل وجاهز بالكامل ✓',
    cardEmail:        'البريد:',
    cardIP:           'الـ IP:',
    cardAmount:       'الإيداع:',
    cardNotes:        'ملاحظات:',
    cardBtnStage2:    'إتمام المهمة وبدء المرحلة 2 ⚡',
    cardTimeRemaining:'متبقي: ',
    cardTimeOverdue:  'تجاوز منذ: ',
    cardCreated:      'تاريخ البدء: ',
    cardStage2Started:'تحديث المرحلة 2: ',
    searchPlaceholder:'بحث بالـ UID أو البريد الإلكتروني...',
    // Export / Import
    btnExport:        'تصدير النسخة الاحتياطية',
    btnImport:        'استعادة النسخة الاحتياطية',
    toastExportOk:    '✅ تم تصدير البيانات بنجاح',
    toastImportOk:    '✅ تم استيراد البيانات بنجاح',
    toastImportErr:   '❌ خطأ في الملف — تأكد من صحة ملف JSON',
    toastImportEmpty: '⚠️ الملف لا يحتوي على بيانات صالحة',
    toastCopied:      '📋 تم النسخ',
    // Notifications
    btnNotif:         '🔔 تفعيل الإشعارات',
    btnNotifOn:       '🔔 الإشعارات مفعلة',
    btnNotifDenied:   '🔕 الإشعارات محجوبة',
    notifStage1Title: 'انتهت المرحلة 1 ✓',
    notifStage1Body:  'الحساب جاهز للمهمات — UID: ',
    notifStage2Title: 'الحساب مكتمل بالكامل 🎉',
    notifStage2Body:  'تمت المرحلة 2 بنجاح — UID: ',
    // Filter / Sort
    filterAll:        'الكل',
    filterStage1:     'المرحلة 1',
    filterStage2:     'المرحلة 2',
    filterDone:       'مكتمل',
    sortNewest:       'الأحدث أولاً',
    sortOldest:       'الأقدم أولاً',
    sortSoonest:      'الأقرب للانتهاء',
    // Dashboard Stats
    dashTotal:        'إجمالي الحسابات',
    dashStage1:       'في المرحلة 1',
    dashStage2:       'في المرحلة 2',
    dashDone:         'مكتملة',
    dashDeposits:     'إجمالي الإيداعات',
    dashExpiringSoon: 'تنتهي اليوم',
    // Audit Log
    auditLog:         'سجل التغييرات',
    auditCreated:     '🆕 تم إنشاء الحساب',
    auditEdited:      '✏️ تم تعديل الحساب',
    auditStage2:      '⚡ بدأت المرحلة 2',
    auditHide:        'إخفاء السجل',
    auditShow:        'عرض السجل',
    // IDB
    idbRestored:      '💾 تم استعادة البيانات من النسخة الاحتياطية',
    toastNoDataExport: '⚠️ لا توجد بيانات للتصدير',
    toastNotifSupport: '⚠️ المتصفح لا يدعم الإشعارات',
    // IP Conflict
    ipConflictBadge:  '⚠️ IP مكرر',
    ipConflictTip:    'هذا الـ IP مستخدم في حسابات أخرى — خطر ربط الحسابات!',
    // Data Integrity Check
    btnIntegrity:     '🔍 فحص سلامة البيانات',
    integrityOk:      '✅ البيانات سليمة — localStorage وIndexedDB متطابقان',
    integrityMismatch:'⚠️ تحذير: يوجد اختلاف بين localStorage وIndexedDB!',
    integrityLSOnly:  '📦 localStorage: {n} حساب',
    integrityIDBOnly: '💾 IndexedDB: {n} حساب',
    integrityDiff:    '❌ المفقود من IndexedDB: {n} حساب',
    integrityNoIDB:   '⚠️ IndexedDB غير متاح',
    integrityChecking:'🔄 جاري الفحص...',
    integrityPanelTitle: '📊 تقرير سلامة البيانات',
    integrityLS:     'localStorage',
    integrityIDB:    'IndexedDB',
    integrityTotalAccounts: 'إجمالي الحسابات',
    integritySyncToIDB: '🔄 مزامنة إلى IndexedDB',
    integrityRestoreFromIDB: '💾 استعادة من IndexedDB',
    integritySyncOk:  '✅ تمت المزامنة بنجاح — {n} حساب',
    integrityRestored: '✅ تمت الاستعادة بنجاح — {n} حساب',
    integrityClose:   'إغلاق',
    integritySyncing: 'جاري المزامنة...',
    integrityRestoring: 'جاري الاستعادة...',
    integrityAutoFixed: '🔧 تم الإصلاح التلقائي',
  },
  en: {
    // Theme
    themeLight: 'Light Mode',
    themeDark: 'Dark Mode',
    themeToggle: 'Toggle Appearance',
    // Timeline
    timelineTitle: 'Accounts Timeline',
    timelineHide: 'Hide',
    timelineShow: 'Show',
    legendStage1: 'Stage 1 (4 days)',
    legendStage2: 'Stage 2 (4 days)',
    legendDone: 'Completed',
    timelineToday: 'Today',
    timelineNoAccounts: 'No accounts yet',
    // Bulk Actions
    bulkSelected: 'selected',
    bulkDelete: '🗑️ Delete Selected',
    bulkExport: '📤 Export Selected',
    bulkExportCSV: '📊 Export CSV',
    bulkSelectAll: '☑️ Select All',
    bulkDeselect: '☐ Deselect All',
    bulkModeBtn: 'Multi-Select Mode',
    bulkExitMode: 'Exit Selection',
    bulkDeleteConfirm: 'Delete {n} selected account(s)?',
    bulkExportOk: '✅ Exported {n} accounts successfully',
    // CSV
    csvFilename: 'waqtak_export_{date}.csv',
    csvHeaders: 'UID,Email,IP,Deposit ($),Status,Stage 1,Stage 2,Notes',
    csvStage1: 'Stage 1',
    csvStage2: 'Stage 2',
    csvDone: 'Completed',
    // Theme
    toastThemeLight: '☀️ Switched to Light Mode',
    toastThemeDark: '🌙 Switched to Dark Mode',
    // PWA
    pwaInstallTitle: '📱 Install Waqtak!',
    // Header
    logoMain:         'Waqtak',
    logoSub:          'Bybit Account Tracker',
    clockLabel:       'Universal Time (UTC)',
    langToggleText:   'عربي',
    // Hero
    heroBadge:        'Deposit & Activity Tracking',
    heroTitle:        'Track Your Account<br/>Milestones Step by Step',
    heroDesc:         'Enter the deposit date from your Gmail message and the tool will automatically calculate the review after <strong>4 days</strong> and readiness after <strong>8 days</strong>',
    // Input Card
    inputCardTitle:   'Enter Deposit Date',
    inputCardSubtitle:'Paste the date from your Gmail message or enter it manually',
    tabUTC:           'UTC Format',
    tabGmail:         'Gmail Format',
    tabManual:        'Manual',
    labelUTC:         'UTC format — Example: <code>2026-05-26 11:36:42 (UTC+0)</code>',
    labelGmail:       'Gmail format — Example: <code>May 26, 2026, 2:36 PM</code>',
    labelManual:      'Choose deposit date & time (Egypt Time)',
    gmailNote:        'Gmail shows your account\'s local timezone — automatically adjusted to UTC',
    btnCalculate:     'Calculate Now',
    exampleLabel:     'Quick examples:',
    exampleUTC:       'UTC Example',
    exampleGmail:     'Gmail Example',
    // Progress
    progressLabel:    'Complete',
    depositLabel:     'Deposit Date (Egypt Time)',
    milestone1Label:  'First Review — After 4 Days (Egypt Time)',
    milestone2Label:  'Second Review & Readiness — After 8 Days (Egypt Time)',
    // Stats
    statElapsedLabel: 'Time Since Deposit',
    statActiveLabel:  'Active Target',
    statStage1Label:  'Stage 1 (4 Days)',
    statStage2Label:  'Stage 2 (8 Days)',
    // Countdown
    countdownTitle:   'Precise Countdown',
    cdDays:           'Days',
    cdHours:          'Hours',
    cdMins:           'Minutes',
    cdSecs:           'Seconds',
    // Buttons
    btnReset:         'Enter New Date',
    // History
    historySectionTitle: 'Saved Accounts',
    btnClearHistory:  'Clear All',
    historyEmpty:     'No saved accounts yet',
    // Footer
    footerText:       'Waqtak — Bybit Account Tracker • All data stored locally on your device',
    // Dynamic strings
    dynReady:         'Fully Ready ✓',
    dynStage2Rem:     'Stage 2: ',
    dynStage1Rem:     'Stage 1: ',
    dynDone:          'Done ✓',
    dynRemaining:     '',
    dynWaiting:       'Waiting...',
    dynBanner2Title:  'Account Fully Ready!',
    dynBanner2Sub:    'The 8-day period completed ',
    dynBanner2Badge:  'Ready',
    dynBanner1Title:  'Stage 2 Active',
    dynBanner1Sub1:   'First review done. ',
    dynBanner1Sub2:   ' remaining until full readiness',
    dynBanner1Badge:  'Stage 2',
    dynBanner0Title:  'Stage 1 Active',
    dynBanner0Sub:    'First review in ',
    dynBanner0Badge:  'Stage 1',
    // History tags
    histTagDone:      'Fully Ready ✓',
    histTagStage2:    'Stage 2 ⚡',
    histTagStage1:    'Stage 1',
    histDepositPfx:   'Deposit: ',
    histRev1Pfx:      'Review 1: ',
    histRev2Pfx:      'Review 2: ',
    histRemReady:     '⏱ Ready in: ',
    histFullReady:    '✓ Fully Ready',
    // Duration
    durDay:    'day',
    durHour:   'hr',
    durMin:    'min',
    durSec:    'sec',
    durAnd:    ' ',
    // Toast
    toastEnterDate:  '⚠️ Please enter a date first',
    toastBadUTC:     '❌ Invalid format — Example: 2026-05-26 11:36:42 (UTC+0)',
    toastBadGmail:   '❌ Invalid format — Example: May 26, 2026, 2:36 PM',
    toastPickDate:   '⚠️ Please pick a date and time',
    toastFuture:     '⚠️ Date seems too far in the future, please check your input',
    toastClearConfirm: 'Delete all saved records?',
    // Mode Switcher
    modeCalc:         'Quick Calculator',
    modeMgr:          'Account Manager',
    // Account Manager Form & Cards
    btnAddAccount:    'Add New Account',
    formTitleAdd:     'New Account',
    formTitleEdit:    'Edit Account',
    formSubtitle:     'Enter Bybit account details to save and track',
    fieldUID:         'Bybit UID',
    fieldEmail:       'Email Address',
    fieldIP:          'IP Address',
    fieldAmount:      'Deposit Amount ($)',
    fieldTime:        'Deposit Time',
    btnNow:           'Now',
    fieldNotes:       'Notes (Optional)',
    btnSave:          'Save Account',
    btnCancel:        'Cancel',
    toastFillRequired:'⚠️ Please specify at least the deposit date and time!',
    toastClearAcctConfirm: 'Are you sure you want to delete this account permanently?',
    cardStage1:       'Stage 1: Review (4 days)',
    cardStage1Done:   'Stage 1: Ready for tasks ✓',
    cardStage2:       'Stage 2: Pending (4 days)',
    cardStage2Done:   'Fully Completed & Ready ✓',
    cardEmail:        'Email:',
    cardIP:           'IP:',
    cardAmount:       'Deposit:',
    cardNotes:        'Notes:',
    cardBtnStage2:    'Complete tasks & start Stage 2 ⚡',
    cardTimeRemaining:'Remaining: ',
    cardTimeOverdue:  'Overdue by: ',
    cardCreated:      'Start Date: ',
    cardStage2Started:'Stage 2 Update: ',
    searchPlaceholder:'Search by UID or Email...',
    // Export / Import
    btnExport:        'Export Backup',
    btnImport:        'Restore Backup',
    toastExportOk:    '✅ Data exported successfully',
    toastImportOk:    '✅ Data imported successfully',
    toastImportErr:   '❌ File error — make sure it is a valid JSON file',
    toastImportEmpty: '⚠️ File contains no valid data',
    toastCopied:      '📋 Copied!',
    // Notifications
    btnNotif:         '🔔 Enable Notifications',
    btnNotifOn:       '🔔 Notifications On',
    btnNotifDenied:   '🔕 Notifications Blocked',
    notifStage1Title: 'Stage 1 Complete ✓',
    notifStage1Body:  'Account ready for tasks — UID: ',
    notifStage2Title: 'Account Fully Complete 🎉',
    notifStage2Body:  'Stage 2 finished successfully — UID: ',
    // Filter / Sort
    filterAll:        'All',
    filterStage1:     'Stage 1',
    filterStage2:     'Stage 2',
    filterDone:       'Completed',
    sortNewest:       'Newest First',
    sortOldest:       'Oldest First',
    sortSoonest:      'Expiring Soon',
    // Dashboard Stats
    dashTotal:        'Total Accounts',
    dashStage1:       'In Stage 1',
    dashStage2:       'In Stage 2',
    dashDone:         'Completed',
    dashDeposits:     'Total Deposits',
    dashExpiringSoon: 'Expiring Today',
    // Audit Log
    auditLog:         'Change Log',
    auditCreated:     '🆕 Account Created',
    auditEdited:      '✏️ Account Edited',
    auditStage2:      '⚡ Stage 2 Started',
    auditHide:        'Hide Log',
    auditShow:        'View Log',
    // IDB
    idbRestored:      '💾 Data restored from backup storage',
    // IP Conflict
    ipConflictBadge:  '⚠️ Duplicate IP',
    ipConflictTip:    'This IP is used by other accounts — risk of account linking!',
    

// Data Integrity Panel
let integrityPanelVisible = false;

function showIntegrityPanel(result) {
  var panel = document.getElementById('integrity-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'integrity-panel';
    panel.innerHTML = '<div class="integrity-panel-overlay" onclick="hideIntegrityPanel()"></div><div class="integrity-panel-content"><div class="integrity-panel-header"><h3>' + t('integrityPanelTitle') + '</h3><button class="integrity-panel-close" onclick="hideIntegrityPanel()">x</button></div><div class="integrity-panel-body" id="integrity-panel-body"></div><div class="integrity-panel-footer" id="integrity-panel-footer"></div></div>';
    document.body.appendChild(panel);
  }
  panel.style.display = 'flex';
  integrityPanelVisible = true;
  updateIntegrityPanelContent(result);
}

function hideIntegrityPanel() {
  var panel = document.getElementById('integrity-panel');
  if (panel) panel.style.display = 'none';
  integrityPanelVisible = false;
}

function updateIntegrityPanelContent(result) {
  var body = document.getElementById('integrity-panel-body');
  var footer = document.getElementById('integrity-panel-footer');
  if (!body || !footer) return;
  var lsData = result.lsData;
  var idbData = result.idbData;
  var lsCount = lsData.length;
  var idbCount = idbData.length;
  var lsIDs = new Set(lsData.map(function(a){return a.id;}));
  var idbIDs = new Set(idbData.map(function(a){return a.id;}));
  var onlyInLS = lsData.filter(function(a){return !idbIDs.has(a.id);});
  var onlyInIDB = idbData.filter(function(a){return !lsIDs.has(a.id);});
  var total = Math.max(lsCount, idbCount, 1);
  var match = lsCount === idbCount && onlyInLS.length === 0 && onlyInIDB.length === 0;
  var statusColor = match ? '#22C55E' : '#F59E0B';
  var statusIcon = match ? 'OK' : 'WARN';
  var statusText = match ? (currentLang === 'ar' ? 'OK' : 'OK') : (currentLang === 'ar' ? 'WARN' : 'WARN');

  var diffRows = '';
  if (onlyInLS.length > 0) {
    var lsLabel = currentLang === 'ar' ? ('in localStorage (' + onlyInLS.length + ')') : ('Only in localStorage (' + onlyInLS.length + ')');
    diffRows += '<div class="integrity-diff-section"><div class="integrity-diff-title">' + lsLabel + '</div>';
    for (var i = 0; i < Math.min(onlyInLS.length, 10); i++) {
      var a = onlyInLS[i];
      diffRows += '<div class="integrity-diff-row"><span class="integrity-diff-uid">#' + (a.uid || '?') + '</span><span class="integrity-diff-email">' + (a.email || '-') + '</span></div>';
    }
    if (onlyInLS.length > 10) diffRows += '<div class="integrity-diff-more">+' + (onlyInLS.length - 10) + ' more</div>';
    diffRows += '</div>';
  }
  if (onlyInIDB.length > 0) {
    var idbLabel = currentLang === 'ar' ? ('in IndexedDB (' + onlyInIDB.length + ')') : ('Only in IndexedDB (' + onlyInIDB.length + ')');
    diffRows += '<div class="integrity-diff-section"><div class="integrity-diff-title">' + idbLabel + '</div>';
    for (var j = 0; j < Math.min(onlyInIDB.length, 10); j++) {
      var b = onlyInIDB[j];
      diffRows += '<div class="integrity-diff-row"><span class="integrity-diff-uid">#' + (b.uid || '?') + '</span><span class="integrity-diff-email">' + (b.email || '-') + '</span></div>';
    }
    if (onlyInIDB.length > 10) diffRows += '<div class="integrity-diff-more">+' + (onlyInIDB.length - 10) + ' more</div>';
    diffRows += '</div>';
  }

  var lsPct = Math.round((lsCount/total)*100);
  var idbPct = Math.round((idbCount/total)*100);

  body.innerHTML = '<div class="integrity-status-bar" style="border-color:' + statusColor + ';background:rgba(' + (statusColor === '#22C55E' ? '34,197,94' : '245,158,11') + ',0.1);"><span class="integrity-status-icon">' + statusIcon + '</span><span class="integrity-status-text" style="color:' + statusColor + ';">' + statusText + '</span></div>' +
    '<div class="integrity-sources">' +
      '<div class="integrity-source-card ls-card"><div class="integrity-source-header"><span class="integrity-source-icon">LS</span><span class="integrity-source-name">' + t('integrityLS') + '</span></div><div class="integrity-source-count" style="color:#60A5FA;">' + lsCount + '</div><div class="integrity-source-label">' + t('integrityTotalAccounts') + '</div><div class="integrity-source-bar"><div class="integrity-source-fill" style="width:' + lsPct + '%;background:#3B82F6;"></div></div></div>' +
      '<div class="integrity-vs">VS</div>' +
      '<div class="integrity-source-card idb-card"><div class="integrity-source-header"><span class="integrity-source-icon">IDB</span><span class="integrity-source-name">' + t('integrityIDB') + '</span></div><div class="integrity-source-count" style="color:#A78BFA;">' + idbCount + '</div><div class="integrity-source-label">' + t('integrityTotalAccounts') + '</div><div class="integrity-source-bar"><div class="integrity-source-fill" style="width:' + idbPct + '%;background:#8B5CF6;"></div></div></div>' +
    '</div>' +
    (diffRows ? '<div class="integrity-differences">' + diffRows + '</div>' : '');

  footer.innerHTML = '<div class="integrity-sync-actions"><button class="integrity-action-btn sync-idb-btn" onclick="syncToIDB()" id="sync-idb-btn">' + t('integritySyncToIDB') + '</button><button class="integrity-action-btn restore-idb-btn" onclick="restoreFromIDB()" id="restore-idb-btn">' + t('integrityRestoreFromIDB') + '</button></div><button class="integrity-close-btn" onclick="hideIntegrityPanel()">' + t('integrityClose') + '</button>';
}

async function checkDataIntegrity() {
  var btn = document.getElementById('integrity-check-btn');
  if (btn) { btn.disabled = true; btn.textContent = t('integrityChecking'); }
  try {
    if (!idb) { showToast(t('integrityNoIDB'), 4000); return; }
    var ACCOUNTS_KEY = 'bybit_tracker_accounts';
    var lsRaw = localStorage.getItem(ACCOUNTS_KEY);
    var lsData = [];
    if (lsRaw) { try { lsData = JSON.parse(lsRaw); } catch(e) { lsData = []; } }
    var idbRaw = await new Promise(function(res, rej) {
      var tx = idb.transaction(IDB_STORE, 'readonly');
      var req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = function() {
        var allData = [];
        (req.result || []).forEach(function(item) {
          try { allData = allData.concat(JSON.parse(item.data)); } catch(e) {}
        });
        res(allData);
      };
      req.onerror = function() { rej(req.error); };
    });
    var result = { lsData: Array.isArray(lsData) ? lsData : [], idbData: Array.isArray(idbRaw) ? idbRaw : [] };
    showIntegrityPanel(result);
  } catch (err) {
    showToast('ERR: ' + err.message, 4000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = t('btnIntegrity'); }
  }
}

async function syncToIDB() {
  var btn = document.getElementById('sync-idb-btn');
  if (btn) { btn.disabled = true; btn.textContent = t('integritySyncing'); }
  try {
    var ACCOUNTS_KEY = 'bybit_tracker_accounts';
    var lsRaw = localStorage.getItem(ACCOUNTS_KEY);
    var lsData = [];
    if (lsRaw) { try { lsData = JSON.parse(lsRaw); } catch(e) { lsData = []; } }
    if (!lsData.length) {
      showToast('No data in LS');
      if (btn) { btn.disabled = false; btn.textContent = t('integritySyncToIDB'); }
      return;
    }
    await new Promise(function(res, rej) {
      var tx = idb.transaction(IDB_STORE, 'readwrite');
      var str = tx.objectStore(IDB_STORE);
      str.clear();
      lsData.forEach(function(item) { str.put({ key: item.id, data: JSON.stringify(item) }); });
      tx.oncomplete = res;
      tx.onerror = function() { rej(tx.error); };
    });
    var result = { lsData: lsData, idbData: lsData };
    updateIntegrityPanelContent(result);
    showToast(t('integritySyncOk').replace('{n}', lsData.length));
  } catch (err) {
    showToast('ERR: ' + err.message, 4000);
  } finally {
    var btn = document.getElementById('sync-idb-btn');
    if (btn) { btn.disabled = false; btn.textContent = t('integritySyncToIDB'); }
  }
}

async function restoreFromIDB() {
  var btn = document.getElementById('restore-idb-btn');
  if (btn) { btn.disabled = true; btn.textContent = t('integrityRestoring'); }
  try {
    var idbRaw = await new Promise(function(res, rej) {
      var tx = idb.transaction(IDB_STORE, 'readonly');
      var req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = function() {
        var allData = [];
        (req.result || []).forEach(function(item) {
          try { allData = allData.concat(JSON.parse(item.data)); } catch(e) {}
        });
        res(allData);
      };
      req.onerror = function() { rej(req.error); };
    });
    if (!idbRaw || !idbRaw.length) {
      showToast('No data in IDB');
      if (btn) { btn.disabled = false; btn.textContent = t('integrityRestoreFromIDB'); }
      return;
    }
    var ACCOUNTS_KEY = 'bybit_tracker_accounts';
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(idbRaw));
    var result = { lsData: idbRaw, idbData: idbRaw };
    updateIntegrityPanelContent(result);
    showToast(t('integrityRestored').replace('{n}', idbRaw.length));
    accounts = idbRaw;
    saveAccounts();
    renderAccounts();
    renderDashboard();
  } catch (err) {
    showToast('ERR: ' + err.message, 4000);
  } finally {
    var btn = document.getElementById('restore-idb-btn');
    if (btn) { btn.disabled = false; btn.textContent = t('integrityRestoreFromIDB'); }
  }
}
let currentTheme = localStorage.getItem('waqtak_theme') || 'dark';

function applyTheme(theme) {
  currentTheme = theme;
  localStorage.setItem('waqtak_theme', theme);
  const isDark = theme === 'dark';
  const root = document.documentElement;

  if (isDark) {
    root.classList.remove('light-theme');
    root.classList.add('dark-theme');
  } else {
    root.classList.remove('dark-theme');
    root.classList.add('light-theme');
  }

  // Update icons
  const moonIcon = document.getElementById('theme-icon-moon');
  const sunIcon  = document.getElementById('theme-icon-sun');
  if (moonIcon) moonIcon.style.display = isDark ? 'block' : 'none';
  if (sunIcon)  sunIcon.style.display  = isDark ? 'none' : 'block';

  showToast(isDark ? t('toastThemeDark') : t('toastThemeLight'));
}

function toggleTheme() {
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

// Apply saved theme on load
(function initTheme() {
  const saved = localStorage.getItem('waqtak_theme') || 'dark';
  applyTheme(saved);
})();

// ─── Bulk Selection Mode ─────────────────────────────────────────────────────
let bulkMode = false;
let selectedIds = new Set();

function toggleBulkMode() {
  bulkMode = !bulkMode;
  selectedIds.clear();
  const btn = document.getElementById('bulk-toggle-btn');
  const bar = document.getElementById('bulk-actions-bar');
  const toggleBtn = btn ? btn.querySelector('span') : null;

  if (bulkMode) {
    if (bar) bar.style.display = 'flex';
    if (toggleBtn) toggleBtn.textContent = t('bulkExitMode');
    if (btn) btn.classList.add('bulk-active');
  } else {
    if (bar) bar.style.display = 'none';
    if (toggleBtn) toggleBtn.textContent = t('bulkModeBtn');
    if (btn) btn.classList.remove('bulk-active');
    // Clear checkbox visuals
    document.querySelectorAll('.account-checkbox').forEach(cb => {
      cb.checked = false;
      cb.closest('.card')?.classList.remove('bulk-selected');
    });
  }
  updateBulkCount();
  renderAccounts();
}

function toggleAccountSelect(id) {
  if (!bulkMode) return;
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);

  const card = document.getElementById(`account-card-${id}`);
  const cb = card ? card.querySelector('.account-checkbox') : null;
  if (card) card.classList.toggle('bulk-selected', selectedIds.has(id));
  if (cb) cb.checked = selectedIds.has(id);
  updateBulkCount();
}

function updateBulkCount() {
  const el = document.getElementById('bulk-count');
  if (el) el.textContent = selectedIds.size;
  const bar = document.getElementById('bulk-actions-bar');
  if (bar) bar.style.display = (bulkMode && selectedIds.size > 0) ? 'flex' :
                                (bulkMode ? 'flex' : 'none');
}

function bulkSelectAll() {
  accounts.forEach(a => selectedIds.add(a.id));
  document.querySelectorAll('.account-checkbox').forEach(cb => { cb.checked = true; });
  document.querySelectorAll('.account-card').forEach(card => card.classList.add('bulk-selected'));
  updateBulkCount();
}

function bulkDeselectAll() {
  selectedIds.clear();
  document.querySelectorAll('.account-checkbox').forEach(cb => { cb.checked = false; });
  document.querySelectorAll('.account-card').forEach(card => card.classList.remove('bulk-selected'));
  updateBulkCount();
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
  toggleBulkMode(); // Exit bulk mode
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
    const dep = new Date(a.depositTime);
    const s1End = new Date(dep.getTime() + 4 * 86400000);
    const s2End = a.stage2StartTime ? new Date(new Date(a.stage2StartTime).getTime() + 4 * 86400000) : '—';
    const status = a.stage === 1 ? t('csvStage1') : a.stage === 2 ? t('csvStage2') : t('csvDone');
    rows.push([
      a.uid || '',
      a.email || '',
      a.ip || '',
      a.amount || '',
      status,
      formatEgyptShort(s1End),
      typeof s2End === 'string' ? s2End : formatEgyptShort(s2End),
      (a.notes || '').replace(/,/g, ';')
    ]);
  });

  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  const pad = n => String(n).padStart(2, '0');
  const now = new Date();
  a.download = `waqtak_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(t('bulkExportOk').replace('{n}', selectedIds.size));
}

// ─── Timeline Visualization ────────────────────────────────────────────────────
let timelineVisible = true;

function toggleTimeline() {
  timelineVisible = !timelineVisible;
  const container = document.getElementById('timeline-container');
  const btn = document.getElementById('timeline-toggle-btn');
  const btnSpan = btn ? btn.querySelector('span') : null;

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

  // Find earliest and latest dates for scale
  let minTime = now;
  let maxTime = now;
  accounts.forEach(a => {
    const dep = new Date(a.depositTime).getTime();
    const end = a.stage2StartTime
      ? new Date(a.stage2StartTime).getTime() + 8 * oneDay
      : dep + 8 * oneDay;
    if (dep < minTime) minTime = dep;
    if (end > maxTime) maxTime = end;
  });

  // Add 1 day padding on each side
  minTime -= oneDay;
  maxTime += oneDay;
  const totalRange = maxTime - minTime;

  // Snap to day boundaries for "today" marker
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const todayMs = todayStart.getTime();
  const todayPct = ((todayMs - minTime) / totalRange) * 100;

  let html = `<div class="timeline-scale-wrapper"><div class="timeline-today-marker" style="left:${todayPct}%;"><span class="today-label">${t('timelineToday')}</span></div></div>`;

  accounts.slice(0, 20).forEach(a => {
    const depMs = new Date(a.depositTime).getTime();
    const stage1EndMs = depMs + 4 * oneDay;
    const stage2EndMs = a.stage2StartTime
      ? new Date(a.stage2StartTime).getTime() + 4 * oneDay
      : stage1EndMs + 4 * oneDay;

    const left1 = Math.max(0, ((depMs - minTime) / totalRange) * 100);
    const left2 = Math.max(0, ((stage1EndMs - minTime) / totalRange) * 100);
    const left3 = Math.max(0, ((stage2EndMs - minTime) / totalRange) * 100);

    const width1 = left2 - left1;
    const width2 = left3 - left2;
    const isDone = a.stage === 2 && stage2EndMs <= now;

    const uid = a.uid ? `#${a.uid}` : `#?`;
    const label = uid;

    html += `
      <div class="timeline-row" onclick="focusAccount(${a.id})">
        <div class="timeline-row-label" title="${a.email || ''}">${label}</div>
        <div class="timeline-bar-track">
          <div class="timeline-bar-stage1" style="left:${left1}%;width:${width1}%;" title="المرحلة 1"></div>
          ${width2 > 0 ? `<div class="timeline-bar-stage2 ${isDone ? 'done' : ''}" style="left:${left2}%;width:${width2}%;" title="المرحلة 2"></div>` : ''}
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

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement.tagName.toLowerCase();
  const isInput = tag === 'input' || tag === 'textarea' || tag === 'select';

  // Ctrl+Enter → Calculate / Save
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    if (typeof calculate === 'function' && currentMode === 'calculator') calculate();
    else if (typeof saveAccount === 'function') saveAccount();
    return;
  }

  // Ctrl+N → New Account (in manager mode)
  if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !isInput) {
    if (currentMode === 'manager') {
      e.preventDefault();
      openAddForm();
    }
    return;
  }

  // Ctrl+E → Export
  if ((e.ctrlKey || e.metaKey) && e.key === 'e' && !isInput) {
    e.preventDefault();
    exportAccounts();
    return;
  }

  // Ctrl+B → Toggle Theme
  if ((e.ctrlKey || e.metaKey) && e.key === 'b' && !isInput) {
    e.preventDefault();
    toggleTheme();
    return;
  }

  // Ctrl+K → Shortcuts modal
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    if (typeof toggleShortcutsModal === 'function') toggleShortcutsModal();
    return;
  }

  // Ctrl+Shift+F → Focus search
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
    e.preventDefault();
    const search = document.getElementById('mgr-search');
    if (search) { search.focus(); search.select(); }
    return;
  }
});

// ─── Update card checkbox in renderAccounts ───────────────────────────────────
const _origRenderAccounts = renderAccounts;
// (overridden below in the function itself via the card innerHTML tweak)

// Update renderAccounts to add bulk checkbox
const origRenderAccounts = renderAccounts;
renderAccounts = function() {
  origRenderAccounts();
  // Add checkbox after rendering
  document.querySelectorAll('.account-card').forEach(card => {
    if (!card.querySelector('.account-checkbox')) {
      const header = card.querySelector('.account-card-header');
      if (header) {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'account-checkbox';
        cb.title = currentLang === 'ar' ? 'تحديد' : 'Select';
        cb.onclick = (ev) => {
          ev.stopPropagation();
          const id = parseInt(card.id.replace('account-card-', ''));
          toggleAccountSelect(id);
        };
        header.insertBefore(cb, header.firstChild);
      }
    }
  });

  // Sync checkbox state in bulk mode
  if (bulkMode) {
    document.querySelectorAll('.account-card').forEach(card => {
      const id = parseInt(card.id.replace('account-card-', ''));
      const cb = card.querySelector('.account-checkbox');
      if (cb) cb.checked = selectedIds.has(id);
      card.classList.toggle('bulk-selected', selectedIds.has(id));
    });
  }
};

// ─── Auto-reload timeline when dashboard updates ───────────────────────────────
const _origRenderDashboard = renderDashboard;
renderDashboard = function() {
  _origRenderDashboard();
  renderTimeline();
};
