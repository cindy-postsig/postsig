import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { createClient as createClient } from '@/utils/supabase/server';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';

export const AUDIT_ACTIONS = {
  // Authentication
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGIN_BLOCKED: 'LOGIN_BLOCKED',
  MFA_REQUIRED: 'MFA_REQUIRED',
  LOGOUT: 'LOGOUT',

  // Password Management
  PASSWORD_RESET_REQUEST: 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_SUCCESS: 'PASSWORD_RESET_SUCCESS',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',

  // User Management
  USER_REGISTRATION: 'USER_REGISTRATION',
  USER_CREATED: 'USER_CREATED',
  USER_EMAIL_VERIFICATION: 'USER_EMAIL_VERIFICATION',
  USER_PROFILE_UPDATE: 'USER_PROFILE_UPDATE',
  USER_DEACTIVATION: 'USER_DEACTIVATION',

  // Role Management
  ROLE_ASSIGNED: 'ROLE_ASSIGNED',
  ROLE_REMOVED: 'ROLE_REMOVED',

  // Session Management
  SESSION_CREATED: 'SESSION_CREATED',
  SESSION_RENEWED: 'SESSION_RENEWED',
  SESSION_TERMINATED: 'SESSION_TERMINATED',

  // Organization
  ORGANIZATION_JOINED: 'ORGANIZATION_JOINED',
  ORGANIZATION_LEFT: 'ORGANIZATION_LEFT',

  // Invitations
  INVITATION_SENT: 'INVITATION_SENT',
  INVITATION_ACCEPTED: 'INVITATION_ACCEPTED',
  INVITATION_DECLINED: 'INVITATION_DECLINED',

  // Compliance
  TERMS_ACCEPTED: 'TERMS_ACCEPTED',

  // Security
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED: 'ACCOUNT_UNLOCKED',
  SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',

  // Generic CRUD
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',

  // Contract Access
  CONTRACT_VIEWED: 'CONTRACT_VIEWED',
  CONTRACT_DOWNLOADED: 'CONTRACT_DOWNLOADED',
  CONTRACT_SHARED: 'CONTRACT_SHARED',
  CONTRACT_ACCESS_GRANTED: 'CONTRACT_ACCESS_GRANTED',
  CONTRACT_ACCESS_REVOKED: 'CONTRACT_ACCESS_REVOKED',
  CONTRACT_ACCESS_DENIED: 'CONTRACT_ACCESS_DENIED',

  // Folder Access
  FOLDER_VIEWED: 'FOLDER_VIEWED',
  FOLDER_SHARED: 'FOLDER_SHARED',
  FOLDER_ACCESS_GRANTED: 'FOLDER_ACCESS_GRANTED',
  FOLDER_ACCESS_REVOKED: 'FOLDER_ACCESS_REVOKED',
  FOLDER_ACCESS_DENIED: 'FOLDER_ACCESS_DENIED',

  // Bulk Operations
  BULK_PERMISSION_UPDATE: 'BULK_PERMISSION_UPDATE',

  // Group Management
  GROUP_CREATED: 'GROUP_CREATED',
  GROUP_UPDATED: 'GROUP_UPDATED',
  GROUP_DELETED: 'GROUP_DELETED',
  GROUP_MEMBER_ADDED: 'GROUP_MEMBER_ADDED',
  GROUP_MEMBER_REMOVED: 'GROUP_MEMBER_REMOVED',

  CONTRACT_DOCUMENT_UPLOADED: 'CONTRACT_DOCUMENT_UPLOADED',
  EXECUTED_CONTRACT_UPLOADED: 'EXECUTED_CONTRACT_UPLOADED',

  // Investor Module
  INVESTOR_DOCUMENT_UPLOADED: 'INVESTOR_DOCUMENT_UPLOADED',
  INVESTOR_DOCUMENT_ACCESSED: 'INVESTOR_DOCUMENT_ACCESSED',
  INVESTOR_DOCUMENT_DOWNLOADED: 'INVESTOR_DOCUMENT_DOWNLOADED',
  INVESTOR_ENTITY_CREATED: 'INVESTOR_ENTITY_CREATED',
  INVESTOR_FUND_CREATED: 'INVESTOR_FUND_CREATED',
  INVESTOR_COMPANY_CREATED: 'INVESTOR_COMPANY_CREATED',

  // Data Export
  DATA_EXPORTED: 'DATA_EXPORTED',
} as const;

export const AUDIT_RESOURCE_TYPES = {
  AUTH_USERS: 'auth_users',
  USERS: 'users',
  USER_ROLES: 'user_roles',
  ORGANIZATIONS: 'organizations',
  APP_INVITES: 'app_invites',
  SESSION: 'session',
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  TRUSTED_DEVICES: 'trusted_devices',
  CONTRACTS: 'contracts',
  CONTRACT_ACL: 'contract_acl',
  CONTRACT_ACL_GROUP: 'contract_acl_group',
  FOLDERS: 'folders',
  FOLDER_ACL: 'folder_acl',
  GROUPS: 'groups',
  GROUP_MEMBERS: 'group_members',
  CONTRACT_VERSIONS: 'contract_versions',
  // Investor Module
  INVESTOR_DOCUMENT: 'investor_document',
  PORTFOLIO_COMPANY: 'portfolio_company',
  INVESTOR_FUND: 'investor_fund',
  MODULE_ENTITY: 'module_entity',
  EXPORT: 'export',
} as const;

export const authActions = [
  AUDIT_ACTIONS.LOGIN_SUCCESS,
  AUDIT_ACTIONS.LOGIN_FAILED,
  AUDIT_ACTIONS.LOGIN_BLOCKED,
  AUDIT_ACTIONS.LOGOUT,
  AUDIT_ACTIONS.PASSWORD_RESET_REQUEST,
  AUDIT_ACTIONS.PASSWORD_RESET_SUCCESS,
  AUDIT_ACTIONS.MFA_REQUIRED,
] as const;

export const roleActions = [
  AUDIT_ACTIONS.ROLE_ASSIGNED,
  AUDIT_ACTIONS.ROLE_REMOVED,
] as const;

export const userActions = [
  AUDIT_ACTIONS.USER_REGISTRATION,
  AUDIT_ACTIONS.USER_EMAIL_VERIFICATION,
  AUDIT_ACTIONS.USER_PROFILE_UPDATE,
  AUDIT_ACTIONS.USER_DEACTIVATION,
] as const;

export const sessionActions = [
  AUDIT_ACTIONS.SESSION_CREATED,
  AUDIT_ACTIONS.SESSION_RENEWED,
  AUDIT_ACTIONS.SESSION_TERMINATED,
] as const;

export const securityActions = [
  AUDIT_ACTIONS.ACCOUNT_LOCKED,
  AUDIT_ACTIONS.ACCOUNT_UNLOCKED,
  AUDIT_ACTIONS.SUSPICIOUS_ACTIVITY,
] as const;

export const trustedDeviceActions = [
  AUDIT_ACTIONS.CREATE,
  AUDIT_ACTIONS.UPDATE,
  AUDIT_ACTIONS.DELETE,
] as const;

export const contractAccessActions = [
  AUDIT_ACTIONS.CONTRACT_VIEWED,
  AUDIT_ACTIONS.CONTRACT_DOWNLOADED,
  AUDIT_ACTIONS.CONTRACT_SHARED,
  AUDIT_ACTIONS.CONTRACT_ACCESS_GRANTED,
  AUDIT_ACTIONS.CONTRACT_ACCESS_REVOKED,
  AUDIT_ACTIONS.CONTRACT_ACCESS_DENIED,
] as const;

export const folderAccessActions = [
  AUDIT_ACTIONS.FOLDER_VIEWED,
  AUDIT_ACTIONS.FOLDER_SHARED,
  AUDIT_ACTIONS.FOLDER_ACCESS_GRANTED,
  AUDIT_ACTIONS.FOLDER_ACCESS_REVOKED,
  AUDIT_ACTIONS.FOLDER_ACCESS_DENIED,
] as const;

export const bulkOperationsActions = [
  AUDIT_ACTIONS.BULK_PERMISSION_UPDATE,
] as const;

export const groupManagementActions = [
  AUDIT_ACTIONS.GROUP_CREATED,
  AUDIT_ACTIONS.GROUP_UPDATED,
  AUDIT_ACTIONS.GROUP_DELETED,
  AUDIT_ACTIONS.GROUP_MEMBER_ADDED,
  AUDIT_ACTIONS.GROUP_MEMBER_REMOVED,
] as const;

export const investorModuleActions = [
  AUDIT_ACTIONS.INVESTOR_DOCUMENT_UPLOADED,
  AUDIT_ACTIONS.INVESTOR_DOCUMENT_ACCESSED,
  AUDIT_ACTIONS.INVESTOR_DOCUMENT_DOWNLOADED,
  AUDIT_ACTIONS.INVESTOR_ENTITY_CREATED,
  AUDIT_ACTIONS.INVESTOR_FUND_CREATED,
  AUDIT_ACTIONS.INVESTOR_COMPANY_CREATED,
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
export type AuditResourceType =
  (typeof AUDIT_RESOURCE_TYPES)[keyof typeof AUDIT_RESOURCE_TYPES];

export interface AuditEventContext {
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  organizationId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditEvent {
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  context?: AuditEventContext;
}

class AuditLogger {
  private getClient() {
    return createServiceClient();
  }

  async logEvent(event: AuditEvent): Promise<void> {
    try {
      const sanitizedEvent = sanitizeForLogging({
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        context: event.context,
        hasOldData: !!event.oldData,
        hasNewData: !!event.newData,
      });

      const supabase = this.getClient();
      const { error } = await supabase.rpc('create_audit_log', {
        p_user_id: event.context?.userId || null,
        p_session_id: event.context?.sessionId || null,
        p_ip_address: event.context?.ipAddress || null,
        p_user_agent: event.context?.userAgent || null,
        p_action: event.action,
        p_resource_type: event.resourceType,
        p_resource_id: event.resourceId || null,
        p_old_data: event.oldData ? event.oldData : null,
        p_new_data: event.newData ? event.newData : null,
        p_metadata: event.context?.metadata ? event.context.metadata : null,
        p_organization_id: event.context?.organizationId || null,
      } as any);

      if (error) {
        logger.error({
          error: sanitizeForLogging(error),
          event: sanitizedEvent,
          processName: 'audit-logger',
        });
        // Don't throw - audit logging should not break application flow
      }
    } catch (error) {
      logger.error({
        error: sanitizeForLogging(error),
        event: sanitizeForLogging(event),
        processName: 'audit-logger',
      });
      // Don't throw - audit logging should not break application flow
    }
  }

  // Convenience methods for common audit events
  async logAuthenticationEvent(
    action: Extract<AuditAction, (typeof authActions)[number]>,
    context: AuditEventContext,
    data?: Record<string, unknown>,
  ): Promise<void> {
    await this.logEvent({
      action,
      resourceType: 'authentication',
      resourceId: context.userId,
      newData: data,
      context,
    });
  }

  async logUserEvent(
    action: Extract<
      AuditAction,
      | 'USER_REGISTRATION'
      | 'USER_PROFILE_UPDATE'
      | 'USER_DEACTIVATION'
      | 'PASSWORD_CHANGE'
      | 'TERMS_ACCEPTED'
    >,
    userId: string,
    context: AuditEventContext,
    oldData?: Record<string, unknown>,
    newData?: Record<string, unknown>,
  ): Promise<void> {
    await this.logEvent({
      action,
      resourceType: 'users',
      resourceId: userId,
      oldData,
      newData,
      context,
    });
  }

  async logRoleEvent(
    action: Extract<AuditAction, (typeof roleActions)[number]>,
    userId: string,
    context: AuditEventContext,
    roleData: Record<string, unknown>,
  ): Promise<void> {
    await this.logEvent({
      action,
      resourceType: 'user_roles',
      resourceId: userId,
      newData: roleData,
      context,
    });
  }

  async logSessionEvent(
    action: Extract<AuditAction, (typeof sessionActions)[number]>,
    sessionId: string,
    context: AuditEventContext,
  ): Promise<void> {
    await this.logEvent({
      action,
      resourceType: 'session',
      resourceId: sessionId,
      context,
    });
  }

  async logSecurityEvent(
    action: Extract<AuditAction, (typeof securityActions)[number]>,
    userId: string,
    context: AuditEventContext,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.logEvent({
      action,
      resourceType: 'users',
      resourceId: userId,
      newData: details,
      context,
    });
  }

  async logTrustedDeviceEvent(
    action: Extract<AuditAction, (typeof trustedDeviceActions)[number]>,
    deviceId: string,
    context: AuditEventContext,
    oldData?: Record<string, unknown>,
    newData?: Record<string, unknown>,
  ): Promise<void> {
    await this.logEvent({
      action,
      resourceType: 'trusted_devices',
      resourceId: deviceId,
      oldData,
      newData,
      context,
    });
  }

  async logContractAccessEvent(
    action: Extract<AuditAction, (typeof contractAccessActions)[number]>,
    contractId: string,
    context: AuditEventContext,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.logEvent({
      action,
      resourceType: 'contracts',
      resourceId: contractId,
      newData: details,
      context,
    });
  }

  async logACLChangeEvent(
    action: Extract<
      AuditAction,
      | (typeof contractAccessActions)[number]
      | (typeof folderAccessActions)[number]
    >,
    resourceType: Extract<
      AuditResourceType,
      'contract_acl' | 'folder_acl' | 'contracts' | 'folders'
    >,
    resourceId: string,
    context: AuditEventContext,
    oldData?: Record<string, unknown>,
    newData?: Record<string, unknown>,
  ): Promise<void> {
    await this.logEvent({
      action,
      resourceType,
      resourceId,
      oldData,
      newData,
      context,
    });
  }

  async logExportEvent(
    source: string,
    context: AuditEventContext,
    details?: {
      format?: 'csv' | 'xlsx';
      rowCount?: number;
      resourceIds?: Array<string | number>;
      reportType?: string;
      filename?: string;
      [key: string]: unknown;
    },
  ): Promise<void> {
    const { resourceIds, ...rest } = details ?? {};
    await this.logEvent({
      action: AUDIT_ACTIONS.DATA_EXPORTED,
      resourceType: 'export',
      resourceId: source,
      newData: {
        source,
        ...rest,
        resourceIdCount: resourceIds?.length,
        resourceIdSample: resourceIds?.slice(0, 25),
      },
      context: {
        ...context,
        metadata: {
          source,
          timestamp: new Date().toISOString(),
          ...context.metadata,
        },
      },
    });
  }

  async logInvestorModuleEvent(
    action: Extract<AuditAction, (typeof investorModuleActions)[number]>,
    resourceType: Extract<
      AuditResourceType,
      | 'investor_document'
      | 'portfolio_company'
      | 'investor_fund'
      | 'module_entity'
    >,
    resourceId: string,
    context: AuditEventContext,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.logEvent({
      action,
      resourceType,
      resourceId,
      newData: details,
      context,
    });
  }
}

export const auditLogger = new AuditLogger();

export function extractAuditContext(
  request?: Request,
  additionalContext?: Partial<AuditEventContext>,
): AuditEventContext {
  const context: AuditEventContext = {
    ...additionalContext,
  };

  if (request) {
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
      context.ipAddress = forwardedFor.split(',')[0]?.trim() || undefined;
    } else {
      const realIp = request.headers.get('x-real-ip');
      context.ipAddress = realIp ? realIp.trim() : undefined;
    }
    context.userAgent = request.headers.get('user-agent') || undefined;
  }

  return context;
}

export async function getUserAuditContext(
  additionalContext?: Partial<AuditEventContext>,
): Promise<AuditEventContext> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return {
      userId: user?.id,
      organizationId: user?.user_metadata.organization_id,
      ...additionalContext,
    };
  } catch (error) {
    // If we can't get user context (e.g., outside request scope), return minimal context
    logger.warn('Failed to get user audit context, returning minimal context');
    return {
      ...additionalContext,
    };
  }
}

export async function logSessionEvent(
  action: Extract<AuditAction, (typeof sessionActions)[number]>,
  sessionId: string,
  userId?: string,
  organizationId?: string,
  context?: Partial<AuditEventContext>,
): Promise<void> {
  await auditLogger.logSessionEvent(action, sessionId, {
    userId,
    organizationId,
    ...context,
    metadata: {
      sessionId,
      timestamp: new Date().toISOString(),
      ...context?.metadata,
    },
  });
}

export async function logTrustedDeviceEvent(
  action: Extract<AuditAction, (typeof trustedDeviceActions)[number]>,
  deviceId: string,
  options?: {
    oldData?: Record<string, unknown>;
    newData?: Record<string, unknown>;
    context?: Partial<AuditEventContext>;
    userId?: string;
    organizationId?: string;
  },
): Promise<void> {
  const { oldData, newData, context, userId, organizationId } = options ?? {};
  const ctx: AuditEventContext = {
    userId,
    organizationId,
    ...context,
    metadata: {
      deviceId,
      timestamp: new Date().toISOString(),
      ...context?.metadata,
    },
  };

  await auditLogger.logTrustedDeviceEvent(
    action,
    deviceId,
    ctx,
    oldData,
    newData,
  );
}
