'use client';

import { createContext, useContext } from 'react';
import { createContextualCan } from '@casl/react';
import {
  AppAbility,
  defineAbilitiesFor,
  RoleId,
} from '@postsig/toolkit/abilities';

export const AbilityContext = createContext<AppAbility | undefined>(undefined);

export const Can = createContextualCan(
  AbilityContext.Consumer as unknown as React.Consumer<AppAbility>,
);

export function useAbility() {
  const ability = useContext(AbilityContext);
  if (!ability) {
    throw new Error('useAbility must be used within AbilityProvider');
  }
  return ability;
}

interface AbilityProviderProps {
  children: React.ReactNode;
  roleId: RoleId;
  userId: string;
  organizationId: string;
}

export function AbilityProvider({
  children,
  roleId,
  userId: id,
  organizationId,
}: AbilityProviderProps) {
  const ability = defineAbilitiesFor({
    roleId,
    id,
    organizationId,
  });

  return (
    <AbilityContext.Provider value={ability}>
      {children}
    </AbilityContext.Provider>
  );
}
