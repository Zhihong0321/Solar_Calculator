(function () {
  "use strict";

  var claims = [];
  var activeFilter = "Pending";
  var activeMonth = "";
  var activeCategory = "";

  var CATEGORIES = [
    "Transport / Fuel", "Toll & Parking", "Meals & Refreshments", "Accommodation / Lodging",
    "Tools & Hardware", "Site Consumables / Materials", "Courier & Postage",
    "Printing & Stationery", "Equipment Rental", "Others",
    // Outstation / traveling claims are manual allowance forms, not receipt claims. They live
    // in the same claim_receipt list (so they still appear under Claim Submission) but are
    // labeled by this category marker instead of a receipt category.
    "Business Trip Allowance"
  ];
  var TRIP_CATEGORY = "Business Trip Allowance";
  var MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  var reviewerNameEl = document.getElementById("reviewerName");
  var accessErrorEl = document.getElementById("accessError");
  var reviewBodyEl = document.getElementById("reviewBody");
  var claimsListEl = document.getElementById("claimsList");
  var emptyStateEl = document.getElementById("emptyState");
  var filterTabs = document.querySelectorAll(".filter-tab");
  var refreshBtn = document.getElementById("refreshBtn");
  var monthFilterEl = document.getElementById("monthFilter");
  var categoryFilterEl = document.getElementById("categoryFilter");
  var lightboxModal = document.getElementById("lightboxModal");
  var lightboxImg = document.getElementById("lightboxImg");
  var lightboxClose = document.getElementById("lightboxClose");

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === "class") node.className = attrs[key];
        else if (key === "text") node.textContent = attrs[key];
        else if (key === "html") node.innerHTML = attrs[key];
        else node.setAttribute(key, attrs[key]);
      });
    }
    (children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function money(claim) {
    var curr = claim.currency || "RM";
    return claim.amount != null ? curr + " " + Number(claim.amount).toFixed(2) : "Amount pending";
  }

  function openLightbox(src) {
    lightboxImg.src = src;
    lightboxModal.classList.remove("hidden");
    lightboxModal.classList.add("flex");
  }

  function closeLightbox() {
    lightboxModal.classList.add("hidden");
    lightboxModal.classList.remove("flex");
    lightboxImg.src = "";
  }

  lightboxClose.addEventListener("click", closeLightbox);
  lightboxModal.addEventListener("click", function (e) {
    if (e.target === lightboxModal) closeLightbox();
  });

  function monthKey(claim) {
    var raw = claim.receipt_date || claim.created_at;
    if (!raw) return null;
    var d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    var month = d.getMonth() + 1;
    return d.getFullYear() + "-" + (month < 10 ? "0" + month : String(month));
  }

  function receiptThumb(claim) {
    if (!claim.file_url) {
      return el("div", { class: "shrink-0 w-28 h-28 rounded-md border border-dashed border-gray-200 bg-slate-50 text-slate-400 text-[11px] font-medium flex items-center justify-center text-center px-2", text: "No receipt" });
    }
    var isPdf = (claim.file_mime || "").indexOf("pdf") !== -1 || /\.pdf($|\?)/i.test(claim.file_url);
    if (isPdf) {
      var pdfBox = el("a", { href: claim.file_url, target: "_blank", rel: "noopener", class: "shrink-0 w-28 h-28 rounded-md border border-gray-200 bg-slate-50 text-slate-500 hover:bg-slate-100 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors" });
      pdfBox.innerHTML = '<i class="fa-solid fa-file-pdf text-xl"></i><span>View PDF</span>';
      return pdfBox;
    }
    var img = el("img", {
      src: claim.file_url,
      alt: "Receipt",
      class: "shrink-0 w-28 h-28 object-cover rounded-md border border-gray-200 bg-white cursor-zoom-in hover:opacity-90 transition-opacity"
    });
    img.addEventListener("click", function () { openLightbox(claim.file_url); });
    return img;
  }

  function getClaimTimestamp(claim) {
    if (claim.created_at) {
      var t = new Date(claim.created_at).getTime();
      if (!isNaN(t)) return t;
    }
    if (claim.receipt_date) {
      var t2 = new Date(claim.receipt_date).getTime();
      if (!isNaN(t2)) return t2;
    }
    return Number(claim.id) || 0;
  }

  function claimCard(claim) {
    var isTrip = claim.category === TRIP_CATEGORY;
    var titleChildren = [
      el("h3", { class: "text-sm font-bold text-slate-900", text: claim.vendor || (isTrip ? "Business Trip" : "Vendor pending") })
    ];
    if (isTrip) {
      titleChildren.push(el("span", { class: "inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200", text: "Business Trip Allowance" }));
    }
    titleChildren.push(el("p", { class: "text-xs text-slate-400 mt-0.5", text: (claim.category || "Category pending") + (claim.receipt_date ? " · " + claim.receipt_date.substring(0, 10) : "") }));

    var header = el("div", { class: "flex items-start justify-between gap-4" }, [
      el("div", {}, titleChildren),
      el("div", { class: "text-right" }, [
        el("div", { class: "text-sm font-bold text-slate-900", text: money(claim) }),
        el("span", { class: "status-pill status-" + (claim.status || "Pending"), text: claim.status || "Pending" })
      ])
    ]);

    var bodyLines = [];
    if (claim.item) bodyLines.push(el("p", { class: "text-sm text-slate-700 mt-2" }, [el("strong", { text: "Item: " }), document.createTextNode(claim.item)]));
    if (claim.description) bodyLines.push(el("p", { class: "text-sm text-slate-500 mt-1 whitespace-pre-line", text: claim.description }));

    var metaLine = el("p", { class: "text-xs text-slate-400 mt-3" }, [
      document.createTextNode("Submitted " + (claim.created_at ? new Date(claim.created_at).toLocaleString() : "") + (claim.receipt_id ? " · Inv Number " + claim.receipt_id : ""))
    ]);

    var footerChildren = [metaLine];

    if (claim.file_url) {
      var link = el("a", { href: claim.file_url, target: "_blank", rel: "noopener", class: "text-xs text-blue-600 hover:text-blue-500" });
      link.innerHTML = '<i class="fa-solid fa-receipt"></i> View receipt';
      footerChildren.push(link);
    }

    var actionsRow;
    var rejectFormRow = null;
    if (claim.status === "Pending") {
      var approveBtn = el("button", { type: "button", class: "text-xs font-semibold px-3 py-1.5 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-colors" }, []);
      approveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Approve';
      var rejectBtn = el("button", { type: "button", class: "text-xs font-semibold px-3 py-1.5 rounded-md bg-red-50 text-red-700 hover:bg-red-600 hover:text-white transition-colors" }, []);
      rejectBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Reject';

      var lockButtons = function () {
        approveBtn.disabled = true;
        rejectBtn.disabled = true;
        approveBtn.classList.add("opacity-50", "cursor-not-allowed");
        rejectBtn.classList.add("opacity-50", "cursor-not-allowed");
      };

      approveBtn.addEventListener("click", function () {
        lockButtons();
        decide(claim.id, "Approved");
      });

      // Reject needs a remark first — swap the buttons for an inline textarea + confirm/cancel
      // rather than blocking with window.prompt().
      var remarkInput = el("textarea", {
        class: "w-full text-xs border border-red-200 rounded-md p-2 mt-2 focus:outline-none focus:ring-1 focus:ring-red-400",
        rows: "2",
        placeholder: "Reason for rejection (required)"
      });
      var confirmRejectBtn = el("button", { type: "button", class: "text-xs font-semibold px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors" }, []);
      confirmRejectBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Confirm Reject';
      var cancelRejectBtn = el("button", { type: "button", class: "text-xs font-semibold px-3 py-1.5 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors", text: "Cancel" });
      var rejectError = el("p", { class: "hidden text-xs text-red-600 mt-1", text: "Please enter a remark before rejecting." });

      rejectFormRow = el("div", { class: "hidden mt-1" }, [
        remarkInput,
        rejectError,
        el("div", { class: "flex gap-2 mt-2" }, [confirmRejectBtn, cancelRejectBtn])
      ]);

      rejectBtn.addEventListener("click", function () {
        actionsRow.classList.add("hidden");
        rejectFormRow.classList.remove("hidden");
        remarkInput.focus();
      });

      cancelRejectBtn.addEventListener("click", function () {
        rejectFormRow.classList.add("hidden");
        actionsRow.classList.remove("hidden");
        remarkInput.value = "";
        rejectError.classList.add("hidden");
      });

      confirmRejectBtn.addEventListener("click", function () {
        var remark = remarkInput.value.trim();
        if (!remark) {
          rejectError.classList.remove("hidden");
          return;
        }
        confirmRejectBtn.disabled = true;
        cancelRejectBtn.disabled = true;
        remarkInput.disabled = true;
        decide(claim.id, "Rejected", remark);
      });

      actionsRow = el("div", { class: "flex gap-2 mt-3" }, [approveBtn, rejectBtn]);
    } else {
      var statusLine = claim.status + " by " + (claim.approved_by || "unknown");
      actionsRow = el("p", { class: "text-xs text-slate-400 mt-3", text: statusLine });
      if (claim.status === "Rejected" && claim.remark) {
        actionsRow = el("div", { class: "mt-3" }, [
          el("p", { class: "text-xs text-slate-400", text: statusLine }),
          el("p", { class: "text-xs text-red-600 mt-1" }, [el("strong", { text: "Remark: " }), document.createTextNode(claim.remark)])
        ]);
      }
    }

    var footer = el("div", { class: "flex items-center justify-between flex-wrap gap-2 mt-1" }, footerChildren);

    var detailChildren = [header].concat(bodyLines).concat([footer, actionsRow]);
    if (rejectFormRow) detailChildren.push(rejectFormRow);

    var detailCol = el("div", { class: "flex-1 min-w-0" }, detailChildren);
    var row = el("div", { class: "flex gap-4" }, [receiptThumb(claim), detailCol]);

    return el("div", { class: "border border-gray-200 rounded-md p-4 bg-white shadow-sm" }, [row]);
  }

  function renderGroupedByAgent(filteredClaims) {
    // Group claims by agent (submitted_by)
    var agentMap = {};
    filteredClaims.forEach(function (claim) {
      var agentName = claim.submitted_by || "Unknown Agent";
      if (!agentMap[agentName]) {
        agentMap[agentName] = {
          agentName: agentName,
          claims: [],
          oldestTimestamp: Infinity
        };
      }
      agentMap[agentName].claims.push(claim);

      var ts = getClaimTimestamp(claim);
      if (ts < agentMap[agentName].oldestTimestamp) {
        agentMap[agentName].oldestTimestamp = ts;
      }
    });

    // Convert map to array and sort groups by oldest pending submission ascending (FIFO)
    var agentGroups = Object.keys(agentMap).map(function (key) {
      return agentMap[key];
    });

    agentGroups.sort(function (a, b) {
      var diff = a.oldestTimestamp - b.oldestTimestamp;
      if (diff !== 0) return diff;
      return a.agentName.localeCompare(b.agentName);
    });

    // For each agent group, sort individual claims by submission timestamp ascending (FIFO)
    agentGroups.forEach(function (group) {
      group.claims.sort(function (a, b) {
        var diff = getClaimTimestamp(a) - getClaimTimestamp(b);
        if (diff !== 0) return diff;
        return (Number(a.id) || 0) - (Number(b.id) || 0);
      });
    });

    claimsListEl.innerHTML = "";
    agentGroups.forEach(function (group) {
      // Calculate totals per currency for this agent group
      var totalsByCurrency = {};
      group.claims.forEach(function (c) {
        var curr = c.currency || "RM";
        var amt = Number(c.amount) || 0;
        totalsByCurrency[curr] = (totalsByCurrency[curr] || 0) + amt;
      });

      var currencyStrings = Object.keys(totalsByCurrency).map(function (curr) {
        return curr + " " + totalsByCurrency[curr].toFixed(2);
      });
      var totalsLabel = currencyStrings.join(" + ");

      var chevronIcon = el("i", { class: "fa-solid fa-chevron-down text-slate-400 text-xs transition-transform duration-200 ml-1" });

      var agentHeader = el("div", { class: "flex items-center justify-between bg-white hover:bg-slate-50/80 border border-slate-200 rounded-lg px-4 py-3.5 cursor-pointer transition-colors select-none shadow-sm" }, [
        el("div", { class: "flex items-center gap-3" }, [
          el("div", { class: "w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs" }, [
            el("i", { class: "fa-solid fa-user" })
          ]),
          el("div", {}, [
            el("h2", { class: "text-sm font-bold text-slate-900", text: group.agentName }),
            el("span", { class: "text-[11px] px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200/60 rounded-full font-semibold mt-0.5 inline-block", text: group.claims.length + " " + (activeFilter === "Pending" ? "unclaimed" : "item") + (group.claims.length > 1 ? "s" : "") })
          ])
        ]),
        el("div", { class: "flex items-center gap-3" }, [
          el("div", { class: "text-right" }, [
            el("div", { class: "text-[11px] uppercase tracking-wider text-slate-400 font-semibold", text: activeFilter === "Pending" ? "Pending Unclaimed" : "Total Amount" }),
            el("div", { class: "text-sm font-bold text-emerald-600", text: totalsLabel })
          ]),
          chevronIcon
        ])
      ]);

      var cardsContainer = el("div", { class: "hidden space-y-3 p-4 bg-slate-50/60 border border-t-0 border-slate-200 rounded-b-lg" }, 
        group.claims.map(function (c) { return claimCard(c); })
      );

      agentHeader.addEventListener("click", function () {
        var isHidden = cardsContainer.classList.contains("hidden");
        if (isHidden) {
          cardsContainer.classList.remove("hidden");
          agentHeader.classList.remove("rounded-lg");
          agentHeader.classList.add("rounded-t-lg");
          chevronIcon.classList.remove("fa-chevron-down");
          chevronIcon.classList.add("fa-chevron-up");
        } else {
          cardsContainer.classList.add("hidden");
          agentHeader.classList.remove("rounded-t-lg");
          agentHeader.classList.add("rounded-lg");
          chevronIcon.classList.remove("fa-chevron-up");
          chevronIcon.classList.add("fa-chevron-down");
        }
      });

      var groupWrapper = el("div", { class: "mb-3" }, [
        agentHeader,
        cardsContainer
      ]);

      claimsListEl.appendChild(groupWrapper);
    });
  }

  function render() {
    var filtered = claims.filter(function (c) {
      if (activeFilter && c.status !== activeFilter) return false;
      if (activeMonth && monthKey(c) !== activeMonth) return false;
      if (activeCategory && (c.category || "") !== activeCategory) return false;
      return true;
    });
    claimsListEl.innerHTML = "";
    if (filtered.length === 0) {
      emptyStateEl.classList.remove("hidden");
      return;
    }
    emptyStateEl.classList.add("hidden");
    renderGroupedByAgent(filtered);
  }

  function populateCategoryOptions() {
    var currentValue = categoryFilterEl.value;
    categoryFilterEl.innerHTML = "";
    categoryFilterEl.appendChild(el("option", { value: "", text: "All Categories" }));
    CATEGORIES.forEach(function (c) {
      categoryFilterEl.appendChild(el("option", { value: c, text: c }));
    });
    categoryFilterEl.value = currentValue;
  }

  function populateMonthOptions() {
    var seen = {};
    claims.forEach(function (c) {
      var k = monthKey(c);
      if (k) seen[k] = true;
    });
    var sortedKeys = Object.keys(seen).sort().reverse();
    var currentValue = monthFilterEl.value;

    monthFilterEl.innerHTML = "";
    monthFilterEl.appendChild(el("option", { value: "", text: "All Months" }));
    sortedKeys.forEach(function (k) {
      var parts = k.split("-");
      var label = MONTH_NAMES[Number(parts[1]) - 1] + " " + parts[0];
      monthFilterEl.appendChild(el("option", { value: k, text: label }));
    });

    if (sortedKeys.indexOf(currentValue) !== -1) monthFilterEl.value = currentValue;
    else activeMonth = "";
  }

  // approved_by is resolved server-side from the authenticated session, not sent from here —
  // reviewerName is display-only (see the /api/agent/me fetch below).
  function decide(id, status, remark) {
    var body = { status: status };
    if (remark) body.remark = remark;
    fetch("/api/claim-receipts/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(loadClaims);
  }

  function loadClaims() {
    return fetch("/api/claim-receipts", { credentials: "same-origin" })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) {
          reviewBodyEl.classList.add("hidden");
          accessErrorEl.classList.remove("hidden");
          accessErrorEl.textContent = res.status === 401
            ? "You need to sign in to review claims."
            : "Claim review is restricted to admin/HR access levels.";
          return null;
        }
        return res.json();
      })
      .then(function (payload) {
        if (!payload) return;
        reviewBodyEl.classList.remove("hidden");
        accessErrorEl.classList.add("hidden");
        claims = payload.claims || [];
        populateMonthOptions();
        render();
      })
      .catch(function () {
        accessErrorEl.classList.remove("hidden");
        accessErrorEl.textContent = "Failed to load claims.";
      });
  }

  filterTabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      filterTabs.forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      activeFilter = tab.getAttribute("data-status") || "";
      render();
    });
  });

  refreshBtn.addEventListener("click", loadClaims);

  monthFilterEl.addEventListener("change", function () {
    activeMonth = monthFilterEl.value;
    render();
  });

  categoryFilterEl.addEventListener("change", function () {
    activeCategory = categoryFilterEl.value;
    render();
  });

  populateCategoryOptions();

  fetch("/api/agent/me", { credentials: "same-origin" })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      if (data && data.name) {
        reviewerNameEl.textContent = data.name;
      }
    })
    .catch(function () {})
    .then(loadClaims);
})();
