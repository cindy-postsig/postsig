import { fetchInviteData, verifyInvite } from '@/app/lib/actions/user';
import { SubmitButton } from '@/components/SubmitButton';
import Image from 'next/image';

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await fetchInviteData(token);
  const orgName = invite.organizations?.name;

  async function handleSubmit() {
    'use server';
    await verifyInvite(token);
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background p-6 md:p-10">
      <div className="flex w-full max-w-lg flex-col gap-6 rounded border border-border bg-card p-10 font-sans shadow-sm">
        <Image
          src="/PS_Icon.svg"
          alt="PostSig Logo"
          width={40}
          height={40}
          className="dark:invert"
        />
        <div>
          <h2 className="mb-2 text-card-foreground">
            Setup your PostSig Account
          </h2>
          <p className="max-w-md leading-loose text-muted-foreground">
            Join{' '}
            <span className="font-medium text-card-foreground">{orgName}</span>{' '}
            on PostSig
          </p>
        </div>
        <form action={handleSubmit} className="w-full md:w-auto">
          <SubmitButton size="lg" className="w-full" pendingText="Accepting...">
            Accept Invite
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
