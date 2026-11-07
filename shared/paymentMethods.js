export const PAYMENT_METHODS=Object.freeze(['CASH','GCASH','MAYA','BANK_TRANSFER','BANK_DEPOSIT','CHECK','OTHER']);
export const paymentMethodLabel=value=>({CASH:'Cash',GCASH:'GCash',MAYA:'Maya',BANK_TRANSFER:'Bank Transfer',BANK_DEPOSIT:'Bank Deposit',CHECK:'Check',OTHER:'Other',UNCLASSIFIED:'Unclassified'})[value]||value;
