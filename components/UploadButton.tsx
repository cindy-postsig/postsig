'use client';
import { useContext } from 'react';
import Link from 'next/link';
import { UserContext } from '@/app/userProvider';
import { useAbility } from '@/components/providers/AbilityProvider';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMode } from '@/contexts/ModeContext';

interface UploadButtonProps {
  size?: 'sm' | 'default';
}

const UploadButton = ({ size = 'default' }: UploadButtonProps) => {
  const context = useContext(UserContext);
  const ability = useAbility();
  const { isVentureMode } = useMode();
  const canCreateContract = ability.can('create', 'Contract');

  if (!context) return null;

  const { userMetadata } = context;
  const isTrial = userMetadata?.isTrial;
  const isDisabled = !isVentureMode && (isTrial || !canCreateContract);

  // In venture mode, go to documents page with upload param
  const href = isVentureMode ? '/investor/documents?upload=true' : '/upload';

  return (
    <Link
      href={isDisabled ? '#' : href}
      onClick={(e) => {
        if (isDisabled) {
          e.preventDefault();
        }
      }}
      className={cn(
        buttonVariants({ size }),
        isDisabled && 'cursor-not-allowed opacity-50',
      )}
      aria-disabled={isDisabled}
    >
      Upload
    </Link>
  );
};

export default UploadButton;
