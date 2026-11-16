const fail=message=>{throw Object.assign(new Error(message),{statusCode:400})};
export const FINAL_CANCELLATION_DOCUMENT_VERSION='FINAL_CANCELLATION_V1';
export function signingDetails(input,approvedDate,today){
 const date=String(input.signingDate||'').trim(),place=String(input.signingPlace||'').trim();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<approvedDate||date>today)fail('Choose the actual signing date, on or after approval and not in the future.');
 if(place.length<2||place.length>160)fail('Enter the place of signing (2–160 characters).');
 return {date,place};
}
export function signedAgreementEvidence(input){
 for(const [key,label]of [['clientSigned','client signature'],['companySigned','company representative signature'],['voluntaryPropertyWaiver','voluntary property-rights provisions'],['legalReviewConfirmed','Philippine legal review']])if(input[key]!==true)fail('Verify the '+label+' before finalizing the agreement.');
 const read=(key,label,min=5,max=1000)=>{const value=String(input[key]||'').trim();if(value.length<min||value.length>max)fail(`Enter ${label} (${min}–${max} characters).`);return value};
 return {signedCopyReference:read('signedCopyReference','the signed-document record/reference'),legalProfessional:read('legalProfessional','the reviewing Philippine legal professional',2,160),legalReviewReference:read('legalReviewReference','the legal review reference'),clientSigned:true,companySigned:true,voluntaryPropertyWaiver:true,legalReviewConfirmed:true};
}
export function requireSignedCancellationAgreement(c){if(c.agreement?.status!=='FINALIZED')throw Object.assign(new Error('Verify and finalize the signed cancellation agreement first. Refund payments remain a separate obligation.'),{statusCode:409})}
export function cancellationPaymentState(c){const approved=c.snapshot.distribution.refundCents,paid=c.refundPaidCents||0;if(paid<0||paid>approved)throw Object.assign(new Error('Refund payable requires reconciliation.'),{statusCode:409});return {approvedCents:approved,paidCents:paid,outstandingCents:approved-paid,status:approved===paid?'PAID':paid?'PARTIALLY_PAID':'UNPAID'}}
