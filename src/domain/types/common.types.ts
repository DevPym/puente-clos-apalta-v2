export type Result<T, E> =
  | { ok: true; data: T }
  | { ok: false; error: E };

export type JobType =
  | 'contact.create'
  | 'contact.update'
  | 'deal.create'
  | 'deal.update'
  | 'deal.delete'
  | 'company.create'
  | 'company.update'
  | 'appointment.create'
  | 'appointment.update';

export type SyncDirection = 'hubspot-to-oracle' | 'oracle-to-hubspot';
