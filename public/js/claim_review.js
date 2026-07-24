(function () {
  "use strict";

  var claims = [];
  var activeFilter = "Pending";

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
    var curr = claim.currency || "RM";
    return claim.amount != null ? curr + " " + Number(claim.amount).toFixed(2) : "Amount pending";
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
    var header = el("div", { class: "flex items-start justify-between gap-4" }, [
      el("div", {}, [
        el("h3", { class: "text-sm font-bold text-slate-900", text: claim.vendor || "Vendor pending" }),
        el("p", { class: "text-xs text-slate-400 mt-0.5", text: (claim.category || "Category pending") + (claim.receipt_date ? " · " + claim.receipt_date.substring(0, 10) : "") })
      ]),
      el("div", { class: "text-right" }, [
        el("div", { class: "text-sm font-bold text-slate-900", text: money(claim) }),
        el("span", { class: "status-pill status-" + (claim.status || "Pending"), text: claim.status || "Pending" })
      ])
    ]);

    var bodyLines = [];
    if (claim.item) bodyLines.push(el("p", { class: "text-sm text-slate-700 mt-2" }, [el("strong", { text: "Item: " }), document.createTextNode(claim.item)]));
    if (claim.description) bodyLines.push(el("p", { class: "text-sm text-slate-500 mt-1", text: claim.description }));

    var metaLine = el("p", { class: "text-xs text-slate-400 mt-3" }, [
      document.createTextNode("Submitted " + (claim.created_at ? new Date(claim.created_at).toLocaleString() : "") + (claim.receipt_id ? " · Receipt #" + claim.receipt_id : ""))
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
      
      var handleDecision = function (status) {
        approveBtn.disabled = true;
        rejectBtn.disabled = true;
        approveBtn.classList.add("opacity-50", "cursor-not-allowed");
        rejectBtn.classList.add("opacity-50", "cursor-not-allowed");
        decide(claim.id, status);
      };

      approveBtn.addEventListener("click", function () { handleDecision("Approved"); });
      rejectBtn.addEventListener("click", function () { handleDecision("Rejected"); });
      actionsRow = el("div", { class: "flex gap-2 mt-3" }, [approveBtn, rejectBtn]);
    } else {
      actionsRow = el("p", { class: "text-xs text-slate-400 mt-3", text: claim.status + " by " + (claim.approved_by || "unknown") });
    }

    var footer = el("div", { class: "flex items-center justify-between flex-wrap gap-2 mt-1" }, footerChildren);

    return el("div", { class: "border border-gray-200 rounded-md p-4 bg-white shadow-sm" }, [header].concat(bodyLines).concat([footer, actionsRow]));
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
      var statusLabel = activeFilter === "Pending" ? " unclaimed" : "";
      var totalsLabel = currencyStrings.join(" + ") + statusLabel;

      var agentHeader = el("div", { class: "flex items-center justify-between bg-slate-100 border border-slate-200 rounded-t-lg px-4 py-3" }, [
        el("div", { class: "flex items-center gap-2" }, [
          el("i", { class: "fa-solid fa-user text-slate-500" }),
          el("h2", { class: "text-sm font-bold text-slate-800", text: group.agentName }),
          el("span", { class: "text-xs px-2 py-0.5 bg-slate-200 text-slate-600 rounded-full font-semibold", text: group.claims.length + " " + (activeFilter === "Pending" ? "unclaimed" : "item") + (group.claims.length > 1 ? "s" : "") })
        ]),
        el("div", { class: "text-sm font-bold text-slate-700", text: totalsLabel })
      ]);

      var cardsContainer = el("div", { class: "space-y-3 p-4 bg-slate-50/50 border border-t-0 border-slate-200 rounded-b-lg" }, 
        group.claims.map(function (c) { return claimCard(c); })
      );

      var groupWrapper = el("div", { class: "rounded-lg overflow-hidden border border-slate-200 shadow-sm bg-white mb-4" }, [
        agentHeader,
        cardsContainer
      ]);

      claimsListEl.appendChild(groupWrapper);
    });
  }

  function render() {
    var filtered = activeFilter ? claims.filter(function (c) { return c.status === activeFilter; }) : claims;
    claimsListEl.innerHTML = "";
    if (filtered.length === 0) {
      emptyStateEl.classList.remove("hidden");
      return;
    }
    emptyStateEl.classList.add("hidden");
    renderGroupedByAgent(filtered);
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
