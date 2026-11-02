(() => {
  const norm = s => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const visible = el => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function nativeSet(el, value) {
    if (!el || value === undefined || value === null) return false;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype :
      el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, String(value));
    else el.value = String(value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.classList.add("dt-assistant-filled");
    return true;
  }

  function findField(terms, scope = document) {
    const labels = [...scope.querySelectorAll("label")].filter(visible);
    for (const term of terms) {
      const label = labels.find(l => norm(l.innerText || l.textContent).includes(term));
      if (label) {
        const control = label.control ||
          (label.htmlFor && document.getElementById(label.htmlFor)) ||
          label.querySelector("input,textarea,select");
        if (control) return control;
      }
    }
    const controls = [...scope.querySelectorAll("input,textarea,select")].filter(visible);
    return controls.find(el => terms.some(term =>
      norm([el.name, el.id, el.placeholder, el.getAttribute("aria-label"),
        el.parentElement?.innerText, el.previousElementSibling?.innerText].join(" ")).includes(term)
    )) || null;
  }

  function fillSummary(data) {
    let count = 0;
    const map = [
      [["title of activity", "activity title"], data.title],
      [["purpose of activity"], data.purpose],
      [["list the benefits", "benefits to the state"], data.benefits],
      [["purpose/goals of your group", "purpose/goals", "goals of your group"], data.groupGoals],
      [["how you have accomplished", "accomplished these goals"], data.accomplished],
      [["other information", "budget committee"], data.otherInfo]
    ];
    for (const [terms, value] of map) {
      const field = findField(terms);
      if (value && nativeSet(field, value)) count++;
    }
    return count;
  }

  function findCategorySection(category) {
    const all = [...document.querySelectorAll("h1,h2,h3,h4,strong,b,div,section,article,p")]
      .filter(visible);
    const heading = all.find(el => {
      const text = norm(el.innerText || el.textContent);
      return text.length < 100 && text.includes(category.toLowerCase()) &&
        (/\b\d+\s*[-–]\s*/.test(text) || text === category.toLowerCase());
    });
    if (!heading) return null;
    let node = heading;
    for (let i = 0; i < 7 && node; i++, node = node.parentElement) {
      if (node.querySelector && [...node.querySelectorAll("a,button")].some(el =>
        visible(el) && norm(el.innerText || el.textContent).includes("add a new item"))) return node;
    }
    return heading.parentElement?.parentElement || null;
  }

  async function addBudgetItem(item) {
    const category = norm(item.category).toUpperCase();
    const section = findCategorySection(category);
    if (!section) return { ok: false, reason: `Couldn't find the ${category} budget section.` };

    const addLink = [...section.querySelectorAll("a,button")]
      .find(el => visible(el) && norm(el.innerText || el.textContent).includes("add a new item"));
    if (!addLink) return { ok: false, reason: `Couldn't find Add a New Item under ${category}.` };

    addLink.click();
    await sleep(350);

    const dialogs = [...document.querySelectorAll('[role="dialog"],.ui-dialog,.modal,.modal-dialog')]
      .filter(visible);
    let dialog = dialogs.find(el => norm(el.innerText).includes("add/edit items")) || dialogs[dialogs.length - 1];
    if (!dialog) {
      const candidates = [...document.querySelectorAll("div")]
        .filter(el => visible(el) && norm(el.innerText).includes("add/edit items") && el.querySelectorAll("input").length >= 3);
      dialog = candidates.sort((a,b) => a.querySelectorAll("*").length - b.querySelectorAll("*").length)[0] || null;
    }
    if (!dialog) return { ok: false, reason: `The ${category} item dialog did not open.` };

    const inputs = [...dialog.querySelectorAll("input")].filter(visible);
    const description = findField(["description"], dialog) || inputs[0];
    const quantity = findField(["number of items", "quantity"], dialog) || inputs[1];
    const cost = findField(["cost per item", "cost"], dialog) || inputs[2];

    if (!description || !quantity || !cost) {
      return { ok: false, reason: `The ${category} dialog opened, but its three fields weren't identified.` };
    }

    nativeSet(description, item.description || "");
    nativeSet(quantity, item.quantity || "1");
    nativeSet(cost, item.cost || "0");
    await sleep(100);

    const addButton = [...dialog.querySelectorAll("button,input[type=button],input[type=submit]")].find(el =>
      visible(el) && norm(el.innerText || el.value) === "add"
    );
    if (!addButton) return { ok: false, reason: `Filled ${category}, but couldn't identify the dialog's Add button.` };
    addButton.click();
    await sleep(450);
    return { ok: true };
  }

  async function fillBudgetItems(items) {
    const results = [];
    for (const item of (items || [])) {
      if (!item.description || Number(item.quantity || 0) <= 0) continue;
      results.push(await addBudgetItem(item));
    }
    return results;
  }

  function clickByText(terms) {
    const candidates = [...document.querySelectorAll("a,button,input[type=button],input[type=submit]")].filter(visible);
    const target = candidates.find(el => terms.some(t => norm(el.innerText || el.value).includes(t)));
    if (target) { target.click(); return true; }
    return false;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "DOCUTRAQ_START") return;
    (async () => {
      const data = message.data || {};
      const page = norm(document.body.innerText);
      if (page.includes("dashboard") || page.includes("create a new sar/tar")) {
        const clicked = clickByText(["create a new sar/tar", "create a new sar"]);
        sendResponse({ message: clicked
          ? "Opened the new request flow. Continue through the request steps, then click Autofill on each page."
          : "I couldn't identify the new-request button on this page." });
        return;
      }

      const textCount = fillSummary(data);
      let itemResults = [];
      if (page.includes("part ii: enter items") || page.includes("add a new item")) {
        itemResults = await fillBudgetItems(data.items || []);
      }
      const successful = itemResults.filter(r => r.ok).length;
      const failed = itemResults.filter(r => !r.ok);
      let messageText = `Filled ${textCount} matching text fields. Added ${successful} of ${itemResults.length} budget items.`;
      if (failed.length) messageText += " " + failed.map(r => r.reason).join(" ");
      else if (itemResults.length === 0) messageText += " No saved budget items were configured for this template.";
      messageText += " Review the page before continuing. Final submission is never automatic.";
      sendResponse({ message: messageText });
    })().catch(error => sendResponse({ message: `Autofill error: ${error.message}` }));
    return true;
  });

  const style = document.createElement("style");
  style.textContent = ".dt-assistant-filled{outline:2px solid #1d9b61!important;outline-offset:1px!important}";
  document.documentElement.appendChild(style);
})();