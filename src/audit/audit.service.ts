import { Injectable, Logger } from '@nestjs/common';

export interface AuditEvent {
  action: string;
  actorId: number | null;
  actorRole?: string;
  actorEmail?: string;
  targetType: string;
  targetId: string | number | null;
  outcome: 'success' | 'failure';
  reason?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('AuditLog');

  log(event: AuditEvent): void {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      action: event.action,
      actorId: event.actorId,
      actorRole: event.actorRole ?? null,
      actorEmail: event.actorEmail ?? null,
      targetType: event.targetType,
      targetId: event.targetId,
      outcome: event.outcome,
      reason: event.reason ?? null,
      ip: event.ip ?? null,
      userAgent: event.userAgent ?? null,
      requestId: event.requestId ?? null,
      ...(event.metadata ? { metadata: event.metadata } : {}),
    };

    this.logger.log(JSON.stringify(auditEntry));
  }
}
