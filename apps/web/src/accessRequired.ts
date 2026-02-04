export function renderAccessRequired(el: (tag: any, props?: any, ...children: any[]) => any, reason?: string) {
  return el(
    "div",
    { className: "grid" },
    el(
      "div",
      { className: "card" },
      el("div", { className: "cardHeader" }, el("div", { className: "cardTitle" }, el("h2", {}, "Access Required"), el("span", { className: "muted" }, "Token-gated"))),
      el(
        "div",
        { className: "section" },
        el("div", { className: "muted" }, "Your account is signed in, but you don't currently meet the token holding requirement."),
        el("div", { className: "muted", style: "margin-top:10px" }, reason ? `Reason: ${reason}` : ""),
        el("div", { className: "muted", style: "margin-top:10px" }, "Link a wallet on the Wallets page, then try again."),
        el("div", { className: "row", style: "margin-top:12px" },
          el("button", { className: "btn primary", onclick: () => (location.hash = "#wallets") }, "Go to Wallets"),
          el("button", { className: "btn", onclick: () => location.reload() }, "Re-check")
        )
      )
    )
  );
}
