/* Loads the portfolio from its single editable content source on static hosts. */
(async function loadLatestPortfolioContent() {
  "use strict";

  const cacheKey = "v=" + Date.now();

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getValue(path, contexts) {
    const key = path.trim();
    let value;
    for (let i = contexts.length - 1; i >= 0; i--) {
      const context = contexts[i];
      if (key === ".") { value = context; break; }
      let current = context;
      let found = true;
      for (const part of key.split(".")) {
        if (current == null || !(part in Object(current))) { found = false; break; }
        current = current[part];
      }
      if (found) { value = current; break; }
    }
    return value;
  }

  function resolve(path, contexts) {
    const raw = path.trim().endsWith("|raw");
    const cleanKey = raw ? path.trim().slice(0, -4).trim() : path;
    const value = getValue(cleanKey, contexts);
    return raw ? String(value ?? "") : escapeHtml(value);
  }

  function tokenize(template) {
    const root = { type: "root", children: [] };
    const stack = [root];
    const tag = /{{([^}]+)}}/g;
    let last = 0;
    let match;
    while ((match = tag.exec(template))) {
      if (match.index > last) stack.at(-1).children.push({ type: "text", value: template.slice(last, match.index) });
      const token = match[1].trim();
      if (token.startsWith("/")) {
        stack.pop();
      } else if (token.startsWith("#") || token.startsWith("^")) {
        const node = { type: "block", kind: token[0], name: token.slice(1).trim(), children: [] };
        stack.at(-1).children.push(node);
        stack.push(node);
      } else {
        stack.at(-1).children.push({ type: "value", name: token });
      }
      last = tag.lastIndex;
    }
    if (last < template.length) stack.at(-1).children.push({ type: "text", value: template.slice(last) });
    return root.children;
  }

  function renderNodes(nodes, contexts, output) {
    for (const node of nodes) {
      if (node.type === "text") output.push(node.value);
      else if (node.type === "value") output.push(resolve(node.name, contexts));
      else if (node.kind === "#") {
        if (node.name.startsWith("if ")) {
          if (getValue(node.name.slice(3), contexts)) renderNodes(node.children, contexts, output);
          continue;
        }
        const value = getValue(node.name, contexts);
        if (Array.isArray(value)) {
          value.forEach((item, index) => renderNodes(node.children, contexts.concat([{ first: index === 0 }, item]), output));
        } else if (value) renderNodes(node.children, contexts.concat([value]), output);
      } else if (node.kind === "^") {
        const value = getValue(node.name, contexts);
        if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) renderNodes(node.children, contexts, output);
      }
    }
  }

  function render(template, content) {
    const output = [];
    renderNodes(tokenize(template), [content], output);
    return output.join("");
  }

  try {
    const [contentResponse, templateResponse] = await Promise.all([
      fetch("content.json?" + cacheKey, { cache: "no-store" }),
      fetch("index.template.html?" + cacheKey, { cache: "no-store" }),
    ]);
    if (!contentResponse.ok || !templateResponse.ok) throw new Error("Could not load the latest site content");
    const [content, template] = await Promise.all([contentResponse.json(), templateResponse.text()]);
    document.open();
    document.write(render(template, content));
    document.close();
  } catch (error) {
    /* Keep the pre-rendered page as a reliable fallback if the network is unavailable. */
    console.warn("Using the pre-rendered portfolio fallback.", error);
  }
})();
