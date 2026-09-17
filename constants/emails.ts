import 'server-only';

const parseEmailList = (envVar: string | undefined): string[] => {
  if (!envVar) {
    console.warn(`Missing email configuration: ${envVar}`);
    return [];
  }
  return envVar
    .split(',')
    .map((email) => email.trim())
    .filter((email) => email);
};

const validateEmailList = (emails: string[]): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emails.every((email) => emailRegex.test(email));
};

const getValidatedEmailList = (
  envVar: string | undefined,
  configName: string,
): string[] => {
  const emails = parseEmailList(envVar);
  if (emails.length === 0) {
    console.error(`Missing required email configuration: ${configName}`);
    return [];
  }
  if (!validateEmailList(emails)) {
    console.error(`Invalid email configuration detected for: ${configName}`);
    return [];
  }
  return emails;
};

const isLocalEnv = process.env.ENV === 'local';
const localEmails = process.env.LOCAL_EMAILS;
const localEmailsList = isLocalEnv
  ? getValidatedEmailList(localEmails, 'LOCAL_EMAILS')
  : [];

const getEmailList = (
  envVar: string | undefined,
  configName: string,
): string[] => {
  return isLocalEnv && localEmailsList.length > 0
    ? localEmailsList
    : getValidatedEmailList(envVar, configName);
};

const lineageEmails = process.env.LINEAGE_EMAILS;

export const emailListings = {
  lineage: getEmailList(lineageEmails, 'LINEAGE_EMAILS'),
};
