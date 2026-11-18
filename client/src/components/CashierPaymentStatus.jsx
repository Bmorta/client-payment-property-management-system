import StatusBadge from './StatusBadge.jsx';
import {pesos} from '../utils/finance.js';

const dateFormat=new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',year:'numeric',timeZone:'Asia/Manila'});
const plural=(count,singular)=>`${count} ${singular}${count===1?'':'s'}`;

export default function CashierPaymentStatus({payment}){
  if(!payment)return null;
  const {status,installments,dueCents,nextDueDate,contracts,affectedContracts}=payment;
  const due=['OVERDUE','DUE_TODAY','DUE_SOON'].includes(status);
  const facts=[
    contracts>1&&(due?`${plural(affectedContracts,'contract')} with payment due`:plural(contracts,'contract')),
    due&&installments>0&&plural(installments,'unpaid installment'),
    due&&dueCents>0&&`${pesos(dueCents)} principal due`,
    nextDueDate&&`${status==='OVERDUE'?'Oldest unpaid':'Next due'} ${dateFormat.format(new Date(nextDueDate+'T00:00:00Z'))}`
  ].filter(Boolean);
  return <div className="cashier-payment-status">
    <StatusBadge status={status}/>
    {facts.length>0&&<small className="text-body-secondary">{facts.join(' · ')}</small>}
  </div>;
}
