import type { HsContact } from '../../domain/types/hubspot.types.js';
import type { GuestProfile, OracleIdentification } from '../../domain/types/oracle.types.js';

export function mapHsContactToGuestProfile(contact: HsContact): GuestProfile {
  const identifications: OracleIdentification[] = [];
  if (contact.pasaporte) {
    identifications.push({ idType: 'PASSPORT', idNumber: contact.pasaporte });
  }
  if (contact.rut) {
    identifications.push({ idType: 'TAX_ID', idNumber: contact.rut });
  }

  const profile: GuestProfile = {
    givenName: contact.firstname.substring(0, 40),
    surname: contact.lastname.substring(0, 40),
  };

  if (contact.email) profile.email = contact.email;
  if (contact.phone) profile.phoneNumber = contact.phone.substring(0, 40);
  if (contact.mobilephone) profile.mobileNumber = contact.mobilephone.substring(0, 40);
  if (contact.hs_language) profile.language = contact.hs_language;
  if (contact.pais) profile.nationality = contact.pais;
  if (contact.fecha_de_nacimiento) profile.birthDate = contact.fecha_de_nacimiento;
  if (contact.huesped_vip) profile.vipCode = contact.huesped_vip;
  if (contact.allergies) profile.allergies = contact.allergies;
  if (identifications.length > 0) profile.identifications = identifications;

  if (contact.address || contact.city) {
    profile.address = {
      addressLine: contact.address ? [contact.address.substring(0, 80)] : [],
      ...(contact.city && { cityName: contact.city.substring(0, 40) }),
    };
  }

  return profile;
}
