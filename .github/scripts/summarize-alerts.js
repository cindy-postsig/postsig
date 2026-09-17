const fs = require('fs');

function normalizeSeverity(severity) {
  return (severity || 'unknown').toString().toLowerCase();
}

function isTargetSeverity(severity) {
  const s = normalizeSeverity(severity);
  return s === 'high' || s === 'critical';
}

function readAlerts() {
  const raw = fs.readFileSync('alerts.json', 'utf8');
  return JSON.parse(raw);
}

function buildRows(alerts) {
  const filtered = alerts.filter((a) => {
    const sev = a?.security_advisory?.severity;
    return isTargetSeverity(sev);
  });

  const rows = filtered.map((a) => {
    const pkg = a?.dependency?.package?.name || 'unknown-package';
    const eco = a?.dependency?.package?.ecosystem || 'unknown-ecosystem';
    const sev = normalizeSeverity(a?.security_advisory?.severity);
    const summary =
      (a?.security_advisory?.summary || '').replace(/\r?\n|\|/g, ' ').trim() ||
      'No summary';
    const scope = a?.dependency?.scope || 'unknown';
    const htmlUrl = a?.html_url || '';
    const cves =
      (a?.security_advisory?.cve_id && [a.security_advisory.cve_id]) || [];
    const ghsa = a?.security_advisory?.ghsa_id
      ? [a.security_advisory.ghsa_id]
      : [];
    const ids = [...cves, ...ghsa].filter(Boolean).join(', ') || 'n/a';

    return { pkg, eco, sev, scope, ids, summary, htmlUrl };
  });

  rows.sort((a, b) => {
    const sevOrder = { critical: 0, high: 1 };
    const ao = sevOrder[a.sev] ?? 99;
    const bo = sevOrder[b.sev] ?? 99;
    if (ao !== bo) return ao - bo;
    return a.pkg.localeCompare(b.pkg);
  });

  return rows;
}

function toMarkdown(rows) {
  const generatedAt = new Date().toISOString();
  const counts = rows.reduce(
    (acc, r) => {
      if (r.sev === 'critical') acc.critical += 1;
      if (r.sev === 'high') acc.high += 1;
      return acc;
    },
    { critical: 0, high: 0 },
  );

  let md = '';
  md += '## Dependency Alert Triage (High/Critical)\n\n';
  md += `Generated at: ${generatedAt}\n\n`;
  md += `- Critical: ${counts.critical}\n`;
  md += `- High: ${counts.high}\n\n`;

  if (rows.length === 0) {
    md += 'No open high/critical Dependabot alerts. ✅\n';
    return md;
  }

  md +=
    '| Severity | Package | Ecosystem | Scope | Advisory IDs | Summary | Link |\n';
  md += '|---|---|---|---|---|---|---|\n';
  for (const r of rows) {
    const link = r.htmlUrl ? `[alert](${r.htmlUrl})` : 'n/a';
    md += `| ${r.sev} | ${r.pkg} | ${r.eco} | ${r.scope} | ${r.ids} | ${r.summary} | ${link} |\n`;
  }

  md += '\n### Objective\n';
  md += 'Upgrade the affected packages to a non-vulnerable version with the\n';
  md += 'smallest possible change, without breaking the build or tests.\n\n';

  md += '### Instructions\n';
  md +=
    '1. Read the advisory and confirm which versions are actually affected\n';
  md += '   and whether our usage exercises the vulnerable code path.\n';
  md +=
    "2. If it's a **direct** dependency: bump to the minimum patched version\n";
  md +=
    '   that satisfies our existing version constraints. Prefer a patch/minor\n';
  md += '   bump over a major bump.\n';
  md += "3. If it's a **transitive** dependency: resolve it via the lockfile\n";
  md += '   (e.g. `npm audit fix`, override/resolution field, or bumping the\n';
  md +=
    '   parent) rather than adding a new direct dependency, unless there is\n';
  md += '   no other option.\n';
  md += '4. If only a **major version** fixes it: review the changelog for\n';
  md += '   breaking changes, apply required code migrations, and list every\n';
  md += '   code change you made in the PR description.\n';
  md += '5. Regenerate the lockfile. Do not hand-edit it.\n';
  md +=
    '6. Run the full build, test suite, and linters. Fix any failures caused\n';
  md += '   by the upgrade. Do not modify or skip tests to make them pass.\n\n';

  md += '### Constraints\n';
  md += '- Do NOT upgrade unrelated dependencies.\n';
  md +=
    '- Do NOT change CI config, tooling versions, or formatting beyond what\n';
  md += '  the upgrade requires.\n';
  md += '- If the fix requires a breaking change you cannot safely complete,\n';
  md +=
    '  stop and report back on this issue instead of merging a partial fix.\n';
  md += '- Use the given branch for this work\n';
  md += '- Create a PR against the development branch\n\n';

  md += '### Definition of done\n';
  md += '- [ ] Vulnerable version no longer appears anywhere in the lockfile\n';
  md += '      (verify with `npm ls <pkg>` / `pip show` / equivalent)\n';
  md += '- [ ] Build, tests, and lint pass locally and in CI\n';
  md += '- [ ] PR opened against `development`, linked to this issue, titled\n';
  md += '      `fix(deps): bump <package> to <version> (CVE-YYYY-NNNNN)`\n';
  md +=
    '- [ ] PR description includes: advisory link, severity, what changed,\n';
  md += '      any code migrations, and test results\n\n';

  md += '### Escalation\n';
  md +=
    'If the advisory has no patched version yet, or the fix is blocked by an\n';
  md +=
    'incompatible peer dependency, comment on this issue with your analysis\n';
  md +=
    'and a recommended mitigation (pin, patch, or vendor workaround) instead\n';
  md += 'of opening a PR.\n';

  return md;
}

function main() {
  const alerts = readAlerts();
  const rows = buildRows(alerts);
  const body = toMarkdown(rows);

  fs.writeFileSync('alert-summary.md', body, 'utf8');
  fs.writeFileSync(
    'alert-summary.json',
    JSON.stringify(
      {
        title: 'Dependency Alerts: High/Critical',
        body,
        hasFindings: rows.length > 0,
        count: rows.length,
      },
      null,
      2,
    ),
    'utf8',
  );
}

main();
