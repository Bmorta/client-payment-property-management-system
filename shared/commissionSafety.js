export function hasCommissionHistory(account,record){
 const financial=v=>v&&((v.earnedCents||0)>0||(v.releasedCents||0)>0||(v.recoveredCents||0)>0||(v.collectedCents||0)>0||(v.sourceAllocations||[]).some(s=>s.amountCents>0));
 return financial(record)||(account.commissionPayouts||[]).some(p=>p.commissionId===record.commissionId)||(account.commissionRecoveries||[]).some(p=>p.commissionId===record.commissionId)||(account.commissionEvents||[]).some(e=>e.commissionId===record.commissionId&&(financial(e.previousValues)||financial(e.updatedValues)));
}
export const deletableCommission=(account,record)=>record.budgetCents===0&&!hasCommissionHistory(account,record);
