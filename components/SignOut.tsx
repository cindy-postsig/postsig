'use client';

import { ExitIcon } from '@radix-ui/react-icons';
import { signOut } from '@/app/lib/auth/actions';
import { useTableExpandedState } from '@/app/context/TableExpandedStateContext';

export default function SignOut() {
  const { clearAllExpandedStates } = useTableExpandedState();

  const handleSignOut = async (formData: FormData) => {
    // Clear all expanded states before signing out
    clearAllExpandedStates();

    // Submit the form to perform the server action
    await signOut();
  };

  return (
    <form action={handleSignOut}>
      <button className="flex w-full items-center gap-2 p-2 text-sm hover:bg-accent hover:text-accent-foreground">
        <ExitIcon />
        Logout
      </button>
    </form>
  );
}
