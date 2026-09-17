const fs = require('fs');
const { execFileSync } = require('child_process');

const TRACKING_ISSUE_TITLE = 'Dependency Alerts: High/Critical';

function run(command, args) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function readSummary() {
  const raw = fs.readFileSync('alert-summary.json', 'utf8');
  return JSON.parse(raw);
}

function createIssue(body) {
  fs.writeFileSync('issue-body.md', body, 'utf8');
  run('gh', [
    'issue',
    'create',
    '--title',
    TRACKING_ISSUE_TITLE,
    '--body-file',
    'issue-body.md',
  ]);
}

function main() {
  const summary = readSummary();

  if (!summary.hasFindings) {
    return;
  }

  createIssue(summary.body);
}

main();
