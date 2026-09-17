import _ from 'lodash';

export const citationGenerationTemplate = {
  term_start_date: {
    template: 'The term start date : {term_start_date}.',
    function: (answer: any) => {
      // Assuming answer is an array of objects with a 'date' property
      if (
        Array.isArray(answer) &&
        answer.length > 0 &&
        answer[answer.length - 1]?.date
      ) {
        return answer[answer.length - 1].date;
      }
      return JSON.stringify(answer);
    },
  },
  cancel_by_date: {
    template:
      'The cancel by date : {cancel_by_date} days before the term end date.',
  },
  auto_renewal: {
    template: '{auto_renewal}.',
    function: (answer: any) => {
      if (String(answer).toLowerCase() === 'true' || answer === true) {
        return 'The contract will automatically renew.';
      }
      return 'The contract will not automatically renew.';
    },
  },
  renewal_type: {
    template: '{renewal_type}.',
    function: (answer: any) => {
      if (
        String(answer).toLowerCase() === 'true' ||
        answer === true ||
        String(answer).toLowerCase() === 'auto'
      ) {
        return 'The contract will automatically renew.';
      }
      return 'The contract will not automatically renew.';
    },
  },
  multi_year: {
    template: '{multi_year}.',
    function: (answer: any) => {
      if (
        String(answer).toLowerCase() === 'true' ||
        answer === true ||
        String(answer).toLowerCase() === 'yes'
      ) {
        return 'The subscription is for multiple years.';
      }
      return 'The subscription is for a single year.';
    },
  },
  subscription_term: {
    template: 'Subscription term : {subscription_term} months.',
  },
  renewal_period: {
    template: 'Renewal period : {renewal_period} months.',
  },
  number_of_users: {
    template: 'Number of users : {number_of_users}.',
    // Assumes answer is the number of users
  },
  annual_increase: {
    template: 'Annual increase : {annual_increase}.',
    // Assumes answer represents the increase (e.g., percentage or amount)
  },
  internal_external_users: {
    template: 'Users are {internal_external_users}.',
  },
  billing_frequency: {
    template: 'Billing frequency : {billing_frequency}.',
  },
  marketing_rights: {
    template: 'Marketing rights : {marketing_rights}.',
  },
};

export function formatAnswerForCitationGeneration(
  dbName: string,
  answer: any,
): string | null {
  if (_.isNil(answer)) {
    return null;
  }

  const key = dbName as keyof typeof citationGenerationTemplate;
  if (_.has(citationGenerationTemplate, key)) {
    const templateConfig = citationGenerationTemplate[key] as {
      template: string;
      function?: (answer: any) => string;
    };

    const formattedAnswer = templateConfig.function
      ? templateConfig.function(answer)
      : String(answer);

    if (templateConfig.template.includes(`{${dbName}}`)) {
      return templateConfig.template.replace(
        `{${dbName}}`,
        String(formattedAnswer),
      );
    } else {
      // If the specific key isn't in the template string, but a general placeholder might be used,
      // or if the template is the value itself.
      // This part might need adjustment based on how templates are structured.
      // For now, assume if the key isn't found, we use a generic placeholder or the key itself might be the placeholder.
      // This attempts to replace a generic placeholder if {dbName} wasn't specific enough.
      const genericPlaceholder = `{${Object.keys(templateConfig)[0]}}`; // Fallback for older template styles
      if (templateConfig.template.includes(genericPlaceholder)) {
        return templateConfig.template.replace(
          genericPlaceholder,
          String(formattedAnswer),
        );
      }
      // If no placeholder is matched, but it has a function, it implies the template is the function's output
      if (templateConfig.function) return String(formattedAnswer);
      // If template is just a string and no function, it might be a direct value or needs {key}
      return templateConfig.template.replace(
        `{${key}}`,
        String(formattedAnswer),
      );
    }
  }
  return String(answer);
}
