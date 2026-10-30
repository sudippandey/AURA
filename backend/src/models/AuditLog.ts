import { Schema, model, type Document, type Model, type Types } from "mongoose";

export interface AuditLogDoc extends Document {
  actor: Types.ObjectId | null;
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  requestId: string | null;
  createdAt: Date;
}

const auditSchema = new Schema<AuditLogDoc>(
  {
    actor: { type: Schema.Types.ObjectId, ref: "User", default: null },
    actorEmail: { type: String, default: null },
    action: { type: String, required: true, maxlength: 120, index: true },
    entity: { type: String, required: true, maxlength: 80, index: true },
    entityId: { type: String, default: null, maxlength: 120 },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    requestId: { type: String, default: null, maxlength: 80 }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditSchema.index({ createdAt: -1 });
auditSchema.index({ entity: 1, entityId: 1 });

export const AuditLog: Model<AuditLogDoc> = model<AuditLogDoc>("AuditLog", auditSchema);
