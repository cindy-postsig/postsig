import { redirect } from 'next/navigation';

export default function ConnectionsRedirect() {
  redirect('/account/connected-apps');
}
