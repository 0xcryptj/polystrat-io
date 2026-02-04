import { supabase } from "./supabase";

export function renderLogin(el: (tag: any, props?: any, ...children: any[]) => any) {
  const email = el("input", { placeholder: "email", type: "email" }) as HTMLInputElement;
  const password = el("input", { placeholder: "password", type: "password" }) as HTMLInputElement;
  const msg = el("div", { className: "muted" }, "");

  async function signUp() {
    msg.textContent = "Signing up…";
    const { error } = await supabase.auth.signUp({ email: email.value.trim(), password: password.value });
    msg.textContent = error ? `Sign up failed: ${error.message}` : "Sign up ok. Now sign in.";
  }

  async function signIn() {
    msg.textContent = "Signing in…";
    const { error } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
    msg.textContent = error ? `Sign in failed: ${error.message}` : "Signed in.";
    if (!error) location.hash = "#markets";
  }

  return el(
    "div",
    { className: "grid" },
    el(
      "div",
      { className: "card" },
      el("div", { className: "cardHeader" }, el("div", { className: "cardTitle" }, el("h2", {}, "Login"), el("span", { className: "muted" }, "Supabase email auth"))),
      el(
        "div",
        { className: "section" },
        el("div", { className: "field" }, el("div", { className: "fieldLabel" }, el("span", {}, "Email"), el("span", { className: "muted" }, "required")), email),
        el("div", { className: "field", style: "margin-top:12px" }, el("div", { className: "fieldLabel" }, el("span", {}, "Password"), el("span", { className: "muted" }, "required")), password),
        el("div", { className: "row", style: "margin-top:12px" },
          el("button", { className: "btn", onclick: signUp }, "Sign up"),
          el("button", { className: "btn primary", onclick: signIn }, "Sign in")
        ),
        el("div", { style: "margin-top:10px" }, msg)
      )
    )
  );
}
