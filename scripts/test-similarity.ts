import { baseQueries } from '../constants/prompts';
import dotenv from 'dotenv';
import * as github from '@actions/github';
import * as core from '@actions/core';
import { createClient } from '@supabase/supabase-js';
import logger from '../utils/pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import _ from 'lodash';
import { openai } from 'inngest';
dotenv.config({ path: '.env.test' });

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const userRoles = {
  postsigUser: 3,
  postsigReviewer: 6,
  postsigExtractor: 7,
  clientAdmin: 11,
  clientSupervisor: 12,
  clientUser: 14,
};

export const contractTypeMap: any = {
  'Master Service Agreement': 'MSA',
  'Service Order': 'SO',
  Addendum: 'Addendum',
  'Terms of Service': 'TOS',
  Invoice: 'Invoice',
  'Trial Agreement': 'Trial Agreement',
  'Non Disclosure Agreement': 'NDA',
  'Operational Agreement': 'OA',
};

function formatJson(data: any) {
  return _.each(data, (value, key) => {
    if (key === 'contract_types') {
      data['contract_type'] = contractTypeMap[value.name];
      delete data[key];
    }
    if (key === 'term_end_date') {
      delete data[key];
      data['term_end_date'] = value[0].date;
    }
    if (key === 'term_start_date') {
      delete data[key];
      data['term_start_date'] = value[0].date;
    }
    if (key === 'vendor_products_details') {
      data['products_list'] = _.map(
        value,
        ({ vendor_products: { name }, year, fees }) => ({
          name,
          year,
          cost: fees,
        }),
      );
      delete data[key];
    }
    if (key === 'vendors') {
      data['vendor_name'] = value.name;
      delete data[key];
    }
  });
}

async function saveContractData(contractIds: number[]) {
  const supabaseClient = createClient(
    NEXT_PUBLIC_SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY!,
  );

  for (const contractId of contractIds) {
    const { data, error } = await supabaseClient
      .from('contracts')
      .select(
        `
        cancel_by_date,
        auto_renewal,
        subscription_term,
        billing_frequency,
        payment_terms,
        exclusivity_terms,
        multi_year,
        annual_increase,
        currency,
        cancellation_process,
        distribution_rights,
        execution_date,
        geo_restrictions,
        marketing_rights,
        permissions,
        renewal_period,
        scope_of_use,
        suspension_of_service,
        summary,
        data_disposal_tnc,
        discount,
        activities,
        derivative_works,
        end_users,
        internal_external_users,
        market_data_types,
        audit_requirements,
        term_end_date,
        term_start_date,
        vendor_products_details (*,vendor_products(*)),
        vendors (
            name
          ),
        contract_types(*)
      `,
      )
      .eq('id', contractId)
      .single();

    if (error) {
      console.error(`Error fetching contract ${contractId}:`, error);
      continue;
    }

    const testDataDir = path.join(__dirname, '../test_data');
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }

    const filePath = path.join(testDataDir, `contract_${contractId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(formatJson(data), null, 2));
    logger.info({ contractId, filePath }, 'Saved contract to file');
  }
}

async function main() {
  try {
    // const testCases = [
    //   ['hello', 'hello'],
    //   ['hello', 'Hello'],
    //   ['hello', 'helo'],
    //   ['hello', 'world'],
    //   ['', ''],
    //   ['hello', ''],
    // ];

    // let markdownOutput = '## Similarity Test Results\n\n';
    // markdownOutput += '| String 1 | String 2 | Similarity |\n';
    // markdownOutput += '|----------|-----------|------------|\n';

    // testCases.forEach(([str1, str2]) => {
    //   const similarity = calculateSimilarity(str1, str2);
    //   markdownOutput += `| \`${str1}\` | \`${str2}\` | ${(similarity * 100).toFixed(2)}% |\n`;
    // });

    // // Get GitHub token from action inputs
    // const token = core.getInput('github-token') || process.env.GITHUB_TOKEN!;
    // const octokit = github.getOctokit(token);

    // // Get context of the action
    // const context = github.context;
    // const { owner, repo } = context.repo;

    // // Post comment on the PR
    // if (context.payload.pull_request) {
    //   await octokit.rest.issues.createComment({
    //     owner,
    //     repo,
    //     issue_number: context.payload.pull_request.number,
    //     body: markdownOutput,
    //   });
    // } else {
    //   core.setOutput('results', markdownOutput);
    //   logger.debug(markdownOutput);
    // }
    // await saveContractData(Array.from({ length: 15 }, (_, i) => i + 241));
    await saveContractData([241]);
    // get contract in the format above
    // download the contract from supabase Storage
    // uplooad the contract to openai
    // run getContractBasics function with the contract
    // compare the result with the contract in the format above
    // create a function to calculate the similarity between the result and the contract in the format above
    // similarity check should be done for each field
    // loop through all the contract ids and do the same for all the contracts
    // aggregate results for every field
    // print the results
  } catch (error) {
    core.setFailed(
      error instanceof Error ? error.message : 'An error occurred',
    );
  }
}

main();
