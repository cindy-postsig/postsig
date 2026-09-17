const fs = require('fs');
const path = require('path');

// Load API key from environment variable
const API_KEY = process.env.EXPLORIUM_API_KEY;

if (!API_KEY) {
  console.error('ERROR: EXPLORIUM_API_KEY environment variable is not set.');
  console.error('Please set it before running this script:');
  console.error('  export EXPLORIUM_API_KEY=your_api_key_here');
  console.error('  node scripts/test-explorium-api.js');
  process.exit(1);
}

const MATCH_URL = 'https://api.explorium.ai/v1/businesses/match';
const ENRICH_URL =
  'https://api.explorium.ai/v1/businesses/firmographics/enrich';

const domains = [
  { domain: '22vresearch.com' },
  { domain: '2iqresearch.com' },
  { domain: '9fin.com' },
  { domain: 'acaglobal.com' },
  { domain: 'addepar.com' },
  { domain: 'advantagedata.com' },
  { domain: 'aiera.com' },
  { domain: 'algoseek.com' },
  { domain: 'alpha-sense.com' },
  { domain: 'asana.com' },
  { domain: 'bamsec.com' },
  { domain: 'bizportal.co.il' },
  { domain: 'bloomberg.com' },
  { domain: 'bondradar.com' },
  { domain: 'brackets.io' },
  { domain: 'bwgglobal.com' },
  { domain: 'captliq.com' },
  { domain: 'cdp.net' },
  { domain: 'cfraresearch.com' },
  { domain: 'chainxy.com' },
  { domain: 'chd-expert.com' },
  { domain: 'citi.com' },
  { domain: 'clevelandresearch.com' },
  { domain: 'cmegroup.com' },
  { domain: 'cmgx.io' },
  { domain: 'consensusmetrix.com' },
  { domain: 'consumeredgeinsight.com' },
  { domain: 'consumeredgeresearch.com' },
  { domain: 'coppclark.com' },
  { domain: 'corpaxe.com' },
  { domain: 'creditsights.com' },
  { domain: 'cusip.com' },
  { domain: 'danainvestment.com' },
  { domain: 'databricks.com' },
  { domain: 'datafold.com' },
  { domain: 'dealcloud.com' },
  { domain: 'debtwire.com' },
  { domain: 'deltek.com' },
  { domain: 'digits.com' },
  { domain: 'docusign.com' },
  { domain: 'dynamosoftware.com' },
  { domain: 'edgewaterrc.com' },
  { domain: 'enfusion.com' },
  { domain: 'enverus.com' },
  { domain: 'environicsanalytics.com' },
  { domain: 'etfglobal.com' },
  { domain: 'etr.ai' },
  { domain: 'euronext.com' },
  { domain: 'exantedata.com' },
  { domain: 'factset.com' },
  { domain: 'fiatech.org' },
  { domain: 'financialmodelingprep.com' },
  { domain: 'fisglobal.com' },
  { domain: 'fitchsolutions.com' },
  { domain: 'fivetran.com' },
  { domain: 'flextrade.com' },
  { domain: 'ftserussell.com' },
  { domain: 'getdbt.com' },
  { domain: 'glean.com' },
  { domain: 'glginsights.com' },
  { domain: 'globalrelay.com' },
  { domain: 'google.com' },
  { domain: 'gordonhaskett.com' },
  { domain: 'greenstreet.com' },
  { domain: 'gtanalytics.com' },
  { domain: 'hedgeye.com' },
  { domain: 'heightllc.com' },
  { domain: 'homeinnovation.com' },
  { domain: 'ice.com' },
  { domain: 'ihsmarkit.com' },
  { domain: 'imagineertechnology.com' },
  { domain: 'insiderscore.com' },
  { domain: 'insight360.io' },
  { domain: 'intropic.io' },
  { domain: 'ionanalytics.com' },
  { domain: 'ipreo.com' },
  { domain: 'iqvia.com' },
  { domain: 'ircsecurities.com' },
  { domain: 'issgovernance.com' },
  { domain: 'issworld.com' },
  { domain: 'itcmarkets.com' },
  { domain: 'jitterbit.com' },
  { domain: 'kynex.com' },
  { domain: 'law360.com' },
  { domain: 'lexisnexis.com' },
  { domain: 'lightkeeper.com' },
  { domain: 'linkedin.com' },
  { domain: 'londonstockexchange.com' },
  { domain: 'lseg.com' },
  { domain: 'lucid.co' },
  { domain: 'luminarypodcasts.com' },
  { domain: 'luxoft.com' },
  { domain: 'macrobond.com' },
  { domain: 'mergermarket.com' },
  { domain: 'moodysanalytics.com' },
  { domain: 'morningstar.com' },
  { domain: 'msci.com' },
  { domain: 'mscience.com' },
  { domain: 'nasdaq.com' },
  { domain: 'newstreetresearch.com' },
];

// Helper to add delay between requests
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function matchBusiness(domain) {
  try {
    const response = await fetch(MATCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        api_key: API_KEY,
      },
      body: JSON.stringify({
        request_context: {},
        businesses_to_match: [{ domain }],
      }),
    });

    if (!response.ok) {
      return { error: `HTTP ${response.status}`, domain };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    return { error: error.message, domain };
  }
}

async function enrichBusiness(businessId, domain) {
  try {
    const response = await fetch(ENRICH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        api_key: API_KEY,
      },
      body: JSON.stringify({
        request_context: {},
        business_id: businessId,
      }),
    });

    if (!response.ok) {
      return { error: `HTTP ${response.status}`, domain, businessId };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    return { error: error.message, domain, businessId };
  }
}

async function main() {
  const results = [];
  const logFile = path.join(__dirname, 'explorium-test-results.json');
  const summaryFile = path.join(__dirname, 'explorium-test-summary.txt');

  for (let i = 0; i < domains.length; i++) {
    const { domain } = domains[i];

    // Step 1: Match business
    const matchResult = await matchBusiness(domain);

    if (matchResult.error) {
      results.push({ domain, matchError: matchResult.error });
      await delay(100); // Small delay even on error
      continue;
    }

    const businessId = matchResult.matched_businesses?.[0]?.business_id;
    if (!businessId) {
      results.push({ domain, matchResult, noBusinessId: true });
      await delay(100);
      continue;
    }

    // Step 2: Enrich business
    await delay(200); // Small delay between match and enrich
    const enrichResult = await enrichBusiness(businessId, domain);

    if (enrichResult.error) {
      results.push({ domain, businessId, enrichError: enrichResult.error });
    } else {
      results.push({
        domain,
        businessId,
        matchResult,
        enrichResult,
      });
    }

    // Save progress after each domain
    fs.writeFileSync(logFile, JSON.stringify(results, null, 2));

    // Rate limiting: wait between requests
    await delay(500);
  }

  // Generate summary
  const successful = results.filter((r) => r.enrichResult && !r.error);
  const failed = results.filter(
    (r) => r.error || r.matchError || r.enrichError,
  );
  const noBusinessId = results.filter((r) => r.noBusinessId);

  const summary = `
Explorium API Test Summary
==========================
Total domains tested: ${domains.length}
Successful: ${successful.length}
Failed (match): ${results.filter((r) => r.matchError).length}
Failed (enrich): ${results.filter((r) => r.enrichError).length}
No business_id found: ${noBusinessId.length}

Failed domains:
${failed.map((r) => `  - ${r.domain}: ${r.matchError || r.enrichError || 'unknown error'}`).join('\n')}

No business_id:
${noBusinessId.map((r) => `  - ${r.domain}`).join('\n')}
`;

  fs.writeFileSync(summaryFile, summary);
}

main().catch(console.error);
