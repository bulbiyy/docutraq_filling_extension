const $ = id => document.getElementById(id);
const fieldIds = ["title","eventDate","purpose","benefits","venue","priority","expectedAttendance","previousAttendance","previousGbmAttendance","gbmsPerSemester","groupGoals","accomplished","otherInfo"];
let activeType = "baseFunding";
function addItem(item={}) {
  const node = $("itemTemplate").content.firstElementChild.cloneNode(true);
  node.querySelector(".category").value = item.category || "PROGRAMS";
  node.querySelector(".description").value = item.description || "";
  node.querySelector(".quantity").value = item.quantity ?? "1";
  node.querySelector(".cost").value = item.cost ?? "0";
  node.querySelector(".remove").addEventListener("click",()=>node.remove());
  $("items").append(node);
}
async function loadTemplate() {
  activeType = $("templateType").value;
  const key = `docutraq_${activeType}`;
  const stored = await chrome.storage.local.get(key);
  const data = stored[key] || window.DOCUTRAQ_DEFAULTS[activeType];
  for (const id of fieldIds) $(id).value = data[id] ?? "";
  $("items").replaceChildren();
  (data.items?.length ? data.items : [{}]).forEach(addItem);
  $("saveStatus").textContent = "Loaded saved template.";
}
function collect() {
  const data = {};
  for (const id of fieldIds) data[id] = $(id).value;
  data.items = [...$("items").querySelectorAll(".item-card")].map(card=>({
    category:card.querySelector(".category").value,
    description:card.querySelector(".description").value.trim(),
    quantity:card.querySelector(".quantity").value,
    cost:card.querySelector(".cost").value
  }));
  return data;
}
$("templateType").addEventListener("change",loadTemplate);
$("addItem").addEventListener("click",()=>addItem());
$("save").addEventListener("click",async()=>{
  await chrome.storage.local.set({[`docutraq_${activeType}`]:collect()});
  $("saveStatus").textContent = "Saved on this browser.";
});
$("back").addEventListener("click",()=>window.close());
loadTemplate();