import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MarkdownPreview, preprocessWikilinks } from './MarkdownPreview';

describe('preprocessWikilinks', () => {
  it('converts standard [[Target]] wikilinks to internal markdown links', () => {
    const raw = 'See [[Stellar Evolution]] for details.';
    const output = preprocessWikilinks(raw);
    expect(output).toBe('See [Stellar Evolution](#wikilink:Stellar%20Evolution) for details.');
  });

  it('converts aliased [[Target|Alias]] wikilinks to internal markdown links with custom display', () => {
    const raw = 'Read about [[Quantum Superposition|Qubits in Physics]].';
    const output = preprocessWikilinks(raw);
    expect(output).toBe('Read about [Qubits in Physics](#wikilink:Quantum%20Superposition).');
  });

  it('handles multiple wikilinks in single block', () => {
    const raw = 'Connecting [[Alpha]] with [[Beta|Second]] and [[Gamma]].';
    const output = preprocessWikilinks(raw);
    expect(output).toContain('[Alpha](#wikilink:Alpha)');
    expect(output).toContain('[Second](#wikilink:Beta)');
    expect(output).toContain('[Gamma](#wikilink:Gamma)');
  });
});

describe('MarkdownPreview Component (§12)', () => {
  it('renders standard Markdown elements: headings, lists, tables, code blocks', () => {
    const markdown = `
# Main Header
## Secondary Header
### Subtitle

Here is a paragraph with **bold** and *italic* text.

* First bullet
* Second bullet

1. Numbered one
2. Numbered two

> This is a scholarly blockquote from archival records.

| Column A | Column B |
| :--- | :--- |
| Val 1 | Val 2 |

\`\`\`python
def calculate_luminosity(mass):
    return mass ** 3.5
\`\`\`

Inline \`code_token\` test.
`;

    const { container } = render(<MarkdownPreview content={markdown} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Main Header' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Secondary Header' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Subtitle' })).toBeInTheDocument();
    expect(screen.getByText('bold')).toBeInTheDocument();
    expect(screen.getByText('First bullet')).toBeInTheDocument();
    expect(screen.getByText('Numbered one')).toBeInTheDocument();
    expect(screen.getByText(/scholarly blockquote/i)).toBeInTheDocument();
    expect(screen.getByText('Column A')).toBeInTheDocument();
    expect(screen.getByText('Val 1')).toBeInTheDocument();
    expect(container.querySelector('code.language-python')).toBeInTheDocument();
    expect(screen.getByText('code_token')).toBeInTheDocument();
  });

  it('resolves wikilinks that match known Hyades records and calls navigation on click', () => {
    const markdown = 'Refer to [[Kepler Observations]] for empirical data.';
    const records = [
      { id: 'note-kepler-1', title: 'Kepler Observations', type: 'note' },
    ];
    const onNavigate = vi.fn();

    render(
      <MarkdownPreview
        content={markdown}
        resolvedRecords={records}
        onNavigateRecord={onNavigate}
      />
    );

    const link = screen.getByTestId('wikilink-resolved-note-kepler-1');
    expect(link).toBeInTheDocument();
    expect(link).toHaveTextContent('Kepler Observations');

    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledWith(records[0]);
  });

  it('renders unresolved wikilinks in a clean, readable manner without crashing', () => {
    const markdown = 'Mentions [[Lost Papyrus of Alexandria]] which has no corresponding record.';
    render(<MarkdownPreview content={markdown} resolvedRecords={[]} />);

    const unresolved = screen.getByTestId('wikilink-unresolved');
    expect(unresolved).toBeInTheDocument();
    expect(unresolved).toHaveTextContent('[[Lost Papyrus of Alexandria]]');
  });

  it('sanitizes malicious Markdown fixtures containing XSS, script tags, event handlers, and javascript: URLs (§12, §14)', () => {
    const maliciousFixture = `
# Safe Heading

<script>window.__hacked = true; alert("xss")</script>
<script src="http://evil.com/malware.js"></script>

<img src="x" onerror="alert(document.cookie)" />
<svg onload="alert('svg xss')"><circle r="10"/></svg>

[Click for free credits](javascript:alert('malicious'))
<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Data URI</a>
<iframe src="http://malicious-site.example.com"></iframe>

<button onclick="alert('click')">Dangerous button</button>
`;

    const { container } = render(<MarkdownPreview content={maliciousFixture} />);

    // Script tags must be stripped completely
    expect(container.querySelector('script')).toBeNull();
    // iframes must be stripped
    expect(container.querySelector('iframe')).toBeNull();
    // onerror, onload, onclick must not exist as attributes
    expect(container.innerHTML).not.toContain('onerror');
    expect(container.innerHTML).not.toContain('onload');
    expect(container.innerHTML).not.toContain('onclick');
    expect(container.innerHTML).not.toContain('javascript:alert');

    // Safe content must remain visible
    expect(screen.getByRole('heading', { level: 1, name: 'Safe Heading' })).toBeInTheDocument();
  });
});
