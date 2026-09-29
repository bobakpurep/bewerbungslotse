const DEF = { appUrl: '', details: true, max: 20 };
chrome.storage.sync.get(DEF, o => { appUrl.value = o.appUrl; details.checked = o.details; max.value = o.max; });
save.onclick = () => chrome.storage.sync.set({ appUrl: appUrl.value.trim(), details: details.checked, max: +max.value || 20 }, () => { ok.textContent = 'Gespeichert ✓'; });
