interface NameParts {
  namespaceIri: string;
  localName: string;
}

function sanitizeIdentifier(raw: string): string {
  const normalized = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim();

  if (!normalized) {
    return "Entity";
  }

  const words = normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ""))
    .filter(Boolean);

  if (!words.length) {
    return "Entity";
  }

  return words
    .map((word) => {
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

function ensureIdentifierStartsWithLetter(value: string): string {
  if (!value) {
    return "Entity";
  }

  return /^[A-Za-z_]/.test(value) ? value : `N${value}`;
}

export function toPascalCase(raw: string): string {
  return ensureIdentifierStartsWithLetter(sanitizeIdentifier(raw));
}

export function toCamelCase(raw: string): string {
  const pascal = toPascalCase(raw);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function splitNamespaceAndLocalName(iri: string): NameParts {
  const hashIndex = iri.lastIndexOf("#");
  if (hashIndex >= 0 && hashIndex < iri.length - 1) {
    return {
      namespaceIri: iri.slice(0, hashIndex + 1),
      localName: iri.slice(hashIndex + 1),
    };
  }

  const slashIndex = iri.lastIndexOf("/");
  if (slashIndex >= 0 && slashIndex < iri.length - 1) {
    return {
      namespaceIri: iri.slice(0, slashIndex + 1),
      localName: iri.slice(slashIndex + 1),
    };
  }

  const colonIndex = iri.lastIndexOf(":");
  if (colonIndex >= 0 && colonIndex < iri.length - 1) {
    return {
      namespaceIri: iri.slice(0, colonIndex + 1),
      localName: iri.slice(colonIndex + 1),
    };
  }

  return {
    namespaceIri: iri,
    localName: iri,
  };
}

function namespaceTokens(namespaceIri: string): string[] {
  const tokens: string[] = [];

  try {
    const parsed = new URL(namespaceIri);
    const hostTokens = parsed.hostname
      .split(".")
      .filter(Boolean)
      .map((token) => token.toLowerCase())
      .reverse();
    tokens.push(...hostTokens);

    const pathTokens = parsed.pathname
      .split("/")
      .map((token) => token.trim())
      .filter(Boolean)
      .map((token) => token.toLowerCase());
    tokens.push(...pathTokens);

    if (parsed.hash) {
      const hashToken = parsed.hash.replace(/^#/, "").trim().toLowerCase();
      if (hashToken) {
        tokens.push(hashToken);
      }
    }
  } catch {
    const rawTokens = namespaceIri
      .replace(/[#:]/g, "/")
      .split("/")
      .map((token) => token.trim())
      .filter(Boolean)
      .map((token) => token.toLowerCase());
    tokens.push(...rawTokens);
  }

  if (!tokens.length) {
    return ["namespace"];
  }

  return tokens;
}

function namespacePrefixCandidates(namespaceIri: string, explicitPrefix?: string): string[] {
  const candidates = new Set<string>();

  if (explicitPrefix) {
    if (explicitPrefix.length <= 3) {
      candidates.add(ensureIdentifierStartsWithLetter(explicitPrefix.toUpperCase()));
    }
    candidates.add(toPascalCase(explicitPrefix));
  }

  const tokens = namespaceTokens(namespaceIri);

  const lastToken = tokens.at(-1);
  if (lastToken) {
    candidates.add(toPascalCase(lastToken));
  }

  if (tokens.length > 1) {
    candidates.add(toPascalCase(tokens.slice(-2).join(" ")));
  }

  candidates.add(toPascalCase(tokens.join(" ")));
  candidates.add("Namespace");

  return Array.from(candidates);
}

export function resolveEntityNames(
  classIris: string[],
  prefixesByNamespace: Map<string, string>,
): Map<string, string> {
  const byLocalName = new Map<string, string[]>();

  for (const iri of classIris) {
    const { localName } = splitNamespaceAndLocalName(iri);
    const baseName = toPascalCase(localName);
    const group = byLocalName.get(baseName) ?? [];
    group.push(iri);
    byLocalName.set(baseName, group);
  }

  const namesByIri = new Map<string, string>();
  const usedNames = new Set<string>();

  const sortedLocalNames = Array.from(byLocalName.keys()).sort((left, right) =>
    left.localeCompare(right),
  );

  for (const baseName of sortedLocalNames) {
    const iris = (byLocalName.get(baseName) ?? []).slice().sort((left, right) =>
      left.localeCompare(right),
    );

    if (iris.length === 1) {
      const candidate = baseName;
      if (!usedNames.has(candidate)) {
        const firstIri = iris[0];
        if (firstIri) {
          namesByIri.set(firstIri, candidate);
        }
        usedNames.add(candidate);
        continue;
      }
    }

    for (const iri of iris) {
      const { namespaceIri } = splitNamespaceAndLocalName(iri);
      const explicitPrefix = prefixesByNamespace.get(namespaceIri);
      const prefixCandidates = namespacePrefixCandidates(namespaceIri, explicitPrefix);

      let selected: string | undefined;
      for (const prefixCandidate of prefixCandidates) {
        const candidate = `${prefixCandidate}${baseName}`;
        if (!usedNames.has(candidate)) {
          selected = candidate;
          break;
        }
      }

      if (!selected) {
        // Final fallback keeps namespace semantics but guarantees deterministic uniqueness.
        const namespaceCode = toPascalCase(namespaceIri).slice(0, 12) || "Namespace";
        selected = `${namespaceCode}${baseName}`;
      }

      namesByIri.set(iri, selected);
      usedNames.add(selected);
    }
  }

  return namesByIri;
}
