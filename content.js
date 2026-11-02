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

  function setPriority(priority) {
    const level = String(priority || "Low").toLowerCase();
    const fraction = level === "high" ? 1 : level === "medium" ? 0.5 : 0;
    const ranges = [...document.querySelectorAll('input[type="range"]')].filter(visible);
    let range = ranges.find(el => norm([
      el.id, el.name, el.getAttribute("aria-label"),
      el.parentElement?.innerText, el.parentElement?.parentElement?.innerText
    ].join(" ")).includes("priority"));
    if (!range && ranges.length === 1) range = ranges[0];
    if (range) {
      const min = Number(range.min || 0), max = Number(range.max || 100);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(range, String(min + (max-min)*fraction));
      else range.value = String(min + (max-min)*fraction);
      range.dispatchEvent(new Event("input", {bubbles:true}));
      range.dispatchEvent(new Event("change", {bubbles:true}));
      return true;
    }
    const sliders = [...document.querySelectorAll(".ui-slider,[role='slider'],.slider")].filter(visible);
    const slider = sliders.find(el => norm(el.parentElement?.innerText || el.parentElement?.parentElement?.innerText).includes("priority"));
    if (slider) {
      const handle = slider.querySelector(".ui-slider-handle,[role='slider']") || slider;
      handle.focus?.();
      handle.dispatchEvent(new KeyboardEvent("keydown",{key:"Home",bubbles:true}));
      const steps = level === "high" ? 10 : level === "medium" ? 5 : 0;
      for(let i=0;i<steps;i++) handle.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));
      handle.dispatchEvent(new KeyboardEvent("keyup",{key:"ArrowRight",bubbles:true}));
      return true;
    }
    return false;
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
    if (setPriority(data.priority)) count++;
    return count;
  }

  function findCategorySection(category) {
    const wanted = norm(category);
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,strong,b,div,section,article,p,span")]
      .filter(visible)
      .filter(el => {
        const text = norm(el.innerText || el.textContent);
        // DocuTraq headings are rendered as e.g. "2 - PROGRAMS".
        return text === wanted || text.replace(/^\\d+\\s*[-–]\\s*/, "") === wanted;
      })
      .sort((a, b) => (a.innerText || a.textContent).length - (b.innerText || b.textContent).length);

    for (const heading of headings) {
      let node = heading;
      for (let i = 0; i < 7 && node; i++, node = node.parentElement) {
        const add = [...(node.querySelectorAll?.("a,button") || [])].find(el =>
          visible(el) && norm(el.innerText || el.textContent).includes("add a new item"));
        if (add) return { container: node, add };
      }
    }
    return null;
  }

  function findOpenItemDialog() {
    const explicit = [...document.querySelectorAll('[role="dialog"],.ui-dialog,.ui-dialog-content,.modal,.modal-dialog')]
      .filter(visible)
      .find(el => norm(el.innerText).includes("add/edit items"));
    if (explicit) return explicit;

    // DocuTraq's legacy popup may not expose dialog semantics. Find the
    // smallest visible wrapper containing its title and the three inputs.
    const candidates = [...document.querySelectorAll("div")]
      .filter(el => visible(el) &&
        norm(el.innerText).includes("add/edit items") &&
        el.querySelectorAll("input").length >= 3);
    return candidates.sort((a, b) =>
      a.querySelectorAll("*").length - b.querySelectorAll("*").length
    )[0] || null;
  }

  async function addBudgetItem(item) {
    const category = norm(item.category).toUpperCase();

    // If the user already opened the Add/Edit Items popup, use it directly.
    // Otherwise open the popup belonging to the requested budget category.
    let dialog = findOpenItemDialog();
    if (!dialog) {
      const sectionMatch = findCategorySection(category);
      if (!sectionMatch) return { ok: false, reason: `Couldn't locate the ${category} section. The category heading must match a visible DocuTraq budget line.` };
      sectionMatch.add.click();
      await sleep(450);
      dialog = findOpenItemDialog();
    }
    if (!dialog) return { ok: false, reason: `The ${category} Add/Edit Items dialog did not open.` };

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