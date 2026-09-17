'use client';

import { useContext } from 'react';
import { UserContext } from '@/app/userProvider';
import {
  formatDate as formatDateBase,
  formatDateTime as formatDateTimeBase,
  DATE_FORMAT_DEFAULT,
} from '@/lib/date-format';

/**
 * Client hook exposing the current user's effective date-fns pattern and a
 * bound `formatDate` helper. Reads from the UserContext populated on the server.
 */
export function useDateFormat() {
  const ctx = useContext(UserContext);
  const dateFormat = ctx?.userMetadata?.dateFormat ?? DATE_FORMAT_DEFAULT;

  const formatDate = (
    value: string | Date | null | undefined,
    fallback = 'N/A',
  ) => formatDateBase(value, dateFormat, fallback);

  const formatDateTime = (
    value: string | Date | null | undefined,
    fallback = 'N/A',
  ) => formatDateTimeBase(value, dateFormat, fallback);

  return { dateFormat, formatDate, formatDateTime };
}
