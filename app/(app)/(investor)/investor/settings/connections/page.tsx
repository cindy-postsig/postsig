import { redirect } from 'next/navigation';

export default function InvestorConnectionsRedirect() {
  redirect('/account/connected-apps');
}
