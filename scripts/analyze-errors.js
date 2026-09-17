const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EXCLUDE_PATTERNS = ['node_modules', '.git', '.next', 'dist', 'build'];

function analyzeErrorsInFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const errors = [];

    lines.forEach((line, index) => {
      if (line.includes('throw new Error')) {
        const trimmedLine = line.trim();
        const context = lines
          .slice(Math.max(0, index - 2), index + 3)
          .join('\n');

        let category = 'unknown';
        if (
          trimmedLine.includes('User not found') ||
          trimmedLine.includes('Authentication')
        ) {
          category = 'auth';
        } else if (
          trimmedLine.includes('not found') ||
          trimmedLine.includes('Not found')
        ) {
          category = 'not_found';
        } else if (
          trimmedLine.includes('Invalid') ||
          trimmedLine.includes('validation')
        ) {
          category = 'validation';
        } else if (
          trimmedLine.includes('Database') ||
          trimmedLine.includes('database')
        ) {
          category = 'database';
        } else if (
          trimmedLine.includes('API') ||
          trimmedLine.includes('fetch') ||
          trimmedLine.includes('response')
        ) {
          category = 'api';
        } else if (
          trimmedLine.includes('File') ||
          trimmedLine.includes('upload')
        ) {
          category = 'file';
        }

        errors.push({
          line: index + 1,
          content: trimmedLine,
          category,
          context: context.substring(0, 200),
        });
      }
    });

    return errors;
  } catch (error) {
    return [];
  }
}

function analyzeProject() {
  try {
    const output = execSync(
      'find . -name "*.ts" -o -name "*.tsx" | grep -v node_modules | grep -v .next | head -100',
      { encoding: 'utf8' },
    );
    const files = output
      .trim()
      .split('\n')
      .filter((file) => file.length > 0);

    const results = {
      totalFiles: 0,
      totalErrors: 0,
      categorized: {
        auth: [],
        not_found: [],
        validation: [],
        database: [],
        api: [],
        file: [],
        unknown: [],
      },
      filesSummary: [],
    };

    files.forEach((file) => {
      const errors = analyzeErrorsInFile(file);
      if (errors.length > 0) {
        results.totalFiles++;
        results.totalErrors += errors.length;

        results.filesSummary.push({
          file,
          errorCount: errors.length,
          errors: errors.map((e) => ({
            line: e.line,
            category: e.category,
            content: e.content,
          })),
        });

        errors.forEach((error) => {
          results.categorized[error.category].push({
            file,
            line: error.line,
            content: error.content,
          });
        });
      }
    });

    return results;
  } catch (error) {
    console.error('Error analyzing project:', error);
    return null;
  }
}

const results = analyzeProject();
if (results) {
  console.log('=== ERROR ANALYSIS RESULTS ===\n');
  console.log(`Total files with errors: ${results.totalFiles}`);
  console.log(`Total error statements: ${results.totalErrors}\n`);

  console.log('=== CATEGORIES ===');
  Object.entries(results.categorized).forEach(([category, errors]) => {
    if (errors.length > 0) {
      console.log(`${category.toUpperCase()}: ${errors.length} errors`);
      errors.slice(0, 3).forEach((error) => {
        console.log(
          `  - ${error.file}:${error.line} - ${error.content.substring(0, 60)}...`,
        );
      });
      if (errors.length > 3) {
        console.log(`  ... and ${errors.length - 3} more`);
      }
      console.log('');
    }
  });

  console.log('=== HIGH PRIORITY FILES ===');
  results.filesSummary
    .sort((a, b) => b.errorCount - a.errorCount)
    .slice(0, 10)
    .forEach((fileSummary) => {
      console.log(`${fileSummary.file}: ${fileSummary.errorCount} errors`);
      fileSummary.errors.forEach((error) => {
        console.log(
          `  L${error.line}: [${error.category}] ${error.content.substring(0, 60)}...`,
        );
      });
      console.log('');
    });
}
