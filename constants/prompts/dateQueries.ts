export const dateQueries = [
  {
    dbName: 'term_start_date',
    query:
      'What is the start date of this contract? Please return the date in the format of YYYY-MM-DD',
  },
  {
    dbName: 'cancel_by_date',
    query: `
          Analyze the provided agreement document, focusing on sections related to the contract "Term," "Subscription Term," "Renewal," and "Termination."

          Identify the specific clause that states the required **advance notice period**, specified in **days**, that either party must provide **before the end of the current term** (or subscription term) to **prevent automatic renewal** or to **terminate** the agreement effective at the end of the term.

          Look for phrases structured similarly to:
          *   "at least [X] days before the current term ends"
          *   "[X] days prior notice of non-renewal"
          *   "terminate upon [X] days notice before expiration"

          Ensure this notice period relates specifically to non-renewal or termination at term end, and **distinguish it** from notice periods related to termination for cause (breach) or cure periods.

          Extract **only the numerical value** representing this number of days.

          For example, if the contract states "notice of non-renewal at least 60 days before the current Subscription Term ends", extract only the number \`60\`.
          `,
  },
  {
    dbName: 'execution_date',
    query: `
        What is the date of the last signature? Please return the date in the format of YYYY-MM-DD
      `,
  },
];
