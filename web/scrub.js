// After "forget", the words must leave the screen too: chat bubbles, the card and the MCP log.
// Works on anything with textContent, so it runs the same in the page and in tests.
export function scrubNodes(nodes, said) {
  if (!said) return 0;
  let n = 0;
  for (const node of nodes) {
    const t = node.textContent;
    const variants = [said, JSON.stringify(said).slice(1, -1)];
    let out = t;
    for (const v of variants) out = out.split(v).join('[forgotten]');
    if (out !== t) { node.textContent = out; n++; }
  }
  return n;
}
