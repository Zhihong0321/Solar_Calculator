(function () {
  "use strict";

  var claims = [];
  var activeFilter = "";

  var reviewerNameEl = document.getElementById("reviewerName");
  var accessErrorEl = document.getElementById("accessError");
  var reviewBodyEl = document.getElementById("reviewBody");
  var claimsListEl = document.getElementById("claimsList");
  var emptyStateEl = document.getElementById("emptyState");
  var filterTabs = document.querySelectorAll(".filter-tab");
  var refreshBtn = document.getElementById("refreshBtn");

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
    return claim.amount != null ? claim.currency + " " + Number(claim.amount).toFixed(2) : "Amount pending";
  }

  function claimCard(claim) {
    var header = el("div", { class: "flex items-start justify-between gap-4" }, [
      el("div", {}, [
        el("h3", { class: "text-sm font-bold text-slate-900", text: claim.vendor || "Vendor pending" }),
        el("p", { class: "text-xs text-slate-400 mt-0.5", text: (claim.category || "Category pending") + (claim.receipt_date ? " · " + claim.receipt_date : "") })
      ]),
      el("div", { class: "text-right" }, [
        el("div", { class: "text-sm font-bold text-slate-900", text: money(claim) }),
        el("span", { class: "status-pill status-" + claim.status, text: claim.status })
      ])
    ]);

    var bodyLines = [];
    if (claim.item) bodyLines.push(el("p", { class: "text-sm text-slate-700 mt-2" }, [el("strong", { text: "Item: " }), document.createTextNode(claim.item)]));
    if (claim.description) bodyLines.push(el("p", { class: "text-sm text-slate-500 mt-1", text: claim.description }));

    var metaLine = el("p", { class: "text-xs text-slate-400 mt-3" }, [
      document.createTextNode("Submitted by " + claim.submitted_by + (claim.receipt_id ? " · Receipt #" + claim.receipt_id : ""))
    ]);

    var footerChildren = [metaLine];

    if (claim.file_url) {
      var link = el("a", { href: claim.file_url, target: "_blank", rel: "noopener", class: "text-xs text-blue-600 hover:text-blue-500" });
      link.innerHTML = '<i class="fa-solid fa-receipt"></i> View receipt';
      footerChildren.push(link);
    }

    var actionsRow;
    if (claim.status === "Pending") {
      var approveBtn = el("button", { type: "button", class: "text-xs font-semibold px-3 py-1.5 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-colors" }, []);
      approveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Approve';
      var rejectBtn = el("button", { type: "button", class: "text-xs font-semibold px-3 py-1.5 rounded-md bg-red-50 text-red-700 hover:bg-red-600 hover:text-white transition-colors" }, []);
      rejectBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Reject';
      approveBtn.addEventListener("click", function () { decide(claim.id, "Approved"); });
      rejectBtn.addEventListener("click", function () { decide(claim.id, "Rejected"); });
      actionsRow = el("div", { class: "flex gap-2 mt-3" }, [approveBtn, rejectBtn]);
    } else {
      actionsRow = el("p", { class: "text-xs text-slate-400 mt-3", text: claim.status + " by " + (claim.approved_by || "unknown") });
    }

    var footer = el("div", { class: "flex items-center justify-between flex-wrap gap-2 mt-1" }, footerChildren);

    return el("div", { class: "border border-gray-200 rounded-md p-4 bg-white" }, [header].concat(bodyLines).concat([footer, actionsRow]));
  }

  function render() {
    var filtered = activeFilter ? claims.filter(function (c) { return c.status === activeFilter; }) : claims;
    claimsListEl.innerHTML = "";
    if (filtered.length === 0) {
      emptyStateEl.classList.remove("hidden");
      return;
    }
    emptyStateEl.classList.add("hidden");
    filtered.forEach(function (claim) {
      claimsListEl.appendChild(claimCard(claim));
    });
  }

  // approved_by is resolved server-side from the authenticated session, not sent from here —
  // reviewerName is display-only (see the /api/agent/me fetch below).
  function decide(id, status) {
    fetch("/api/claim-receipts/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: status })
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
