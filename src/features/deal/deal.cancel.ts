import type { IOracleClient } from '../../domain/ports/oracle.port.js';
import type { IHubSpotClient } from '../../domain/ports/hubspot.port.js';
import type { ILogger } from '../../shared/logger/logger.js';

export interface DealCancelDeps {
  oracle: IOracleClient;
  hubspot: IHubSpotClient;
  logger: ILogger;
  cancellationReasonCode: string;
}

export async function cancelDeal(
  deps: DealCancelDeps,
  payload: { objectId: string },
): Promise<{ oracleId?: string }> {
  const { oracle, hubspot, logger, cancellationReasonCode } = deps;

  // Try to get the deal (might be archived/deleted)
  let oracleId: string | null | undefined;

  const dealResult = await hubspot.getDealById(payload.objectId);
  if (dealResult.ok) {
    oracleId = dealResult.data.id_oracle;
  } else {
    // Deal might be archived
    const archivedResult = await hubspot.getArchivedDealById(payload.objectId);
    if (archivedResult.ok && archivedResult.data) {
      oracleId = archivedResult.data.id_oracle;
    }
  }

  if (!oracleId) {
    logger.warn('Deal has no Oracle reservation ID, nothing to cancel', { objectId: payload.objectId });
    return {};
  }

  const cancelResult = await oracle.cancelReservation(oracleId, cancellationReasonCode);
  if (!cancelResult.ok) throw cancelResult.error;

  logger.info('Cancelled Oracle reservation', {
    objectId: payload.objectId,
    oracleId,
    cancellationNumber: cancelResult.data,
  });

  return { oracleId };
}
