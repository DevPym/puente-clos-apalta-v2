---
name: hubspot-mapping
description: HubSpot CRM property mapping rules for Clos Apalta. 69 real properties across 4 objects (Contact, Deal, Company, Appointment). Use when implementing mappers, writing tests, or debugging sync issues.
allowed-tools: Read, Grep
---

# HubSpot Property Mapping — Clos Apalta

## Objects and Sync Direction

| HubSpot Object | Direction        | Oracle Target           |
|----------------|------------------|-------------------------|
| Contact        | HS ↔ Oracle      | Guest Profile (CRM)     |
| Deal           | HS ↔ Oracle      | Reservation             |
| Company        | HS ↔ Oracle      | Company/TravelAgent     |
| Appointment    | HS → Oracle only | 4 APIs                  |

## Contact → GuestProfile

firstname→givenName, lastname→surname, email→emails[0], phone→telephones[Phone],
mobilephone→telephones[Mobile], hs_language→language, nacionalidad→nationality.code,
date_of_birth→birthDate, titulo→namePrefix, tipo_de_huesped→vipCode,
tipo_de_documento→identifications[].idType, numero_de_documento→identifications[].idNumber,
alergias_o_restricciones→allergies (Guest Message workaround), id_oracle→Oracle Profile ID

## Deal → OracleReservation

fecha_de_llegada→arrivalDate, fecha_de_salida→departureDate, room_type→roomType,
rate_plan→ratePlanCode, n_huespedes→adults, n_ninosas→children,
numero_de_habitaciones→numberOfRooms, estado_de_reserva→reservationStatus,
fuente_de_reserva→sourceCode (extract parentheses), medio_de_pago→paymentMethod,
es_pseudo_room→isPseudoRoom, id_oracle→internal ID, numero_de_reserva_→confirmation number

## Company → CompanyProfile

name→companyName, phone→telephones[0], email_agencia→emails[0],
nombre_agente→contact name, tipo_de_empresa→profileType, iata_code→iATACompany

## Appointment → 4 Oracle APIs

actividades→Leisure, comentarios/incidencias→Messages,
mantencion→ServiceRequests, comidas→Cashiering (breakfast=2004, lunch=2010, dinner=2020)

## Business Rules

- resolveOracleCompanyType: iataCode→TravelAgent, Agencia→TravelAgent, else→Company
- isPrimaryGuest: labels includes "Huésped Principal"
- parseSourceCode: "Walk-in (WLK)" → "WLK"
- Visa→VA not VI, Deposit→BTR not DP

## Watch Out

- `numero_de_reserva_` has trailing underscore — NOT a typo
- `n_ninosas` is the actual field name for children
- Deal associations include contact labels for primary guest
