// Prefer stable attributes, then semantic classes; nth-of-type is a last resort.
export function selectorFor(element: Element, doc: Document = document): string {
  const unique = (selector: string) => {
    try {
      return doc.querySelectorAll(selector).length === 1 && doc.querySelector(selector) === element;
    } catch {
      return false;
    }
  };

  if (element.id && !/\d{4,}|[a-f0-9]{8,}/i.test(element.id)) {
    const id = '#' + CSS.escape(element.id);
    if (unique(id)) return id;
  }

  for (const attribute of ['data-testid', 'data-t', 'itemprop', 'data-role']) {
    const value = element.getAttribute(attribute);
    if (!value || value.length > 100) continue;
    const selector = `${element.localName}[${attribute}="${CSS.escape(value)}"]`;
    if (unique(selector)) return selector;
  }

  const parts: string[] = [];
  let node: Element | null = element;
  while (node && node !== doc.documentElement && parts.length < 10) {
    const stable = [...node.classList].filter(
      (c) => c.length < 60 && !/\d{3,}|[a-f0-9]{8,}|^(?:hover|focus|is-loading|css-|sc-)/i.test(c),
    );

    let part =
      node.localName +
      stable
        .slice(0, 3)
        .map((c) => '.' + CSS.escape(c))
        .join('');
    if (node !== element && node.id && !/\d{4,}/.test(node.id)) part = '#' + CSS.escape(node.id);
    parts.unshift(part);
    if (unique(parts.join(' > '))) return parts.join(' > ');
    const siblings = node.parentElement
      ? [...node.parentElement.children].filter((el) => el.localName === node!.localName)
      : [];
    if (siblings.length > 1) parts[0] += `:nth-of-type(${siblings.indexOf(node) + 1})`;
    if (unique(parts.join(' > '))) return parts.join(' > ');
    node = node.parentElement;
  }
  return parts.join(' > ');
}
