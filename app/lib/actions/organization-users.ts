'use server';

import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { verifyAbility, checkAbility } from '@/data/user-permissions';
import {
  ADMIN,
  userRoles,
  MANAGER,
  VIEWER,
  POSTSIG_ADMIN,
  POSTSIG_REVIEWER,
  POSTSIG_EXTRACTOR,
} from '@/constants/data';
import {
  AuthorizationError,
  DatabaseError,
  ValidationError,
} from '@/lib/errors';
import logger from '@/utils/pino';
import { filterVisibleOrgUsers } from '@/lib/utils/users';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import { Resend } from 'resend';
import InviteEmailTemplate from '@/emails/InviteEmail';
import { ExternalServiceError } from '@/lib/errors';
import { validateEmailDomain } from '@/app/lib/validations';
import { getUserMetadata, getUserProfile } from '@/data/users';
import { UserRole } from '@/constants/types';
import {
  auditLogger,
  getUserAuditContext,
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
} from '@/lib/audit';

async function sendInviteEmail({
  name,
  token,
  email,
  organization,
  invitedBy,
}: {
  name?: string;
  token?: string;
  email: string;
  organization: string;
  invitedBy?: string | null | undefined;
}) {
  try {
    const { RESEND_API_KEY } = process.env;
    const resend = new Resend(RESEND_API_KEY);

    const emailTemplate = InviteEmailTemplate({
      name,
      token: token || '',
      email,
      organization,
      invitedBy,
    });

    const subject = invitedBy
      ? `${invitedBy} invited you to join ${organization} on PostSig`
      : `You're invited to join ${organization} on PostSig`;

    await resend.emails.send({
      from: 'PostSig <noreply@postsig.com>',
      to: [email],
      subject,
      react: emailTemplate as React.ReactElement,
    });
  } catch (error) {
    logger.error(
      { error: sanitizeForLogging(error), email },
      'Failed to send invite email',
    );
    throw new ExternalServiceError(
      'Resend',
      'Failed to send invite email',
      error as Error,
    );
  }
}

interface AuditLogEntry {
  action_type: string;
  actor_id: string;
  target_user_id?: string;
  organization_id: string;
  changes?: Record<string, unknown>;
}

async function logAudit(entry: AuditLogEntry): Promise<void> {
  const supabase = createServiceClient();
  // const { error } = await supabase.from('user_management_audit_log').insert({
  //   action_type: entry.action_type,
  //   actor_id: entry.actor_id,
  //   target_user_id: entry.target_user_id,
  //   organization_id: entry.organization_id,
  //   changes: entry.changes,
  // });

  // if (error) {
  //   logger.error(
  //     { error: sanitizeForLogging(error) },
  //     'Failed to write audit log',
  //   );
  // }
}

export async function getOrganizationUsers(
  organizationId: string,
  options?: {
    includePostsigUsers?: boolean;
    currentUserEmail?: string | null;
  },
) {
  await verifyAbility('manage', 'Organization');

  const supabase = createServiceClient();

  try {
    const { data, error } = await supabase
      .from('users')
      .select(
        `
        id,
        email,
        name,
        job_title,
        department,
        signed_up,
        user_roles2!user_roles2_user_id_fkey(
          role_id
        )
      `,
      )
      .eq('organization_id', organizationId)
      .eq('signed_up', true)
      .order('email', { ascending: true });

    if (error) throw error;

    const users = (data || []).map((user) => {
      const roleId = user.user_roles2[0]?.role_id;
      let appRole: UserRole;

      if (roleId === userRoles.clientSupervisor) {
        appRole = ADMIN;
      } else if (roleId === userRoles.clientAdmin) {
        appRole = MANAGER;
      } else if (roleId === userRoles.postsigAdmin) {
        appRole = POSTSIG_ADMIN;
      } else if (roleId === userRoles.postsigReviewer) {
        appRole = POSTSIG_REVIEWER;
      } else if (roleId === userRoles.postsigExtractor) {
        appRole = POSTSIG_EXTRACTOR;
      } else {
        appRole = VIEWER;
      }

      return {
        ...user,
        appRole,
      };
    });

    return filterVisibleOrgUsers(users, options);
  } catch (error) {
    logger.error(
      { error: sanitizeForLogging(error), organizationId },
      'Error fetching organization users',
    );
    throw new DatabaseError(
      'Failed to fetch organization users',
      error as Error,
    );
  }
}

export async function getOrganizationUser(userId: string) {
  const { organizationId } = await verifyAbility('manage', 'Organization');
  const supabase = createServiceClient();

  try {
    const { data, error } = await supabase
      .from('users')
      .select(
        `
        id,
        email,
        name,
        job_title,
        department,
        organization_id,
        user_roles2!user_roles2_user_id_fkey(
          role_id
        )
      `,
      )
      .eq('id', userId)
      .single();

    if (error) throw error;

    if (!data) {
      throw new DatabaseError('User not found', new Error('User not found'));
    }

    if (data.organization_id !== organizationId) {
      throw new AuthorizationError(
        'Cannot access users from another organization',
      );
    }

    const roleId = data.user_roles2[0]?.role_id;
    let appRole: UserRole;

    if (roleId === userRoles.clientSupervisor) {
      appRole = ADMIN;
    } else if (roleId === userRoles.clientAdmin) {
      appRole = MANAGER;
    } else if (roleId === userRoles.postsigAdmin) {
      appRole = POSTSIG_ADMIN;
    } else if (roleId === userRoles.postsigReviewer) {
      appRole = POSTSIG_REVIEWER;
    } else if (roleId === userRoles.postsigExtractor) {
      appRole = POSTSIG_EXTRACTOR;
    } else {
      appRole = VIEWER;
    }

    return {
      ...data,
      appRole,
      userRoleId: data.user_roles2[0]?.role_id,
    };
  } catch (error) {
    logger.error(
      { error: sanitizeForLogging(error), userId },
      'Error fetching organization user',
    );
    throw new DatabaseError('Failed to fetch user details', error as Error);
  }
}

export async function createOrganizationUser(data: {
  email: string;
  name?: string;
  job_title?: string;
  appRole: UserRole;
  moduleId?: number;
}) {
  try {
    // Extract user metadata and validate domain (common to both admin and manager flows)
    const userMetadata = await getUserMetadata();
    const invitedBy = userMetadata?.userProfile?.name;
    const orgDomain = userMetadata?.userProfile?.email
      ?.split('@')[1]
      ?.toLowerCase();

    if (!orgDomain) {
      throw new ValidationError(
        'Cannot determine organization domain from admin user',
      );
    }

    if (!validateEmailDomain(data.email, orgDomain)) {
      throw new ValidationError(
        'Email domain does not match organization domain',
      );
    }

    // Check if user can manage organization (Admins can invite any role)
    const canManageOrg = await checkAbility('manage', 'Organization');

    if (canManageOrg) {
      // Admins can invite any role, verify they have the manage permission
      const {
        userId: actorId,
        organizationId,
        organizationName,
      } = await verifyAbility('manage', 'Organization');

      return await createUserWithRole(
        data,
        actorId,
        organizationId,
        organizationName,
        invitedBy,
        data.moduleId,
      );
    } else {
      // Managers can only invite Viewers
      const {
        userId: actorId,
        organizationId,
        organizationName,
      } = await verifyAbility('share', 'Contract');

      // Enforce that managers can only invite Viewers
      if (data.appRole !== VIEWER) {
        throw new AuthorizationError(
          'You do not have permission to invite users with this role. Only Viewer role is allowed.',
        );
      }

      return await createUserWithRole(
        data,
        actorId,
        organizationId,
        organizationName,
        invitedBy,
        data.moduleId,
      );
    }
  } catch (error) {
    logger.error(
      {
        error: sanitizeForLogging(error),
        data: sanitizeForLogging(data),
      },
      'Error creating organization user',
    );
    if (error instanceof AuthorizationError) {
      throw error;
    }
    throw new DatabaseError(
      `Failed to create user: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error as Error,
    );
  }
}

async function createUserWithRole(
  data: {
    email: string;
    name?: string;
    job_title?: string;
    appRole: UserRole;
  },
  actorId: string,
  organizationId: string,
  organizationName: string,
  invitedBy: string | null | undefined,
  moduleId?: number,
) {
  const supabase = createServiceClient();

  try {
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('email', data.email)
      .single();

    if (existingUser) {
      logger.info(
        { email: data.email, existingUserId: existingUser.id },
        'User already exists',
      );
      throw new DatabaseError(
        `A user with email ${data.email} already exists in your organization`,
        new Error('Duplicate email'),
      );
    }

    const { data: authUser, error: createError } =
      await supabase.auth.admin.createUser({
        email: data.email,
        user_metadata: {
          full_name: data.name || null,
          signed_up: false,
          organization_id: organizationId,
        },
      });

    if (createError) throw createError;
    if (!authUser.user) {
      throw new DatabaseError(
        'Failed to create user',
        new Error('No user returned'),
      );
    }

    // Get inviter details for audit logging
    const inviterProfile = await getUserProfile(actorId);
    const inviterEmail = inviterProfile?.email;
    const inviterName = inviterProfile?.name;

    // Log USER_CREATED audit event
    const auditContext = await getUserAuditContext({
      userId: actorId,
      organizationId,
    });

    await auditLogger.logEvent({
      action: AUDIT_ACTIONS.USER_CREATED,
      resourceType: AUDIT_RESOURCE_TYPES.AUTH_USERS,
      resourceId: authUser.user.id,
      newData: {
        invitedUserEmail: data.email,
        invitedUserName: data.name,
        invitedUserRole: data.appRole,
      },
      context: {
        ...auditContext,
        metadata: {
          inviterUserId: actorId,
          inviterName,
          inviterEmail,
          organizationName,
          createdAt: new Date().toISOString(),
        },
      },
    });

    const { error: updateError } = await supabase
      .from('users')
      .update({
        name: data.name || null,
        job_title: data.job_title || null,
        organization_id: organizationId,
      })
      .eq('id', authUser.user.id);

    if (updateError) throw updateError;

    let roleId: number;
    if (data.appRole === ADMIN) {
      roleId = userRoles.clientSupervisor;
    } else if (data.appRole === MANAGER) {
      roleId = userRoles.clientAdmin;
    } else {
      roleId = userRoles.clientUser;
    }

    const { error: roleError } = await supabase.from('user_roles2').insert({
      user_id: authUser.user.id,
      role_id: roleId,
    });

    if (roleError) throw roleError;

    if (moduleId) {
      const { error: moduleAccessError } = await supabase
        .from('user_module_access')
        .insert({
          user_id: authUser.user.id,
          organization_id: organizationId,
          module_id: moduleId,
          granted_by: actorId,
          is_default: true,
        });

      if (moduleAccessError) throw moduleAccessError;
    }

    const { data: inviteData, error: inviteError } =
      await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: data.email,
      });

    if (inviteError) throw inviteError;

    const token = inviteData.properties?.hashed_token;
    const invitedAt = inviteData.user?.updated_at ?? new Date().toISOString();
    const expiresAt = new Date(
      new Date(invitedAt).getTime() + 24 * 60 * 60 * 1000,
    ).toISOString();

    const { error: saveInviteError } = await supabase
      .from('app_invites')
      .upsert({
        token,
        organization_id: organizationId,
        user_id: authUser.user.id,
        expires_at: expiresAt,
        invited_at: invitedAt,
      });

    if (saveInviteError) throw saveInviteError;

    await sendInviteEmail({
      name: data.name,
      token,
      email: data.email,
      organization: organizationName,
      invitedBy,
    });

    const { error: expireOldError } = await supabase
      .from('app_invites')
      .update({ expired: true })
      .neq('token', token)
      .eq('user_id', authUser.user.id);

    if (expireOldError) throw expireOldError;

    logger.info(
      {
        userId: authUser.user.id,
        email: data.email,
        actorId,
        organizationId,
      },
      'Organization user created and invited',
    );

    return { success: true, userId: authUser.user.id };
  } catch (error) {
    logger.error(
      {
        error: sanitizeForLogging(error),
        email: data.email,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorName: error instanceof Error ? error.name : 'Unknown',
      },
      'Error creating organization user',
    );
    throw new DatabaseError(
      `Failed to create user: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error as Error,
    );
  }
}

export async function updateOrganizationUser(
  userId: string,
  data: {
    name?: string;
    job_title?: string;
    appRole?: UserRole;
  },
) {
  const { userId: actorId, organizationId } = await verifyAbility(
    'manage',
    'Organization',
  );
  const supabase = createServiceClient();

  try {
    const existingUser = await getOrganizationUser(userId);

    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.job_title !== undefined) updates.job_title = data.job_title;

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId);

      if (updateError) throw updateError;
    }

    if (data.appRole && data.appRole !== existingUser.appRole) {
      if (existingUser.userRoleId) {
        const { error: deleteRoleError } = await supabase
          .from('user_roles2')
          .delete()
          .eq('user_id', userId);

        if (deleteRoleError) throw deleteRoleError;
      }

      let newRoleId: number;
      if (data.appRole === ADMIN) {
        newRoleId = userRoles.clientSupervisor;
      } else if (data.appRole === MANAGER) {
        newRoleId = userRoles.clientAdmin;
      } else {
        newRoleId = userRoles.clientUser;
      }

      const { error: insertRoleError } = await supabase
        .from('user_roles2')
        .insert({
          user_id: userId,
          role_id: newRoleId,
        });

      if (insertRoleError) throw insertRoleError;
    }

    await logAudit({
      action_type: 'user_updated',
      actor_id: actorId,
      target_user_id: userId,
      organization_id: organizationId,
      changes: {
        before: {
          name: existingUser.name,
          job_title: existingUser.job_title,
          app_role: existingUser.appRole,
        },
        after: data,
      },
    });

    logger.info(
      { userId, actorId, organizationId, updates: sanitizeForLogging(data) },
      'Organization user updated',
    );

    return { success: true };
  } catch (error) {
    logger.error(
      { error: sanitizeForLogging(error), userId },
      'Error updating organization user',
    );
    throw new DatabaseError('Failed to update user', error as Error);
  }
}

// At the moment, this is only for deleting invited only users
export async function deleteOrganizationUser(userId: string) {
  const { userId: actorId, organizationId } = await verifyAbility(
    'manage',
    'Organization',
  );
  const supabase = createServiceClient();

  try {
    const existingUser = await getOrganizationUser(userId);

    const { error: deleteUserRole2Error } = await supabase
      .from('user_roles2')
      .delete()
      .eq('user_id', userId);
    if (deleteUserRole2Error) throw deleteUserRole2Error;

    const { error: deleteUserRoleError } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId);
    if (deleteUserRoleError) throw deleteUserRoleError;

    const { error: appInvitesError } = await supabase
      .from('app_invites')
      .delete()
      .eq('user_id', userId);
    if (appInvitesError) throw appInvitesError;

    const { error: deleteUserError } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);
    if (deleteUserError) throw deleteUserError;

    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw error;

    await logAudit({
      action_type: 'user_deleted',
      actor_id: actorId,
      target_user_id: userId,
      organization_id: organizationId,
      changes: {
        deleted_user: {
          email: existingUser.email,
          name: existingUser.name,
        },
      },
    });

    logger.info(
      { userId, actorId, organizationId },
      'Organization user deleted',
    );

    return { success: true };
  } catch (error) {
    logger.error(
      { error: sanitizeForLogging(error), userId },
      'Error deleting organization user',
    );
    throw new DatabaseError('Failed to delete user', error as Error);
  }
}

export async function getPendingInvites(options?: {
  includePostsigUsers?: boolean;
  currentUserEmail?: string | null;
}) {
  const { organizationId } = await verifyAbility('manage', 'Organization');
  const supabase = createServiceClient();

  try {
    // Fetch invites with user data
    const { data: inviteData, error: inviteError } = await supabase
      .from('app_invites')
      .select(
        `
        *,
        users(
          id,
          name,
          email,
          signed_up,
          user_roles2!user_roles2_user_id_fkey(role_id)
        )
      `,
      )
      .eq('organization_id', organizationId)
      .eq('expired', false)
      .order('invited_at', { ascending: false });

    if (inviteError) throw inviteError;

    const now = new Date();
    // Filter to only include invites for users who have NOT signed up yet
    const invites = (inviteData || [])
      .filter((invite) => invite.users?.signed_up === false)
      .map((invite) => {
        const roleId = invite.users?.user_roles2?.[0]?.role_id;
        let appRole: string | undefined;

        // Map role IDs to display names
        if (roleId === userRoles.clientSupervisor) {
          appRole = ADMIN;
        } else if (roleId === userRoles.clientAdmin) {
          appRole = MANAGER;
        } else if (roleId === userRoles.clientUser) {
          appRole = VIEWER;
        } else if (roleId === userRoles.postsigAdmin) {
          appRole = POSTSIG_ADMIN;
        } else if (roleId) {
          // If there's a role ID but we don't recognize it, show it
          appRole = `Role ${roleId}`;
        }

        return {
          id: invite.id.toString(),
          userId: invite.users?.id,
          name: invite.users?.name,
          email: invite.users?.email,
          role: appRole,
          invitedAt: invite.invited_at,
          expiresAt: invite.expires_at,
          status:
            new Date(invite.expires_at || '') < now ? 'expired' : 'pending',
        };
      });

    // Also fetch users with signed_up = false who don't have an invite
    // (edge case: users created without invite or invite was deleted)
    const { data: unsignedUpUsers, error: usersError } = await supabase
      .from('users')
      .select(
        `
        id,
        name,
        email,
        user_roles2!user_roles2_user_id_fkey(role_id)
      `,
      )
      .eq('organization_id', organizationId)
      .eq('signed_up', false)
      .order('email', { ascending: true });

    if (usersError) throw usersError;

    // Get user IDs that already have invites
    const invitedUserIds = new Set(
      invites.map((inv) => inv.userId).filter(Boolean),
    );

    // Add users without invites
    const usersWithoutInvites = (unsignedUpUsers || [])
      .filter((user) => !invitedUserIds.has(user.id))
      .map((user) => {
        const roleId = user.user_roles2?.[0]?.role_id;
        let appRole: string | undefined;

        if (roleId === userRoles.clientSupervisor) {
          appRole = ADMIN;
        } else if (roleId === userRoles.clientAdmin) {
          appRole = MANAGER;
        } else if (roleId === userRoles.clientUser) {
          appRole = VIEWER;
        } else if (roleId === userRoles.postsigAdmin) {
          appRole = POSTSIG_ADMIN;
        } else if (roleId) {
          appRole = `Role ${roleId}`;
        }

        return {
          id: user.id,
          userId: user.id,
          name: user.name,
          email: user.email,
          role: appRole,
          invitedAt: new Date().toISOString(), // Use current time as fallback
          expiresAt: null,
          status: 'pending' as const,
        };
      });

    // Combine and return all pending users
    return filterVisibleOrgUsers([...invites, ...usersWithoutInvites], options);
  } catch (error) {
    logger.error(
      { error: sanitizeForLogging(error), organizationId },
      'Error fetching pending invites',
    );
    throw new DatabaseError('Failed to fetch pending invites', error as Error);
  }
}

export async function resendUserInvite(userId: string) {
  const {
    userId: actorId,
    organizationId,
    organizationName,
  } = await verifyAbility('manage', 'Organization');
  const userMetadata = await getUserMetadata();
  const invitedBy = userMetadata?.userProfile?.name;
  const supabase = createServiceClient();

  try {
    const existingUser = await getOrganizationUser(userId);

    if (!existingUser.email) {
      throw new DatabaseError(
        'User has no email address',
        new Error('Missing email'),
      );
    }

    const { data: inviteData, error: inviteError } =
      await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: existingUser.email,
      });

    if (inviteError) throw inviteError;

    const token = inviteData.properties?.hashed_token;
    const invitedAt = inviteData.user?.updated_at ?? new Date().toISOString();
    const expiresAt = new Date(
      new Date(invitedAt).getTime() + 24 * 60 * 60 * 1000,
    ).toISOString();

    const { error: saveInviteError } = await supabase
      .from('app_invites')
      .upsert({
        token,
        organization_id: organizationId,
        user_id: userId,
        expires_at: expiresAt,
        invited_at: invitedAt,
      });

    if (saveInviteError) throw saveInviteError;

    await sendInviteEmail({
      name: existingUser.name || existingUser.email,
      token,
      email: existingUser.email,
      organization: organizationName,
      invitedBy,
    });

    const { error: expireOldError } = await supabase
      .from('app_invites')
      .update({ expired: true })
      .neq('token', token)
      .eq('user_id', userId);

    if (expireOldError) throw expireOldError;

    await logAudit({
      action_type: 'invite_resent',
      actor_id: actorId,
      target_user_id: userId,
      organization_id: organizationId,
      changes: {
        email: existingUser.email,
      },
    });

    logger.info({ userId, actorId, organizationId }, 'User invite resent');

    return { success: true };
  } catch (error) {
    logger.error(
      { error: sanitizeForLogging(error), userId },
      'Error resending user invite',
    );
    throw new DatabaseError('Failed to resend invite', error as Error);
  }
}
