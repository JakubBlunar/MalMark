// Prefer stable attributes, then semantic classes; nth-of-type is a last resort.
export function selectorFor(element: Element, doc: Document = document): string {
  const unique = (selector: string) => {
    if (selector.length > 2000) return false;
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
  let contextual = false;
  let leaf = '';
  while (node && node !== doc.documentElement) {
    const stable = [...node.classList].filter(
      (c) => c.length < 60 && !/\d{3,}|[a-f0-9]{8,}|^(?:hover|focus|is-loading|css-|sc-)/i.test(c),
    );

    let part =
      node.localName +
      stable
        .slice(0, 3)
        .map((c) => '.' + CSS.escape(c))
        .join('');
    let anchored = stable.length > 0;
    if (node.id && !/\d{4,}|[a-f0-9]{8,}/i.test(node.id)) {
      part = '#' + CSS.escape(node.id);
      anchored = true;
    } else {
      for (const attribute of ['data-testid', 'data-t', 'itemprop', 'data-role']) {
        const value = node.getAttribute(attribute);
        if (!value || value.length > 100) continue;
        part = `${node.localName}[${attribute}="${CSS.escape(value)}"]`;
        anchored = true;
        break;
      }
    }
    if (node === element) leaf = part;
    // A tag may be unique only until a banner or another episode adds the same tag.
    // Prefer a stable ancestor; a descendant selector also tolerates wrapper changes.
    if (node !== element && anchored && unique(`${part} ${leaf}`)) return `${part} ${leaf}`;
    contextual ||= anchored;
    parts.unshift(part);
    if (contextual && unique(parts.join(' > '))) return parts.join(' > ');
    const siblings = node.parentElement
      ? [...node.parentElement.children].filter((el) => el.localName === node!.localName)
      : [];
    if (siblings.length > 1) parts[0] += `:nth-of-type(${siblings.indexOf(node) + 1})`;
    if (contextual && unique(parts.join(' > '))) return parts.join(' > ');
    node = node.parentElement;
  }
  const selector = parts.join(' > ');
  if (unique(selector)) return selector;
  throw new Error(
    'Could not identify this element uniquely. Choose another title or episode label.',
  );
}
