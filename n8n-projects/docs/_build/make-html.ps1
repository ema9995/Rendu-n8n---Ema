$ErrorActionPreference = 'Stop'
$root   = 'C:\Users\ema\n8n-projects'
$raw    = Get-Content (Join-Path $root 'docs\_build\raw.html') -Raw -Encoding UTF8

# Page breaks before each PARTIE are handled in CSS (@media print -> h1:not(.doc-title))
# Mark the main title
$raw = $raw -replace '^<h1>', '<h1 class="doc-title">'

$css = @'
@page { size: A4; margin: 18mm 14mm; }

:root {
  color-scheme: light;          /* empêche le mode sombre automatique */
  --ink:      #1a1d21;
  --muted:    #5b6470;
  --line:     #dfe3e8;
  --accent:   #ea4b71;   /* n8n red */
  --accent2:  #2b6cb0;   /* blue    */
  --code-bg:  #f6f7f9;
  --box-bg:   #fff8e6;
}

* { box-sizing: border-box; }

body {
  font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.65;
  color: var(--ink);
  background: #ffffff;
  max-width: 190mm;
  margin: 0 auto;
  padding: 10mm 6mm 20mm;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ---------- TITLE ---------- */
h1.doc-title {
  font-size: 26pt;
  line-height: 1.2;
  border: none;
  padding: 0 0 6pt;
  margin: 0 0 4pt;
  color: var(--ink);
}
h1.doc-title::after {
  content: "";
  display: block;
  width: 64pt; height: 4pt;
  background: var(--accent);
  margin-top: 10pt;
}

/* ---------- HEADINGS ---------- */
h1 {
  font-size: 19pt;
  margin: 22pt 0 10pt;
  padding-bottom: 5pt;
  border-bottom: 2px solid var(--accent);
  color: var(--ink);
  letter-spacing: -0.2pt;
}
h2 {
  font-size: 14pt;
  margin: 18pt 0 7pt;
  padding-left: 8pt;
  border-left: 4px solid var(--accent);
  line-height: 1.3;
}
h3 {
  font-size: 11.5pt;
  margin: 14pt 0 5pt;
  color: #25303d;
}
h4 {
  font-size: 10.5pt;
  margin: 11pt 0 4pt;
  color: var(--accent2);
  text-transform: uppercase;
  letter-spacing: 0.6pt;
}
h2, h3, h4 { break-after: avoid; page-break-after: avoid; }

/* ---------- TEXT ---------- */
p { margin: 7pt 0; }

strong { font-weight: 650; color: #0f1317; }
em { color: #3d4753; }

a { color: var(--accent2); text-decoration: none; }

ul, ol { margin: 7pt 0 7pt 20pt; padding: 0; }
li { margin: 3pt 0; }
li > ul, li > ol { margin: 3pt 0; }

hr {
  border: none;
  border-top: 1px solid var(--line);
  margin: 18pt 0;
}

/* ---------- CODE ---------- */
code {
  font-family: "Cascadia Mono", Consolas, "SF Mono", Menlo, monospace;
  font-size: 9pt;
  background: var(--code-bg);
  border: 1px solid var(--line);
  border-radius: 3px;
  padding: 1pt 4pt;
  color: #0b3d62;
  word-break: break-word;
}

pre {
  background: var(--code-bg);
  border: 1px solid var(--line);
  border-left: 4px solid var(--accent2);
  border-radius: 4px;
  padding: 9pt 11pt;
  margin: 9pt 0;
  overflow-x: hidden;
  break-inside: avoid;
  page-break-inside: avoid;
}
pre code {
  background: none;
  border: none;
  padding: 0;
  color: #16202b;
  font-size: 8.6pt;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ---------- TABLES ---------- */
table {
  border-collapse: collapse;
  width: 100%;
  margin: 10pt 0;
  font-size: 9.3pt;
  break-inside: avoid;
  page-break-inside: avoid;
}
th {
  background: #eef1f5;
  text-align: left;
  font-weight: 650;
  border: 1px solid var(--line);
  padding: 5pt 7pt;
  color: #25303d;
}
td {
  border: 1px solid var(--line);
  padding: 5pt 7pt;
  vertical-align: top;
}
tbody tr:nth-child(even) td { background: #fafbfc; }

/* ---------- BLOCKQUOTE ---------- */
blockquote {
  background: var(--box-bg);
  border-left: 4px solid #e0a800;
  border-radius: 3px;
  margin: 11pt 0;
  padding: 8pt 12pt;
  break-inside: avoid;
  page-break-inside: avoid;
}
blockquote p { margin: 3pt 0; }
blockquote strong { color: #7a5a00; }

/* ---------- PAGE BREAK ---------- */
.page-break { break-before: page; page-break-before: always; }

/* ---------- PRINT HEADER / FOOTER ---------- */
@media print {
  body { padding: 0; max-width: none; }
  a { color: inherit; }
  h1:not(.doc-title) { break-before: page; page-break-before: always; }
}
'@

$html = @"
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cours complet : CLI, n8n et n8n CLI</title>
<style>
$css
</style>
</head>
<body>
$raw
</body>
</html>
"@

$outHtml = Join-Path $root 'docs\COURS-CLI-N8N.html'
[System.IO.File]::WriteAllText($outHtml, $html, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "HTML : $outHtml"
