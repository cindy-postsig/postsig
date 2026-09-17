import {
  FailedRow,
  NewUploadsDTO,
  NewUploadsEmailData,
  NewUploadsSummary,
  SummaryRow,
} from './types.d.ts';

const failedContracts: FailedRow[] = [];

const formatUsername = (username: string) => {
  if (!username) return '';

  const names = username.trim().split(' ');
  if (names.length === 1) {
    return names[0];
  } else {
    const firstName = names[0];
    const lastNameInitial = names[names.length - 1][0].toUpperCase();
    return `${firstName} ${lastNameInitial}.`;
  }
};

const groupByUser = (data: NewUploadsDTO[]) =>
  Object.values(
    data.reduce(
      (
        acc: Record<string, SummaryRow & { orgId: string; orgName: string }>,
        { id: contractId, ai_extraction_status, users, contract_docs },
      ) => {
        const { id, name, email, organizations } = users || {
          id: 'Not specified',
          name: '-',
          email: '-',
        };
        let orgId = 'x',
          orgName = 'Org not specified';

        if (organizations) {
          orgId = organizations.id;
          orgName = organizations.name;
        }

        if (!acc[email]) {
          acc[email] = {
            uid: id,
            username: name,
            count: 0,
            failedCount: 0,
            orgId,
            orgName,
          };
        }
        acc[email].count += 1;
        if (ai_extraction_status === 'ai_failed') {
          acc[email].failedCount += 1;
          failedContracts.push({
            contractId,
            uid: id,
            username: formatUsername(name),
            orgName,
            docFileName: contract_docs.length
              ? contract_docs[0].file_path.split('/').pop() || 'Not found'
              : 'Not found',
          });
        }
        return acc;
      },
      {},
    ),
  );

const combineByOrg = (
  data: (SummaryRow & {
    orgId: string;
    orgName: string;
  })[],
): NewUploadsSummary[] =>
  Object.values(
    data.reduce(
      (acc: Record<string, { orgName: string; data: SummaryRow[] }>, item) => {
        if (!acc[item.orgName]) {
          acc[item.orgName] = { orgName: item.orgName, data: [] };
        }
        acc[item.orgName].data.push({
          uid: item.uid,
          username: formatUsername(item.username),
          count: item.count,
          failedCount: item.failedCount,
        });
        return acc;
      },
      {},
    ),
  );

export const transformNewContracts = (
  data: NewUploadsDTO[],
): NewUploadsEmailData => ({
  summary: combineByOrg(groupByUser(data)),
  isFailed: !!failedContracts.length && { data: failedContracts },
});

export const removeInternalContracts = (
  data: NewUploadsDTO[],
): NewUploadsDTO[] => {
  return data.filter(({ users }) => {
    // remove @postsig.com emails
    if (users?.email) {
      return !users.email.toLowerCase().endsWith('@postsig.com');
    }
    return true;
  });
};
