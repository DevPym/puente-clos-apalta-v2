// ── Contact ──

export interface HsContact {
  // Standard properties
  hs_object_id: string;
  firstname: string;
  lastname: string;
  email?: string | null;
  phone?: string | null;
  mobilephone?: string | null;
  address?: string | null;
  city?: string | null;

  // Custom — sync with Oracle
  fecha_de_nacimiento?: string | null;
  hs_language?: string | null;
  pais?: string | null;
  pasaporte?: string | null;
  rut?: string | null;
  huesped_vip?: string | null;
  allergies?: string | null;

  // Custom — bridge IDs
  id_oracle?: string | null;
}

// ── Deal ──

export interface HsDeal {
  // Standard properties
  hs_object_id: string;
  dealname: string;
  createdate?: string | null;

  // Custom — sync with Oracle (reservation)
  check_in: string;
  check_out: string;
  room_type: string;
  tipo_de_tarifa: string;
  n_huespedes: string;
  n_ninosas: string;
  cantidad_de_habitaciones?: string | null;
  n_habitacion?: string | null;
  estado_de_reserva: string;
  fuente_de_reserva?: string | null;
  tipo_de_pago?: string | null;
  agencia_de_viajes?: string | null;
  es_pseudo_room?: string | null;
  comentarios_del_huesped?: string | null;

  // Custom — bridge IDs
  id_oracle?: string | null;
  numero_de_reserva_?: string | null;    // trailing underscore is intentional
  id_synxis?: string | null;

  // Operational (NOT synced to Oracle)
  nights?: string | null;
  numero_de_noches_de_estancia?: string | null;
  destino_anterior?: string | null;
  estado_de_animo_general?: string | null;
  feedback_espontaneo?: string | null;
  gastos_adicionales_del_dia?: string | null;
  nombre_chofer_clos_apalta?: string | null;
  numero_de_vuelo?: string | null;
  observaciones_de_mejora?: string | null;
  preferencia_de_horario?: string | null;
  transporte?: string | null;
  tienda_le_club?: string | null;
  actividades_pendientes_o_reservadas?: string | null;
  actividades_realizadas?: string | null;
  servicios_utilizados?: string | null;
  nivel_de_satisfaccion_actividades?: string | null;
}

// ── Company ──

export interface HsCompany {
  // Standard properties
  hs_object_id: string;
  name: string;
  domain?: string | null;
  phone?: string | null;

  // Custom — sync with Oracle
  email_agencia?: string | null;
  nombre_agente?: string | null;
  tipo_de_empresa?: string | null;
  iata_code?: string | null;

  // Custom — bridge IDs
  id_oracle?: string | null;

  // Not synced
  hs_parent_company_id?: string | null;
}

// ── Appointment (daily guest log) ──

export interface HsAppointment {
  hs_object_id: string;

  // Activities → Oracle: Leisure Management API
  actividades_pendientes_o_reservadas?: string | null;
  actividades_realizadas?: string | null;

  // Comments & incidents → Oracle: Guest Messages API
  comentarios_del_huesped?: string | null;
  descripcion_de_la_incidencia?: string | null;
  cambios_dieteticos?: string | null;

  // Maintenance → Oracle: Service Requests API
  comentarios_mantencion?: string | null;
  comentarios_mantencion_habitacion?: string | null;

  // Meals consumed → Oracle: Cashiering API
  descripcion_desayuno_consumido?: string | null;
  descripcion_almuerzo_consumido?: string | null;
  descripcion_cena_consumida?: string | null;
}

// ── Associations ──

export interface DealContactAssociation {
  contactId: string;
  labels: string[];
}

// ── Webhook ──

export type WebhookSubscriptionType =
  | 'contact.creation'
  | 'contact.propertyChange'
  | 'contact.deletion'
  | 'deal.creation'
  | 'deal.propertyChange'
  | 'deal.deletion'
  | 'company.creation'
  | 'company.propertyChange'
  | 'company.deletion';

export interface WebhookEvent {
  objectId: number;
  subscriptionType: WebhookSubscriptionType;
  propertyName?: string;
  propertyValue?: string;
  occurredAt: number;
  attemptNumber: number;
}
