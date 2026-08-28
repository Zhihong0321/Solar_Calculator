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

  // Camera photos routinely land at 8-12MB. Downscale + re-encode on-device before upload so
  // mobile agents on weak signal aren't pushing full-res JPGs — text stays legible for OCR well
  // below this ceiling.
  var IMAGE_MAX_DIMENSION = 2000;
  var IMAGE_TARGET_BYTES = 1.5 * 1024 * 1024;
  var IMAGE_MIN_QUALITY = 0.5;

  var EMPTY_FORM = { vendor: "", receipt_date: "", receipt_id: "", amount: "", currency: "MYR", category: "", item: "", description: "" };

  var items = []; // { id, fileName, mimeType, previewUrl, stage, errorMessage, md5, model, claimId, fileUrl, fileMime, form, el, onBehalfOfUserId }
  var idCounter = 0;
  var queue = [];
  var active = 0;

  // Admin/HR only: who new receipts get attributed to. null = the logged-in session itself.
  // Captured onto each item when it's added (not read again later) so switching mid-batch can't
  // retroactively change who an already-queued receipt is filed under.
  var selectedSubmitterId = null;

  var claimantInput = document.getElementById("claimant");
  var fileInput = document.getElementById("file-input");
  var uploadStatus = document.getElementById("upload-status");
  var cardsEl = document.getElementById("cards");

  function nextId() {
    idCounter += 1;
    return "receipt-" + idCounter;
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error("canvas.toBlob returned null"));
      }, type, quality);
    });
  }

  // Resizes + re-encodes raster images to JPEG on-device before upload. PDFs and GIFs pass
  // through untouched (GIFs may be animated; canvas would flatten to a single frame). Falls back
  // to the original file on any failure (unsupported format, browser lacking createImageBitmap).
  function preprocessImage(file) {
    if (!file.type || file.type.indexOf("image/") !== 0 || file.type === "image/gif") {
      return Promise.resolve(file);
    }

    return createImageBitmap(file, { imageOrientation: "from-image" })
      .then(function (bitmap) {
        var scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
        var width = Math.round(bitmap.width * scale);
        var height = Math.round(bitmap.height * scale);

        var canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        var ctx = canvas.getContext("2d");
        if (!ctx) return file;
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();

        var quality = 0.85;
        function attempt(blob) {
          if (blob.size > IMAGE_TARGET_BYTES && quality > IMAGE_MIN_QUALITY) {
            quality -= 0.1;
            return canvasToBlob(canvas, "image/jpeg", quality).then(attempt);
          }
          if (blob.size >= file.size) return file;
          var baseName = file.name.replace(/\.\w+$/, "") || "receipt";
          return new File([blob], baseName + ".jpg", { type: "image/jpeg", lastModified: file.lastModified });
        }
        return canvasToBlob(canvas, "image/jpeg", quality).then(attempt);
      })
      .catch(function () {
        return file;
      });
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
    else if (item.stage === "reading") e.statusEl.textContent = "Reading receipt…";
    else if (item.stage === "saving") e.statusEl.textContent = "Saving…";
    else if (item.stage === "saved" && !item.errorMessage) {
      if (item.readStatus === "failed") {
        e.statusEl.textContent = "Saved, but nothing could be read from this file — please fill it in manually.";
        e.statusEl.className = "status-warn";
      } else {
        e.statusEl.textContent = "Saved — Update to edit, Delete to remove.";
        e.statusEl.className = "status-ok";
      }
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
        // The server returns status "failed" when the model read nothing at all. Without this the
        // card renders a green "Saved" over an empty form — identical to a successful read, which
        // is how a total extraction failure stayed invisible.
        item.readStatus = r.payload.status;
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

    // submitted_by is resolved server-side from the authenticated session (or, for an admin/HR
    // reviewer who picked someone else in "Submit as", from on_behalf_of_user_id) — never sent
    // from here as free text.
    var body = Object.assign({}, item.form, {
      md5: item.md5,
      file_url: item.fileUrl,
      file_mime: item.fileMime
    });
    if (item.onBehalfOfUserId) body.on_behalf_of_user_id = item.onBehalfOfUserId;

    return fetch("/api/claim-receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
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
      var onBehalfOfUserId = selectedSubmitterId;
      preprocessImage(file).then(function (prepared) {
        var item = {
          id: id, file: prepared, fileName: prepared.name, mimeType: prepared.type,
          previewUrl: URL.createObjectURL(prepared), stage: "queued", form: Object.assign({}, EMPTY_FORM),
          onBehalfOfUserId: onBehalfOfUserId
        };
        items.push(item);
        renderCard(item);
        queue.push(id);
        pump();
      });
    });
  }

  fileInput.addEventListener("change", function () {
    if (fileInput.files && fileInput.files.length) handleFiles(fileInput.files);
    fileInput.value = "";
  });

  // The server always stamps submitted_by server-side (see claimReceiptController.create) — this
  // picker only ever sends a user id, never a free-text name. For everyone but admin/HR it's a
  // single locked option showing their own name. For admin/HR it's populated with the full
  // roster so they can file a receipt under a colleague instead of themselves.
  function populateOwnNameOnly(name) {
    claimantInput.innerHTML = "";
    claimantInput.appendChild(el("option", { value: "", text: name || "You" }));
    claimantInput.disabled = true;
  }

  claimantInput.addEventListener("change", function () {
    selectedSubmitterId = claimantInput.value || null;
  });

  fetch("/api/agent/me", { credentials: "same-origin" })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      if (!data) return;
      var levels = Array.isArray(data.access_level) ? data.access_level.map(function (l) { return String(l).toLowerCase(); }) : [];
      var canSubmitForOthers = levels.indexOf("admin") !== -1 || levels.indexOf("hr") !== -1;
      if (!canSubmitForOthers) {
        populateOwnNameOnly(data.name);
        return;
      }

      return fetch("/api/claim-receipts/submittable-users", { credentials: "same-origin" })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (payload) {
          if (!payload) { populateOwnNameOnly(data.name); return; }
          claimantInput.innerHTML = "";
          claimantInput.appendChild(el("option", { value: "", text: "Myself" + (data.name ? " (" + data.name + ")" : "") }));
          (payload.users || []).forEach(function (u) {
            if (payload.selfId && String(u.id) === String(payload.selfId)) return;
            claimantInput.appendChild(el("option", { value: String(u.id), text: u.name + (u.email ? " · " + u.email : "") }));
          });
          claimantInput.disabled = false;
          claimantInput.value = "";
        });
    })
    .catch(function () {
      populateOwnNameOnly("");
    });

  // Tab switching
  var tabs = document.querySelectorAll(".tab");
  var submitTab = document.getElementById("submit-tab");
  var myClaimsTab = document.getElementById("my-claims-tab");

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var targetTab = tab.dataset.tab;

      tabs.forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");

      if (targetTab === "submit") {
        submitTab.classList.add("active");
        myClaimsTab.classList.remove("active");
      } else if (targetTab === "my-claims") {
        submitTab.classList.remove("active");
        myClaimsTab.classList.add("active");
        loadMyClaims();
      }
    });
  });

  // ---- Business Trip Allowance (outstation / traveling claim) ----
  // A manual allowance form: no receipt/OCR, submitted straight to the same claim_receipt
  // table with category = "Business Trip Allowance" so both claim types live in one list and
  // the admin review labels them by that category.
  var TRIP_CATEGORY = "Business Trip Allowance";

  var typeTabs = document.querySelectorAll(".type-tab");
  var receiptForm = document.getElementById("receipt-form");
  var tripForm = document.getElementById("trip-form");

  var tripFrom = document.getElementById("trip-from");
  var tripTo = document.getElementById("trip-to");
  var tripDeparturePoint = document.getElementById("trip-departure-point");
  var tripDestination = document.getElementById("trip-destination");

  var tripReasonPhotograph = document.getElementById("trip-reason-photograph");
  var tripReasonSitevisit = document.getElementById("trip-reason-sitevisit");
  var tripReasonCollect = document.getElementById("trip-reason-collect");
  var tripReasonOther = document.getElementById("trip-reason-other");
  var tripReasonOtherRow = document.getElementById("trip-reason-other-row");
  var tripReasonOtherText = document.getElementById("trip-reason-other-text");
  var tripCustomerName = document.getElementById("trip-customer-name");
  var tripCustomerAddress = document.getElementById("trip-customer-address");

  var HOSTEL_ROWS = [1, 2].map(function (n) {
    return {
      day: document.getElementById("trip-hostel" + n + "-day"),
      night: document.getElementById("trip-hostel" + n + "-night"),
      cost: document.getElementById("trip-hostel" + n + "-cost")
    };
  });
  var DISTANCE_ROWS = [1, 2, 3, 4, 5, 6].map(function (n) {
    return {
      from: document.getElementById("trip-distance" + n + "-from"),
      to: document.getElementById("trip-distance" + n + "-to"),
      cost: document.getElementById("trip-distance" + n + "-cost")
    };
  });
  var tripTollCost = document.getElementById("trip-toll-cost");
  var MEAL_INPUTS = [
    document.getElementById("trip-meal-day1"),
    document.getElementById("trip-meal-day2"),
    document.getElementById("trip-meal-day3")
  ];
  var tripOtherRemark = document.getElementById("trip-other-remark");
  var tripOtherCost = document.getElementById("trip-other-cost");

  var tripTotal = document.getElementById("trip-total");
  var tripSubmit = document.getElementById("trip-submit");
  var tripStatus = document.getElementById("trip-status");

  function num(v) {
    if (v === null || v === undefined || v === "") return 0;
    var n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  // Inclusive day count between two YYYY-MM-DD dates; 0 if missing/backwards.
  function tripDays() {
    if (!tripFrom.value || !tripTo.value) return 0;
    var a = new Date(tripFrom.value + "T00:00:00");
    var b = new Date(tripTo.value + "T00:00:00");
    if (isNaN(a.getTime()) || isNaN(b.getTime()) || b < a) return 0;
    return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  }

  function computeTripTotal() {
    var total = 0;
    HOSTEL_ROWS.forEach(function (row) { total += num(row.cost.value); });
    DISTANCE_ROWS.forEach(function (row) { total += num(row.cost.value); });
    total += num(tripTollCost.value);
    MEAL_INPUTS.forEach(function (input) { total += num(input.value); });
    total += num(tripOtherCost.value);
    tripTotal.value = total > 0 ? total.toFixed(2) : "";
  }

  function setTripStatus(text, cls) {
    tripStatus.textContent = text || "";
    tripStatus.className = "status" + (cls ? " " + cls : "");
    tripStatus.classList.toggle("hidden", !text);
  }

  function resetTripForm() {
    [tripFrom, tripTo, tripDeparturePoint, tripDestination, tripReasonOtherText,
      tripCustomerName, tripCustomerAddress, tripTollCost, tripOtherRemark, tripOtherCost]
      .forEach(function (el) { if (el) el.value = ""; });
    HOSTEL_ROWS.forEach(function (row) { row.day.value = ""; row.night.value = ""; row.cost.value = ""; });
    DISTANCE_ROWS.forEach(function (row) { row.from.value = ""; row.to.value = ""; row.cost.value = ""; });
    MEAL_INPUTS.forEach(function (input) { input.value = ""; });
    [tripReasonPhotograph, tripReasonSitevisit, tripReasonCollect, tripReasonOther]
      .forEach(function (cb) { cb.checked = false; });
    tripReasonOtherRow.classList.add("hidden");
    tripTotal.value = "";
  }

  tripReasonOther.addEventListener("change", function () {
    tripReasonOtherRow.classList.toggle("hidden", !tripReasonOther.checked);
  });

  var tripCostInputs = [tripTollCost, tripOtherCost].concat(MEAL_INPUTS);
  HOSTEL_ROWS.forEach(function (row) { tripCostInputs.push(row.cost); });
  DISTANCE_ROWS.forEach(function (row) { tripCostInputs.push(row.cost); });
  tripCostInputs.forEach(function (el) {
    el.addEventListener("input", computeTripTotal);
    el.addEventListener("change", computeTripTotal);
  });

  tripSubmit.addEventListener("click", function () {
    var destination = tripDestination.value.trim();
    var departurePoint = tripDeparturePoint.value.trim();
    var from = tripFrom.value;
    var to = tripTo.value;
    var total = num(tripTotal.value);

    var reasons = [];
    if (tripReasonPhotograph.checked) reasons.push("Photograph");
    if (tripReasonSitevisit.checked) reasons.push("Site Visit");
    if (tripReasonCollect.checked) reasons.push("Collect Payment");
    if (tripReasonOther.checked) reasons.push("Other" + (tripReasonOtherText.value.trim() ? " (" + tripReasonOtherText.value.trim() + ")" : ""));

    if (!destination) return setTripStatus("Destination is required.", "status-error");
    if (!from || !to) return setTripStatus("Departure and return dates are required.", "status-error");
    if (tripDays() === 0) return setTripStatus("Return date must be on or after departure date.", "status-error");
    if (!reasons.length) return setTripStatus("Select at least one reason for the trip.", "status-error");
    if (tripReasonOther.checked && !tripReasonOtherText.value.trim()) return setTripStatus("Specify the \"Other\" reason.", "status-error");
    if (total <= 0) return setTripStatus("Enter at least one cost so the total is above zero.", "status-error");

    var days = tripDays();
    var lines = [];
    lines.push("Reason: " + reasons.join(", "));
    if (tripCustomerName.value.trim()) lines.push("Customer name: " + tripCustomerName.value.trim());
    if (tripCustomerAddress.value.trim()) lines.push("Customer address: " + tripCustomerAddress.value.trim());
    lines.push("Trip: " + (departurePoint || "?") + " → " + destination + " · " + from + " → " + to +
      (days ? " (" + days + " day" + (days > 1 ? "s" : "") + ")" : ""));

    HOSTEL_ROWS.forEach(function (row, i) {
      var cost = num(row.cost.value);
      if (cost > 0 || row.day.value || row.night.value) {
        lines.push("Hostel " + (i + 1) + ": " + (row.day.value || 0) + " Day / " + (row.night.value || 0) +
          " Night — RM" + cost.toFixed(2));
      }
    });
    DISTANCE_ROWS.forEach(function (row, i) {
      var cost = num(row.cost.value);
      if (cost > 0 || row.from.value.trim() || row.to.value.trim()) {
        lines.push("Distance " + (i + 1) + ": " + (row.from.value.trim() || "?") + " → " +
          (row.to.value.trim() || "?") + " — RM" + cost.toFixed(2));
      }
    });
    if (num(tripTollCost.value) > 0) lines.push("Toll & parking: RM" + num(tripTollCost.value).toFixed(2));
    MEAL_INPUTS.forEach(function (input, i) {
      if (num(input.value) > 0) lines.push("Meals Day " + (i + 1) + ": RM" + num(input.value).toFixed(2));
    });
    if (num(tripOtherCost.value) > 0) {
      lines.push("Other: RM" + num(tripOtherCost.value).toFixed(2) +
        (tripOtherRemark.value.trim() ? " (" + tripOtherRemark.value.trim() + ")" : ""));
    }

    var body = {
      claim_type: "trip",
      vendor: destination,
      item: "Business trip: " + (departurePoint || "?") + " → " + destination,
      description: lines.join("\n"),
      receipt_date: from,
      amount: total.toFixed(2),
      currency: "MYR",
      category: TRIP_CATEGORY
    };
    if (selectedSubmitterId) body.on_behalf_of_user_id = selectedSubmitterId;

    tripSubmit.disabled = true;
    setTripStatus("Submitting…");

    fetch("/api/claim-receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
      .then(function (res) { return res.json().then(function (p) { return { res: res, payload: p }; }); })
      .then(function (r) {
        tripSubmit.disabled = false;
        if (!r.res.ok) {
          setTripStatus(r.payload.error || "Submit failed.", "status-error");
          return;
        }
        setTripStatus("Business Trip Allowance submitted ✓", "status-ok");
        resetTripForm();
        setTimeout(function () {
          var myClaimsTabBtn = document.querySelector('.tab[data-tab="my-claims"]');
          if (myClaimsTabBtn) myClaimsTabBtn.click();
        }, 700);
      })
      .catch(function (err) {
        tripSubmit.disabled = false;
        setTripStatus(err && err.message ? err.message : "Submit threw.", "status-error");
      });
  });

  typeTabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      typeTabs.forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      var ftype = tab.dataset.ftype;
      receiptForm.classList.toggle("active", ftype === "receipt");
      tripForm.classList.toggle("active", ftype === "trip");
    });
  });

  // Load my claims
  function loadMyClaims() {
    var listEl = document.getElementById("my-claims-list");
    listEl.innerHTML = '<div class="empty-state">Loading...</div>';

    fetch("/api/claim-receipts/mine", { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load claims");
        return res.json();
      })
      .then(function (data) {
        var claims = data.claims || [];
        if (claims.length === 0) {
          listEl.innerHTML = '<div class="empty-state">No claims submitted yet.<br>Switch to "Submit New" to create your first claim.</div>';
          return;
        }

        listEl.innerHTML = "";
        claims.forEach(function (claim) {
          var card = document.createElement("div");
          card.className = "my-claim-card";
          card.dataset.claimId = claim.id;

          var statusClass = (claim.status || "pending").toLowerCase();
          var statusText = claim.status || "Pending";
          var isTrip = claim.category === TRIP_CATEGORY;

          var html = '<div class="my-claim-header">' +
            '<div>' +
            (isTrip ? '<div class="my-claim-badge">Business Trip Allowance</div>' : '') +
            '<div class="my-claim-vendor">' + escapeHtml(claim.vendor || (isTrip ? "Business Trip" : "Unknown Vendor")) + '</div>' +
            '</div>' +
            '<div class="my-claim-status ' + statusClass + '">' + statusText + '</div>' +
            '</div>' +
            '<div class="my-claim-amount">' + (claim.currency || "RM") + ' ' + (claim.amount || "0.00") + '</div>' +
            '<div class="my-claim-meta">' +
            (isTrip ? 'Trip: ' : 'Receipt: ') + (claim.receipt_date || "N/A") + ' • ' +
            'Submitted: ' + formatDate(claim.created_at) +
            '</div>';

          if (claim.remark && statusClass === "rejected") {
            html += '<div class="my-claim-remark">' +
              '<div class="my-claim-remark-label">Rejection Reason:</div>' +
              escapeHtml(claim.remark) +
              '</div>';
          }

          html += '<div class="my-claim-actions">' +
            '<button class="btn-expand" onclick="toggleDetails(' + claim.id + ')">View Details</button>';

          if (statusClass === "pending") {
            html += '<button class="btn-delete-claim" onclick="deleteClaim(' + claim.id + ')">Delete</button>';
          }

          html += '</div>' +
            '<div class="my-claim-details" id="details-' + claim.id + '">' +
            '<div class="my-claim-details-row"><span class="my-claim-details-label">Item:</span>' + escapeHtml(claim.item || "N/A") + '</div>' +
            '<div class="my-claim-details-row"><span class="my-claim-details-label">Category:</span>' + escapeHtml(claim.category || "N/A") + '</div>' +
            '<div class="my-claim-details-row my-claim-desc"><span class="my-claim-details-label">Description:</span>' + escapeHtml(claim.description || "N/A") + '</div>' +
            '<div class="my-claim-details-row"><span class="my-claim-details-label">Receipt ID:</span>' + escapeHtml(claim.receipt_id || "N/A") + '</div>';

          if (claim.file_url) {
            html += '<div class="my-claim-details-row"><span class="my-claim-details-label">Receipt:</span><a href="' + escapeHtml(claim.file_url) + '" target="_blank" style="color: #9aa4ff;">View File</a></div>';
          }

          if (claim.approved_by && (statusClass === "approved" || statusClass === "rejected")) {
            html += '<div class="my-claim-details-row"><span class="my-claim-details-label">Reviewed by:</span>' + escapeHtml(claim.approved_by) + '</div>';
            html += '<div class="my-claim-details-row"><span class="my-claim-details-label">Reviewed at:</span>' + formatDate(claim.approved_at) + '</div>';
          }

          html += '</div>';

          card.innerHTML = html;
          listEl.appendChild(card);
        });
      })
      .catch(function (err) {
        listEl.innerHTML = '<div class="empty-state" style="color: #f28b82;">Failed to load claims.<br>' + escapeHtml(err.message) + '</div>';
      });
  }

  window.toggleDetails = function (claimId) {
    var detailsEl = document.getElementById("details-" + claimId);
    if (detailsEl) {
      detailsEl.classList.toggle("show");
    }
  };

  window.deleteClaim = function (claimId) {
    if (!confirm("Are you sure you want to delete this claim? This cannot be undone.")) return;

    fetch("/api/claim-receipts/" + claimId, {
      method: "DELETE",
      credentials: "same-origin"
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to delete claim");
        return res.json();
      })
      .then(function () {
        loadMyClaims();
      })
      .catch(function (err) {
        alert("Failed to delete claim: " + err.message);
      });
  };

  function formatDate(dateStr) {
    if (!dateStr) return "N/A";
    var d = new Date(dateStr);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function escapeHtml(text) {
    if (!text) return "";
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
})();
