/**
 * Next.js → Vite/react-router source transform.
 * The prototype only uses next/link, next/navigation and async route params.
 */

/** Replace `href=` with `to=` only inside <Link …> opening tags. */
export function linkHrefToTo(code) {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const start = code.indexOf('<Link', i);
    if (start === -1) {
      out += code.slice(i);
      break;
    }
    out += code.slice(i, start);

    let j = start;
    let depth = 0;
    let quote = null;
    while (j < code.length) {
      const ch = code[j];
      if (quote) {
        if (ch === quote && code[j - 1] !== '\\') quote = null;
      } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      else if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) break;
      j++;
    }

    out += code.slice(start, j + 1).replace(/\bhref=/g, 'to=');
    i = j + 1;
  }
  return out;
}

const NAV_HOOK_MAP = {
  useRouter: 'useNavigate',
  usePathname: 'useLocation',
  useSearchParams: 'useSearchParams',
  useParams: 'useParams',
};

export function transform(code, { isPage }) {
  let out = code;

  // 1 — directives are meaningless in a SPA
  out = out.replace(/^['"]use client['"];?\n+/m, '');

  // 2 — next/link → react-router
  out = out.replace(/import\s+Link\s+from\s+['"]next\/link['"];?/g, "import { Link } from 'react-router-dom';");
  out = linkHrefToTo(out);

  // 3 — next/navigation → react-router hooks
  out = out.replace(/import\s*\{([^}]+)\}\s*from\s*['"]next\/navigation['"];?/g, (_m, names) => {
    const mapped = names
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => NAV_HOOK_MAP[n] ?? n);
    return `import { ${[...new Set(mapped)].join(', ')} } from 'react-router-dom';`;
  });

  out = out.replace(/const\s+router\s*=\s*useRouter\(\)/g, 'const navigate = useNavigate()');
  out = out.replace(/router\.push\(/g, 'navigate(');
  out = out.replace(/router\.replace\(([^)]*)\)/g, 'navigate($1, { replace: true })');
  out = out.replace(/router\.back\(\)/g, 'navigate(-1)');
  out = out.replace(/const\s+pathname\s*=\s*usePathname\(\)/g, 'const pathname = useLocation().pathname');
  out = out.replace(/const\s+searchParams\s*=\s*useSearchParams\(\)/g, 'const [searchParams] = useSearchParams()');

  // 4 — async route params → useParams()
  if (isPage && /params:\s*Promise</.test(out)) {
    out = out.replace(
      /export default (?:async )?function (\w+)\(\{\s*params\s*\}:\s*\{\s*params:\s*Promise<[^>]*>\s*\}\)/g,
      'export default function $1()',
    );

    out = out.replace(/const\s*\{([^}]+)\}\s*=\s*(?:use\(params\)|await params);/g, (_m, inner) => {
      const fields = inner
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean)
        .map((f) => `${f} = ''`)
        .join(', ');
      return `const { ${fields} } = useParams();`;
    });

    if (/from 'react-router-dom'/.test(out)) {
      out = out.replace(/import \{([^}]+)\} from 'react-router-dom';/, (_m, names) => {
        const set = new Set(names.split(',').map((n) => n.trim()).filter(Boolean));
        set.add('useParams');
        return `import { ${[...set].join(', ')} } from 'react-router-dom';`;
      });
    } else {
      out = `import { useParams } from 'react-router-dom';\n${out}`;
    }
  }

  // 5 — drop React's `use` import once its only call site is gone
  if (!/\buse\(/.test(out)) {
    out = out.replace(/import\s*\{([^}]*)\}\s*from\s*['"]react['"];?\n?/g, (_m, names) => {
      const kept = names
        .split(',')
        .map((n) => n.trim())
        .filter((n) => n && n !== 'use');
      return kept.length ? `import { ${kept.join(', ')} } from 'react';\n` : '';
    });
  }

  return out.replace(/^\n+/, '');
}
