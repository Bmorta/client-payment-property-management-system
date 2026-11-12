import mongoose from 'mongoose';
import Client from '../models/Client.js';
import Property from '../models/Property.js';
import PropertyAssignment from '../models/PropertyAssignment.js';

const terminal = ['CANCELLED', 'FORFEITED', 'SUPERSEDED', 'TRANSFERRED', 'ASSUMED'];
export function deriveClientStatus({ hasActive, hasTerminal }) {
  return hasActive ? 'ACTIVE' : hasTerminal ? 'INACTIVE' : null;
}

/** Keep the master client status consistent with its live contracts. */
export async function syncClientLifecycleFromContracts(clientId, actor = {}, reason = 'Contract lifecycle changed', session = null) {
  const activeQuery = PropertyAssignment.exists({
    client: clientId,
    $or: [{ lifecycle: 'ACTIVE' }, { lifecycle: { $exists: false } }]
  });
  const terminalQuery = PropertyAssignment.exists({ client: clientId, lifecycle: { $in: terminal } });
  if (session) {
    activeQuery.session(session);
    terminalQuery.session(session);
  }
  const hasActive = await activeQuery;
  const hasTerminal = await terminalQuery;
  const nextStatus = deriveClientStatus({ hasActive, hasTerminal });
  if (!nextStatus) return null;

  // Any active contract keeps the client active. Only clients whose contracts
  // are all closed are moved to Inactive; clients without contracts are untouched.
  const clientQuery = Client.findById(clientId);
  if (session) clientQuery.session(session);
  const client = await clientQuery.lean();
  if (!client || client.status === nextStatus) return null;
  const event = {
    action: 'CONTRACT_LIFECYCLE_STATUS_SYNC',
    previousStatus: client.status,
    updatedStatus: nextStatus,
    reason,
    actor: actor.username || 'system',
    role: actor.role || 'SYSTEM',
    userId: actor.userId || null,
    timestamp: new Date()
  };
  const update = Client.updateOne(
    { _id: client._id, status: client.status },
    { $set: { status: nextStatus }, $push: { lifecycleStatusHistory: event } }
  );
  if (session) update.session(session);
  const result = await update;
  if (!result.modifiedCount) throw Object.assign(new Error('Client status changed concurrently. Refresh and retry.'), { statusCode: 409 });
  return event;
}

/** Repair only unambiguous legacy closure metadata; never infer from payment age. */
export async function repairClosedContractStatuses() {
  let repaired = 0;
  let lotsReturnedToReview = 0;
  const clients = new Set();
  const cursor = PropertyAssignment.find({
    $or: [
      { cancellationOut: { $exists: true, $ne: null } },
      { forfeitureClosure: { $exists: true, $ne: null } }
    ]
  }).cursor();

  for await (const account of cursor) {
    let expected = null;
    if (account.cancellationOut) expected = 'CANCELLED';
    else if (account.forfeitureClosure) {
      const events = account.forfeitureEvents || [];
      const latest = events.at(-1), period = account.forfeiturePeriods?.at(-1);
      expected = latest?.action === 'REACTIVATE'
        ? (period?.reactivationOutcome === 'REACTIVATED' ? 'ACTIVE' : 'SUPERSEDED')
        : 'FORFEITED';
    }
    if (!expected) continue;
    clients.add(String(account.client));
    if (account.lifecycle !== expected) {
      const event = { action: 'LEGACY_CONTRACT_STATUS_REPAIRED', previousStatus: account.lifecycle || null, updatedStatus: expected, reason: 'Derived from approved cancellation/forfeiture closure metadata; financial history unchanged.', actor: 'system', role: 'SYSTEM', timestamp: new Date() };
      const result = await PropertyAssignment.updateOne(
        { _id: account._id, __v: account.__v },
        { $set: { lifecycle: expected }, $push: { auditEvents: event }, $inc: { __v: 1 } }
      );
      if (result.modifiedCount) repaired++;
    }

    // Older cancellation finalization could release inventory directly when a
    // clearance checkbox was set. Current Reopen Lot approvals mark the lot
    // APPROVED, so only an AVAILABLE, unlinked lot without that approval is
    // unambiguously the old bypass and should return to the release-review queue.
    if (account.cancellationOut && account.property) {
      const property = await Property.findById(account.property).lean();
      if (property?.status === 'AVAILABLE' && !property.client && property.reopeningStatus !== 'APPROVED') {
        const activeSuccessor = await PropertyAssignment.exists({
          property: property._id,
          $or: [{ lifecycle: 'ACTIVE' }, { lifecycle: { $exists: false } }]
        });
        if (!activeSuccessor) {
          const event = {
            action: 'LEGACY_CANCELLED_LOT_RETURNED_TO_RELEASE_REVIEW',
            contractId: account.assignmentId,
            client: account.client,
            reason: 'Legacy cancellation had made this lot available without an approved Reopen Lot record.',
            actor: 'system',
            timestamp: new Date()
          };
          const result = await Property.updateOne(
            { _id: property._id, __v: property.__v, status: 'AVAILABLE', client: null, reopeningStatus: { $ne: 'APPROVED' } },
            { $set: { status: 'UNAVAILABLE', client: account.client, reopeningStatus: 'PENDING' }, $push: { history: event }, $inc: { __v: 1 } }
          );
          if (result.modifiedCount) lotsReturnedToReview++;
        }
      }
    }
  }
  for (const clientId of clients) {
    if (mongoose.isValidObjectId(clientId)) await syncClientLifecycleFromContracts(clientId, {}, 'Legacy closed-contract status reconciliation');
  }
  return { repaired, lotsReturnedToReview };
}
