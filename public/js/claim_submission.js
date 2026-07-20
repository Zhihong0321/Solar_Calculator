(function () {
  "use strict";

  var CATEGORIES = [
    "Transport / Fuel", "Toll & Parking", "Meals & Refreshments", "Accommodation / Lodging",
    "Tools & Hardware", "Site Consumables / Materials", "Courier & Postage",
    "Printing & Stationery", "Equipment Rental", "Others"
  ];
  var MAX_CONCURRENT_OCR = 6;
  var BUYER_NAME = "Eternalgy Sdn Bhd";
  var BUYER_PATTERN = /eternalgy/i;

  var EMPTY_FORM = { vendor: "", receipt_date: "", receipt_id: "", amount: "", currency: "MYR", category: "", item: "", description: "" };

  var items = []; // { id, fileName, mimeType, previewUrl, stage, errorMessage, md5, model, claimId, fileUrl, fileMime, form, el }
  var idCounter = 0;
  var queue = [];
  var active = 0;

  var claimantInput = document.getElementById("claimant");
  var fileInput = document.getElementById("file-input");
  var uploadStatus = document.getElementById("upload-status");
  var cardsEl = document.getElementById("cards");

  function nextId() {
    idCounter += 1;
    return "receipt-" + idCounter;
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === "class") node.className = attrs[key];
        else if (key === "text") node.textContent = attrs[key];
        else node.setAttribute(key, attrs[key]);
      });
    }
    (children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function categoryOptions(selected) {
    var frag = document.createDocumentFragment();
    frag.appendChild(el("option", { value: "", text: "Select" }));
    CATEGORIES.forEach(function (c) {
      var opt = el("option", { value: c, text: c });
      if (c === selected) opt.selected = true;
      frag.appendChild(opt);
    });
    return frag;
  }

  function updateUploadStatus() {
    var reading = items.filter(function (i) { return i.stage === "reading"; }).length;
    var queued = items.filter(function (i) { return i.stage === "queued"; }).length;
    if (items.length === 0) {
      uploadStatus.classList.add("hidden");
      return;
    }
    uploadStatus.classList.remove("hidden");
    uploadStatus.textContent = items.length + " receipt(s) · " + reading + " reading · " + queued + " queued";
  }

  // ---- Receipt card DOM (built once per item, then mutated in place) ----

  function buildCard(item) {
    var thumbSlot;
    if (item.mimeType === "application/pdf") {
      thumbSlot = el("span", { class: "thumb-pdf", text: "PDF" });
    } else {
      thumbSlot = el("img", { class: "thumb", src: item.previewUrl, alt: item.fileName });
    }

    var fileNameEl = el("span", { class: "file-name", text: item.fileName });
    var md5El = el("span", { class: "md5" });
    var head = el("div", { class: "card-head" }, [
      thumbSlot,
      el("div", { class: "card-head-text" }, [fileNameEl, md5El])
    ]);

    var statusEl = el("p", { class: "status" });

    var vendorInput = el("input", { id: "vendor-" + item.id });
    var vendorError = el("span", { class: "field-error hidden" }, []);
    vendorError.textContent = "Eternalgy is the buyer, never the vendor — enter the actual shop/supplier.";
    var categorySelect = el("select", { id: "category-" + item.id }, []);
    categorySelect.appendChild(categoryOptions(""));

    var itemInput = el("input", { id: "item-" + item.id, placeholder: "e.g. Petrol (RON95), 30L" });
    var descTextarea = el("textarea", { id: "description-" + item.id, placeholder: "Why this was claimed" });
    var dateInput = el("input", { id: "date-" + item.id, type: "date" });
    var receiptIdInput = el("input", { id: "receiptid-" + item.id });
    var amountInput = el("input", { id: "amount-" + item.id, inputmode: "decimal" });
    var currencyInput = el("input", { id: "currency-" + item.id });

    var updateBtn = el("button", { type: "submit", class: "btn", text: "Update" });
    var deleteBtn = el("button", { type: "button", class: "btn-delete", text: "Delete" });

    var form = el("form", { class: "form-grid hidden" }, [
      el("div", { class: "row-tight" }, [el("span", { class: "buyer-badge", text: "Buyer: " + BUYER_NAME })]),
      el("div", { class: "row" }, [
        el("div", { class: "field" }, [el("label", { class: "field-label", text: "Vendor" }), vendorInput, vendorError]),
        el("div", { class: "field" }, [el("label", { class: "field-label", text: "Category" }), categorySelect])
      ]),
      el("div", { class: "field" }, [el("label", { class: "field-label", text: "Item purchased" }), itemInput]),
      el("div", { class: "field" }, [el("label", { class: "field-label", text: "Purpose / description" }), descTextarea]),
      el("div", { class: "row" }, [
        el("div", { class: "field" }, [el("label", { class: "field-label", text: "Date" }), dateInput]),
        el("div", { class: "field" }, [el("label", { class: "field-label", text: "Receipt no." }), receiptIdInput])
      ]),
      el("div", { class: "row" }, [
        el("div", { class: "field grow2" }, [el("label", { class: "field-label", text: "Amount" }), amountInput]),
        el("div", { class: "field" }, [el("label", { class: "field-label", text: "Currency" }), currencyInput])
      ]),
      el("div", { class: "row" }, [updateBtn, deleteBtn])
    ]);

    var section = el("section", { class: "card", id: "card-" + item.id }, [head, statusEl, form]);

    function syncField(field, value) {
      item.form[field] = value;
      if (field === "vendor") {
        var isBuyer = BUYER_PATTERN.test(value);
        vendorError.classList.toggle("hidden", !isBuyer);
        updateBtn.disabled = isBuyer || item.stage === "saving";
      }
    }

    vendorInput.addEventListener("input", function (e) { syncField("vendor", e.target.value); });
    itemInput.addEventListener("input", function (e) { syncField("item", e.target.value); });
    descTextarea.addEventListener("input", function (e) { syncField("description", e.target.value); });
    dateInput.addEventListener("input", function (e) { syncField("receipt_date", e.target.value); });
    receiptIdInput.addEventListener("input", function (e) { syncField("receipt_id", e.target.value); });
    amountInput.addEventListener("input", function (e) { syncField("amount", e.target.value); });
    currencyInput.addEventListener("input", function (e) { syncField("currency", e.target.value); });
    categorySelect.addEventListener("change", function (e) { syncField("category", e.target.value); });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      saveEdits(item.id);
    });
    deleteBtn.addEventListener("click", function () {
      deleteClaim(item.id);
    });

    item.el = {
      section: section, statusEl: statusEl, md5El: md5El, form: form,
      vendorInput: vendorInput, vendorError: vendorError, categorySelect: categorySelect,
      itemInput: itemInput, descTextarea: descTextarea, dateInput: dateInput,
      receiptIdInput: receiptIdInput, amountInput: amountInput, currencyInput: currencyInput,
      updateBtn: updateBtn, deleteBtn: deleteBtn
    };
    return section;
  }

  function populateForm(item) {
    var e = item.el;
    e.vendorInput.value = item.form.vendor;
    e.itemInput.value = item.form.item;
    e.descTextarea.value = item.form.description;
    e.dateInput.value = item.form.receipt_date;
    e.receiptIdInput.value = item.form.receipt_id;
    e.amountInput.value = item.form.amount;
    e.currencyInput.value = item.form.currency;
    e.categorySelect.innerHTML = "";
    e.categorySelect.appendChild(categoryOptions(item.form.category));
    var isBuyer = BUYER_PATTERN.test(item.form.vendor);
    e.vendorError.classList.toggle("hidden", !isBuyer);
  }

  function renderCard(item) {
    if (!item.el) {
      cardsEl.appendChild(buildCard(item));
    }
    var e = item.el;
    e.md5El.textContent = item.md5 ? "md5 " + item.md5.slice(0, 10) + "…" : "";
    e.md5El.title = item.md5 || "";

    e.statusEl.className = "status";
    e.statusEl.textContent = "";
    if (item.stage === "queued") e.statusEl.textContent = "Queued…";
    else if (item.stage === "reading") e.statusEl.textContent = "Reading with MiMo…";
    else if (item.stage === "saving") e.statusEl.textContent = "Saving…";
    else if (item.stage === "saved" && !item.errorMessage) {
      e.statusEl.textContent = "Saved — Update to edit, Delete to remove.";
      e.statusEl.className = "status-ok";
    }
    if (item.errorMessage) {
      e.statusEl.textContent = item.errorMessage;
      e.statusEl.className = "status-error";
    }

    var showForm = Boolean(item.md5) && item.stage !== "queued" && item.stage !== "reading";
    e.form.classList.toggle("hidden", !showForm);
    if (showForm) {
      populateForm(item);
      e.updateBtn.disabled = BUYER_PATTERN.test(item.form.vendor) || item.stage === "saving";
      e.deleteBtn.disabled = item.stage === "saving";
    }

    updateUploadStatus();
  }

  function removeCard(item) {
    if (item.el && item.el.section.parentNode) {
      item.el.section.parentNode.removeChild(item.el.section);
    }
    items = items.filter(function (i) { return i.id !== item.id; });
    updateUploadStatus();
  }

  // ---- OCR + save pipeline ----

  function pump() {
    while (active < MAX_CONCURRENT_OCR && queue.length > 0) {
      var id = queue.shift();
      active += 1;
      processItem(id).finally(function () {
        active -= 1;
        pump();
      });
    }
  }

  function findItem(id) {
    return items.filter(function (i) { return i.id === id; })[0];
  }

  function processItem(id) {
    var item = findItem(id);
    if (!item) return Promise.resolve();

    item.stage = "reading";
    renderCard(item);

    var body = new FormData();
    body.append("file", item.file);

    return fetch("/api/claim-receipts/ocr", { method: "POST", body: body })
      .then(function (res) { return res.json().then(function (payload) { return { res: res, payload: payload }; }); })
      .then(function (r) {
        if (!r.res.ok) {
          item.stage = "error";
          item.errorMessage = r.payload.error || "OCR request failed";
          item.md5 = r.payload.md5;
          renderCard(item);
          return;
        }
        var draft = r.payload.draft;
        item.md5 = r.payload.md5;
        item.model = r.payload.model;
        item.fileUrl = r.payload.file_url;
        item.fileMime = r.payload.file_mime;
        item.form = {
          vendor: draft.vendor || "",
          receipt_date: draft.receipt_date || "",
          receipt_id: draft.receipt_id || "",
          amount: draft.amount != null ? String(draft.amount) : "",
          currency: draft.currency || "MYR",
          category: draft.category_hint || "",
          item: draft.item || "",
          description: draft.description || ""
        };
        renderCard(item);
        return createClaim(item.id);
      })
      .catch(function (error) {
        item.stage = "error";
        item.errorMessage = error && error.message ? error.message : "OCR request threw";
        renderCard(item);
      });
  }

  function createClaim(id) {
    var item = findItem(id);
    if (!item) return Promise.resolve();
    item.stage = "saving";
    renderCard(item);

    return fetch("/api/claim-receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({}, item.form, {
        md5: item.md5,
        submitted_by: claimantInput.value,
        file_url: item.fileUrl,
        file_mime: item.fileMime
      }))
    })
      .then(function (res) { return res.json().then(function (payload) { return { res: res, payload: payload }; }); })
      .then(function (r) {
        if (!r.res.ok) {
          item.stage = "error";
          item.errorMessage = r.payload.error || "Auto-save failed";
          renderCard(item);
          return;
        }
        item.stage = "saved";
        item.claimId = r.payload.claim.id;
        item.errorMessage = undefined;
        renderCard(item);
      })
      .catch(function (error) {
        item.stage = "error";
        item.errorMessage = error && error.message ? error.message : "Auto-save threw";
        renderCard(item);
      });
  }

  function saveEdits(id) {
    var item = findItem(id);
    if (!item) return;
    if (!item.claimId) {
      createClaim(id);
      return;
    }
    item.stage = "saving";
    renderCard(item);
    fetch("/api/claim-receipts/" + item.claimId, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item.form)
    })
      .then(function (res) { return res.json().then(function (payload) { return { res: res, payload: payload }; }); })
      .then(function (r) {
        item.stage = "saved";
        item.errorMessage = r.res.ok ? undefined : (r.payload.error || "Update failed");
        renderCard(item);
      })
      .catch(function (error) {
        item.stage = "saved";
        item.errorMessage = error && error.message ? error.message : "Update threw";
        renderCard(item);
      });
  }

  function deleteClaim(id) {
    var item = findItem(id);
    if (!item) return;
    var request = item.claimId ? fetch("/api/claim-receipts/" + item.claimId, { method: "DELETE" }) : Promise.resolve();
    request.then(function () {
      removeCard(item);
    });
  }

  function handleFiles(fileList) {
    Array.prototype.forEach.call(fileList, function (file) {
      var id = nextId();
      var item = {
        id: id, file: file, fileName: file.name, mimeType: file.type,
        previewUrl: URL.createObjectURL(file), stage: "queued", form: Object.assign({}, EMPTY_FORM)
      };
      items.push(item);
      renderCard(item);
      queue.push(id);
    });
    pump();
  }

  fileInput.addEventListener("change", function () {
    if (fileInput.files && fileInput.files.length) handleFiles(fileInput.files);
    fileInput.value = "";
  });

  // Prefill the claimant field with the logged-in agent's name — still editable, in case
  // someone is submitting on behalf of a site crew member without their own login.
  fetch("/api/agent/me", { credentials: "same-origin" })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      if (data && data.name && !claimantInput.value) claimantInput.value = data.name;
    })
    .catch(function () {});
})();
