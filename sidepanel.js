const $ = id => document.getElementById(id);
let current = "baseFunding";
async function refreshInfo() {
  const key = `docutraq_${current}`;
  const stored = await chrome.storage.local.get(key);
  const template = stored[key] || window.DOCUTRAQ_DEFAULTS[current];
  const count = (template.items || []).length;
  const total = (template.items || []).reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.cost || 0), 0);
  $("templateInfo").textContent = `${count} saved budget line items · Estimated total $${total.toFixed(2)}. You can edit all saved answers in Settings.`;
}
$("type").addEventListener("change", () => { current = $("type").value; refreshInfo(); });
$("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("dismiss").addEventListener("click", () => window.close());
$("start").addEventListener("click", async () => {
  $("status").textContent = "Checking the active tab…";
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.id || !tab.url?.startsWith("https://www.docutraq.sg.ufl.edu/")) {
    $("status").textContent = "Open DocuTraq in this tab, then click Start Request & Autofill again.";
    return;
  }
  const key = `docutraq_${current}`;
  const stored = await chrome.storage.local.get(key);
  const data = stored[key] || window.DOCUTRAQ_DEFAULTS[current];
  try {
    const response = await chrome.tabs.sendMessage(tab.id, {type:"DOCUTRAQ_START", data, requestType:current});
    $("status").textContent = response?.message || "Command sent. Check the DocuTraq page.";
  } catch (error) {
    $("status").textContent = "Refresh the DocuTraq tab once, then try again.";
  }
});
refreshInfo();