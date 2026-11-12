export const PENDING_FORFEITURE_REVIEW=['UNDER_REVIEW','NOTICE_ISSUED','APPROVED_FOR_FORFEITURE','FORFEITED'];
export function forfeitureActions(account) {
  if(account.lifecycle==='FORFEITED')return ['PENDING','REJECTED'].includes(account.property?.reopeningStatus)?['REOPEN','REJECT_REOPEN','RETURN_REOPEN','REACTIVATE']:['REACTIVATE'];
  if(account.lifecycle&&account.lifecycle!=='ACTIVE')return [];
  return PENDING_FORFEITURE_REVIEW.includes(account.forfeitureReviews?.at(-1)?.status)?['FORFEIT','REJECT','CANCEL_REVIEW']:['MARK_REVIEW'];
}
export function assertForfeitureReviewTransition(account,action) {
  const pending=PENDING_FORFEITURE_REVIEW.includes(account.forfeitureReviews?.at(-1)?.status);
  const fail=message=>{throw Object.assign(new Error(message),{statusCode:409})};
  if(action==='MARK_REVIEW'&&pending)fail('This contract already has a pending forfeiture review. Approve, reject or withdraw that review.');
  if(['FORFEIT','REJECT','CANCEL_REVIEW'].includes(action)&&!pending)fail('Start a forfeiture review before approving, rejecting or withdrawing it.');
  if(action==='MARK_REVIEW'&&(account.pendingCancellation||account.transferOut||account.cancellationOut))fail('Resolve the existing cancellation or transfer before starting forfeiture review.');
}
