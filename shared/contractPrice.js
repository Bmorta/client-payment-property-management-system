// Original TCP is the agreed selling price; TCP is the installment principal,
// not the live receivable and not the down payment actually collected.
export function contractAmounts(contract){
 const originalTcpCents=contract.totalCents,agreedDownPaymentCents=contract.downPaymentCents??0;
 if(!Number.isSafeInteger(originalTcpCents)||originalTcpCents<=0||!Number.isSafeInteger(agreedDownPaymentCents)||agreedDownPaymentCents<0||agreedDownPaymentCents>originalTcpCents)throw Object.assign(new Error('Invalid original TCP or agreed down payment.'),{statusCode:409});
 return {originalTcpCents,agreedDownPaymentCents,tcpAfterDownPaymentCents:originalTcpCents-agreedDownPaymentCents};
}
