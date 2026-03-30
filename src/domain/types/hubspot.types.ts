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
// Propiedades según export HubSpot 2026-03-30

export interface HsDeal {
  // Standard properties
  hs_object_id: string;
  dealname: string;
  createdate?: string | null;

  // Custom — sync with Oracle (reservation) — 8 campos del XLS
  check_in: string;
  check_out: string;
  room_type: string;                    // enum: CASITA, PLCASITA, OWNERC, VILLAS
  tipo_de_tarifa: string;               // enum: Half Board, Overnight, Full board
  n_huespedes: string;
  n_ninosas: string;
  estado_de_reserva: string;            // enum: Confirmada, Hospedado, Salida, Cancelada
  tipo_de_pago?: string | null;         // enum: Efectivo (CASH), Depósito (DP), etc.

  // Custom — bridge IDs (NO eliminar)
  id_oracle?: string | null;                    // Oracle Reservation ID interno
  numero_de_reserva_?: string | null;           // trailing underscore is intentional
  confirmation_number__oracle?: string | null;   // Oracle Confirmation Number (para cancelar/buscar)
  id_synxis?: string | null;
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
// TODAS las propiedades según export HubSpot 2026-03-30 (28 campos)

export interface HsAppointment {
  hs_object_id: string;

  // Referencia al deal
  dealname?: string | null;
  numero_de_reserva_?: string | null;

  // Activities → Oracle: Leisure Management API
  actividades_pendientes_o_reservadas?: string | null;   // enum: Birdwatching, Trekking Casa Parrón, etc.
  actividades_realizadas?: string | null;                 // enum: mismos valores

  // Comments & incidents → Oracle: Guest Messages API
  comentarios_del_huesped?: string | null;
  descripcion_de_la_incidencia?: string | null;
  cambios_dieteticos?: string | null;
  estado_de_animo_general?: string | null;                // enum: Feliz, Relajado, Indiferente, Molesto, Cansado
  feedback_espontaneo?: string | null;
  observaciones_de_mejora?: string | null;

  // Incidents detail
  tipo_de_incidencia?: string | null;                     // enum: Plomería, Electricidad, Limpieza, Inmuebles
  estado_incidencia?: string | null;                      // enum: Pendiente, En proceso, Resuelto
  responsable_asignado?: string | null;

  // Maintenance → Oracle: Service Requests API
  comentarios_mantencion?: string | null;
  comentarios_mantencion_habitacion?: string | null;
  observaciones_de_la_habitacion?: string | null;

  // Housekeeping
  nombre_housekeeping?: string | null;
  tareas_realizadas?: string | null;                      // enum: Cambio de Sábanas, Limpieza baño, Aspirar, Reponer Amenities
  velocidad_del_servicio?: string | null;                 // enum: Rápida, Intermedia, Lenta

  // Meals consumed → Oracle: Cashiering API
  descripcion_desayuno_consumido?: string | null;
  descripcion_almuerzo_consumido?: string | null;
  descripcion_cena_consumida?: string | null;
  snacks__bebidas_adicionales?: string | null;

  // Guest services & extras
  servicios_utilizados?: string | null;                   // enum: SPA, Restaurante, Tienda, Tour, Room Service
  gastos_adicionales_del_dia?: string | null;             // number
  tienda_le_club?: string | null;                         // number
  nivel_de_satisfaccion_actividades?: string | null;      // enum: 1-10
  preferencia_de_horario?: string | null;                 // enum: Mañana, Tarde, Noche
  room_type?: string | null;                              // enum: Type 1, Type 2, Type 3
}

// ── Associations ──

export interface DealContactAssociation {
  contactId: string;
  labels: string[];
}

// ── Webhook ──

// HubSpot envía muchos event types: creation, propertyChange, deletion,
// merge, restore, associationChange, privacyDeletion, y para objetos custom
// (como appointments 0-421): object.creation, object.propertyChange, etc.
// El webhook route usa un schema flexible (z.string()) y filtra los que nos interesan.
export type WebhookSubscriptionType = string;

export interface WebhookEvent {
  objectId: number;
  subscriptionType: WebhookSubscriptionType;
  objectTypeId?: string;       // Presente en object.* events (ej: "0-421" para appointments)
  propertyName?: string;
  propertyValue?: string;
  occurredAt: number;
  attemptNumber: number;
}
