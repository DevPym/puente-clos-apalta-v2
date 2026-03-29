import type { HsCompany } from '../../domain/types/hubspot.types.js';
import type { CompanyProfile } from '../../domain/types/oracle.types.js';
import { resolveOracleCompanyType } from '../../domain/rules/company.rules.js';

export function mapHsCompanyToOracleProfile(company: HsCompany): CompanyProfile {
  const profileType = resolveOracleCompanyType(company.tipo_de_empresa, company.iata_code);

  const profile: CompanyProfile = {
    companyName: company.name.substring(0, 40),
    profileType,
  };

  if (company.iata_code) profile.iataCode = company.iata_code.substring(0, 20);
  if (company.email_agencia) profile.email = company.email_agencia;
  if (company.phone) profile.phoneNumber = company.phone;
  if (company.nombre_agente) profile.contactName = company.nombre_agente;

  return profile;
}
