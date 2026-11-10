export const CLIENT_ACCOUNT_STATUSES=[['ACTIVE','Active accounts'],['FULLY_PAID','Fully paid (principal)'],['PRINCIPAL_FULLY_PAID','Principal fully paid'],['SETTLED','Fully settled'],['OUTSTANDING','With outstanding balance'],['OVERDUE','Overdue'],['FORFEITURE_REVIEW','Forfeiture review'],['FORFEITED','Forfeited'],['CANCELLATION_REVIEW','Cancellation review'],['CANCELLED','Cancelled'],['REACTIVATED','Reactivated'],['TRANSFERRED','Transferred'],['SUPERSEDED','Superseded']];
export function accountStatusTags(a,s){
 const category=String(s.category||'').replace(/^HISTORICAL_/,''),lifecycle=['CANCELLED','TRANSFERRED','FORFEITED','SUPERSEDED'].includes(category)?category:a.lifecycle||'ACTIVE';
 const tags=new Set([lifecycle]);
 if(s.settlement?.status==='SETTLED'){tags.add('SETTLED');tags.add('FULLY_PAID');tags.add('PRINCIPAL_FULLY_PAID')}
 if(s.settlement?.status==='PRINCIPAL_FULLY_PAID'){tags.add('FULLY_PAID');tags.add('PRINCIPAL_FULLY_PAID')}
 if((s.totalOutstandingCents??s.balanceCents)>0)tags.add('OUTSTANDING');
 if(s.overdueCents>0)tags.add('OVERDUE');
 if(s.riskStatus==='FORFEITURE_REVIEW_REQUIRED'||['UNDER_REVIEW','NOTICE_ISSUED','APPROVED_FOR_FORFEITURE'].includes(a.forfeitureReviews?.at(-1)?.status))tags.add('FORFEITURE_REVIEW');
 if(a.pendingCancellation||a.cancellationReview?.status==='UNDER_REVIEW')tags.add('CANCELLATION_REVIEW');
 if(a.reactivationIn||a.forfeiturePeriods?.some(p=>p.reactivatedAt))tags.add('REACTIVATED');
 return [...tags];
}
